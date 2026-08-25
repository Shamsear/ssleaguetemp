import { NextRequest, NextResponse } from 'next/server';
import { getMainDb } from '@/lib/neon/main-config';

/**
 * GET /api/transfers/history
 * Fetch transfer history from Neon transactions + player_transactions tables
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const seasonId = searchParams.get('season_id');
    const teamId = searchParams.get('team_id');
    const type = searchParams.get('type');
    const playerType = searchParams.get('player_type');
    const page = parseInt(searchParams.get('page') || '0');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!seasonId) {
      return NextResponse.json(
        { success: false, error: 'season_id is required' },
        { status: 400 }
      );
    }

    const sql = getMainDb();
    const allTxns: any[] = [];
    const seasonsSet = new Set<string>();

    // === 1. Fetch financial transactions from Neon ===
    try {
      let txnQuery = `
        SELECT * FROM transactions 
        WHERE season_id = $1 
        AND type IN ('release', 'transfer', 'swap', 'player_transfer', 'player_swap', 'football_swap_fee')
      `;
      const txnParams: any[] = [seasonId];
      let paramIdx = 2;

      if (type) {
        txnQuery += ` AND type = $${paramIdx++}`;
        txnParams.push(type);
      }
      if (playerType) {
        txnQuery += ` AND (player_type = $${paramIdx} OR player_type IS NULL)`;
        txnParams.push(playerType);
      }
      if (teamId) {
        txnQuery += ` AND (team_id = $${paramIdx} OR old_team_id = $${paramIdx} OR new_team_id = $${paramIdx})`;
        txnParams.push(teamId);
      }

      txnQuery += ' ORDER BY created_at DESC';

      const txnResult: any = await sql.query(txnQuery, txnParams);
      const txnRows: any[] = Array.isArray(txnResult) ? txnResult : (txnResult?.rows || []);

      for (const row of txnRows) {
        seasonsSet.add(row.season_id);
        allTxns.push({
          id: row.id,
          transaction_type: row.type,
          season_id: row.season_id,
          processed_by: row.processed_by || '',
          processed_by_name: row.processed_by_name || 'Unknown',
          created_at: row.created_at?.toISOString?.() || row.created_at || new Date().toISOString(),
          player_name: row.player_name,
          player_type: row.player_type,
          team_id: row.team_id,
          team_name: row.team_name,
          auction_value: row.auction_value,
          refund_amount: row.refund_amount,
          refund_percentage: row.refund_percentage,
          release_timing: row.release_timing,
          release_season: row.release_season,
          original_contract_start: row.original_contract_start,
          original_contract_end: row.original_contract_end,
          player: row.player,
          old_team_id: row.old_team_id,
          new_team_id: row.new_team_id,
          values: row.values,
          star_rating: row.star_rating,
          financial: row.financial,
          new_salary: row.new_salary,
          player_a: row.player_a,
          player_b: row.player_b,
          teams: row.teams,
        });
      }
    } catch (e: any) {
      console.warn('[Transfers] Neon transactions query failed:', e.message);
    }

    // === 2. Fetch player_transactions (swaps) from Neon ===
    if (!type || type === 'swap') {
      try {
        let ptQuery = `
          SELECT * FROM player_transactions 
          WHERE season_id = $1 AND transaction_type = 'swap'
        `;
        const ptParams: any[] = [seasonId];
        let ptIdx = 2;

        if (playerType) {
          ptQuery += ` AND player_type = $${ptIdx++}`;
          ptParams.push(playerType);
        }
        if (teamId) {
          ptQuery += ` AND (team_a_id = $${ptIdx} OR team_b_id = $${ptIdx})`;
          ptParams.push(teamId);
        }

        ptQuery += ' ORDER BY created_at DESC';

        const ptResult: any = await sql.query(ptQuery, ptParams);
        const ptRows: any[] = Array.isArray(ptResult) ? ptResult : (ptResult?.rows || []);

        const processedSwaps = new Set<string>();
        for (const row of ptRows) {
          if (processedSwaps.has(row.id)) continue;
          processedSwaps.add(row.id);
          seasonsSet.add(row.season_id);

          allTxns.push({
            id: row.id,
            transaction_type: 'swap',
            season_id: row.season_id,
            processed_by: row.processed_by || '',
            processed_by_name: row.processed_by_name || 'System',
            created_at: row.created_at?.toISOString?.() || row.created_at || new Date().toISOString(),
            player_a: {
              id: row.player_a_id,
              name: row.player_a_name,
              type: row.player_type || 'football',
              old_value: 0,
              new_value: 0,
              old_star: 0,
              new_star: 0,
              points_added: 0,
              new_salary: 0,
            },
            player_b: {
              id: row.player_b_id,
              name: row.player_b_name,
              type: row.player_type || 'football',
              old_value: 0,
              new_value: 0,
              old_star: 0,
              new_star: 0,
              points_added: 0,
              new_salary: 0,
            },
            teams: {
              team_a_id: row.team_a_id,
              team_b_id: row.team_b_id,
              team_a_pays: row.fee_team_a || 0,
              team_b_pays: row.fee_team_b || 0,
            },
            financial: {
              total_committee_fees: (row.fee_team_a || 0) + (row.fee_team_b || 0),
            },
          });
        }
      } catch (e: any) {
        console.warn('[Transfers] Neon player_transactions query failed:', e.message);
      }
    }

    // Sort by date (newest first)
    allTxns.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const totalCount = allTxns.length;

    // Apply pagination
    const startIndex = page * limit;
    const endIndex = startIndex + limit;
    const paginatedTxns = allTxns.slice(startIndex, endIndex);

    return NextResponse.json({
      success: true,
      data: {
        transactions: paginatedTxns,
        totalCount,
        hasMore: endIndex < allTxns.length,
        availableSeasons: Array.from(seasonsSet).sort((a, b) => {
          const getSeasonNum = (id: string) => parseInt(id.replace(/\D/g, '')) || 0;
          return getSeasonNum(b) - getSeasonNum(a);
        }),
      },
    });

  } catch (error: any) {
    console.error('Error fetching transfer history:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch transfer history' },
      { status: 500 }
    );
  }
}
