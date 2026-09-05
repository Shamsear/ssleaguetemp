import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/draft/tier-results?league_id=xxx
 * Backwards compatible endpoint returning slot-by-slot draft results mapped to tier structure for the UI
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('league_id');

    if (!leagueId) {
      return NextResponse.json(
        { error: 'Missing required parameter: league_id' },
        { status: 400 }
      );
    }

    // 1. Fetch league settings to get slots configuration
    const leagues = await fantasySql`
      SELECT category_settings FROM fantasy_leagues WHERE league_id = ${leagueId} LIMIT 1
    `;

    if (leagues.length === 0) {
      return NextResponse.json({
        success: true,
        tiers: [],
        message: 'League not found',
      });
    }

    const categorySettings = typeof leagues[0].category_settings === 'string'
      ? JSON.parse(leagues[0].category_settings)
      : leagues[0].category_settings;

    const slots = categorySettings?.slots || [];

    if (slots.length === 0) {
      return NextResponse.json({
        success: true,
        tiers: [],
        message: 'No slot configurations found in league settings',
      });
    }

    // 2. Fetch all bids for this league
    const bids = await fantasySql`
      SELECT 
        fdb.id,
        fdb.bid_id,
        fdb.team_id,
        fdb.slot_index,
        fdb.priority,
        fdb.target_id,
        fdb.bid_type,
        fdb.bid_amount,
        fdb.status,
        fdb.submitted_at,
        fdb.processed_at,
        ft.team_name as fantasy_team_name,
        ft.owner_name
      FROM fantasy_draft_bids fdb
      JOIN fantasy_teams ft ON fdb.team_id = ft.team_id
      WHERE fdb.league_id = ${leagueId}
      ORDER BY fdb.bid_amount DESC, fdb.submitted_at ASC
    `;

    // 3. Map each slot as a "tier" for the admin UI
    const mappedTiers = await Promise.all(
      slots.map(async (slot: any) => {
        const slotIdx = slot.slot_index;

        // Bids in this slot
        const slotBids = bids.filter((b: any) => b.slot_index === slotIdx);

        // Get target names
        const enrichedResults = await Promise.all(
          slotBids.map(async (bid: any) => {
            let targetName = bid.target_id;

            if (bid.bid_type === 'player') {
              const players = await fantasySql`
                SELECT player_name FROM fantasy_players 
                WHERE real_player_id = ${bid.target_id} AND league_id = ${leagueId} 
                LIMIT 1
              `;
              if (players.length > 0) {
                targetName = players[0].player_name;
              }
            } else {
              const teams = await fantasySql`
                SELECT team_name FROM teams WHERE team_uid = ${bid.target_id} LIMIT 1
              `;
              if (teams.length > 0) {
                targetName = teams[0].team_name;
              }
            }

            return {
              bid_id: bid.bid_id,
              player_name: targetName, // Display name
              real_player_id: bid.target_id,
              winning_team: bid.fantasy_team_name,
              team_id: bid.team_id,
              owner_name: bid.owner_name,
              bid_amount: Number(bid.bid_amount),
              submitted_at: bid.submitted_at,
              processed_at: bid.processed_at,
              status: bid.status
            };
          })
        );

        const wonBids = enrichedResults.filter((r: any) => r.status === 'won');
        const lostBids = enrichedResults.filter((r: any) => r.status === 'lost');
        const skippedBids = enrichedResults.filter((r: any) => r.status === 'skipped');

        return {
          tier_id: `slot_${slotIdx}`,
          tier_number: slotIdx,
          tier_name: slot.name,
          player_count: slot.name.includes('Team') ? 8 : 15, // Approximate or arbitrary
          min_points: 0,
          max_points: 0,
          avg_points: 0,
          total_bids: slotBids.length,
          won_bids: wonBids.length,
          lost_bids: lostBids.length,
          skipped_bids: skippedBids.length,
          results: wonBids,
          lost_bids: lostBids,
          skipped_teams: skippedBids.map((b: any) => ({
            team_name: b.winning_team,
            team_id: b.team_id
          }))
        };
      })
    );

    return NextResponse.json({
      success: true,
      tiers: mappedTiers
    });
  } catch (error) {
    console.error('Error fetching tier results:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tier results', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
