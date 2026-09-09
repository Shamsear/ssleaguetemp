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

    // 2. Build per-team bid priority queues (each team's bids sorted by amount DESC)
    //    Nomination-round algorithm: each round, every unassigned team nominates
    //    their highest unresolved bid. Conflicts resolved by bid amount.
    //    This ensures teams win their highest-priority target, not a lower bid
    //    that gets processed first due to another team's high bid inflating a target.
    const teamBidQueues: Map<string, typeof validBids> = new Map();
    for (const bid of validBids) {
      if (!teamBidQueues.has(bid.team_id)) teamBidQueues.set(bid.team_id, []);
      teamBidQueues.get(bid.team_id)!.push(bid);
    }
    for (const [, bids] of teamBidQueues) {
      bids.sort((a, b) => {
        const diff = parseFloat(b.bid_amount) - parseFloat(a.bid_amount);
        if (diff !== 0) return diff;
        return new Date(a.submitted_at || 0).getTime() - new Date(b.submitted_at || 0).getTime();
      });
    }

    const assignedTeams = new Set();
    const wonTargets = new Set();
    const awarded: any[] = [];
    const ties: any[] = [];

    // Track all bids by bid_id for status updates
    const bidById: Map<string, any> = new Map();
    for (const b of validBids) bidById.set(b.bid_id, b);

    let hasProgress = true;
    while (hasProgress) {
      hasProgress = false;

      // Each unassigned team nominates their highest unresolved bid
      const nominations: Map<string, Array<{ teamId: string; bid: any }>> = new Map();

      for (const [teamId, bids] of teamBidQueues) {
        if (assignedTeams.has(teamId)) continue;
        const topBid = bids.find((b) => !wonTargets.has(b.target_id));
        if (!topBid) continue;

        if (!nominations.has(topBid.target_id)) nominations.set(topBid.target_id, []);
        nominations.get(topBid.target_id)!.push({ teamId, bid: topBid });
      }

      if (nominations.size === 0) break;
      hasProgress = true;

      // Resolve each nominated target
      for (const [targetId, nominees] of nominations) {
        const maxAmt = Math.max(...nominees.map((n) => parseFloat(n.bid.bid_amount)));
        const topNominees = nominees.filter((n) => parseFloat(n.bid.bid_amount) === maxAmt);

        if (topNominees.length > 1) {
          // TIE among top nominators
          const tieId = `tie_${draft_round_id}_${targetId}_${Date.now()}`;
          const tiedTeamIds = topNominees.map((n) => n.teamId);
          const refBid = topNominees[0].bid;

          await fantasySql`
            INSERT INTO fantasy_draft_ties (
              tie_id, draft_round_id, league_id, target_id, target_name,
              category, is_passive_team, tied_team_ids, tied_bid_amount,
              status, created_at
            ) VALUES (
              ${tieId}, ${draft_round_id}, ${league_id}, ${targetId}, ${refBid.target_name},
              ${refBid.category}, ${refBid.is_passive_team}, ${JSON.stringify(tiedTeamIds)}, ${maxAmt},
              'pending_resolution', NOW()
            )
          `;
          for (const n of topNominees) {
            await fantasySql`UPDATE fantasy_post_release_bids SET status = 'tied' WHERE bid_id = ${n.bid.bid_id}`;
          }
          ties.push({
            tie_id: tieId,
            target_id: targetId,
            target_name: refBid.target_name,
            tied_teams_count: topNominees.length,
            tied_bid_amount: maxAmt
          });
          wonTargets.add(targetId);

        } else {
          // Single winner
          const { teamId: winningTeamId, bid: winningBid } = topNominees[0];
          const bidAmount = parseFloat(winningBid.bid_amount);

          assignedTeams.add(winningTeamId);
          wonTargets.add(targetId);

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
            const playerRows = await fantasySql`
              SELECT player_name, position, real_team_name, current_price
              FROM fantasy_players
              WHERE real_player_id = ${targetId} AND league_id = ${league_id}
              LIMIT 1
            `;
            const playerMeta = playerRows[0] || {};
            const playerName = playerMeta.player_name || winningBid.target_name;
            const playerPos = playerMeta.position || 'Unknown';
            const realTeamName = playerMeta.real_team_name || '';
            const currentValue = parseFloat(playerMeta.current_price) || bidAmount;

            const squadId = `squad_${winningTeamId}_${targetId}_${Date.now()}`;
            await fantasySql`
              INSERT INTO fantasy_squad (
                squad_id, team_id, league_id, real_player_id, player_name,
                position, real_team_name, purchase_price, current_value,
                acquisition_type, acquired_at
              ) VALUES (
                ${squadId}, ${winningTeamId}, ${league_id}, ${targetId}, ${playerName},
                ${playerPos}, ${realTeamName}, ${bidAmount}, ${currentValue},
                'post_release_draft', NOW()
              )
            `;
            await fantasySql`
              UPDATE fantasy_players SET is_available = false, updated_at = NOW()
              WHERE real_player_id = ${targetId} AND league_id = ${league_id}
            `;
          }

          // Deduct budget
          await fantasySql`
            UPDATE fantasy_teams
            SET budget_remaining = budget_remaining - ${bidAmount}, updated_at = NOW()
            WHERE team_id = ${winningTeamId}
          `;

          // Mark winning bid
          await fantasySql`UPDATE fantasy_post_release_bids SET status = 'won' WHERE bid_id = ${winningBid.bid_id}`;

          // Mark losing nominees' bids on this target as lost
          const losingNominees = nominees.filter((n) => parseFloat(n.bid.bid_amount) < maxAmt);
          for (const n of losingNominees) {
            await fantasySql`UPDATE fantasy_post_release_bids SET status = 'lost' WHERE bid_id = ${n.bid.bid_id}`;
          }

          awarded.push({
            winning_team_id: winningTeamId,
            target_id: targetId,
            target_name: winningBid.target_name,
            bid_amount: bidAmount
          });
        }
      }
    }

    // Mark all remaining pending/submitted bids as 'lost':
    // - Bids from assigned teams (they already won something)
    // - Bids on won targets from teams that didn't win that target
    for (const b of validBids) {
      const alreadyResolved = ['won', 'tied', 'lost', 'invalid_self_release'].includes(b.status);
      if (alreadyResolved) continue;
      if (assignedTeams.has(b.team_id) || wonTargets.has(b.target_id)) {
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
