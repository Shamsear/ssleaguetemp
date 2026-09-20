import { NextRequest, NextResponse } from 'next/server';
import { getFantasyDb } from '@/lib/neon/fantasy-config';

export const dynamic = 'force-dynamic';

/**
 * POST /api/fantasy/captain-windows/[windowId]/reassign-previous
 * Reassigns captain and vice-captain from the previous window (or active squad)
 * for teams that haven't set their captain for this window.
 * 
 * Body:
 * - user_id: Required (admin user ID for audit)
 * - team_id: Optional (if provided, reassigns only this team; otherwise reassigns all unset teams)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ windowId: string }> }
) {
  try {
    const { windowId } = await params;
    const body = await request.json();
    const { user_id, team_id } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    const sql = getFantasyDb();

    // 1. Fetch window details
    const windowRows = await sql`
      SELECT 
        window_id,
        league_id,
        round_id,
        round_number,
        window_status,
        start_round,
        end_round
      FROM fantasy_captain_windows
      WHERE window_id = ${windowId}
    `;

    if (windowRows.length === 0) {
      return NextResponse.json(
        { error: 'Captain window not found' },
        { status: 404 }
      );
    }

    const window = windowRows[0];
    const leagueId = window.league_id;
    const roundId = window.round_id;
    const startRound = window.start_round || window.round_number || 1;
    const endRound = window.end_round || window.round_number || 1;

    // 2. Fetch teams to process
    let targetTeams: Array<{ team_id: string; team_name: string; owner_name: string }> = [];

    if (team_id) {
      const teamRes = await sql`
        SELECT team_id, team_name, owner_name 
        FROM fantasy_teams 
        WHERE league_id = ${leagueId} AND team_id = ${team_id}
      `;
      if (teamRes.length === 0) {
        return NextResponse.json(
          { error: 'Team not found in this league' },
          { status: 404 }
        );
      }
      targetTeams = teamRes as any;
    } else {
      const teamsRes = await sql`
        SELECT team_id, team_name, owner_name 
        FROM fantasy_teams 
        WHERE league_id = ${leagueId}
        ORDER BY team_name ASC
      `;
      targetTeams = teamsRes as any;
    }

    // 3. Find teams that already set captains in this window
    const existingSelections = await sql`
      SELECT DISTINCT team_id
      FROM fantasy_captain_history
      WHERE league_id = ${leagueId}
        AND window_id = ${windowId}
    `;
    const alreadySetTeamIds = new Set(existingSelections.map((s: any) => s.team_id));

    // Filter to only unset teams (or if a specific team was passed and already set, let admin know)
    const unsetTeams = targetTeams.filter(t => !alreadySetTeamIds.has(t.team_id));

    if (unsetTeams.length === 0) {
      return NextResponse.json({
        success: true,
        message: team_id 
          ? 'This team already has a captain set for this window.' 
          : 'All teams have already set their captains for this window.',
        reassigned_count: 0,
        failed_count: 0,
        results: []
      });
    }

    // 4. Player name lookup map for friendly output
    const allPlayers = await sql`
      SELECT real_player_id, player_name
      FROM fantasy_players
      WHERE league_id = ${leagueId}
    `;
    const playerMap = new Map(allPlayers.map((p: any) => [p.real_player_id, p.player_name]));

    const results: Array<{
      team_id: string;
      team_name: string;
      status: 'success' | 'failed';
      reason?: string;
      captain_name?: string;
      vice_captain_name?: string;
    }> = [];

    let reassignedCount = 0;
    let failedCount = 0;

    // 5. Process each unset team
    for (const team of unsetTeams) {
      let candidateCaptainId: string | null = null;
      let candidateVcId: string | null = null;

      // Check most recent history from a different window
      const historyRows = await sql`
        SELECT captain_player_id, vice_captain_player_id
        FROM fantasy_captain_history
        WHERE league_id = ${leagueId}
          AND team_id = ${team.team_id}
          AND window_id != ${windowId}
        ORDER BY changed_at DESC
        LIMIT 1
      `;

      if (historyRows.length > 0 && historyRows[0].captain_player_id && historyRows[0].vice_captain_player_id) {
        candidateCaptainId = historyRows[0].captain_player_id;
        candidateVcId = historyRows[0].vice_captain_player_id;
      } else {
        // Fallback: Check fantasy_squad for active captain/vice-captain
        const squadFlags = await sql`
          SELECT real_player_id, is_captain, is_vice_captain
          FROM fantasy_squad
          WHERE league_id = ${leagueId}
            AND team_id = ${team.team_id}
            AND (is_captain = true OR is_vice_captain = true)
        `;
        const cap = squadFlags.find((p: any) => p.is_captain);
        const vc = squadFlags.find((p: any) => p.is_vice_captain);
        if (cap && vc && cap.real_player_id !== vc.real_player_id) {
          candidateCaptainId = cap.real_player_id;
          candidateVcId = vc.real_player_id;
        }
      }

      if (!candidateCaptainId || !candidateVcId || candidateCaptainId === candidateVcId) {
        failedCount++;
        results.push({
          team_id: team.team_id,
          team_name: team.team_name,
          status: 'failed',
          reason: 'No previous captain and vice-captain found'
        });
        continue;
      }

      // Verify both candidate players are currently in the squad
      const squadCheck = await sql`
        SELECT real_player_id
        FROM fantasy_squad
        WHERE league_id = ${leagueId}
          AND team_id = ${team.team_id}
          AND real_player_id IN (${candidateCaptainId}, ${candidateVcId})
      `;

      if (squadCheck.length !== 2) {
        failedCount++;
        results.push({
          team_id: team.team_id,
          team_name: team.team_name,
          status: 'failed',
          reason: 'Previous captain or vice-captain is no longer in the squad'
        });
        continue;
      }

      // Valid! Apply captain selection
      // A. Update active captain in squad
      await sql`
        UPDATE fantasy_squad
        SET is_captain = false, is_vice_captain = false
        WHERE team_id = ${team.team_id} AND league_id = ${leagueId}
      `;

      await sql`
        UPDATE fantasy_squad
        SET is_captain = true
        WHERE team_id = ${team.team_id} AND league_id = ${leagueId} AND real_player_id = ${candidateCaptainId}
      `;

      await sql`
        UPDATE fantasy_squad
        SET is_vice_captain = true
        WHERE team_id = ${team.team_id} AND league_id = ${leagueId} AND real_player_id = ${candidateVcId}
      `;

      // B. Update points multiplier in fantasy_player_points for rounds in this window range
      await sql`
        UPDATE fantasy_player_points
        SET 
          is_captain = false,
          is_vice_captain = false,
          points_multiplier = 1
        WHERE team_id = ${team.team_id}
          AND league_id = ${leagueId}
          AND round_number >= ${startRound}
          AND round_number <= ${endRound}
      `;

      await sql`
        UPDATE fantasy_player_points
        SET 
          is_captain = true,
          points_multiplier = 2
        WHERE team_id = ${team.team_id}
          AND league_id = ${leagueId}
          AND real_player_id = ${candidateCaptainId}
          AND round_number >= ${startRound}
          AND round_number <= ${endRound}
      `;

      await sql`
        UPDATE fantasy_player_points
        SET 
          is_vice_captain = true
        WHERE team_id = ${team.team_id}
          AND league_id = ${leagueId}
          AND real_player_id = ${candidateVcId}
          AND round_number >= ${startRound}
          AND round_number <= ${endRound}
      `;

      // C. Insert into fantasy_captain_history
      const historyId = `ch_${team.team_id}_${roundId}_${Date.now()}_auto`;
      await sql`
        INSERT INTO fantasy_captain_history (
          history_id,
          league_id,
          team_id,
          round_id,
          window_id,
          captain_player_id,
          vice_captain_player_id,
          changed_by_user_id,
          notes
        ) VALUES (
          ${historyId},
          ${leagueId},
          ${team.team_id},
          ${roundId},
          ${windowId},
          ${candidateCaptainId},
          ${candidateVcId},
          ${user_id},
          'Auto-reassigned from previous window by admin'
        )
      `;

      reassignedCount++;
      results.push({
        team_id: team.team_id,
        team_name: team.team_name,
        status: 'success',
        captain_name: playerMap.get(candidateCaptainId) || candidateCaptainId,
        vice_captain_name: playerMap.get(candidateVcId) || candidateVcId
      });
    }

    // 6. Update teams_with_captain_set on fantasy_captain_windows
    const countRes = await sql`
      SELECT COUNT(DISTINCT team_id) as count
      FROM fantasy_captain_history
      WHERE league_id = ${leagueId}
        AND window_id = ${windowId}
    `;
    const totalSet = parseInt(countRes[0]?.count || '0');

    await sql`
      UPDATE fantasy_captain_windows
      SET teams_with_captain_set = ${totalSet}, updated_at = NOW()
      WHERE window_id = ${windowId}
    `;

    return NextResponse.json({
      success: true,
      message: `Reassigned captains for ${reassignedCount} team(s). ${failedCount > 0 ? `${failedCount} team(s) could not be reassigned.` : ''}`,
      reassigned_count: reassignedCount,
      failed_count: failedCount,
      results
    });
  } catch (error: any) {
    console.error('Error reassigning previous captains:', error);
    return NextResponse.json(
      { error: 'Failed to reassign previous captains', details: error.message },
      { status: 500 }
    );
  }
}
