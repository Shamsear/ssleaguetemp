import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { verifyAuth } from '@/lib/auth-helper';

const INITIAL_SPEND_MAP: Record<string, { squadSpend: number; passiveSpend: number; passiveTeamName: string }> = {
  'SSPSLT0041': { squadSpend: 440, passiveSpend: 58, passiveTeamName: 'RED PANTHERS' },
  'SSPSLT0027': { squadSpend: 290, passiveSpend: 83, passiveTeamName: 'FC BARCELONA' },
  'SSPSLT0003': { squadSpend: 454, passiveSpend: 45, passiveTeamName: 'PES GUARDIANS' },
  'SSPSLT0004': { squadSpend: 232, passiveSpend: 99, passiveTeamName: 'LOS GALACTICOS' },
  'SSPSLT0021': { squadSpend: 301, passiveSpend: 70, passiveTeamName: 'CLASSIC TENS' },
  'SSPSLT0015': { squadSpend: 294, passiveSpend: 162, passiveTeamName: 'LEGENDS FC' },
  'SSPSLT0005': { squadSpend: 209, passiveSpend: 151, passiveTeamName: 'TM ASGARDIANS' },
  'SSPSLT0001': { squadSpend: 345, passiveSpend: 36, passiveTeamName: 'ANDIMUKK FC' },
};

/**
 * GET /api/fantasy/audit/reconcile-budgets
 * Performs dynamic, transaction-accurate budget audit for all fantasy teams in the league
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(['committee_admin', 'admin', 'team_owner', 'super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const leagueId = searchParams.get('league_id') || 'SSPSLFLS18';

    // 1. Fetch releases refunds
    const releases = await fantasySql`
      SELECT team_id, refund_amount, is_passive_team, player_name, released_at
      FROM fantasy_releases
      WHERE league_id = ${leagueId}
    `;

    const refundsByTeam: Record<string, number> = {};
    for (const r of releases) {
      refundsByTeam[r.team_id] = (refundsByTeam[r.team_id] || 0) + Number(r.refund_amount || 0);
    }

    // 2. Fetch won post-release bids across all windows
    const wonBids = await fantasySql`
      SELECT team_id, bid_amount, category, is_passive_team, target_name, draft_round_id
      FROM fantasy_post_release_bids
      WHERE league_id = ${leagueId} AND status = 'won'
    `;

    const wonSpendByTeam: Record<string, number> = {};
    for (const b of wonBids) {
      wonSpendByTeam[b.team_id] = (wonSpendByTeam[b.team_id] || 0) + Number(b.bid_amount || 0);
    }

    // 3. Fetch fantasy teams
    const teams = await fantasySql`
      SELECT team_id, team_name, budget_remaining, supported_team_id, supported_team_name
      FROM fantasy_teams
      WHERE league_id = ${leagueId}
      ORDER BY team_name
    `;

    const audit = teams.map((t: any) => {
      const initData = INITIAL_SPEND_MAP[t.team_id] || { squadSpend: 0, passiveSpend: 0, passiveTeamName: '' };
      const totalInitialSpend = initData.squadSpend + initData.passiveSpend;
      const balanceAfterDraft = 500 - totalInitialSpend;
      const totalRefunds = refundsByTeam[t.team_id] || 0;
      const totalPostReleaseSpend = wonSpendByTeam[t.team_id] || 0;
      const calculatedBudget = Number((balanceAfterDraft + totalRefunds - totalPostReleaseSpend).toFixed(2));
      const currentDbBudget = Number(t.budget_remaining || 0);

      return {
        team_id: t.team_id,
        team_name: t.team_name,
        initial_spend: totalInitialSpend,
        balance_after_draft: balanceAfterDraft,
        refunds_received: totalRefunds,
        post_release_spend: totalPostReleaseSpend,
        calculated_budget: calculatedBudget,
        current_db_budget: currentDbBudget,
        is_synced: calculatedBudget === currentDbBudget
      };
    });

    return NextResponse.json({
      success: true,
      league_id: leagueId,
      audit
    });

  } catch (error: any) {
    console.error('Error auditing fantasy budgets:', error);
    return NextResponse.json(
      { error: 'Failed to audit fantasy budgets', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/fantasy/audit/reconcile-budgets
 * Reconciles and writes exact computed budgets to database
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(['committee_admin', 'admin', 'super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const leagueId = body.league_id || 'SSPSLFLS18';

    const releases = await fantasySql`
      SELECT team_id, refund_amount FROM fantasy_releases WHERE league_id = ${leagueId}
    `;
    const refundsByTeam: Record<string, number> = {};
    for (const r of releases) {
      refundsByTeam[r.team_id] = (refundsByTeam[r.team_id] || 0) + Number(r.refund_amount || 0);
    }

    const wonBids = await fantasySql`
      SELECT team_id, bid_amount FROM fantasy_post_release_bids WHERE league_id = ${leagueId} AND status = 'won'
    `;
    const wonSpendByTeam: Record<string, number> = {};
    for (const b of wonBids) {
      wonSpendByTeam[b.team_id] = (wonSpendByTeam[b.team_id] || 0) + Number(b.bid_amount || 0);
    }

    const teams = await fantasySql`
      SELECT team_id, team_name FROM fantasy_teams WHERE league_id = ${leagueId}
    `;

    const updated = [];
    for (const t of teams) {
      const initData = INITIAL_SPEND_MAP[t.team_id] || { squadSpend: 0, passiveSpend: 0, passiveTeamName: '' };
      const totalInitialSpend = initData.squadSpend + initData.passiveSpend;
      const balanceAfterDraft = 500 - totalInitialSpend;
      const totalRefunds = refundsByTeam[t.team_id] || 0;
      const totalPostReleaseSpend = wonSpendByTeam[t.team_id] || 0;
      const calculatedBudget = Number((balanceAfterDraft + totalRefunds - totalPostReleaseSpend).toFixed(2));

      await fantasySql`
        UPDATE fantasy_teams
        SET budget_remaining = ${calculatedBudget}, updated_at = NOW()
        WHERE league_id = ${leagueId} AND team_id = ${t.team_id}
      `;

      updated.push({ team_id: t.team_id, team_name: t.team_name, budget: calculatedBudget });
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully reconciled and updated all fantasy team budgets',
      updated
    });

  } catch (error: any) {
    console.error('Error reconciling fantasy budgets:', error);
    return NextResponse.json(
      { error: 'Failed to reconcile fantasy budgets', details: error.message },
      { status: 500 }
    );
  }
}
