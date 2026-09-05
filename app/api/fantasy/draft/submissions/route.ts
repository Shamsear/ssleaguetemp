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

    const bidCountsMap = new Map(bidCounts.map((b: any) => [b.team_id, Number(b.count)]));

    // 3. Fetch full bid details for submitted teams
    const submittedTeamIds = teams.filter((t: any) => t.draft_submitted).map((t: any) => t.team_id);
    const teamBidsMap = new Map<string, any[]>();

    if (submittedTeamIds.length > 0) {
      const allBids = await fantasySql`
        SELECT team_id, slot_index, priority, target_id, bid_type, bid_amount
        FROM fantasy_draft_bids
        WHERE league_id = ${league_id} AND team_id = ANY(${submittedTeamIds})
        ORDER BY team_id, slot_index ASC, priority ASC
      `;
      for (const b of allBids) {
        if (!teamBidsMap.has(b.team_id)) teamBidsMap.set(b.team_id, []);
        teamBidsMap.get(b.team_id)!.push({
          slot_index: b.slot_index,
          priority: b.priority,
          target_id: b.target_id,
          bid_type: b.bid_type,
          bid_amount: Number(b.bid_amount)
        });
      }
    }

    // 4. Fetch slot names for formatting
    const leagues = await fantasySql`
      SELECT category_settings FROM fantasy_leagues WHERE league_id = ${league_id} LIMIT 1
    `;
    const categorySettings = leagues[0]
      ? (typeof leagues[0].category_settings === 'string' ? JSON.parse(leagues[0].category_settings) : leagues[0].category_settings)
      : {};
    const slotNameMap = new Map<number, string>();
    (categorySettings?.slots || []).forEach((s: any) => slotNameMap.set(s.slot_index, s.name));

    // 4. Fetch per-slot submission status (gracefully handle missing table)
    const slotSubMap = new Map<string, any>();
    try {
      const slotSubmissions = await fantasySql`
        SELECT team_id, slot_index, submitted_at
        FROM fantasy_slot_submissions
        WHERE league_id = ${league_id}
      `;
      for (const ss of slotSubmissions) {
        slotSubMap.set(`${ss.team_id}_${ss.slot_index}`, { submitted_at: ss.submitted_at });
      }
    } catch {
      // Table may not exist yet — only mark slots where team has bids AND draft_submitted is true
      for (const t of teams) {
        if (t.draft_submitted) {
          const teamBids = teamBidsMap.get(t.team_id) || [];
          const bidSlots = new Set(teamBids.map((b: any) => b.slot_index));
          for (const slotIdx of bidSlots) {
            slotSubMap.set(`${t.team_id}_${slotIdx}`, { submitted_at: null });
          }
        }
      }
    }

    // Combine data
    const submissionStatuses = teams.map((t: any) => ({
      team_id: t.team_id,
      team_name: t.team_name,
      owner_name: t.owner_name,
      draft_submitted: !!t.draft_submitted,
      budget_remaining: Number(t.budget_remaining),
      total_bids: bidCountsMap.get(t.team_id) || 0,
      bids: teamBidsMap.get(t.team_id) || [],
      slot_submissions: Object.fromEntries(
        [...slotNameMap.entries()].map(([idx]) => [
          idx,
          !!slotSubMap.get(`${t.team_id}_${idx}`)
        ])
      )
    }));

    return NextResponse.json({
      success: true,
      teams: submissionStatuses,
      total_teams: teams.length,
      submitted_count: teams.filter((t: any) => t.draft_submitted).length,
      slot_names: Object.fromEntries(slotNameMap)
    });
  } catch (error) {
    console.error('Error fetching submission statuses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch submission statuses', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
