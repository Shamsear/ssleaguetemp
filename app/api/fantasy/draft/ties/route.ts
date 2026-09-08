import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/draft/ties?league_id=xxx
 * Get pending and resolved draft ties for admin resolution
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('league_id');

    if (!leagueId) {
      return NextResponse.json({ error: 'league_id is required' }, { status: 400 });
    }

    const ties = await fantasySql`
      SELECT 
        dt.tie_id,
        dt.draft_round_id,
        dt.league_id,
        dt.target_id,
        dt.target_name,
        dt.category,
        dt.is_passive_team,
        dt.tied_team_ids,
        dt.tied_bid_amount,
        dt.admin_adjusted_amount,
        dt.winning_team_id,
        dt.status,
        dt.created_at,
        dt.resolved_at,
        wt.team_name as winning_team_name
      FROM fantasy_draft_ties dt
      LEFT JOIN fantasy_teams wt ON dt.winning_team_id = wt.team_id
      WHERE dt.league_id = ${leagueId}
      ORDER BY dt.created_at DESC
    `;

    // Fetch team names for tied teams
    const allTeams = await fantasySql`
      SELECT team_id, team_name FROM fantasy_teams WHERE league_id = ${leagueId}
    `;

    const teamMap: Record<string, string> = {};
    for (const t of allTeams) {
      teamMap[t.team_id] = t.team_name;
    }

    const enrichedTies = ties.map((t: any) => {
      const teamIds: string[] = typeof t.tied_team_ids === 'string' ? JSON.parse(t.tied_team_ids) : (t.tied_team_ids || []);
      const tiedTeams = teamIds.map((id) => ({
        team_id: id,
        team_name: teamMap[id] || id
      }));

      return {
        ...t,
        tied_teams: tiedTeams
      };
    });

    return NextResponse.json({
      success: true,
      ties: enrichedTies
    });

  } catch (error: any) {
    console.error('Error fetching ties:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ties', details: error.message },
      { status: 500 }
    );
  }
}
