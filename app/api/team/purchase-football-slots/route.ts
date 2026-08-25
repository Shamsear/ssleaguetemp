import { NextRequest, NextResponse } from 'next/server';
import { getMainDb } from '@/lib/neon/main-config';
import { auctionSql as sql } from '@/lib/neon/auction-config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team_id, season_id, slots_to_purchase } = body;

    if (!team_id || !season_id || !slots_to_purchase) {
      return NextResponse.json(
        { success: false, error: 'team_id, season_id, and slots_to_purchase are required' },
        { status: 400 }
      );
    }

    if (slots_to_purchase < 1) {
      return NextResponse.json(
        { success: false, error: 'Must purchase at least 1 slot' },
        { status: 400 }
      );
    }

    // Get season settings from Neon
    const mainSql = getMainDb();
    const seasonRows = await mainSql`SELECT * FROM seasons WHERE id = ${season_id} LIMIT 1`;

    if (seasonRows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Season not found' },
        { status: 404 }
      );
    }

    const seasonData = seasonRows[0];
    const maxPurchasable = seasonData.football_max_purchasable_slots || 3;
    const slotPrice = seasonData.football_slot_price || 10;
    const purchaseEnabled = seasonData.football_slot_purchase_enabled !== false;

    if (!purchaseEnabled) {
      return NextResponse.json(
        { success: false, error: 'Slot purchases are currently disabled' },
        { status: 403 }
      );
    }

    // Get team_season from Neon
    const tsRows = await mainSql`SELECT * FROM team_seasons WHERE id = ${`${team_id}_${season_id}`} LIMIT 1`;

    if (tsRows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Team season not found' },
        { status: 404 }
      );
    }

    const teamSeasonData = tsRows[0];
    const currentPurchased = teamSeasonData.football_purchased_slots || 0;
    const currentBudget = teamSeasonData.football_budget || 0;

    // Check if team can purchase more slots
    if (currentPurchased + slots_to_purchase > maxPurchasable) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Cannot purchase ${slots_to_purchase} slots. Maximum purchasable is ${maxPurchasable}, you already have ${currentPurchased}.` 
        },
        { status: 400 }
      );
    }

    // Calculate cost
    const totalCost = slots_to_purchase * slotPrice;

    // Check if team has enough budget
    if (currentBudget < totalCost) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Insufficient budget. Need ₡${totalCost}, but only have ₡${currentBudget}` 
        },
        { status: 400 }
      );
    }

    // Perform update in Neon
    {
      const freshRows = await mainSql`SELECT football_budget, football_purchased_slots, football_base_slots FROM team_seasons WHERE id = ${`${team_id}_${season_id}`} LIMIT 1`;
      if (freshRows.length === 0) throw new Error('Team season not found');
      const freshData = freshRows[0];
      const freshBudget = freshData.football_budget || 0;
      const freshPurchased = freshData.football_purchased_slots || 0;
      const baseSlots = freshData.football_base_slots || seasonData.football_base_slots || 25;

      if (freshBudget < totalCost) throw new Error('Insufficient budget');

      const newPurchased = freshPurchased + slots_to_purchase;
      const newTotalSlots = baseSlots + newPurchased;
      const newBudget = freshBudget - totalCost;

      await mainSql`UPDATE team_seasons SET football_purchased_slots = ${newPurchased}, football_total_slots = ${newTotalSlots}, football_budget = ${newBudget}, updated_at = NOW() WHERE id = ${`${team_id}_${season_id}`}`;

      // Create transaction record in Neon
      const txId = `tx_${Date.now().toString(36)}`;
      await mainSql`
        INSERT INTO transactions (id, team_id, season_id, type, amount, description, status, raw_data, created_at, updated_at)
        VALUES (${txId}, ${team_id}, ${season_id}, 'slot_purchase', ${-totalCost},
          ${`Purchased ${slots_to_purchase} football player slot${slots_to_purchase > 1 ? 's' : ''}`},
          'completed', ${JSON.stringify({ slots_purchased: slots_to_purchase, price_per_slot: slotPrice })}, NOW(), NOW())
      `;
    }

    // Update Neon database
    try {
      await sql`
        UPDATE teams 
        SET 
          football_purchased_slots = football_purchased_slots + ${slots_to_purchase},
          football_total_slots = football_total_slots + ${slots_to_purchase}
        WHERE id = ${team_id}
      `;

      // Insert purchase history
      await sql`
        INSERT INTO football_slot_purchases (
          team_id, season_id, slots_purchased, price_per_slot, total_cost, notes
        ) VALUES (
          ${team_id}, ${season_id}, ${slots_to_purchase}, ${slotPrice}, ${totalCost},
          ${'Purchased via team dashboard'}
        )
      `;
    } catch (neonError) {
      console.error('Error updating Neon database:', neonError);
      // Don't fail the request if Neon update fails, Firebase is source of truth
    }

    return NextResponse.json({
      success: true,
      message: `Successfully purchased ${slots_to_purchase} slot${slots_to_purchase > 1 ? 's' : ''} for ₡${totalCost}`,
      data: {
        slots_purchased: slots_to_purchase,
        total_cost: totalCost,
        new_total_slots: (teamSeasonData.football_base_slots || 25) + (currentPurchased + slots_to_purchase),
        remaining_budget: currentBudget - totalCost
      }
    });
  } catch (error: any) {
    console.error('Error purchasing slots:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
