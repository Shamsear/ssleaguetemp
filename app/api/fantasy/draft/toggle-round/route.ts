import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { verifyAuth } from '@/lib/auth-helper';

/**
 * POST /api/fantasy/draft/toggle-round
 * Admin endpoint to open, close, or extend a transfer window category draft round
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(['committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized - Committee access required' }, { status: 401 });
    }

    const body = await request.json();
    const { league_id, window_id, category, action, opens_at, closes_at } = body;

    if (!league_id || !window_id || !category || !action) {
      return NextResponse.json(
        { error: 'Missing required parameters: league_id, window_id, category, action' },
        { status: 400 }
      );
    }

    const isActive = action === 'open' || action === 'active';
    const roundStatus = isActive ? 'active' : action === 'close' ? 'closed' : 'completed';

    const opensUTC = opens_at ? new Date(opens_at).toISOString() : new Date().toISOString();
    const closesUTC = closes_at ? new Date(closes_at).toISOString() : new Date(Date.now() + 2 * 3600 * 1000).toISOString();

    // 1. Update transfer window table
    await fantasySql`
      UPDATE fantasy_transfer_windows
      SET 
        is_active = ${isActive},
        status = ${roundStatus},
        opens_at = ${opensUTC},
        closes_at = ${closesUTC},
        start_time = ${opensUTC},
        end_time = ${closesUTC},
        config = jsonb_build_object('active_category', ${category}),
        updated_at = NOW()
      WHERE window_id = ${window_id} OR league_id = ${league_id}
    `;

    // 2. Map category to draft round slot_name
    let slotPattern = category;
    if (category.toUpperCase().includes('RED 1') || category.toUpperCase() === 'RED 1') slotPattern = 'Red Slot 1';
    else if (category.toUpperCase().includes('RED 2') || category.toUpperCase() === 'RED 2') slotPattern = 'Red Slot 2';
    else if (category.toUpperCase().includes('BLACK')) slotPattern = 'Black Slot';
    else if (category.toUpperCase().includes('BLUE')) slotPattern = 'Blue Slot';
    else if (category.toUpperCase().includes('WHITE')) slotPattern = 'White Slot';
    else if (category.toUpperCase().includes('PASSIVE') || category.toUpperCase().includes('SUPPORTED')) slotPattern = 'Real Team Slot';

    // 3. Update matching draft round in fantasy_draft_rounds
    await fantasySql`
      UPDATE fantasy_draft_rounds
      SET 
        status = ${roundStatus},
        opens_at = ${opensUTC},
        closes_at = ${closesUTC},
        updated_at = NOW()
      WHERE league_id = ${league_id} AND (slot_name ILIKE ${'%' + slotPattern + '%'} OR slot_name ILIKE ${'%' + category + '%'})
    `;

    // 4. Reset other rounds to completed/closed if opening this one
    if (isActive) {
      await fantasySql`
        UPDATE fantasy_draft_rounds
        SET status = 'completed', updated_at = NOW()
        WHERE league_id = ${league_id} 
          AND NOT (slot_name ILIKE ${'%' + slotPattern + '%'} OR slot_name ILIKE ${'%' + category + '%'})
          AND status = 'active'
      `;
    }

    return NextResponse.json({
      success: true,
      message: `Round ${category} is now ${roundStatus.toUpperCase()}`,
      active_category: category,
      round_status: roundStatus,
      is_active: isActive,
      opens_at: opensUTC,
      closes_at: closesUTC
    });

  } catch (error: any) {
    console.error('Error toggling draft round:', error);
    return NextResponse.json(
      { error: 'Failed to toggle draft round', details: error.message },
      { status: 500 }
    );
  }
}
