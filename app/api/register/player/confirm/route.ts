import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { triggerNewsGeneration, isPlayerMilestone } from '@/lib/news/trigger';

/**
 * POST /api/register/player/confirm
 * Confirm player self-registration
 * Uses Admin SDK to bypass security rules
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields (user_email and user_uid are optional for committee registrations)
    if (!body.player_id || !body.season_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: player_id and season_id are required',
        },
        { status: 400 }
      );
    }

    const { player_id, season_id, user_email, user_uid, player_data, is_admin_registration, used_smart_assist } = body;

    const sql = getTournamentDb();
    const registrationId = `${player_id}_${season_id}`;
    
    // Check if player already registered for this season in Neon
    // This check is before transaction to fail fast, but we'll check again during INSERT
    const existingRegistration = await sql`
      SELECT id FROM realplayerstats WHERE player_id = ${player_id} AND season_id = ${season_id}
    `;

    if (existingRegistration.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Player is already registered for this season',
        },
        { status: 400 }
      );
    }

    // Check if registration is open (simplified - no phase system)
    const seasonRef = adminDb.collection('seasons').doc(season_id);
    let seasonData: any;
    
    try {
      const seasonDoc = await seasonRef.get();
      
      if (!seasonDoc.exists) {
        return NextResponse.json(
          { success: false, error: 'Season not found' },
          { status: 404 }
        );
      }

      seasonData = seasonDoc.data();
      
      // Simple check: is player registration open?
      if (!is_admin_registration && !seasonData?.is_player_registration_open) {
        return NextResponse.json(
          { success: false, error: 'Registration is closed for this season' },
          { status: 403 }
        );
      }
    } catch (error: any) {
      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Failed to check registration status',
        },
        { status: 500 }
      );
    }

    console.log(`📝 Creating single-season registration for ${player_id}: ${season_id}`);

    // Wrap database operations in try-catch to rollback Firestore counter if they fail
    try {
      // Determine tournament_id dynamically from Neon tournaments table (only for seasons < 18)
      const seasonMatch = season_id.match(/\d+/);
      const seasonNum = seasonMatch ? parseInt(seasonMatch[0]) : 0;
      
      let tournament_id = null;
      if (seasonNum < 18) {
        const tournaments = await sql`
          SELECT id FROM tournaments 
          WHERE season_id = ${season_id} 
            AND (tournament_name ILIKE '%League%' OR id LIKE '%-LEAGUE' OR id LIKE '%L')
          LIMIT 1
        `;
        tournament_id = tournaments.length > 0 ? tournaments[0].id : null;
      }
      
      // Create registration for season in Neon realplayerstats table
      // Use ON CONFLICT to detect race condition duplicates
      const insertResult = await sql`
        INSERT INTO realplayerstats (
          id, player_id, season_id, tournament_id, player_name,
          category,
          points,
          matches_played, matches_won, matches_lost, matches_drawn,
          goals_scored, goals_conceded, assists, clean_sheets, own_goals, saves, penalties_saved,
          wins, draws, losses, motm_awards,
          trophies,
          used_smart_assist,
          created_at, updated_at
        )
        VALUES (
          ${registrationId}, ${player_id}, ${season_id}, ${tournament_id}, ${player_data?.name || ''},
          ${player_data?.category || 'A'},
          100,
          0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0,
          '[]'::jsonb,
          ${used_smart_assist || null},
          (NOW() AT TIME ZONE 'UTC')::timestamp, (NOW() AT TIME ZONE 'UTC')::timestamp
        )
        ON CONFLICT (player_id, season_id) DO NOTHING
        RETURNING id
      `;
      
      // If no rows returned, player was already registered (race condition caught)
      if (insertResult.length === 0) {
        console.error(`❌ Race condition: Player ${player_id} already registered for ${season_id}`);
        
        return NextResponse.json(
          {
            success: false,
            error: 'Player is already registered for this season',
          },
          { status: 400 }
        );
      }
    
    console.log(`✅ Created single-season registration in realplayerstats for ${player_id}: ${registrationId}`);

    // Trigger news for new player registration milestone (every 10 players)
    try {
      // Get current player count
      const playerCount = await sql`
        SELECT COUNT(*) as count
        FROM realplayerstats
        WHERE season_id = ${season_id}
      `;
      
      const currentCount = parseInt(playerCount[0]?.count || '0');
      
      // Check if this is a milestone (every 10 players)
      if (isPlayerMilestone(currentCount)) {
        triggerNewsGeneration({
          event_type: 'player_milestone',
          category: 'milestone',
          season_id: season_id,
          season_name: seasonData?.name || season_id,
          metadata: {
            player_count: currentCount,
            milestone_number: currentCount,
          },
        }).catch(err => console.error('News generation failed:', err));
      }
    } catch (err) {
      console.error('Failed to check player milestone:', err);
    }

    // Auto-add player to fantasy league if one exists for this season
    try {
      const fantasyLeagues = await fantasySql`
        SELECT league_id, category_prices
        FROM fantasy_leagues
        WHERE season_id = ${season_id}
        LIMIT 1
      `;

      if (fantasyLeagues.length > 0) {
        const league = fantasyLeagues[0];
        const category = player_data?.category || 'A'; // Default category
        
        // Get price from category pricing
        let draftPrice = 10; // Default price
        if (league.category_prices) {
          const priceObj = league.category_prices.find((p: any) => p.category === category);
          if (priceObj) draftPrice = priceObj.price;
        }

        await fantasySql`
          INSERT INTO fantasy_players (
            player_id,
            league_id,
            player_name,
            real_team_id,
            real_team_name,
            position,
            category,
            draft_price,
            is_available
          ) VALUES (
            ${player_id},
            ${league.league_id},
            ${player_data?.name || ''},
            '',
            '',
            'Unknown',
            ${category},
            ${draftPrice},
            true
          )
          ON CONFLICT (player_id, league_id) DO NOTHING
        `;

        console.log(`✅ Added ${player_data?.name || player_id} to fantasy league ${league.league_id} with category ${category}`);
      }
    } catch (fantasyError) {
      // Don't fail registration if fantasy addition fails
      console.error('Warning: Failed to add player to fantasy league:', fantasyError);
    }

    // Update permanent player data in Firebase realplayers collection
    const playersQuery = await adminDb
      .collection('realplayers')
      .where('player_id', '==', player_id)
      .limit(1)
      .get();

    if (!playersQuery.empty) {
      const playerDoc = playersQuery.docs[0];
      const updateData: any = {
        current_season_id: season_id,
        is_registered: true,
        registration_date: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      };

      if (used_smart_assist) {
        updateData.used_smart_assist = used_smart_assist;
      }

      // Update any missing player data if provided
      if (player_data) {
        if (player_data.name) updateData.name = player_data.name;
        if (player_data.place) updateData.place = player_data.place;
        if (player_data.date_of_birth) updateData.date_of_birth = player_data.date_of_birth;
        if (player_data.email) updateData.email = player_data.email;
        if (player_data.phone) updateData.phone = player_data.phone;
        if (player_data.photo_url) updateData.photo_url = player_data.photo_url;
        if (player_data.photo_file_id) updateData.photo_file_id = player_data.photo_file_id;
        if (player_data.category) updateData.category = player_data.category;
      }

      await playerDoc.ref.update(updateData);
    } else {
      // Player doesn't exist in master list, create them
      if (!player_data || !player_data.name) {
        return NextResponse.json(
          {
            success: false,
            error: 'Player data is required for new players',
          },
          { status: 400 }
        );
      }

      // Generate new player ID if this is a completely new player
      const newPlayerId = player_id;
      
      await adminDb.collection('realplayers').doc(newPlayerId).set({
        player_id: newPlayerId,
        name: player_data.name,
        place: player_data.place || null,
        date_of_birth: player_data.date_of_birth || null,
        email: player_data.email || null,
        phone: player_data.phone || null,
        photo_url: player_data.photo_url || null,
        photo_file_id: player_data.photo_file_id || null,
        category: player_data.category || 'A',
        is_registered: true,
        current_season_id: season_id,
        registered_email: user_email,
        registered_user_id: user_uid,
        is_active: true,
        is_available: true,
        role: 'player',
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
    }

      return NextResponse.json(
        {
          success: true,
          message: 'Player registration confirmed successfully',
          data: {
            player_id,
            season_id,
            registration_id: registrationId,
          },
        },
        { status: 200 }
      );
    } catch (dbError: any) {
      // Database operation failed - cleanup
      console.error('❌ Database operation failed:', dbError);
      
      // Try to delete the realplayerstats record if it was created
      try {
        await sql`DELETE FROM realplayerstats WHERE player_id = ${player_id} AND season_id = ${season_id}`;
        console.log('✅ Cleaned up realplayerstats record');
      } catch (cleanupError) {
        console.error('❌ Failed to cleanup realplayerstats:', cleanupError);
      }
      
      return NextResponse.json(
        {
          success: false,
          error: dbError.message || 'Registration failed due to database error',
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error confirming player registration:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to confirm registration',
      },
      { status: 500 }
    );
  }
}
