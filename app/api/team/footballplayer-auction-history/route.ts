import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { verifyAuth } from '@/lib/auth-helper';
import { decryptBidData } from '@/lib/encryption';

const auctionSql = neon(process.env.NEON_AUCTION_DB_URL!);

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const auth = await verifyAuth(['team'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get season_id from query params
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('season_id');

    if (!seasonId) {
      return NextResponse.json(
        { success: false, error: 'Season ID is required' },
        { status: 400 }
      );
    }

    // Fetch all rounds for the season with player auction results
    // Combine both normal and bulk rounds
    const rounds = await auctionSql`
      SELECT 
        r.id as round_id,
        r.round_number,
        r.position,
        r.round_type,
        r.status,
        r.end_time,
        r.created_at
      FROM rounds r
      WHERE r.season_id = ${seasonId}
        AND r.status = 'completed'
      ORDER BY r.round_number ASC
    `;

    if (rounds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          rounds: [],
          seasonId
        }
      });
    }

    // For each round, fetch sold players
    const roundsWithPlayers = await Promise.all(
      rounds.map(async (round: any) => {
        let players = [];

        if (round.round_type === 'bulk') {
          // Bulk round: fetch from round_players
          players = await auctionSql`
            SELECT 
              rp.player_id,
              fp.name as player_name,
              fp.position,
              fp.player_id as football_player_id,
              rp.winning_team_id as team_id,
              t.name as team_name,
              rp.winning_bid as price,
              rp.status
            FROM round_players rp
            JOIN footballplayers fp ON rp.player_id = fp.id
            LEFT JOIN teams t ON rp.winning_team_id = t.id
            WHERE rp.round_id = ${round.round_id}
              AND rp.status = 'sold'
            ORDER BY rp.winning_bid DESC, fp.name ASC
          `;
        } else {
          // Normal round: fetch from bids
          players = await auctionSql`
            SELECT DISTINCT ON (b.player_id)
              b.player_id,
              fp.name as player_name,
              fp.position,
              fp.player_id as football_player_id,
              b.team_id,
              t.name as team_name,
              b.amount as price,
              b.encrypted_bid_data,
              'won' as status
            FROM bids b
            JOIN footballplayers fp ON b.player_id = fp.id
            LEFT JOIN teams t ON b.team_id = t.id
            WHERE b.round_id = ${round.round_id}
              AND b.status = 'won'
            ORDER BY b.player_id, b.amount DESC, b.created_at ASC
          `;

          // Fetch all bids for the round to list them per player
          const allBids = await auctionSql`
            SELECT 
              b.id,
              b.player_id,
              b.team_id,
              t.name as team_name,
              b.amount,
              b.encrypted_bid_data,
              b.created_at,
              b.status
            FROM bids b
            LEFT JOIN teams t ON b.team_id = t.id
            WHERE b.round_id = ${round.round_id}
          `;

          // Group decrypted bids by player_id
          const bidsByPlayer: Record<string, any[]> = {};
          allBids.forEach((b: any) => {
            let finalPrice = b.amount;
            if (finalPrice === null && b.encrypted_bid_data) {
              if (b.encrypted_bid_data.includes(':')) {
                try {
                  const decrypted = decryptBidData(b.encrypted_bid_data);
                  finalPrice = decrypted.amount;
                } catch (error) {
                  console.error(`Failed to decrypt bid ${b.id}:`, error);
                  finalPrice = 0;
                }
              } else {
                const parsed = Number(b.encrypted_bid_data);
                finalPrice = !isNaN(parsed) ? parsed : 0;
              }
            }
            if (!bidsByPlayer[b.player_id]) {
              bidsByPlayer[b.player_id] = [];
            }
            bidsByPlayer[b.player_id].push({
              team_id: b.team_id,
              team_name: b.team_name || 'Unknown Team',
              amount: Number(finalPrice) || 0,
              status: b.status,
              created_at: b.created_at
            });
          });

          // Sort each player's bids by amount descending
          Object.keys(bidsByPlayer).forEach(pid => {
            bidsByPlayer[pid].sort((a, b) => {
              const amountB = Number(b.amount) || 0;
              const amountA = Number(a.amount) || 0;
              if (amountB !== amountA) {
                return amountB - amountA;
              }
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });
          });

          // Decrypt bid amounts if they're NULL
          players = players.map((player: any) => {
            let finalPrice = player.price;
            
            // If amount is NULL, decrypt from encrypted_bid_data
            if (player.price === null && player.encrypted_bid_data) {
              if (player.encrypted_bid_data.includes(':')) {
                try {
                  const decrypted = decryptBidData(player.encrypted_bid_data);
                  finalPrice = decrypted.amount;
                } catch (error) {
                  console.error(`Failed to decrypt bid for player ${player.player_id}:`, error);
                  finalPrice = 0; // Fallback to 0 if decryption fails
                }
              } else {
                const parsed = Number(player.encrypted_bid_data);
                finalPrice = !isNaN(parsed) ? parsed : 0;
              }
            }

            return {
              ...player,
              price: finalPrice,
              bids: bidsByPlayer[player.player_id] || []
            };
          });

          // Sort normal round players by decrypted price (highest to lowest)
          players.sort((a: any, b: any) => {
            const priceA = Number(a.price) || 0;
            const priceB = Number(b.price) || 0;
            if (priceB !== priceA) {
              return priceB - priceA; // Descending by price
            }
            // If prices are equal, sort alphabetically by name
            return a.player_name.localeCompare(b.player_name);
          });
        }

        return {
          round_id: round.round_id,
          round_number: round.round_number,
          position: round.position,
          round_type: round.round_type,
          status: round.status,
          end_time: round.end_time,
          created_at: round.created_at,
          players: players.map((p: any) => ({
            player_id: p.player_id,
            player_name: p.player_name,
            position: p.position,
            football_player_id: p.football_player_id,
            team_id: p.team_id,
            team_name: p.team_name || 'Unknown Team',
            price: Number(p.price) || 0,
            bids: p.bids || []
          })),
          total_players: players.length
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        rounds: roundsWithPlayers,
        seasonId,
        totalRounds: roundsWithPlayers.length,
        totalPlayers: roundsWithPlayers.reduce((sum, r) => sum + r.total_players, 0)
      }
    });

  } catch (error) {
    console.error('Error fetching football player auction history:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch auction history',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
