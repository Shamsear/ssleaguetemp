import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * DELETE /api/register/player/delete
 * Delete player registration from all databases (Neon player_seasons, Firebase, Fantasy)
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.player_id || !body.season_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: player_id and season_id are required',
        },
        { status: 400 }
      );
    }

    const { player_id, season_id } = body;

    const registrationId = `${player_id}_${season_id}`;

    console.log(`🗑️ Deleting player registration: ${registrationId}`);

    // Get the player data from Neon to check registration type
    const sql = getTournamentDb();
    const playerStats = await sql`
      SELECT id, player_id, season_id
      FROM realplayerstats 
      WHERE player_id = ${player_id} AND season_id = ${season_id}
    `;

    if (playerStats.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Player registration not found',
        },
        { status: 404 }
      );
    }

    // For realplayerstats, we'll determine registration type from the season's registration phase
    const seasonDoc = await adminDb.collection('seasons').doc(season_id).get();
    if (!seasonDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: 'Season not found',
        },
        { status: 404 }
      );
    }
    
    const seasonData = seasonDoc.data()!;
    // Assume confirmed registration for now (we can enhance this later if needed)
    const registrationType = 'confirmed';

    // Delete from Neon realplayerstats table
    await sql`
      DELETE FROM realplayerstats 
      WHERE player_id = ${player_id} AND season_id = ${season_id}
    `;

    console.log(`✅ Deleted from Neon realplayerstats: ${player_id} for season ${season_id}`);

    // Delete from Firebase realplayer collection
    try {
      const firestoreDb = adminDb;
      await firestoreDb.collection('realplayer').doc(registrationId).delete();
      console.log(`✅ Deleted from Firebase realplayer: ${registrationId}`);
    } catch (fbError) {
      console.warn('Firebase realplayer deletion failed (may not exist):', fbError);
    }

    // Auto-promote unconfirmed player if this was a confirmed registration
    let promotedPlayer = null;
    if (registrationType === 'confirmed') {
      const currentFilled = seasonData.confirmed_slots_filled || 0;
      const confirmedLimit = seasonData.confirmed_slots_limit || 999;
      
      if (currentFilled > 0) {
        // Decrement the counter first
        await adminDb.collection('seasons').doc(season_id).update({
          confirmed_slots_filled: currentFilled - 1,
        });
        console.log(`✅ Decremented confirmed_slots_filled for season ${season_id}`);
        
        // Check if we're still below the limit (meaning we have space)
        if (currentFilled <= confirmedLimit) {
          // Note: Since realplayerstats doesn't have registration_type field,
          // we can't auto-promote unconfirmed players anymore
          // This feature would need to be implemented differently if needed
          console.log(`ℹ️ Auto-promotion not available with realplayerstats table`);
        }
      }
    }

    // Remove from fantasy league if exists
    try {
      const fantasyLeagues = await fantasySql`
        SELECT league_id
        FROM fantasy_leagues
        WHERE season_id = ${season_id}
        LIMIT 1
      `;

      if (fantasyLeagues.length > 0) {
        const leagueId = fantasyLeagues[0].league_id;
        await fantasySql`
          DELETE FROM fantasy_players
          WHERE player_id = ${player_id} AND league_id = ${leagueId}
        `;
        console.log(`✅ Removed from fantasy league ${leagueId}`);
      }
    } catch (fantasyError) {
      console.warn('Fantasy league removal failed (may not exist):', fantasyError);
    }

    // Update master realplayers collection status
    try {
      const playersQuery = await adminDb
        .collection('realplayers')
        .where('player_id', '==', player_id)
        .limit(1)
        .get();

      if (!playersQuery.empty) {
        await playersQuery.docs[0].ref.update({
          is_registered: false,
          current_season_id: null,
          registration_date: null,
        });
        console.log(`✅ Updated realplayers master collection`);
      }
    } catch (updateError) {
      console.warn('Master realplayers update failed:', updateError);
    }

    return NextResponse.json(
      {
        success: true,
        message: promotedPlayer 
          ? `Player registration deleted successfully. Auto-promoted ${promotedPlayer.player_name} from unconfirmed to confirmed.`
          : 'Player registration deleted successfully',
        data: {
          player_id,
          season_id,
          deleted_registration: registrationId,
          promoted_player: promotedPlayer ? {
            player_id: promotedPlayer.player_id,
            player_name: promotedPlayer.player_name,
            registration_date: promotedPlayer.registration_date,
          } : null,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error deleting player registration:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to delete registration',
      },
      { status: 500 }
    );
  }
}
