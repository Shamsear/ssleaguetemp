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
          WHEN (fl.category_settings->'lists'->'red_list_2')::jsonb @> jsonb_build_array(fr.real_player_id) THEN 'RED 2'
          WHEN (fl.category_settings->'lists'->'red_list_1')::jsonb @> jsonb_build_array(fr.real_player_id) THEN 'RED 1'
          WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' AND (fdb.slot_index = 2 OR fdr.slot_name ILIKE '%Slot 2%') THEN 'RED 2'
          WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' AND (fdb.slot_index = 1 OR fdr.slot_name ILIKE '%Slot 1%') THEN 'RED 1'
          WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' THEN 'RED 1'
          ELSE UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, 'Red'))
        END as resolved_category
      FROM fantasy_releases fr
      LEFT JOIN fantasy_leagues fl ON fr.league_id = fl.league_id
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
        AND target_id != ${target_id}
        AND status IN ('pending', 'submitted')
    `;

    if (existingCategoryBids.length >= participatingTeamsCount) {
      return NextResponse.json(
        { error: `Maximum bids limit reached (${participatingTeamsCount} max bids allowed for ${category} round based on ${participatingTeamsCount} participating teams).` },
        { status: 400 }
      );
    }

    // 4. FUTURE ROUNDS BUDGET RESERVATION
    // Fetch league category settings and draft rounds
    const [leagueRow] = await fantasySql`
      SELECT category_settings
      FROM fantasy_leagues
      WHERE league_id = ${league_id}
    `;

    const draftRounds = await fantasySql`
      SELECT slot_index, slot_name, status
      FROM fantasy_draft_rounds
      WHERE league_id = ${league_id}
      ORDER BY slot_index ASC
    `;

    const slots = typeof leagueRow?.category_settings === 'string'
      ? JSON.parse(leagueRow.category_settings)?.slots
      : leagueRow?.category_settings?.slots;

    const getCategoryInfo = (catName: string) => {
      const normCat = (catName || '').toUpperCase().trim();

      let foundSlotIndex = 99;
      let foundBasePrice = 10;
      if (normCat.includes('PASSIVE') || normCat.includes('SUPPORTED') || normCat.includes('REAL')) {
        foundSlotIndex = 6; foundBasePrice = 30;
      } else if (normCat === 'RED 1' || normCat === 'RED SLOT 1' || normCat === 'RED') {
        foundSlotIndex = 1; foundBasePrice = 25;
      } else if (normCat === 'RED 2' || normCat === 'RED SLOT 2') {
        foundSlotIndex = 2; foundBasePrice = 25;
      } else if (normCat === 'BLUE' || normCat.includes('BLUE')) {
        foundSlotIndex = 3; foundBasePrice = 15;
      } else if (normCat === 'BLACK' || normCat.includes('BLACK')) {
        foundSlotIndex = 4; foundBasePrice = 20;
      } else if (normCat === 'WHITE' || normCat.includes('WHITE')) {
        foundSlotIndex = 5; foundBasePrice = 10;
      }

      if (slots && Array.isArray(slots)) {
        const slot = slots.find((s: any) => {
          const sName = (s.name || '').toUpperCase().trim();
          const sList = (s.list_id || '').toUpperCase().trim();
          if (normCat.includes('PASSIVE') || normCat.includes('SUPPORTED') || normCat.includes('REAL TEAM')) {
            return sName.includes('REAL TEAM') || sName.includes('PASSIVE') || sName.includes('SUPPORTED') || sList.includes('REAL_TEAM');
          }
          if (normCat === 'RED 1' || normCat === 'RED SLOT 1') return sName.includes('SLOT 1') || sName.includes('RED 1') || sList === 'RED_LIST_1';
          if (normCat === 'RED 2' || normCat === 'RED SLOT 2') return sName.includes('SLOT 2') || sName.includes('RED 2') || sList === 'RED_LIST_2';
          return sName.includes(normCat) || sList.includes(normCat.toLowerCase());
        });
        if (slot) {
          foundSlotIndex = Number(slot.slot_index);
          if (slot.base_price) {
            foundBasePrice = Number(slot.base_price);
          }
        }
      }

      let foundStatus = 'pending';
      const round = draftRounds?.find((r: any) => {
        const sName = (r.slot_name || '').toUpperCase().trim();
        if (normCat.includes('PASSIVE') || normCat.includes('SUPPORTED') || normCat.includes('REAL TEAM')) {
          return sName.includes('REAL TEAM') || sName.includes('PASSIVE') || sName.includes('SUPPORTED');
        }
        if (normCat === 'RED 1' || normCat === 'RED SLOT 1') return sName.includes('SLOT 1') || sName.includes('RED 1');
        if (normCat === 'RED 2' || normCat === 'RED SLOT 2') return sName.includes('SLOT 2') || sName.includes('RED 2');
        return sName.includes(normCat) || Number(r.slot_index) === foundSlotIndex;
      });

      if (round) {
        foundSlotIndex = Number(round.slot_index);
        foundStatus = round.status;
      }

      return {
        slotIndex: foundSlotIndex,
        basePrice: foundBasePrice,
        status: foundStatus
      };
    };

    const activeInfo = getCategoryInfo(category);
    const teamReleases = windowReleases.filter((r) => r.team_id === team_id);

    const releaseCountsByCategory: Record<string, number> = {};
    for (const rel of teamReleases) {
      const catKey = (rel.resolved_category || '').toUpperCase().trim();
      releaseCountsByCategory[catKey] = (releaseCountsByCategory[catKey] || 0) + 1;
    }

    const wonPostReleaseBids = await fantasySql`
      SELECT category, is_passive_team
      FROM fantasy_post_release_bids
      WHERE team_id = ${team_id}
        AND (draft_round_id = ${draft_round_id} OR league_id = ${league_id})
        AND status = 'won'
    `;

    const teamWonCats = new Set(
      wonPostReleaseBids.map((b: any) => b.is_passive_team ? 'PASSIVE TEAM' : (b.category || '').toUpperCase().trim())
    );

    const activeCatKey = (category || '').toUpperCase().trim();
    const activeNormCategory = activeCatKey.includes('PASSIVE') || activeCatKey.includes('SUPPORTED') ? 'PASSIVE TEAM' : activeCatKey;

    let reservedFunds = 0;
    for (const [catKey, count] of Object.entries(releaseCountsByCategory)) {
      const normCatKey = catKey.toUpperCase().trim();
      const normCategory = normCatKey.includes('PASSIVE') || normCatKey.includes('SUPPORTED') ? 'PASSIVE TEAM' : normCatKey;
      const catInfo = getCategoryInfo(normCategory);

      const isOtherCategory = normCategory !== activeNormCategory;
      const isRoundUncompleted = catInfo.status !== 'completed' && catInfo.status !== 'finalized';
      const isTeamUncompleted = !teamWonCats.has(normCategory);

      if (isOtherCategory && isRoundUncompleted && isTeamUncompleted) {
        reservedFunds += count * catInfo.basePrice;
      }
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
