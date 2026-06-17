import { NextRequest, NextResponse } from 'next/server';
import { 
  getSwapRequestById,
  updateSwapRequestStatus
} from '@/lib/neon/roster-requests';
import { swapPlayersNeon, NeonPlayerData } from '@/lib/player-transfers-neon';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { getAuctionDb } from '@/lib/neon/auction-config';

/**
 * PATCH /api/requests/swap/[id]
 * Approve or reject a swap request
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { status, processed_by, processed_by_name, rejection_reason } = body;
    
    if (!status || !['approved', 'rejected', 'cancelled'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status' },
        { status: 400 }
      );
    }
    
    const req = await getSwapRequestById(id);
    if (!req) {
      return NextResponse.json(
        { success: false, error: 'Request not found' },
        { status: 404 }
      );
    }
    
    if (req.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Request is already ${req.status}` },
        { status: 400 }
      );
    }
    
    // If approved, execute the actual swap logic
    if (status === 'approved') {
      if (!processed_by || !processed_by_name) {
        return NextResponse.json(
          { success: false, error: 'processed_by and processed_by_name required for approval' },
          { status: 400 }
        );
      }
      
      if (req.players.length !== 2) {
        return NextResponse.json(
          { success: false, error: 'Only 1-for-1 swaps are currently supported by the engine' },
          { status: 400 }
        );
      }
      
      const p1 = req.players[0];
      const p2 = req.players[1];
      
      if (p1.player_type !== p2.player_type) {
        return NextResponse.json(
          { success: false, error: 'Cannot swap players of different types' },
          { status: 400 }
        );
      }
      
      const sql = p1.player_type === 'real' ? getTournamentDb() : getAuctionDb();
      
      // Fetch full player data from Neon
      let p1Data, p2Data;
      if (p1.player_type === 'real') {
        const [result1, result2] = await Promise.all([
          sql`SELECT * FROM player_seasons WHERE id = ${p1.player_id + '_' + req.season_id} LIMIT 1`,
          sql`SELECT * FROM player_seasons WHERE id = ${p2.player_id + '_' + req.season_id} LIMIT 1`
        ]);
        p1Data = result1[0];
        p2Data = result2[0];
      } else {
        const [result1, result2] = await Promise.all([
          sql`SELECT * FROM footballplayers WHERE player_id = ${p1.player_id} AND season_id = ${req.season_id} LIMIT 1`,
          sql`SELECT * FROM footballplayers WHERE player_id = ${p2.player_id} AND season_id = ${req.season_id} LIMIT 1`
        ]);
        p1Data = result1[0];
        p2Data = result2[0];
      }
      
      if (!p1Data || !p2Data) {
        return NextResponse.json(
          { success: false, error: 'One or both players not found in database. Cannot approve.' },
          { status: 404 }
        );
      }
      
      // Map to NeonPlayerData
      const playerAInfo: NeonPlayerData = {
        id: p1Data.id || `${p1.player_id}_${req.season_id}`,
        player_id: p1Data.player_id || p1.player_id,
        player_name: p1Data.player_name || p1Data.name || p1.player_name,
        team_id: p1.from_team_id,
        team: p1Data.team || p1Data.team_name,
        auction_value: p1Data.auction_value || p1Data.acquisition_value || 0,
        star_rating: p1Data.star_rating || p1Data.overall_rating,
        contract_start_season: p1Data.contract_start_season || req.season_id,
        contract_end_season: p1Data.contract_end_season || req.season_id,
        season_id: req.season_id,
        status: p1Data.status,
        type: p1.player_type as 'real' | 'football'
      };
      
      const playerBInfo: NeonPlayerData = {
        id: p2Data.id || `${p2.player_id}_${req.season_id}`,
        player_id: p2Data.player_id || p2.player_id,
        player_name: p2Data.player_name || p2Data.name || p2.player_name,
        team_id: p2.from_team_id,
        team: p2Data.team || p2Data.team_name,
        auction_value: p2Data.auction_value || p2Data.acquisition_value || 0,
        star_rating: p2Data.star_rating || p2Data.overall_rating,
        contract_start_season: p2Data.contract_start_season || req.season_id,
        contract_end_season: p2Data.contract_end_season || req.season_id,
        season_id: req.season_id,
        status: p2Data.status,
        type: p2.player_type as 'real' | 'football'
      };
      
      // Determine fee amount (positive means Team A pays Team B)
      let feeAmount = 0;
      if (req.cash_amount > 0) {
        if (req.cash_direction === 'A_to_B') {
          feeAmount = req.cash_amount;
        } else if (req.cash_direction === 'B_to_A') {
          feeAmount = -req.cash_amount;
        }
      }
      
      const swapResult = await swapPlayersNeon(
        playerAInfo,
        playerBInfo,
        feeAmount,
        req.season_id,
        processed_by,
        processed_by_name
      );
      
      if (!swapResult.success) {
        return NextResponse.json(
          { success: false, error: swapResult.error || swapResult.message },
          { status: 500 }
        );
      }
    }
    
    // Update the request status in database
    const updatedReq = await updateSwapRequestStatus(
      id, 
      status, 
      processed_by, 
      rejection_reason
    );
    
    return NextResponse.json({ success: true, data: updatedReq });
  } catch (error: any) {
    console.error('Error updating swap request:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update request' },
      { status: 500 }
    );
  }
}
