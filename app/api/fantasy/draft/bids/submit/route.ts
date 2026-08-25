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
      // Fallback: look up by team_id via Firebase (try owner_uid then uid field)
      const { adminDb } = await import('@/lib/neon/admin-db-wrapper');
      let firebaseTeamId: string | null = null;
      let teamsSnap = await adminDb.collection('teams').where('owner_uid', '==', user_id).limit(1).get();
      if (!teamsSnap.empty) {
        firebaseTeamId = teamsSnap.docs[0].id;
      } else {
        teamsSnap = await adminDb.collection('teams').where('uid', '==', user_id).limit(1).get();
        if (!teamsSnap.empty) {
          firebaseTeamId = teamsSnap.docs[0].id;
        }
      }

      if (firebaseTeamId) {
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
      SELECT budget_per_team, draft_status, category_settings
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

    // Check per-slot round status from fantasy_draft_rounds
    const bidSlotIndices = [...new Set(bids.map((b: any) => Number(b.slot_index)))];
    const now = new Date();

    for (const slotIdx of bidSlotIndices) {
      const round = await fantasySql`
        SELECT status, opens_at, closes_at FROM fantasy_draft_rounds
        WHERE league_id = ${league_id} AND slot_index = ${slotIdx}
        LIMIT 1
      `;
      if (round.length === 0) {
        return NextResponse.json(
          { error: `No draft round found for slot ${slotIdx}` },
          { status: 400 }
        );
      }
      const r = round[0];
      if (r.status !== 'active') {
        return NextResponse.json(
          { error: `Draft bidding for slot ${slotIdx} is ${r.status}, not active` },
          { status: 400 }
        );
      }
      if (r.opens_at && now < new Date(r.opens_at)) {
        return NextResponse.json(
          { error: `Draft bidding for slot ${slotIdx} has not opened yet` },
          { status: 400 }
        );
      }
      if (r.closes_at && now > new Date(r.closes_at)) {
        return NextResponse.json(
          { error: `Draft bidding for slot ${slotIdx} has closed` },
          { status: 400 }
        );
      }
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

    const maxBidsLimit = Number(categorySettings?.max_bids_per_team) || 0;

    // Validate max bids per slot
    const bidsBySlot: Record<number, any[]> = {};
    bids.forEach((b: any) => {
      const idx = Number(b.slot_index);
      if (!bidsBySlot[idx]) bidsBySlot[idx] = [];
      bidsBySlot[idx].push(b);
    });

    for (const [slotStr, slotBids] of Object.entries(bidsBySlot)) {
      if (maxBidsLimit > 0 && slotBids.length > maxBidsLimit) {
        return NextResponse.json(
          { error: `You cannot place more than ${maxBidsLimit} bids for slot ${slotStr}.` },
          { status: 400 }
        );
      }
      // Validate unique bid amounts within each slot
      const amounts = slotBids.map((b: any) => Number(b.bid_amount));
      if (new Set(amounts).size !== amounts.length) {
        return NextResponse.json(
          { error: `Each bid in slot ${slotStr} must have a unique bid amount.` },
          { status: 400 }
        );
      }
    }

    // 4. Validate budget constraint — max spend is the highest bid per slot
    let maxSpend = 0;
    for (const slotBids of Object.values(bidsBySlot)) {
      const slotMax = Math.max(...slotBids.map((b: any) => Number(b.bid_amount)));
      maxSpend += slotMax;
    }

    const budgetLimit = Number(budget_remaining);
    if (maxSpend > budgetLimit) {
      return NextResponse.json(
        { error: `Insufficient budget. Your highest bids total ${maxSpend}, which exceeds your remaining budget of ${budgetLimit}.` },
        { status: 400 }
      );
    }

    // 5. Delete old bids for each slot being submitted, then insert new ones
    for (const [slotStr, slotBids] of Object.entries(bidsBySlot)) {
      const slotIdx = Number(slotStr);
      // Get round_id for this slot
      const roundRow = await fantasySql`
        SELECT id FROM fantasy_draft_rounds
        WHERE league_id = ${league_id} AND slot_index = ${slotIdx}
        LIMIT 1
      `;
      const roundId = roundRow[0]?.id || null;

      await fantasySql`
        DELETE FROM fantasy_draft_bids
        WHERE team_id = ${team_id} AND league_id = ${league_id} AND slot_index = ${slotIdx}
      `;

      for (const bid of slotBids) {
        const bid_id = `bid_${uuidv4().replace(/-/g, '')}`;
        await fantasySql`
          INSERT INTO fantasy_draft_bids
            (bid_id, league_id, team_id, slot_index, round_id, priority, target_id, bid_type, bid_amount, status, submitted_at)
          VALUES
            (${bid_id}, ${league_id}, ${team_id}, ${slotIdx}, ${roundId}, ${Number(bid.priority || 1)},
             ${bid.target_id}, ${bid.bid_type}, ${Number(bid.bid_amount)}, 'pending', NOW())
        `;
      }
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
      let firebaseTeamId: string | null = null;
      let fbTeams = await adminDb.collection('teams').where('owner_uid', '==', userId).limit(1).get();
      if (!fbTeams.empty) {
        firebaseTeamId = fbTeams.docs[0].id;
      } else {
        fbTeams = await adminDb.collection('teams').where('uid', '==', userId).limit(1).get();
        if (!fbTeams.empty) {
          firebaseTeamId = fbTeams.docs[0].id;
        }
      }
      if (firebaseTeamId) {
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

    // Check if any round for this team's league is still active/open
    const activeRounds = await fantasySql`
      SELECT slot_index, status, closes_at FROM fantasy_draft_rounds
      WHERE league_id = ${league_id} AND status = 'active'
    `;

    if (activeRounds.length === 0) {
      return NextResponse.json(
        { error: 'No active draft round — cannot unlock bids' },
        { status: 400 }
      );
    }

    const now = new Date();
    for (const r of activeRounds) {
      if (r.closes_at && now > new Date(r.closes_at)) {
        return NextResponse.json(
          { error: `Draft round for slot ${r.slot_index} has already closed` },
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
