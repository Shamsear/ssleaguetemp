import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { verifyAuth } from '@/lib/auth-helper';

/**
 * POST /api/fantasy/draft/process-post-release
 * Admin endpoint to process post-release draft bids
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(['committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { draft_round_id, league_id } = body;

    if (!draft_round_id || !league_id) {
      return NextResponse.json(
        { error: 'draft_round_id and league_id are required' },
        { status: 400 }
      );
    }

    // 1. Fetch pending bids for this draft round
    const bids = await fantasySql`
      SELECT 
        bid_id, draft_round_id, league_id, team_id,
        category, is_passive_team, target_id, target_name,
        bid_amount, submitted_at
      FROM fantasy_post_release_bids
      WHERE draft_round_id = ${draft_round_id}
        AND league_id = ${league_id}
        AND status = 'pending'
      ORDER BY target_id, bid_amount DESC, submitted_at ASC
    `;

    if (bids.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending bids found to process',
        awarded: [],
        ties: []
      });
    }

    // Group bids by target_id
    const targetMap: Record<string, any[]> = {};
    for (const b of bids) {
      if (!targetMap[b.target_id]) targetMap[b.target_id] = [];
      targetMap[b.target_id].push(b);
    }

    const awarded: any[] = [];
    const ties: any[] = [];

    for (const targetId in targetMap) {
      const targetBids = targetMap[targetId];
      const maxBidAmount = parseFloat(targetBids[0].bid_amount);

      // Find all top bidders with the exact same max amount
      const topBidders = targetBids.filter(
        (b) => parseFloat(b.bid_amount) === maxBidAmount
      );

      if (topBidders.length > 1) {
        // TIE DETECTED!
        const tieId = `tie_${draft_round_id}_${targetId}_${Date.now()}`;
        const tiedTeamIds = topBidders.map((b) => b.team_id);

        await fantasySql`
          INSERT INTO fantasy_draft_ties (
            tie_id, draft_round_id, league_id, target_id, target_name,
            category, is_passive_team, tied_team_ids, tied_bid_amount,
            status, created_at
          ) VALUES (
            ${tieId}, ${draft_round_id}, ${league_id}, ${targetId}, ${targetBids[0].target_name},
            ${targetBids[0].category}, ${targetBids[0].is_passive_team}, ${JSON.stringify(tiedTeamIds)}, ${maxBidAmount},
            'pending_resolution', NOW()
          )
        `;

        // Mark bids as tied
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
          target_name: targetBids[0].target_name,
          tied_teams_count: topBidders.length,
          tied_bid_amount: maxBidAmount
        });
      } else {
        // WINNER!
        const winningBid = topBidders[0];
        const winningTeamId = winningBid.team_id;
        const bidAmount = parseFloat(winningBid.bid_amount);

        if (winningBid.is_passive_team) {
          // Assign supported team
          await fantasySql`
            UPDATE fantasy_teams
            SET supported_team_id = ${targetId},
                supported_team_name = ${winningBid.target_name},
                updated_at = NOW()
            WHERE team_id = ${winningTeamId}
          `;
        } else {
          // Add player to squad
          const squadId = `squad_${winningTeamId}_${targetId}_${Date.now()}`;
          await fantasySql`
            INSERT INTO fantasy_squad (
              squad_id, team_id, real_player_id, purchase_price, added_at
            ) VALUES (
              ${squadId}, ${winningTeamId}, ${targetId}, ${bidAmount}, NOW()
            )
          `;

          // Mark player unavailable
          await fantasySql`
            UPDATE fantasy_players
            SET is_available = false, updated_at = NOW()
            WHERE real_player_id = ${targetId} AND league_id = ${league_id}
          `;
        }

        // Deduct budget
        await fantasySql`
          UPDATE fantasy_teams
          SET budget = budget - ${bidAmount}, updated_at = NOW()
          WHERE team_id = ${winningTeamId}
        `;

        // Update bid statuses
        await fantasySql`
          UPDATE fantasy_post_release_bids
          SET status = 'won'
          WHERE bid_id = ${winningBid.bid_id}
        `;

        // Mark other bids for this target as lost
        const lostBids = targetBids.slice(1);
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

    return NextResponse.json({
      success: true,
      message: `Processed post-release draft bids. Awarded: ${awarded.length}, Ties: ${ties.length}`,
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
