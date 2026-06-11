import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/firebase/admin';
import { logTransaction } from '@/lib/transaction-logger';

/**
 * POST /api/realplayers/adjust-salaries-for-edit
 * Adjust salaries when players are swapped in result edits
 * - Refund salary for players who were originally in match but got substituted
 * - Deduct salary for players who are now in match but weren't originally
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fixture_id, season_id } = body;

    console.log(`\n💰 SALARY ADJUSTMENTS DISABLED (fixture: ${fixture_id}, season: ${season_id})`);

    return NextResponse.json({
      success: true,
      message: 'Salary adjustments bypassed (salary system is disabled)',
      refunds: [],
      deductions: [],
      no_changes: [],
    });
  } catch (error) {
    console.error('Error bypassing salary adjustment:', error);
    return NextResponse.json(
      { error: 'Failed to adjust salaries' },
      { status: 500 }
    );
  }
}

/**
 * Refund salary for player who was removed from match
 */
async function processRefund(
  playerId: string,
  playerName: string,
  seasonId: string,
  fixtureId: string,
  sql: any,
  refunds: any[]
) {
  try {
    // Get player's team and salary
    const playerData = await sql`
      SELECT team_id, salary_per_match
      FROM player_seasons
      WHERE id = ${`${playerId}_${seasonId}`}
      LIMIT 1
    `;

    if (playerData.length === 0) {
      console.log(`⚠️  Player ${playerName} not found in player_seasons`);
      return;
    }

    const { team_id, salary_per_match } = playerData[0];
    const salary = parseFloat(salary_per_match) || 0;

    if (!team_id || salary <= 0) {
      console.log(`⚠️  ${playerName}: Invalid team or salary`);
      return;
    }

    // Get team's current balance
    const teamSeasonDocId = `${team_id}_${seasonId}`;
    const teamSeasonRef = adminDb.collection('team_seasons').doc(teamSeasonDocId);
    const teamSeasonDoc = await teamSeasonRef.get();

    if (!teamSeasonDoc.exists) {
      console.log(`⚠️  Team season ${teamSeasonDocId} not found`);
      return;
    }

    const currentBalance = teamSeasonDoc.data()?.real_player_budget || 0;
    const newBalance = currentBalance + salary; // ADD back salary

    // Update team balance
    await teamSeasonRef.update({
      real_player_budget: newBalance,
      updated_at: new Date(),
    });

    // Log refund transaction
    await logTransaction({
      team_id,
      season_id: seasonId,
      transaction_type: 'adjustment',
      currency_type: 'real_player',
      amount: salary, // POSITIVE (refund)
      balance_before: currentBalance,
      balance_after: newBalance,
      description: `Salary refund: ${playerName} (result edited, player removed)`,
      metadata: {
        fixture_id: fixtureId,
        player_id: playerId,
        player_name: playerName,
        salary_amount: salary,
        reason: 'result_edit_player_removed',
      },
    });

    refunds.push({
      player_id: playerId,
      player_name: playerName,
      team_id,
      salary,
      balance_before: currentBalance,
      balance_after: newBalance,
    });

    console.log(`   ↩️  Refunded $${salary.toFixed(2)} to ${team_id} for ${playerName}`);
  } catch (error) {
    console.error(`Error processing refund for ${playerName}:`, error);
  }
}

/**
 * Deduct salary for player who was added to match
 */
async function processDeduction(
  playerId: string,
  playerName: string,
  seasonId: string,
  fixtureId: string,
  sql: any,
  deductions: any[]
) {
  try {
    // Get player's team and salary
    const playerData = await sql`
      SELECT team_id, salary_per_match
      FROM player_seasons
      WHERE id = ${`${playerId}_${seasonId}`}
      LIMIT 1
    `;

    if (playerData.length === 0) {
      console.log(`⚠️  Player ${playerName} not found in player_seasons`);
      return;
    }

    const { team_id, salary_per_match } = playerData[0];
    const salary = parseFloat(salary_per_match) || 0;

    if (!team_id || salary <= 0) {
      console.log(`⚠️  ${playerName}: Invalid team or salary`);
      return;
    }

    // Get team's current balance
    const teamSeasonDocId = `${team_id}_${seasonId}`;
    const teamSeasonRef = adminDb.collection('team_seasons').doc(teamSeasonDocId);
    const teamSeasonDoc = await teamSeasonRef.get();

    if (!teamSeasonDoc.exists) {
      console.log(`⚠️  Team season ${teamSeasonDocId} not found`);
      return;
    }

    const currentBalance = teamSeasonDoc.data()?.real_player_budget || 0;
    const newBalance = currentBalance - salary; // SUBTRACT salary

    // Update team balance
    await teamSeasonRef.update({
      real_player_budget: newBalance,
      updated_at: new Date(),
    });

    // Log deduction transaction
    await logTransaction({
      team_id,
      season_id: seasonId,
      transaction_type: 'salary_payment',
      currency_type: 'real_player',
      amount: -salary, // NEGATIVE (deduction)
      balance_before: currentBalance,
      balance_after: newBalance,
      description: `Salary: ${playerName} (result edited, player added)`,
      metadata: {
        fixture_id: fixtureId,
        player_id: playerId,
        player_name: playerName,
        salary_amount: salary,
        reason: 'result_edit_player_added',
        player_count: 1,
      },
    });

    deductions.push({
      player_id: playerId,
      player_name: playerName,
      team_id,
      salary,
      balance_before: currentBalance,
      balance_after: newBalance,
    });

    console.log(`   💸 Deducted $${salary.toFixed(2)} from ${team_id} for ${playerName}`);
  } catch (error) {
    console.error(`Error processing deduction for ${playerName}:`, error);
  }
}
