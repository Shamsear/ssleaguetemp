import { NextRequest, NextResponse } from 'next/server';
import { processSlotBids } from '@/lib/fantasy/draft-processor';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { verifyAuth } from '@/lib/auth-helper';

/**
 * POST /api/fantasy/draft/preview
 * Preview draft finalization results WITHOUT applying changes
 * 
 * This calculates what would happen if draft is finalized, but doesn't:
 * - Update squads
 * - Deduct budgets
 * - Mark players as drafted
 * - Change draft status
 * 
 * Similar to normal auction preview-finalization
 */
export async function POST(request: NextRequest) {
  try {
    // Verify committee admin authorization
    const auth = await verifyAuth(['committee_admin', 'super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { league_id } = body;

    if (!league_id) {
      return NextResponse.json(
        { success: false, error: 'league_id is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 [PREVIEW] Starting preview for league: ${league_id}`);

    // 1. Check league exists and get settings
    const leagues = await fantasySql`
      SELECT 
        league_id, 
        season_id,
        draft_status,
        draft_finalization_mode,
        category_settings,
        budget_per_team
      FROM fantasy_leagues
      WHERE league_id = ${league_id}
      LIMIT 1
    `;

    if (leagues.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Fantasy league not found' },
        { status: 404 }
      );
    }

    const league = leagues[0];

    // 2. Verify draft can be previewed (must be closed or active, not completed)
    if (league.draft_status === 'completed') {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Cannot preview - draft is already completed' 
        },
        { status: 400 }
      );
    }

    if (league.draft_status === 'pending') {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Cannot preview - draft has not been started yet' 
        },
        { status: 400 }
      );
    }

    // 3. Get current state snapshot for comparison
    const currentSquads = await fantasySql`
      SELECT team_id, COUNT(*) as player_count
      FROM fantasy_squad
      WHERE league_id = ${league_id}
      GROUP BY team_id
    `;

    const currentBudgets = await fantasySql`
      SELECT team_id, budget_remaining
      FROM fantasy_teams
      WHERE league_id = ${league_id}
    `;

    // 4. Call the SAME processing function that finalization uses
    // But we'll read the results without writing them
    // We need to simulate what processSlotBids does WITHOUT database writes

    // Get all bids
    const allBids = await fantasySql`
      SELECT 
        id, 
        bid_id, 
        team_id, 
        slot_index, 
        priority, 
        target_id, 
        bid_type, 
        bid_amount, 
        submitted_at
      FROM fantasy_draft_bids
      WHERE league_id = ${league_id}
      ORDER BY slot_index ASC, bid_amount DESC, submitted_at ASC
    `;

    // Get team info
    const teams = await fantasySql`
      SELECT team_id, team_name, budget_remaining
      FROM fantasy_teams
      WHERE league_id = ${league_id} AND is_enabled = true
    `;

    const categorySettings = typeof league.category_settings === 'string'
      ? JSON.parse(league.category_settings)
      : league.category_settings;

    const slots = (categorySettings?.slots || []).sort((a: any, b: any) => a.slot_index - b.slot_index);
    const slotLists = categorySettings?.lists || {};

    // Build team budget map
    const teamBudgets = new Map<string, number>();
    const teamNames = new Map<string, string>();
    teams.forEach((t: any) => {
      teamBudgets.set(t.team_id, Number(t.budget_remaining));
      teamNames.set(t.team_id, t.team_name);
    });

    // Track filled slots per team
    const teamFilledSlots = new Map<string, Set<number>>();
    teams.forEach((t: any) => {
      teamFilledSlots.set(t.team_id, new Set<number>());
    });

    // Simulate the bid processing
    const resultsBySlot: any[] = [];
    const awardedTargets = new Set<string>();
    let totalPlayersDrafted = 0;
    let totalTeamsDrafted = 0;
    let totalBudgetSpent = 0;

    for (const slot of slots) {
      const slotIdx = slot.slot_index;
      const slotBids = allBids.filter((b: any) => b.slot_index === slotIdx);

      const bidsByTarget = new Map<string, any[]>();
      slotBids.forEach((bid: any) => {
        if (!bidsByTarget.has(bid.target_id)) {
          bidsByTarget.set(bid.target_id, []);
        }
        bidsByTarget.get(bid.target_id)!.push(bid);
      });

      const slotWinners: any[] = [];

      for (const [targetId, targetBids] of bidsByTarget.entries()) {
        if (awardedTargets.has(targetId)) {
          continue;
        }

        const sortedBids = [...targetBids].sort((a: any, b: any) => {
          if (Number(b.bid_amount) !== Number(a.bid_amount)) {
            return Number(b.bid_amount) - Number(a.bid_amount);
          }
          return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
        });

        let wonBid = null;
        for (const bid of sortedBids) {
          const teamId = bid.team_id;
          const bidAmt = Number(bid.bid_amount);

          if (teamFilledSlots.get(teamId)!.has(slotIdx)) {
            continue;
          }

          const currentBudget = teamBudgets.get(teamId)!;
          if (currentBudget < bidAmt) {
            continue;
          }

          wonBid = bid;
          break;
        }

        if (wonBid) {
          const teamId = wonBid.team_id;
          const bidAmt = Number(wonBid.bid_amount);

          teamBudgets.set(teamId, teamBudgets.get(teamId)! - bidAmt);
          teamFilledSlots.get(teamId)!.add(slotIdx);
          awardedTargets.add(targetId);

          slotWinners.push({
            team_id: teamId,
            team_name: teamNames.get(teamId) || teamId,
            target_id: targetId,
            target_name: targetId,
            bid_type: wonBid.bid_type,
            bid_amount: bidAmt
          });

          if (wonBid.bid_type === 'player') {
            totalPlayersDrafted++;
          } else {
            totalTeamsDrafted++;
          }
          totalBudgetSpent += bidAmt;
        }
      }

      resultsBySlot.push({
        slot_index: slotIdx,
        slot_name: slot.name,
        total_bids: slotBids.length,
        winners: slotWinners.length,
        winning_bids: slotWinners
      });
    }

    // Calculate average squad size
    const averageSquadSize = teams.length > 0 ? totalPlayersDrafted / teams.length : 0;

    // Build preview response
    const preview = {
      success: true,
      is_preview: true,
      league_id,
      draft_status: league.draft_status,
      finalization_mode: league.draft_finalization_mode,
      results_by_slot: resultsBySlot,
      total_players_drafted: totalPlayersDrafted,
      total_teams_drafted: totalTeamsDrafted,
      total_budget_spent: totalBudgetSpent,
      average_squad_size: averageSquadSize,
      current_state: {
        squads: currentSquads.map((s: any) => ({
          team_id: s.team_id,
          player_count: Number(s.player_count)
        })),
        budgets: currentBudgets.map((b: any) => ({
          team_id: b.team_id,
          budget_remaining: Number(b.budget_remaining)
        }))
      },
      team_previews: teams.map((t: any) => ({
        team_id: t.team_id,
        team_name: t.team_name,
        current_budget: Number(t.budget_remaining),
        projected_budget: teamBudgets.get(t.team_id) || 0,
        budget_spent: Number(t.budget_remaining) - (teamBudgets.get(t.team_id) || 0),
        players_won: resultsBySlot.reduce((count, slot) => {
          return count + slot.winning_bids.filter((b: any) => 
            b.team_id === t.team_id && b.bid_type === 'player'
          ).length;
        }, 0)
      })),
      message: 'Preview calculated successfully. No changes have been applied to the database.'
    };

    console.log(`✅ [PREVIEW] Preview complete: ${totalPlayersDrafted} players, ${totalTeamsDrafted} teams`);

    return NextResponse.json(preview);

  } catch (error) {
    console.error('❌ [PREVIEW] Error generating preview:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to generate preview',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
