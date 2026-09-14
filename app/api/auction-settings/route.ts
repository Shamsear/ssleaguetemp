import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

// GET - Fetch auction settings
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('season_id') || 'default';
    const auctionWindow = searchParams.get('auction_window') || 'season_start';

    const client = await pool.connect();
    
    try {
      // Get settings for specific season and auction window
      const result = await client.query(
        'SELECT * FROM auction_settings WHERE season_id = $1 AND auction_window = $2 LIMIT 1',
        [seasonId, auctionWindow]
      );

      // If no settings found, return null
      if (result.rows.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            settings: null,
            stats: {
              total_rounds: 0,
              completed_rounds: 0,
              remaining_rounds: 0,
            }
          }
        });
      }

      const settings = result.rows[0];

      // Get actual rounds data from database
      const roundsResult = await client.query(
        `SELECT 
          COUNT(*) as total_rounds,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_rounds
         FROM rounds 
         WHERE season_id = $1`,
        [seasonId]
      );
      
      const totalRounds = parseInt(roundsResult.rows[0]?.total_rounds || '0');
      const completedRounds = parseInt(roundsResult.rows[0]?.completed_rounds || '0');
      const remainingRounds = settings.max_rounds - totalRounds;

      const isMidSeason = (settings.auction_window || auctionWindow) === 'mid_season';

      return NextResponse.json({
        success: true,
        data: {
          settings: {
            id: settings.id,
            season_id: settings.season_id,
            auction_window: settings.auction_window || 'season_start',
            max_rounds: settings.max_rounds,
            min_balance_per_round: settings.min_balance_per_round,
            contract_duration: settings.contract_duration || 2,
            max_squad_size: settings.max_squad_size || 25,
            phase_1_end_round: isMidSeason ? null : (settings.phase_1_end_round ?? 18),
            phase_1_min_balance: isMidSeason ? null : (settings.phase_1_min_balance ?? 30),
            phase_2_end_round: isMidSeason ? null : (settings.phase_2_end_round ?? 20),
            phase_2_min_balance: isMidSeason ? null : (settings.phase_2_min_balance ?? 30),
            phase_3_min_balance: settings.phase_3_min_balance ?? 10,
            created_at: settings.created_at,
            updated_at: settings.updated_at,
          },
          stats: {
            total_rounds: totalRounds,
            completed_rounds: completedRounds,
            remaining_rounds: remainingRounds,
          }
        }
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('❌ Error fetching auction settings:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST - Update auction settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('🔍 [Auction Settings POST] Received body:', body);
    const { 
      season_id = 'default',
      auction_window = 'season_start', 
      max_rounds, 
      min_balance_per_round, 
      contract_duration = 2, 
      max_squad_size = 25,
      phase_1_end_round,
      phase_1_min_balance,
      phase_2_end_round,
      phase_2_min_balance,
      phase_3_min_balance = 10
    } = body;
    console.log('🔍 [Auction Settings POST] Extracted max_rounds:', max_rounds, 'window:', auction_window);

    if (!max_rounds || !min_balance_per_round || !max_squad_size) {
      return NextResponse.json(
        { success: false, error: 'max_rounds, min_balance_per_round, and max_squad_size are required' },
        { status: 400 }
      );
    }

    const isMidSeason = auction_window === 'mid_season';
    const finalPhase1End = isMidSeason ? null : (phase_1_end_round !== undefined ? phase_1_end_round : 18);
    const finalPhase1Min = isMidSeason ? null : (phase_1_min_balance !== undefined ? phase_1_min_balance : 30);
    const finalPhase2End = isMidSeason ? null : (phase_2_end_round !== undefined ? phase_2_end_round : 20);
    const finalPhase2Min = isMidSeason ? null : (phase_2_min_balance !== undefined ? phase_2_min_balance : 30);
    const finalPhase3Min = phase_3_min_balance !== undefined ? phase_3_min_balance : 10;

    const client = await pool.connect();

    try {
      // Check if settings exist for this season and auction window
      const checkResult = await client.query(
        'SELECT id FROM auction_settings WHERE season_id = $1 AND auction_window = $2',
        [season_id, auction_window]
      );

      let result;
      if (checkResult.rows.length > 0) {
        // Update existing
        result = await client.query(
          `UPDATE auction_settings 
           SET max_rounds = $1, min_balance_per_round = $2, contract_duration = $3, max_squad_size = $4,
               phase_1_end_round = $5, phase_1_min_balance = $6, phase_2_end_round = $7, 
               phase_2_min_balance = $8, phase_3_min_balance = $9, updated_at = NOW()
           WHERE season_id = $10 AND auction_window = $11
           RETURNING *`,
          [max_rounds, min_balance_per_round, contract_duration, max_squad_size, 
           finalPhase1End, finalPhase1Min, finalPhase2End, finalPhase2Min, finalPhase3Min, season_id, auction_window]
        );
      } else {
        // Insert new
        result = await client.query(
          `INSERT INTO auction_settings (season_id, auction_window, max_rounds, min_balance_per_round, contract_duration, max_squad_size, phase_1_end_round, phase_1_min_balance, phase_2_end_round, phase_2_min_balance, phase_3_min_balance) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
           RETURNING *`,
          [season_id, auction_window, max_rounds, min_balance_per_round, contract_duration, max_squad_size,
           finalPhase1End, finalPhase1Min, finalPhase2End, finalPhase2Min, finalPhase3Min]
        );
      }

      console.log(`✅ Updated auction settings for season ${season_id}, window ${auction_window}:`, {
        phase_1_end_round: finalPhase1End,
        phase_2_end_round: finalPhase2End,
        phase_3_min_balance: finalPhase3Min
      });

      return NextResponse.json({
        success: true,
        data: result.rows[0]
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('❌ Error updating auction settings:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
