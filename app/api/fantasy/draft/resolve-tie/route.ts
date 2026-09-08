import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { verifyAuth } from '@/lib/auth-helper';

/**
 * POST /api/fantasy/draft/resolve-tie
 * Admin endpoint to resolve a draft tie with a new adjusted amount
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(['committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { tie_id, winning_team_id, admin_adjusted_amount } = body;

    if (!tie_id || !winning_team_id || admin_adjusted_amount === undefined || admin_adjusted_amount === null) {
      return NextResponse.json(
        { error: 'tie_id, winning_team_id, and admin_adjusted_amount are required' },
        { status: 400 }
      );
    }

    // 1. Fetch tie record
    const [tie] = await fantasySql`
      SELECT 
        tie_id, draft_round_id, league_id, target_id, target_name,
        category, is_passive_team, tied_team_ids, tied_bid_amount, status
      FROM fantasy_draft_ties
      WHERE tie_id = ${tie_id}
    `;

    if (!tie) {
      return NextResponse.json({ error: 'Tie record not found' }, { status: 404 });
    }

    if (tie.status === 'resolved') {
      return NextResponse.json({ error: 'Tie has already been resolved' }, { status: 400 });
    }

    const newAmount = parseFloat(admin_adjusted_amount);

    // 2. Verify winning team budget
    const [team] = await fantasySql`
      SELECT team_id, team_name, budget
      FROM fantasy_teams
      WHERE team_id = ${winning_team_id}
    `;

    if (!team) {
      return NextResponse.json({ error: 'Winning team not found' }, { status: 404 });
    }

    const currentBudget = parseFloat(team.budget || 0);
    if (currentBudget < newAmount) {
      return NextResponse.json(
        { error: `Winning team ${team.team_name} has insufficient budget (Available: ₹${currentBudget}M, Required: ₹${newAmount}M)` },
        { status: 400 }
      );
    }

    // 3. Award Target
    if (tie.is_passive_team) {
      // Assign supported team
      await fantasySql`
        UPDATE fantasy_teams
        SET supported_team_id = ${tie.target_id},
            supported_team_name = ${tie.target_name},
            supported_team_price = ${newAmount},
            updated_at = NOW()
        WHERE team_id = ${winning_team_id}
      `;
    } else {
      // Add player to squad
      const squadId = `squad_${winning_team_id}_${tie.target_id}_${Date.now()}`;
      await fantasySql`
        INSERT INTO fantasy_squad (
          squad_id, team_id, real_player_id, purchase_price, added_at
        ) VALUES (
          ${squadId}, ${winning_team_id}, ${tie.target_id}, ${newAmount}, NOW()
        )
      `;

      // Mark player unavailable
      await fantasySql`
        UPDATE fantasy_players
        SET is_available = false, updated_at = NOW()
        WHERE real_player_id = ${tie.target_id} AND league_id = ${tie.league_id}
      `;
    }

    // Deduct new amount from winning team's budget
    await fantasySql`
      UPDATE fantasy_teams
      SET budget = budget - ${newAmount}, updated_at = NOW()
      WHERE team_id = ${winning_team_id}
    `;

    // 4. Update Tie record status
    await fantasySql`
      UPDATE fantasy_draft_ties
      SET status = 'resolved',
          winning_team_id = ${winning_team_id},
          admin_adjusted_amount = ${newAmount},
          resolved_at = NOW()
      WHERE tie_id = ${tie_id}
    `;

    // Update bid records status
    await fantasySql`
      UPDATE fantasy_post_release_bids
      SET status = 'won'
      WHERE draft_round_id = ${tie.draft_round_id}
        AND target_id = ${tie.target_id}
        AND team_id = ${winning_team_id}
    `;

    await fantasySql`
      UPDATE fantasy_post_release_bids
      SET status = 'lost'
      WHERE draft_round_id = ${tie.draft_round_id}
        AND target_id = ${tie.target_id}
        AND team_id != ${winning_team_id}
    `;

    return NextResponse.json({
      success: true,
      message: `Tie resolved successfully! Awarded ${tie.target_name} to ${team.team_name} for ₹${newAmount}M.`
    });

  } catch (error: any) {
    console.error('Error resolving tie:', error);
    return NextResponse.json(
      { error: 'Failed to resolve tie', details: error.message },
      { status: 500 }
    );
  }
}
