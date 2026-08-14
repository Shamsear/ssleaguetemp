import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/draft/submissions?league_id=xxx
 * Get submission status of all teams for admin tracking
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const league_id = searchParams.get('league_id');

    if (!league_id) {
      return NextResponse.json(
        { error: 'Missing league_id parameter' },
        { status: 400 }
      );
    }

    // 1. Fetch all teams in the league
    const teams = await fantasySql`
      SELECT 
        team_id,
        team_name,
        owner_name,
        draft_submitted,
        budget_remaining
      FROM fantasy_teams
      WHERE league_id = ${league_id} AND is_enabled = true
      ORDER BY team_name ASC
    `;

    // 2. Fetch bid counts for each team
    const bidCounts = await fantasySql`
      SELECT team_id, COUNT(*) as count
      FROM fantasy_draft_bids
      WHERE league_id = ${league_id}
      GROUP BY team_id
    `;

    const bidCountsMap = new Map(bidCounts.map(b => [b.team_id, Number(b.count)]));

    // Combine data
    const submissionStatuses = teams.map(t => ({
      team_id: t.team_id,
      team_name: t.team_name,
      owner_name: t.owner_name,
      draft_submitted: !!t.draft_submitted,
      budget_remaining: Number(t.budget_remaining),
      total_bids: bidCountsMap.get(t.team_id) || 0
    }));

    return NextResponse.json({
      success: true,
      teams: submissionStatuses,
      total_teams: teams.length,
      submitted_count: teams.filter(t => t.draft_submitted).length
    });
  } catch (error) {
    console.error('Error fetching submission statuses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch submission statuses', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
