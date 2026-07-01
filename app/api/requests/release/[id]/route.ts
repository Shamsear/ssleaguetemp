import { NextRequest, NextResponse } from 'next/server';
import { 
  getReleaseRequestById,
  updateReleaseRequestStatus
} from '@/lib/neon/roster-requests';
import { releasePlayerNeon, NeonPlayerData } from '@/lib/player-transfers-neon';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { getAuctionDb } from '@/lib/neon/auction-config';

/**
 * PATCH /api/requests/release/[id]
 * Approve or reject a release request
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, processed_by, processed_by_name, rejection_reason } = body;
    
    if (!status || !['approved', 'rejected', 'cancelled'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status' },
        { status: 400 }
      );
    }
    
    const req = await getReleaseRequestById(id);
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
    
    // If approved, execute the actual release logic
    if (status === 'approved') {
      if (!processed_by || !processed_by_name) {
        return NextResponse.json(
          { success: false, error: 'processed_by and processed_by_name required for approval' },
          { status: 400 }
        );
      }
      
      const sql = req.player_type === 'real' ? getTournamentDb() : getAuctionDb();
      
      const seasonNum = parseInt(req.season_id.replace(/\D/g, '')) || 0;
      const isModern = seasonNum === 16 || seasonNum === 17;
      
      // Fetch full player data from Neon to pass to releasePlayerNeon
      let playerData;
      if (req.player_type === 'real') {
        const result = isModern
          ? await sql`SELECT * FROM player_seasons WHERE id = ${req.player_id + '_' + req.season_id} LIMIT 1`
          : await sql`SELECT * FROM realplayerstats WHERE id = ${req.player_id + '_' + req.season_id} LIMIT 1`;
        playerData = result[0];
      } else {
        const result = await sql`SELECT * FROM footballplayers WHERE player_id = ${req.player_id} AND season_id = ${req.season_id} LIMIT 1`;
        playerData = result[0];
      }
      
      if (!playerData) {
        return NextResponse.json(
          { success: false, error: 'Player not found in database. Cannot approve.' },
          { status: 404 }
        );
      }
      
      // Map to NeonPlayerData
      const playerInfo: NeonPlayerData = {
        id: playerData.id || `${req.player_id}_${req.season_id}`,
        player_id: playerData.player_id || req.player_id,
        player_name: playerData.player_name || playerData.name || req.player_name,
        team_id: req.team_id,
        team: playerData.team || playerData.team_name,
        auction_value: playerData.auction_value || playerData.acquisition_value || 0,
        star_rating: playerData.star_rating || playerData.overall_rating,
        contract_start_season: playerData.contract_start_season || req.season_id,
        contract_end_season: playerData.contract_end_season || req.season_id,
        season_id: req.season_id,
        status: playerData.status,
        type: req.player_type as 'real' | 'football'
      };
      
      const releaseResult = await releasePlayerNeon(
        playerInfo,
        req.season_id,
        processed_by,
        processed_by_name
      );
      
      if (!releaseResult.success) {
        return NextResponse.json(
          { success: false, error: releaseResult.error || releaseResult.message },
          { status: 500 }
        );
      }
    }
    
    // Update the request status in database
    const updatedReq = await updateReleaseRequestStatus(
      id, 
      status, 
      processed_by, 
      rejection_reason
    );
    
    return NextResponse.json({ success: true, data: updatedReq });
  } catch (error: any) {
    console.error('Error updating release request:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update request' },
      { status: 500 }
    );
  }
}
