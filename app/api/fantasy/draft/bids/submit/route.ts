import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/fantasy/draft/bids/submit
 * Save or submit & lock draft bids for a team
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, bids, lock } = body;

    if (!user_id || !Array.isArray(bids)) {
      return NextResponse.json(
        { error: 'Missing required fields: user_id and bids array' },
        { status: 400 }
      );
    }

    // 1. Get fantasy team info — primary lookup by owner_uid
    let teamRow: any = null;
    const teams = await fantasySql`
      SELECT team_id, league_id, budget_remaining, draft_submitted 
      FROM fantasy_teams
      WHERE owner_uid = ${user_id} AND is_enabled = true
      LIMIT 1
    `;

    if (teams.length > 0) {
      teamRow = teams[0];
    } else {
      // Fallback: look up by team_id via Firebase uid field
      const { adminDb } = await import('@/lib/neon/admin-db-wrapper');
      const teamsSnap = await adminDb.collection('teams')
        .where('owner_uid', '==', user_id)
        .limit(1)
        .get();

      if (!teamsSnap.empty) {
        const firebaseTeamId = teamsSnap.docs[0].id;
        const byTeamId = await fantasySql`
          SELECT team_id, league_id, budget_remaining, draft_submitted
          FROM fantasy_teams
          WHERE team_id = ${firebaseTeamId} AND is_enabled = true
          LIMIT 1
        `;
        if (byTeamId.length > 0) {
          teamRow = byTeamId[0];
          // Self-heal owner_uid
          await fantasySql`
            UPDATE fantasy_teams SET owner_uid = ${user_id}, updated_at = NOW()
            WHERE team_id = ${firebaseTeamId} AND owner_uid != ${user_id}
          `;
        }
      }
    }

    if (!teamRow) {
      return NextResponse.json(
        { error: 'Fantasy team not found or not enabled' },
        { status: 404 }
      );
    }

    const { team_id, league_id, budget_remaining, draft_submitted } = teamRow;

    // 2. Load league draft settings for validation
    const leagues = await fantasySql`
      SELECT budget_per_team, draft_status, draft_opens_at, draft_closes_at, category_settings
      FROM fantasy_leagues
      WHERE league_id = ${league_id}
      LIMIT 1
    `;

    if (leagues.length === 0) {
      return NextResponse.json(
        { error: 'Fantasy league settings not found' },
        { status: 404 }
      );
    }

    const league = leagues[0];
    const draftStatus = league.draft_status || 'pending';
    
    // Check if draft is active — only block if status is explicitly not active
    if (draftStatus !== 'active') {
      return NextResponse.json(
        { error: 'Draft bidding is currently closed or inactive' },
        { status: 400 }
      );
    }

    // Check time window only if dates are actually set
    const now = new Date();
    const opensAt = league.draft_opens_at ? new Date(league.draft_opens_at) : null;
    const closesAt = league.draft_closes_at ? new Date(league.draft_closes_at) : null;
    if (opensAt && now < opensAt) {
      return NextResponse.json(
        { error: 'Draft bidding window has not opened yet' },
        { status: 400 }
      );
    }
    if (closesAt && now > closesAt) {
      return NextResponse.json(
        { error: 'Draft bidding window has closed' },
        { status: 400 }
      );
    }

    // If draft is already locked/submitted, prevent re-locking
    if (draft_submitted && lock) {
      return NextResponse.json(
        { error: 'Your bids are already locked and submitted' },
        { status: 400 }
      );
    }

    // Parse category settings
    const categorySettings = typeof league.category_settings === 'string'
      ? JSON.parse(league.category_settings)
      : league.category_settings;

    const slots = categorySettings?.slots || [];

    // 3. Validate bid amounts against slot base prices
    for (const bid of bids) {
      const slot = slots.find((s: any) => s.slot_index === bid.slot_index);
      if (!slot) {
        return NextResponse.json(
          { error: `Invalid slot index: ${bid.slot_index}` },
          { status: 400 }
        );
      }
      if (Number(bid.bid_amount) < Number(slot.base_price)) {
        return NextResponse.json(
          { error: `Bid for slot "${slot.name}" (${bid.bid_amount}) is below the base price of ${slot.base_price}` },
          { status: 400 }
        );
      }
    }

    const activeSlot = categorySettings?.active_slot_index ? Number(categorySettings.active_slot_index) : null;
    const maxBidsLimit = Number(categorySettings?.max_bids_per_team) || 0;

    // Validate max bids per team limit if configured
    if (maxBidsLimit > 0) {
      const countBids = bids.filter((b: any) => activeSlot ? b.slot_index === activeSlot : true);
      if (countBids.length > maxBidsLimit) {
        return NextResponse.json(
          { error: `You cannot place more than ${maxBidsLimit} bids for this draft round.` },
          { status: 400 }
        );
      }
    }

    // Validate unique bid amounts per team for the active slot
    const activeSlotBids = bids.filter((b: any) => activeSlot ? b.slot_index === activeSlot : true);
    const bidAmounts = activeSlotBids.map((b: any) => Number(b.bid_amount));
    const uniqueBidAmounts = new Set(bidAmounts);
    if (uniqueBidAmounts.size !== bidAmounts.length) {
      return NextResponse.json(
        { error: 'Each bid in your list for this draft round must have a unique bid amount. Duplicate bid amounts are not allowed.' },
        { status: 400 }
      );
    }

    // 4. Validate budget constraint
    let maxSpend = 0;
    if (activeSlot) {
      const slotBids = bids.filter((b: any) => b.slot_index === activeSlot);
      maxSpend = slotBids.length > 0 ? Math.max(...slotBids.map((b: any) => Number(b.bid_amount))) : 0;
    } else {
      const slotMaxBids: Record<number, number> = {};
      bids.forEach((bid: any) => {
        const slotIdx = bid.slot_index;
        const amt = Number(bid.bid_amount);
        if (!slotMaxBids[slotIdx] || amt > slotMaxBids[slotIdx]) {
          slotMaxBids[slotIdx] = amt;
        }
      });
      maxSpend = Object.values(slotMaxBids).reduce((sum, amt) => sum + amt, 0);
    }

    const budgetLimit = Number(budget_remaining);
    if (maxSpend > budgetLimit) {
      return NextResponse.json(
        { error: `Insufficient budget. Your highest bid for this round is ${maxSpend}, which exceeds your remaining budget of ${budgetLimit}.` },
        { status: 400 }
      );
    }

    // 5. Execute queries sequentially (Neon tagged-template doesn't support .transaction())
    // Delete old bids for the active slot (or all if no active slot)
    if (activeSlot) {
      await fantasySql`
        DELETE FROM fantasy_draft_bids
        WHERE team_id = ${team_id} AND league_id = ${league_id} AND slot_index = ${activeSlot}
      `;
    } else {
      await fantasySql`
        DELETE FROM fantasy_draft_bids
        WHERE team_id = ${team_id} AND league_id = ${league_id}
      `;
    }

    // Insert new bids one by one to avoid bulk insert API issues
    for (const bid of bids) {
      const bid_id = `bid_${uuidv4().replace(/-/g, '')}`;
      await fantasySql`
        INSERT INTO fantasy_draft_bids
          (bid_id, league_id, team_id, slot_index, priority, target_id, bid_type, bid_amount, status, submitted_at)
        VALUES
          (${bid_id}, ${league_id}, ${team_id}, ${Number(bid.slot_index)}, ${Number(bid.priority || 1)},
           ${bid.target_id}, ${bid.bid_type}, ${Number(bid.bid_amount)}, 'pending', NOW())
      `;
    }

    // Update draft submission flag
    await fantasySql`
      UPDATE fantasy_teams
      SET draft_submitted = ${!!lock},
          updated_at = CURRENT_TIMESTAMP
      WHERE team_id = ${team_id} AND league_id = ${league_id}
    `;

    return NextResponse.json({
      success: true,
      message: lock ? 'Bids submitted and locked successfully' : 'Draft bids saved successfully',
      draft_submitted: !!lock
    });
  } catch (error) {
    console.error('Error submitting bids:', error);
    return NextResponse.json(
      { error: 'Failed to submit bids', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


/**
 * DELETE /api/fantasy/draft/bids/submit?user_id=xxx
 * Unlock draft bids for editing (set draft_submitted = false)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing user_id parameter' },
        { status: 400 }
      );
    }

    // Get team (with fallback for mismatched owner_uid)
    let teams = await fantasySql`
      SELECT team_id, league_id 
      FROM fantasy_teams
      WHERE owner_uid = ${userId} AND is_enabled = true
      LIMIT 1
    `;

    if (teams.length === 0) {
      const { adminDb } = await import('@/lib/neon/admin-db-wrapper');
      const teamsSnap = await adminDb.collection('teams')
        .where('owner_uid', '==', userId)
        .limit(1)
        .get();
      if (!teamsSnap.empty) {
        const firebaseTeamId = teamsSnap.docs[0].id;
        teams = await fantasySql`
          SELECT team_id, league_id 
          FROM fantasy_teams
          WHERE team_id = ${firebaseTeamId} AND is_enabled = true
          LIMIT 1
        `;
        if (teams.length > 0) {
          await fantasySql`
            UPDATE fantasy_teams SET owner_uid = ${userId}, updated_at = NOW()
            WHERE team_id = ${firebaseTeamId} AND owner_uid != ${userId}
          `;
        }
      }
    }

    if (teams.length === 0) {
      return NextResponse.json(
        { error: 'Fantasy team not found or not enabled' },
        { status: 404 }
      );
    }

    const { team_id, league_id } = teams[0];

    // Check if draft is still active/open
    const leagues = await fantasySql`
      SELECT draft_status, draft_opens_at, draft_closes_at
      FROM fantasy_leagues
      WHERE league_id = ${league_id}
      LIMIT 1
    `;

    if (leagues.length > 0) {
      const league = leagues[0];
      const now = new Date();
      const closesAt = league.draft_closes_at ? new Date(league.draft_closes_at) : null;
      if (league.draft_status !== 'active' || (closesAt && now > closesAt)) {
        return NextResponse.json(
          { error: 'Draft is closed, cannot unlock bids' },
          { status: 400 }
        );
      }
    }

    // Unlock
    await fantasySql`
      UPDATE fantasy_teams
      SET draft_submitted = false,
          updated_at = CURRENT_TIMESTAMP
      WHERE team_id = ${team_id} AND league_id = ${league_id}
    `;

    return NextResponse.json({
      success: true,
      message: 'Draft unlocked successfully'
    });
  } catch (error) {
    console.error('Error unlocking draft:', error);
    return NextResponse.json(
      { error: 'Failed to unlock draft', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
