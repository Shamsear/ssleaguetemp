import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { verifyAuth } from '@/lib/auth-helper';

/**
 * POST /api/fantasy/draft/submit-category-bid
 * Submit a category-restricted draft bid with self-release prohibition & future rounds budget reservation
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth([], request);
    if (!auth.authenticated || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { draft_round_id, league_id, team_id, category, is_passive_team, target_id, target_name, bid_amount } = body;

    if (!draft_round_id || !league_id || !team_id || !category || !target_id || !bid_amount) {
      return NextResponse.json(
        { error: 'Missing required parameters: draft_round_id, league_id, team_id, category, target_id, bid_amount' },
        { status: 400 }
      );
    }

    // 1. Verify team details and budget
    const [team] = await fantasySql`
      SELECT team_id, owner_uid, budget_remaining
      FROM fantasy_teams
      WHERE team_id = ${team_id}
    `;

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // 2. SELF-RELEASE PROHIBITION: Team cannot bid on target they released in this window
    const selfReleases = await fantasySql`
      SELECT release_id 
      FROM fantasy_releases
      WHERE team_id = ${team_id}
        AND (window_id = ${draft_round_id} OR league_id = ${league_id})
        AND (
          real_player_id = ${target_id} 
          OR player_name = ${target_name || ''} 
          OR (is_passive_team = true AND ${is_passive_team || false} = true)
        )
    `;

    if (selfReleases.length > 0) {
      return NextResponse.json(
        { error: 'Forbidden: You cannot bid on a player or supported team that your team released in this transfer window.' },
        { status: 400 }
      );
    }

    // 3. MAX BIDS LIMIT FOR CATEGORY = Number of participating teams in this category
    // Query all window releases with resolved categories (supporting RED 1 and RED 2)
    const windowReleases = await fantasySql`
      SELECT 
        fr.team_id,
        CASE
          WHEN fr.is_passive_team = true THEN 'Passive Team'
          WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' AND (fdb.slot_index = 1 OR fdr.slot_name ILIKE '%Slot 1%') THEN 'RED 1'
          WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' AND (fdb.slot_index = 2 OR fdr.slot_name ILIKE '%Slot 2%') THEN 'RED 2'
          WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' THEN 'RED 1'
          ELSE UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, 'Red'))
        END as resolved_category
      FROM fantasy_releases fr
      LEFT JOIN fantasy_players fp ON (fr.real_player_id = fp.real_player_id OR fr.real_player_id = fp.id::text)
      LEFT JOIN fantasy_draft_bids fdb ON (
        (fdb.target_id::text = fp.id::text OR fdb.target_id::text = fp.real_player_id::text OR fdb.target_id::text = fr.real_player_id::text)
        AND fdb.status = 'won'
      )
      LEFT JOIN fantasy_draft_rounds fdr ON fdb.round_id = fdr.id
      WHERE (fr.window_id = ${draft_round_id} OR fr.league_id = ${league_id})
    `;

    const participatingTeamIds = new Set(
      windowReleases
        .filter((r) => r.resolved_category.toLowerCase() === category.toLowerCase())
        .map((r) => r.team_id)
    );
    const participatingTeamsCount = Math.max(1, participatingTeamIds.size);

    const existingCategoryBids = await fantasySql`
      SELECT bid_id 
      FROM fantasy_post_release_bids
      WHERE team_id = ${team_id}
        AND (draft_round_id = ${draft_round_id} OR league_id = ${league_id})
        AND (category ILIKE ${category} OR (${category === 'Passive Team'} AND is_passive_team = true))
        AND status = 'pending'
    `;

    if (existingCategoryBids.length >= participatingTeamsCount) {
      return NextResponse.json(
        { error: `Maximum bids limit reached (${participatingTeamsCount} max bids allowed for ${category} round based on ${participatingTeamsCount} participating teams).` },
        { status: 400 }
      );
    }

    // 4. FUTURE ROUNDS BUDGET RESERVATION
    // Find all remaining categories this team released items for in this window
    const teamReleases = windowReleases.filter((r) => r.team_id === team_id);

    let reservedFunds = 0;
    const processedCategories = new Set<string>();
    processedCategories.add(category.toLowerCase());

    for (const rel of teamReleases) {
      const catKey = rel.resolved_category.toLowerCase();
      if (processedCategories.has(catKey)) continue;
      processedCategories.add(catKey);

      // Find participating teams count N_future for this future category round
      const futureTeamIds = new Set(
        windowReleases
          .filter((r) => r.resolved_category.toLowerCase() === catKey)
          .map((r) => r.team_id)
      );
      const N_future = Math.max(1, futureTeamIds.size);
      const basePrice = 10; // Default base price ₹10 Cr
      const increment = 1;

      // Reserved formula: Base_Price + (N_future - 1) * Increment
      const categoryReserved = basePrice + (N_future - 1) * increment;
      reservedFunds += categoryReserved;
    }

    const currentBudget = parseFloat(team.budget_remaining || 0);
    const maxAllowedBid = Math.max(0, currentBudget - reservedFunds);
    const amount = parseFloat(bid_amount);

    if (amount > maxAllowedBid) {
      return NextResponse.json(
        { 
          error: `Bid amount (₹${amount} Cr) exceeds your maximum allowed bid (₹${maxAllowedBid} Cr). ₹${reservedFunds} Cr must be preserved for your remaining draft rounds.` 
        },
        { status: 400 }
      );
    }

    // 5. Save/upsert bid
    const bidId = `bid_${draft_round_id}_${team_id}_${target_id}_${Date.now()}`;

    // Delete existing bid for same target and team in this window before inserting
    await fantasySql`
      DELETE FROM fantasy_post_release_bids
      WHERE team_id = ${team_id}
        AND (draft_round_id = ${draft_round_id} OR league_id = ${league_id})
        AND target_id = ${target_id}
    `;

    await fantasySql`
      INSERT INTO fantasy_post_release_bids (
        bid_id, draft_round_id, league_id, team_id,
        category, is_passive_team, target_id, target_name,
        bid_amount, status, submitted_at
      ) VALUES (
        ${bidId}, ${draft_round_id}, ${league_id}, ${team_id},
        ${category}, ${is_passive_team || false}, ${target_id}, ${target_name || target_id},
        ${amount}, 'submitted', NOW()
      )
    `;

    return NextResponse.json({
      success: true,
      message: 'Bid submitted successfully',
      bid_id: bidId,
      max_allowed_bid: maxAllowedBid,
      reserved_funds: reservedFunds
    });

  } catch (error: any) {
    console.error('Error submitting category bid:', error);
    return NextResponse.json(
      { error: 'Failed to submit bid', details: error.message },
      { status: 500 }
    );
  }
}
