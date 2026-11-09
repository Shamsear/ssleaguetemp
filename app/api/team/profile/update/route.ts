import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { verifyAuth } from '@/lib/auth-helper';
import { formatId, ID_PREFIXES, ID_PADDING } from '@/lib/id-utils';

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Profile update request received');
    
    const auth = await verifyAuth(['team'], request);
    if (!auth.authenticated) {
      console.error('❌ Authentication failed:', auth.error);
      return NextResponse.json({
        success: false,
        error: auth.error || 'Unauthorized',
      }, { status: 401 });
    }

    const userId = auth.userId!;
    console.log('✅ User authenticated:', userId);
    
    const body = await request.json();
    const { teamName, logoUrl, owner, manager, seasonId } = body;
    console.log('📦 Request data:', { teamName, logoUrl, hasOwner: !!owner, hasManager: !!manager, seasonId });

    // Get team ID from Neon or Firestore
    console.log('🔍 Fetching team for userId:', userId);
    const mainSql = getMainDb();
    let teamId: string | null = null;

    try {
      const teamResult = await mainSql`
        SELECT id, team_name, logo_url FROM teams 
        WHERE owner_uid = ${userId} OR uid = ${userId} OR id = ${userId} OR user_id = ${userId}
        LIMIT 1
      `;
      if (teamResult && teamResult.length > 0) {
        teamId = teamResult[0].id;
      }
    } catch (teamSqlErr) {
      console.warn('Error querying Neon teams by owner_uid:', teamSqlErr);
    }

    // Fallback: check Firestore users doc
    if (!teamId) {
      try {
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (userDoc.exists) {
          teamId = userDoc.data()?.teamId || null;
        }
      } catch (userDocErr) {
        console.warn('Error fetching user document for teamId:', userDocErr);
      }
    }
    
    if (!teamId) {
      console.error('❌ Team not found for userId:', userId);
      return NextResponse.json({
        success: false,
        error: 'Team not found for this user',
      }, { status: 404 });
    }

    console.log('✅ Team found:', teamId);

    // Update Neon teams table
    if (teamName || logoUrl) {
      try {
        const updates: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (teamName) {
          updates.push(`team_name = $${idx++}`);
          values.push(teamName.trim());
        }
        if (logoUrl) {
          updates.push(`logo_url = $${idx++}`);
          values.push(logoUrl);
        }
        updates.push('updated_at = NOW()');
        values.push(teamId);

        await mainSql.query(
          `UPDATE teams SET ${updates.join(', ')} WHERE id = $${idx} OR owner_uid = $${idx}`,
          values
        );
        console.log(`✅ Updated Neon teams table for team ID: ${teamId}`);
      } catch (neonUpdateErr) {
        console.error('Failed to update Neon teams table:', neonUpdateErr);
      }
    }

    // Update Neon team_seasons table if applicable
    if (logoUrl || teamName) {
      try {
        const tsUpdates: string[] = [];
        const tsValues: any[] = [];
        let tsIdx = 1;
        if (logoUrl) {
          tsUpdates.push(`logo_url = $${tsIdx++}`);
          tsValues.push(logoUrl);
        }
        if (teamName) {
          tsUpdates.push(`team_name = $${tsIdx++}`);
          tsValues.push(teamName.trim());
        }
        tsUpdates.push('updated_at = NOW()');
        tsValues.push(teamId);

        let query = `UPDATE team_seasons SET ${tsUpdates.join(', ')} WHERE team_id = $${tsIdx}`;
        if (seasonId) {
          tsValues.push(seasonId);
          query += ` AND season_id = $${++tsIdx}`;
        }
        await mainSql.query(query, tsValues);
        console.log(`✅ Updated Neon team_seasons table for team ID: ${teamId}`);
      } catch (neonTsErr) {
        console.warn('Failed to update Neon team_seasons table:', neonTsErr);
      }
    }

    // Update Firebase users collection (for global team info)
    if (teamName || logoUrl) {
      try {
        const userRef = adminDb.collection('users').doc(userId);
        const userUpdateData: any = {};
        
        if (teamName) userUpdateData.teamName = teamName.trim();
        if (logoUrl) {
          userUpdateData.logoUrl = logoUrl;
          userUpdateData.teamLogo = logoUrl;
        }
        
        await userRef.set(userUpdateData, { merge: true });
        console.log('✅ Updated users collection:', userUpdateData);
      } catch (userUpErr) {
        console.error('Failed to update user document:', userUpErr);
      }
    }

    // Update Firebase teams collection
    if (teamName || logoUrl) {
      try {
        const teamRef = adminDb.collection('teams').doc(teamId);
        const teamUpdateData: any = {};
        
        if (teamName) {
          teamUpdateData.team_name = teamName.trim();
          teamUpdateData.name = teamName.trim();
        }
        if (logoUrl) {
          teamUpdateData.logo_url = logoUrl;
          teamUpdateData.team_logo = logoUrl;
          teamUpdateData.logoUrl = logoUrl;
          teamUpdateData.teamLogo = logoUrl;
        }
        
        await teamRef.set(teamUpdateData, { merge: true });
        console.log('✅ Updated teams collection:', teamUpdateData);
      } catch (teamUpErr) {
        console.error('Failed to update team document:', teamUpErr);
      }
    }

    // Update team_seasons in Firebase
    if (seasonId && (teamName || logoUrl)) {
      try {
        const teamSeasonRef = adminDb.collection('team_seasons').doc(`${teamId}_${seasonId}`);
        const updateData: any = { updated_at: new Date() };
        
        if (teamName) updateData.team_name = teamName.trim();
        if (logoUrl) {
          updateData.team_logo = logoUrl;
          updateData.logo_url = logoUrl;
        }
        
        await teamSeasonRef.set(updateData, { merge: true });
        console.log('✅ Updated team_seasons collection:', updateData);
      } catch (tsUpErr) {
        console.error('Failed to update team_seasons document:', tsUpErr);
      }
    }

    const tournamentSql = getTournamentDb();

    // Handle owner updates
    if (owner) {
      const {
        name,
        photo_url,
        email,
        phone,
        date_of_birth,
        place,
        nationality,
        bio,
        instagram_handle,
        twitter_handle
      } = owner;

      // Check if owner exists for this team OR this user
      const existingOwner = await tournamentSql`
        SELECT id, team_id FROM owners 
        WHERE team_id = ${teamId} 
           OR (registered_user_id = ${userId} AND registered_user_id IS NOT NULL)
        LIMIT 1
      `;

      if (existingOwner.length > 0) {
        // Update existing owner
        await tournamentSql`
          UPDATE owners
          SET 
            name = ${name || ''},
            photo_url = ${photo_url || null},
            email = ${email || null},
            phone = ${phone || null},
            date_of_birth = ${date_of_birth || null},
            place = ${place || null},
            nationality = ${nationality || null},
            bio = ${bio || null},
            instagram_handle = ${instagram_handle || null},
            twitter_handle = ${twitter_handle || null},
            updated_at = NOW()
          WHERE id = ${existingOwner[0].id}
        `;
      } else {
        // Generate proper owner ID
        const latestOwner = await tournamentSql`
          SELECT owner_id FROM owners
          ORDER BY id DESC
          LIMIT 1
        `;

        let nextCounter = 1;
        if (latestOwner.length > 0) {
          const lastId = latestOwner[0].owner_id;
          const numericPart = lastId.replace(/\D/g, '');
          if (numericPart) {
            const lastCounter = parseInt(numericPart, 10);
            if (!isNaN(lastCounter)) {
              nextCounter = lastCounter + 1;
            }
          }
        }

        const ownerId = formatId(ID_PREFIXES.OWNER, nextCounter, ID_PADDING.OWNER);

        // Create new owner (note: season_id removed - owners are team-level)
        await tournamentSql`
          INSERT INTO owners (
            owner_id,
            team_id,
            name,
            photo_url,
            email,
            phone,
            date_of_birth,
            place,
            nationality,
            bio,
            instagram_handle,
            twitter_handle,
            is_active,
            registered_user_id,
            created_by,
            created_at,
            updated_at
          ) VALUES (
            ${ownerId},
            ${teamId},
            ${name || ''},
            ${photo_url || null},
            ${email || null},
            ${phone || null},
            ${date_of_birth || null},
            ${place || null},
            ${nationality || null},
            ${bio || null},
            ${instagram_handle || null},
            ${twitter_handle || null},
            true,
            ${userId},
            ${userId},
            NOW(),
            NOW()
          )
        `;
      }
    }

    // Handle manager updates
    if (manager && seasonId) {
      const {
        name,
        photo_url,
        email,
        phone,
        date_of_birth,
        place,
        nationality,
        jersey_number,
        is_player,
        player_id
      } = manager;

      // Check if manager exists for this season
      const existingManager = await tournamentSql`
        SELECT id FROM managers 
        WHERE team_id = ${teamId} AND season_id = ${seasonId}
        LIMIT 1
      `;

      if (existingManager.length > 0) {
        // Update existing manager
        await tournamentSql`
          UPDATE managers
          SET 
            name = ${name || ''},
            photo_url = ${photo_url || null},
            email = ${email || null},
            phone = ${phone || null},
            date_of_birth = ${date_of_birth || null},
            place = ${place || null},
            nationality = ${nationality || null},
            jersey_number = ${jersey_number || null},
            is_player = ${is_player || false},
            player_id = ${player_id || null},
            updated_at = NOW()
          WHERE id = ${existingManager[0].id}
        `;
      } else {
        // Generate proper manager ID
        const latestManager = await tournamentSql`
          SELECT manager_id FROM managers
          ORDER BY id DESC
          LIMIT 1
        `;

        let nextCounter = 1;
        if (latestManager.length > 0) {
          const lastId = latestManager[0].manager_id;
          const numericPart = lastId.replace(/\D/g, '');
          if (numericPart) {
            const lastCounter = parseInt(numericPart, 10);
            if (!isNaN(lastCounter)) {
              nextCounter = lastCounter + 1;
            }
          }
        }

        const managerId = formatId(ID_PREFIXES.MANAGER, nextCounter, ID_PADDING.MANAGER);

        // Create new manager
        await tournamentSql`
          INSERT INTO managers (
            manager_id,
            team_id,
            season_id,
            name,
            photo_url,
            email,
            phone,
            date_of_birth,
            place,
            nationality,
            jersey_number,
            is_player,
            player_id,
            is_active,
            created_by,
            created_at,
            updated_at
          ) VALUES (
            ${managerId},
            ${teamId},
            ${seasonId},
            ${name || ''},
            ${photo_url || null},
            ${email || null},
            ${phone || null},
            ${date_of_birth || null},
            ${place || null},
            ${nationality || null},
            ${jersey_number || null},
            ${is_player || false},
            ${player_id || null},
            true,
            ${userId},
            NOW(),
            NOW()
          )
        `;
      }
    }

    console.log('✅ Profile updated successfully');
    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
    });
  } catch (error: any) {
    console.error('❌ Error updating profile:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error message:', error.message);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update profile',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
