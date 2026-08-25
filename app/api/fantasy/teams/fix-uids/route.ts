import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * POST /api/fantasy/teams/fix-uids
 * Iterates all fantasy_teams rows and fixes owner_uid by looking up
 * the correct Firebase UID from the teams collection.
 *
 * Strategy:
 *  1. For each fantasy_team, find the matching Firebase team doc by team_id
 *  2. Get the correct owner_uid from Firebase (try owner_uid, uid, then look up users)
 *  3. Update fantasy_teams.owner_uid if it's wrong
 */
export async function POST(request: NextRequest) {
  try {
    // Optional: protect with a secret header
    const secret = request.headers.get('x-fix-secret');
    if (secret !== 'fix-uids-2026') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all fantasy teams
    const allTeams = await fantasySql`
      SELECT team_id, league_id, owner_uid, team_name
      FROM fantasy_teams
      WHERE is_enabled = true
      ORDER BY league_id, team_id
    `;

    console.log(`[FixUIDs] Found ${allTeams.length} fantasy teams to check`);

    const results = {
      total: allTeams.length,
      fixed: 0,
      already_ok: 0,
      not_found: 0,
      errors: [] as string[],
      details: [] as any[],
    };

    // Process in batches of 10 (Firestore IN query limit)
    const teamIds = allTeams.map(t => t.team_id);
    const firebaseTeamsMap = new Map<string, any>();

    for (let i = 0; i < teamIds.length; i += 10) {
      const batch = teamIds.slice(i, i + 10);
      try {
        const snap = await adminDb.collection('teams')
          .where('__name__', 'in', batch)
          .get();
        snap.docs.forEach(doc => {
          firebaseTeamsMap.set(doc.id, doc.data());
        });
      } catch (err: any) {
        console.error(`[FixUIDs] Error fetching batch:`, err.message);
      }
    }

    // Also check by uid field (some teams store owner under 'uid')
    // Build a reverse map: uid -> team_id
    const uidToTeamId = new Map<string, string>();
    for (const [teamId, data] of firebaseTeamsMap) {
      const uid = data.uid || data.owner_uid || '';
      if (uid) {
        uidToTeamId.set(uid, teamId);
      }
    }

    for (const ft of allTeams) {
      try {
        const fbTeam = firebaseTeamsMap.get(ft.team_id);

        if (!fbTeam) {
          results.not_found++;
          results.details.push({
            team_id: ft.team_id,
            league_id: ft.league_id,
            status: 'firebase_team_not_found',
          });
          continue;
        }

        // Determine the correct owner_uid from Firebase
        const correctUid = fbTeam.owner_uid || fbTeam.uid || '';

        if (!correctUid) {
          // Firebase team doc has no UID at all — try to find it via team_seasons
          const seasonId = ft.league_id.replace('SSPSLFLS', 'SSPSLS');
          const tsSnap = await adminDb.collection('team_seasons')
            .where('team_id', '==', ft.team_id)
            .where('season_id', '==', seasonId)
            .limit(1)
            .get();

          if (!tsSnap.empty) {
            const tsUid = tsSnap.docs[0].data().user_id || '';
            if (tsUid && tsUid !== ft.owner_uid) {
              await fantasySql`
                UPDATE fantasy_teams
                SET owner_uid = ${tsUid}, updated_at = NOW()
                WHERE team_id = ${ft.team_id} AND league_id = ${ft.league_id}
              `;
              results.fixed++;
              results.details.push({
                team_id: ft.team_id,
                league_id: ft.league_id,
                old_uid: ft.owner_uid,
                new_uid: tsUid,
                source: 'team_seasons',
              });
              console.log(`[FixUIDs] FIXED ${ft.team_name}: ${ft.owner_uid} → ${tsUid} (via team_seasons)`);
              continue;
            }
          }

          results.errors.push(`${ft.team_name}: Firebase team has no owner_uid or uid`);
          results.not_found++;
          continue;
        }

        if (correctUid === ft.owner_uid) {
          results.already_ok++;
          continue;
        }

        // Update with correct UID
        await fantasySql`
          UPDATE fantasy_teams
          SET owner_uid = ${correctUid}, updated_at = NOW()
          WHERE team_id = ${ft.team_id} AND league_id = ${ft.league_id}
        `;
        results.fixed++;
        results.details.push({
          team_id: ft.team_id,
          league_id: ft.league_id,
          team_name: ft.team_name,
          old_uid: ft.owner_uid,
          new_uid: correctUid,
          source: fbTeam.owner_uid ? 'owner_uid' : 'uid',
        });
        console.log(`[FixUIDs] FIXED ${ft.team_name}: ${ft.owner_uid} → ${correctUid}`);
      } catch (err: any) {
        results.errors.push(`${ft.team_name}: ${err.message}`);
      }
    }

    console.log(`[FixUIDs] Done: ${results.fixed} fixed, ${results.already_ok} ok, ${results.not_found} not found`);

    return NextResponse.json({
      success: true,
      message: `Fixed ${results.fixed} teams, ${results.already_ok} already correct, ${results.not_found} not found in Firebase`,
      results,
    });
  } catch (error) {
    console.error('[FixUIDs] Fatal error:', error);
    return NextResponse.json(
      { error: 'Failed to fix UIDs', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
