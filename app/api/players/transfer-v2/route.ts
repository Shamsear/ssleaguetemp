import { NextRequest, NextResponse } from 'next/server';
import { executeTransferV2, TransferRequest, PlayerType } from '@/lib/player-transfers-v2';
import { calculateTransferDetails } from '@/lib/player-transfers-v2-utils-categories';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { getAuctionDb } from '@/lib/neon/auction-config';

/**
 * POST /api/players/transfer-v2
 * Execute a player transfer with committee fees and star upgrades
 * 
 * This endpoint implements the enhanced transfer system with:
 * - Transfer limit enforcement (2 per team per season)
 * - Star-based value increases
 * - 10% committee fees
 * - Automatic star rating upgrades
 * - Salary recalculation
 * 
 * Body:
 * {
 *   player_id: string,
 *   player_type: 'real' | 'football',
 *   new_team_id: string,
 *   season_id: string,
 *   transferred_by: string,
 *   transferred_by_name: string,
 *   preview_only?: boolean  // If true, only return calculation without executing
 * }
 * 
 * Requirements: 2.1-2.7, 11.1, 11.2, 11.5, 11.6
 */
export async function POST(request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: 'Transfers (sales) are disabled. Only swaps and releases are allowed.',
      errorCode: 'TRANSFERS_DISABLED'
    },
    { status: 400 }
  );
}
