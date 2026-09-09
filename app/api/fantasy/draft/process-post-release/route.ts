import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { verifyAuth } from '@/lib/auth-helper';

/**
 * POST /api/fantasy/draft/process-post-release
 * Admin endpoint to process post-release draft bids for a specific category round or full window
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(['committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { draft_round_id, league_id, category } = body;

    if (!draft_round_id || !league_id) {
      return NextResponse.json(
        { error: 'draft_round_id and league_id are required' },
        { status: 400 }
      );
    }

    // 1. Fetch pending/submitted bids for this draft round / window (and optional category filter)
    let bids = [];
    if (category) {
      bids = await fantasySql`
        SELECT 
          bid_id, draft_round_id, league_id, team_id,
          category, is_passive_team, target_id, target_name,
          bid_amount, submitted_at
        FROM fantasy_post_release_bids
        WHERE (draft_round_id = ${draft_round_id} OR league_id = ${league_id})
          AND (category ILIKE ${category} OR (${category === 'Passive Team'} AND is_passive_team = true))
          AND (status = 'pending' OR status = 'submitted')
        ORDER BY target_id, bid_amount DESC, submitted_at ASC
      `;
    } else {
      bids = await fantasySql`
        SELECT 
          bid_id, draft_round_id, league_id, team_id,
          category, is_passive_team, target_id, target_name,
          bid_amount, submitted_at
        FROM fantasy_post_release_bids
        WHERE (draft_round_id = ${draft_round_id} OR league_id = ${league_id})
          AND (status = 'pending' OR status = 'submitted')
        ORDER BY target_id, bid_amount DESC, submitted_at ASC
      `;
    }

    if (bids.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No pending bids found to process${category ? ` for category ${category}` : ''}`,
        awarded: [],
        ties: []
      });
    }

    // Filter out invalid self-release bids if any slipped through
    const validBids = [];
    for (const b of bids) {
      const selfRelease = await fantasySql`
        SELECT release_id FROM fantasy_releases
        WHERE team_id = ${b.team_id}
          AND (window_id = ${draft_round_id} OR league_id = ${league_id})
          AND (real_player_id = ${b.target_id} OR player_name = ${b.target_name} OR (is_passive_team = true AND ${b.is_passive_team || false} = true))
      `;
      if (selfRelease.length > 0) {
        // Mark self-release bid as invalid
        await fantasySql`
          UPDATE fantasy_post_release_bids
          SET status = 'invalid_self_release'
          WHERE bid_id = ${b.bid_id}
        `;
      } else {
        validBids.push(b);
      }
    }

    // 2. Sort all valid bids across all targets by bid_amount DESC, submitted_at ASC
    const sortedBids = [...validBids].sort((a, b) => {
      const diff = parseFloat(b.bid_amount) - parseFloat(a.bid_amount);
      if (diff !== 0) return diff;
      return new Date(a.submitted_at || 0).getTime() - new Date(b.submitted_at || 0).getTime();
    });

    const assignedTeams = new Set();
    const resolvedTargets = new Set();
    const awarded: any[] = [];
    const ties: any[] = [];

    // Process targets in descending order of highest bid placed
    for (const b of sortedBids) {
      const targetId = b.target_id;
      if (resolvedTargets.has(targetId)) continue; // Target already awarded or tied

      // Find all bids for this target from teams that have NOT won a player yet in this round
      const eligibleTargetBids = sortedBids.filter(
        (tb) => tb.target_id === targetId && !assignedTeams.has(tb.team_id)
      );

      if (eligibleTargetBids.length === 0) continue;

      const maxBidAmount = parseFloat(eligibleTargetBids[0].bid_amount);
      const topBidders = eligibleTargetBids.filter(
        (tb) => parseFloat(tb.bid_amount) === maxBidAmount
      );

      if (topBidders.length > 1) {
        // TIE DETECTED!
        const tieId = `tie_${draft_round_id}_${targetId}_${Date.now()}`;
        const tiedTeamIds = topBidders.map((tb) => tb.team_id);

        await fantasySql`
          INSERT INTO fantasy_draft_ties (
            tie_id, draft_round_id, league_id, target_id, target_name,
            category, is_passive_team, tied_team_ids, tied_bid_amount,
            status, created_at
          ) VALUES (
            ${tieId}, ${draft_round_id}, ${league_id}, ${targetId}, ${eligibleTargetBids[0].target_name},
            ${eligibleTargetBids[0].category}, ${eligibleTargetBids[0].is_passive_team}, ${JSON.stringify(tiedTeamIds)}, ${maxBidAmount},
            'pending_resolution', NOW()
          )
        `;

        for (const tb of topBidders) {
          await fantasySql`
            UPDATE fantasy_post_release_bids
            SET status = 'tied'
            WHERE bid_id = ${tb.bid_id}
          `;
        }

        ties.push({
          tie_id: tieId,
          target_id: targetId,
          target_name: eligibleTargetBids[0].target_name,
          tied_teams_count: topBidders.length,
          tied_bid_amount: maxBidAmount
        });

        resolvedTargets.add(targetId);
      } else {
        // WINNER!
        const winningBid = topBidders[0];
        const winningTeamId = winningBid.team_id;
        const bidAmount = parseFloat(winningBid.bid_amount);

        assignedTeams.add(winningTeamId);
        resolvedTargets.add(targetId);

        if (winningBid.is_passive_team) {
          await fantasySql`
            UPDATE fantasy_teams
            SET supported_team_id = ${targetId},
                supported_team_name = ${winningBid.target_name},
                supported_team_price = ${bidAmount},
                updated_at = NOW()
            WHERE team_id = ${winningTeamId}
          `;
        } else {
          const squadId = `squad_${winningTeamId}_${targetId}_${Date.now()}`;
          await fantasySql`
            INSERT INTO fantasy_squad (
              squad_id, team_id, real_player_id, purchase_price, acquired_at
            ) VALUES (
              ${squadId}, ${winningTeamId}, ${targetId}, ${bidAmount}, NOW()
            )
          `;

          await fantasySql`
            UPDATE fantasy_players
            SET is_available = false, updated_at = NOW()
            WHERE real_player_id = ${targetId} AND league_id = ${league_id}
          `;
        }

        // Deduct budget
        await fantasySql`
          UPDATE fantasy_teams
          SET budget_remaining = budget_remaining - ${bidAmount}, updated_at = NOW()
          WHERE team_id = ${winningTeamId}
        `;

        // Update winning bid status
        await fantasySql`
          UPDATE fantasy_post_release_bids
          SET status = 'won'
          WHERE bid_id = ${winningBid.bid_id}
        `;

        // Mark other bids for this target as lost
        const lostBids = eligibleTargetBids.slice(1);
        for (const lb of lostBids) {
          await fantasySql`
            UPDATE fantasy_post_release_bids
            SET status = 'lost'
            WHERE bid_id = ${lb.bid_id}
          `;
        }

        awarded.push({
          winning_team_id: winningTeamId,
          target_id: targetId,
          target_name: winningBid.target_name,
          bid_amount: bidAmount
        });
      }
    }

    // Mark remaining bids from teams that already won a player as 'lost'
    for (const b of validBids) {
      if (assignedTeams.has(b.team_id)) {
        await fantasySql`
          UPDATE fantasy_post_release_bids
          SET status = 'lost'
          WHERE bid_id = ${b.bid_id} AND status IN ('pending', 'submitted')
        `;
      }
    }

    // Update fantasy_draft_rounds status to 'completed' for this category round
    if (category) {
      let slotPattern = category.toUpperCase();
      if (slotPattern === 'RED 1') slotPattern = 'RED SLOT 1';
      else if (slotPattern === 'RED 2') slotPattern = 'RED SLOT 2';
      else if (slotPattern.includes('PASSIVE') || slotPattern.includes('SUPPORTED')) slotPattern = 'REAL TEAM SLOT';

      await fantasySql`
        UPDATE fantasy_draft_rounds
        SET status = 'completed', updated_at = NOW()
        WHERE league_id = ${league_id}
          AND (
            slot_name ILIKE ${'%' + category + '%'} OR
            (${slotPattern === 'RED SLOT 1'} AND (slot_name ILIKE '%SLOT 1%' OR slot_name ILIKE '%RED 1%')) OR
            (${slotPattern === 'RED SLOT 2'} AND (slot_name ILIKE '%SLOT 2%' OR slot_name ILIKE '%RED 2%')) OR
            (${slotPattern === 'REAL TEAM SLOT'} AND (slot_name ILIKE '%REAL TEAM%' OR slot_name ILIKE '%PASSIVE%' OR slot_name ILIKE '%SUPPORTED%'))
          )
      `;
    }

    return NextResponse.json({
      success: true,
      message: `Processed post-release draft bids${category ? ` for category ${category}` : ''}. Awarded: ${awarded.length}, Ties: ${ties.length}`,
      awarded,
      ties
    });

  } catch (error: any) {
    console.error('Error processing post release bids:', error);
    return NextResponse.json(
      { error: 'Failed to process bids', details: error.message },
      { status: 500 }
    );
  }
}
