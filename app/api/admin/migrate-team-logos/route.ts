import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyAuth } from '@/lib/auth-helper';

export async function GET(request: NextRequest) {
  try {
    // Verify super admin auth
    const auth = await verifyAuth(['super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json({
        success: false,
        error: auth.error || 'Unauthorized',
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const execute = searchParams.get('execute') === 'true';

    console.log('[Migration] Starting team logo migration...', { execute });

    const teamsSnapshot = await adminDb.collection('teams').get();
    
    let migratedCount = 0;
    let skippedCount = 0;
    let errorsCount = 0;
    const logs: string[] = [];

    const addLog = (msg: string) => {
      console.log(msg);
      logs.push(msg);
    };

    addLog(`Found ${teamsSnapshot.size} teams to process.`);

    for (const teamDoc of teamsSnapshot.docs) {
      const teamData = teamDoc.data();
      const teamId = teamDoc.id;
      
      let resolvedLogo = teamData.logo_url || null;
      let source = 'teams';

      // If no logo on team, check team_seasons
      if (!resolvedLogo) {
        const seasonsSnapshot = await adminDb
          .collection('team_seasons')
          .where('team_id', '==', teamId)
          .get();
          
        for (const seasonDoc of seasonsSnapshot.docs) {
          const seasonData = seasonDoc.data();
          if (seasonData.team_logo) {
            resolvedLogo = seasonData.team_logo;
            source = `team_seasons (${seasonDoc.id})`;
            break;
          }
        }
      }

      // If still no logo, check user
      if (!resolvedLogo) {
        const userId = teamData.firebase_uid || teamData.user_id || teamData.owner_uid;
        if (userId) {
          const userDoc = await adminDb.collection('users').doc(userId).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData?.logoUrl || userData?.teamLogo) {
              resolvedLogo = userData?.logoUrl || userData?.teamLogo;
              source = `users (${userId})`;
            }
          }
        }
      }

      // Process update if we found a logo and it's not already correct on the team doc
      if (resolvedLogo) {
        if (!teamData.logo_url || teamData.logo_url !== resolvedLogo) {
          addLog(`[Migrating] Team ${teamId} (${teamData.team_name}): Found logo from ${source}`);
          
          if (execute) {
            try {
              // Update team document
              await teamDoc.ref.update({ logo_url: resolvedLogo });
              migratedCount++;
            } catch (error: any) {
              addLog(`[Error] Failed to update team ${teamId}: ${error.message}`);
              errorsCount++;
            }
          } else {
            migratedCount++; // Count as "would migrate"
          }
        } else {
          skippedCount++;
        }
      } else {
        addLog(`[Skipped] Team ${teamId} (${teamData.team_name}): No logo found anywhere.`);
        skippedCount++;
      }
    }

    addLog('--- Migration Summary ---');
    addLog(`Total Teams: ${teamsSnapshot.size}`);
    addLog(`${execute ? 'Successfully Migrated' : 'Would Migrate'}: ${migratedCount}`);
    addLog(`Skipped (Already Correct or No Logo): ${skippedCount}`);
    addLog(`Errors: ${errorsCount}`);

    return NextResponse.json({
      success: true,
      mode: execute ? 'execute' : 'dry-run',
      summary: {
        total: teamsSnapshot.size,
        migrated: migratedCount,
        skipped: skippedCount,
        errors: errorsCount,
      },
      logs
    });

  } catch (error: any) {
    console.error('Migration failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Migration failed'
    }, { status: 500 });
  }
}
