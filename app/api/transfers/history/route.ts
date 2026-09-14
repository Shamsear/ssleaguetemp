import { NextRequest, NextResponse } from 'next/server';
import { getMainDb } from '@/lib/neon/main-config';

/**
 * GET /api/transfers/history
 * Fetch transfer history from Neon transactions + player_transactions tables
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawSeasonId = searchParams.get('season_id');
    const teamId = searchParams.get('team_id');
    const type = searchParams.get('type');
    const playerType = searchParams.get('player_type');
    const page = parseInt(searchParams.get('page') || '0');
    const limit = parseInt(searchParams.get('limit') || '20');

    const hasSeasonFilter = Boolean(rawSeasonId && rawSeasonId !== 'null' && rawSeasonId !== 'undefined' && rawSeasonId.trim() !== '');
    const seasonId = hasSeasonFilter ? rawSeasonId!.trim() : null;

    const sql = getMainDb();
    const allTxns: any[] = [];
    const seasonsSet = new Set<string>();

    // Pre-populate seasonsSet with distinct seasons from transactions
    try {
      const seasonRows: any = await sql.query("SELECT DISTINCT UPPER(season_id) as season_id FROM transactions WHERE season_id IS NOT NULL");
      const seasonsArr = Array.isArray(seasonRows) ? seasonRows : (seasonRows?.rows || []);
      seasonsArr.forEach((s: any) => {
        if (s.season_id) seasonsSet.add(s.season_id);
      });
    } catch (err) {
      // Fallback
    }

    // Pre-populate seasonsSet with distinct seasons from player_transactions
    try {
      const ptSeasonRows: any = await sql.query("SELECT DISTINCT UPPER(season_id) as season_id FROM player_transactions WHERE season_id IS NOT NULL");
      const ptSeasonsArr = Array.isArray(ptSeasonRows) ? ptSeasonRows : (ptSeasonRows?.rows || []);
      ptSeasonsArr.forEach((s: any) => {
        if (s.season_id) seasonsSet.add(s.season_id);
      });
    } catch (err) {
      // Fallback
    }

    if (seasonId) seasonsSet.add(seasonId.toUpperCase());

    // === 1. Fetch financial transactions (releases, transfers) from Neon ===
    const shouldFetchTransactions = !type || type === 'release' || type === 'transfer' || type === 'player_transfer';
    if (shouldFetchTransactions) {
      try {
        let txnQuery = `
          SELECT * FROM transactions 
          WHERE (
            type IN ('release', 'release_refund', 'transfer', 'player_transfer')
            OR (raw_data->>'transaction_type') IN ('release', 'release_refund', 'transfer', 'player_transfer')
            OR (raw_data->>'type') IN ('release', 'release_refund', 'transfer', 'player_transfer')
          )
        `;
        const txnParams: any[] = [];
        let paramIdx = 1;

        if (seasonId) {
          txnQuery += ` AND (LOWER(season_id) = LOWER($${paramIdx}) OR LOWER(raw_data->>'season_id') = LOWER($${paramIdx}))`;
          paramIdx++;
          txnParams.push(seasonId);
        }

        if (type) {
          if (type === 'release') {
            txnQuery += ` AND (type IN ('release', 'release_refund') OR (raw_data->>'transaction_type') IN ('release', 'release_refund'))`;
          } else if (type === 'transfer' || type === 'player_transfer') {
            txnQuery += ` AND (type IN ('transfer', 'player_transfer') OR (raw_data->>'transaction_type') IN ('transfer', 'player_transfer'))`;
          } else {
            txnQuery += ` AND (type = $${paramIdx} OR (raw_data->>'transaction_type') = $${paramIdx})`;
            paramIdx++;
            txnParams.push(type);
          }
        }

        if (playerType) {
          const currencyType = playerType === 'real' ? 'real_player' : 'football';
          txnQuery += ` AND (
            (raw_data->>'player_type') = $${paramIdx} 
            OR (raw_data->>'currency_type') = $${paramIdx + 1}
            OR currency = $${paramIdx + 1}
          )`;
          paramIdx += 2;
          txnParams.push(playerType, currencyType);
        }

        if (teamId) {
          txnQuery += ` AND (
            team_id = $${paramIdx} 
            OR (raw_data->>'team_id') = $${paramIdx} 
            OR (raw_data->>'old_team_id') = $${paramIdx} 
            OR (raw_data->>'new_team_id') = $${paramIdx}
            OR (raw_data->>'related_team_id') = $${paramIdx}
          )`;
          paramIdx++;
          txnParams.push(teamId);
        }

        txnQuery += ' ORDER BY created_at DESC';

        const txnResult: any = await sql.query(txnQuery, txnParams);
        const txnRows: any[] = Array.isArray(txnResult) ? txnResult : (txnResult?.rows || []);

        for (const row of txnRows) {
          if (row.season_id) seasonsSet.add(row.season_id.toUpperCase());
          const raw = typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : (row.raw_data || {});
          if (raw.season_id) seasonsSet.add(raw.season_id.toUpperCase());

          const isRelease = row.type === 'release' || row.type === 'release_refund' || raw.transaction_type === 'release' || raw.transaction_type === 'release_refund' || raw.type === 'release_refund';
          const isTransfer = row.type === 'transfer' || row.type === 'player_transfer' || raw.transaction_type === 'transfer' || raw.transaction_type === 'player_transfer';
          const txType = isRelease ? 'release' : isTransfer ? 'transfer' : row.type;

          // Parse release player name from description if missing
          let extractedName = row.player_name || raw.player_name || raw.playerName || (raw.metadata?.player_name);
          if (!extractedName && row.description) {
            const match = row.description.match(/^Released\s+([^-]+)\s+-/i);
            if (match) extractedName = match[1].trim();
          }

          const pType = raw.player_type || (raw.metadata?.player_type) || (row.currency === 'real_player' || raw.currency_type === 'real_player' ? 'real' : 'football');

          allTxns.push({
            id: row.id,
            transaction_type: txType,
            season_id: row.season_id || raw.season_id,
            processed_by: row.processed_by || raw.processed_by || (raw.metadata?.processed_by) || '',
            processed_by_name: row.processed_by_name || raw.processed_by_name || (raw.metadata?.processed_by_name) || 'Admin',
            created_at: row.created_at?.toISOString?.() || row.created_at || (raw.created_at?._seconds ? new Date(raw.created_at._seconds * 1000).toISOString() : raw.created_at) || new Date().toISOString(),
            player_name: extractedName || 'Unknown Player',
            player_type: pType,
            team_id: row.team_id || raw.team_id,
            team_name: raw.team_name || row.team_name || (row.team_id ? row.team_id : 'Unknown Team'),
            auction_value: Number(row.auction_value || raw.acquisition_value || raw.auction_value || Math.abs(Number(row.amount || 0))),
            refund_amount: Number(row.refund_amount || raw.refund_amount || (raw.metadata?.refund_amount) || Math.abs(Number(row.amount || 0))),
            refund_percentage: Number(row.refund_percentage || raw.refund_percentage || (raw.metadata?.refund_percentage) || 100),
            release_timing: row.release_timing || raw.release_timing || (raw.metadata?.release_timing) || 'mid',
            release_season: row.release_season || raw.release_season || (raw.metadata?.release_season) || row.season_id,
            original_contract_start: row.original_contract_start || raw.original_contract_start || (raw.metadata?.original_contract_start) || row.season_id,
            original_contract_end: row.original_contract_end || raw.original_contract_end || (raw.metadata?.original_contract_end) || row.season_id,
            player: row.player || raw.player || { id: row.player_id || raw.player_id || (raw.metadata?.player_id), name: extractedName, type: pType },
            old_team_id: row.old_team_id || raw.old_team_id || raw.from_team_id,
            new_team_id: row.new_team_id || raw.new_team_id || raw.to_team_id,
            values: row.values || raw.values,
            star_rating: row.star_rating || raw.star_rating,
            financial: row.financial || raw.financial,
            new_salary: row.new_salary || raw.new_salary,
            player_a: row.player_a || raw.player_a,
            player_b: row.player_b || raw.player_b,
            teams: row.teams || raw.teams,
          });
        }
      } catch (e: any) {
        console.warn('[Transfers] Neon transactions query failed:', e.message);
      }
    }

    // === 2. Fetch player_transactions (swaps) from Neon ===
    const shouldFetchSwaps = !type || type === 'swap' || type === 'player_swap' || type === 'football_swap';
    if (shouldFetchSwaps) {
      try {
        let ptQuery = `
          SELECT * FROM player_transactions 
          WHERE (type = 'swap' OR (raw_data->>'transaction_type') = 'swap' OR (raw_data->>'type') = 'swap')
        `;
        const ptParams: any[] = [];
        let ptIdx = 1;

        if (seasonId) {
          ptQuery += ` AND (LOWER(season_id) = LOWER($${ptIdx}) OR LOWER(raw_data->>'season_id') = LOWER($${ptIdx}))`;
          ptIdx++;
          ptParams.push(seasonId);
        }

        if (playerType) {
          ptQuery += ` AND (
            (raw_data->>'player_type') = $${ptIdx} 
            OR (raw_data->>'player_a_type') = $${ptIdx} 
            OR (raw_data->>'player_b_type') = $${ptIdx}
          )`;
          ptIdx++;
          ptParams.push(playerType);
        }

        if (teamId) {
          ptQuery += ` AND (
            team_id = $${ptIdx} 
            OR from_team_id = $${ptIdx} 
            OR to_team_id = $${ptIdx} 
            OR (raw_data->>'team_a_id') = $${ptIdx} 
            OR (raw_data->>'team_b_id') = $${ptIdx}
          )`;
          ptIdx++;
          ptParams.push(teamId);
        }

        ptQuery += ' ORDER BY created_at DESC';

        const ptResult: any = await sql.query(ptQuery, ptParams);
        const ptRows: any[] = Array.isArray(ptResult) ? ptResult : (ptResult?.rows || []);

        const processedSwaps = new Set<string>();
        for (const row of ptRows) {
          if (processedSwaps.has(row.id)) continue;
          processedSwaps.add(row.id);
          if (row.season_id) seasonsSet.add(row.season_id.toUpperCase());

          const raw = typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : (row.raw_data || {});
          if (raw.season_id) seasonsSet.add(raw.season_id.toUpperCase());

          const playerAType = raw.player_a_type || raw.player_type || 'football';
          const playerBType = raw.player_b_type || raw.player_type || 'football';

          const teamAPays = Number(raw.team_a_pays || raw.fee_team_a || raw.team_a_fee || 0);
          const teamBPays = Number(raw.team_b_pays || raw.fee_team_b || raw.team_b_fee || 0);
          const totalFees = Number(raw.total_committee_fees || (teamAPays + teamBPays) || raw.fee_amount || 0);

          allTxns.push({
            id: row.id,
            transaction_type: 'swap',
            season_id: row.season_id || raw.season_id,
            processed_by: row.processed_by || raw.processed_by || '',
            processed_by_name: raw.processed_by_name || row.processed_by_name || 'Admin',
            created_at: row.created_at?.toISOString?.() || row.created_at || (raw.created_at?._seconds ? new Date(raw.created_at._seconds * 1000).toISOString() : raw.created_at) || new Date().toISOString(),
            player_a: {
              id: raw.player_a_id || row.player_id,
              name: raw.player_a_name || 'Player A',
              type: playerAType,
              old_value: Number(raw.player_a_old_value || 0),
              new_value: Number(raw.player_a_new_value || 0),
              old_star: Number(raw.player_a_old_star || 0),
              new_star: Number(raw.player_a_new_star || 0),
              points_added: Number(raw.player_a_points_added || 0),
              new_salary: Number(raw.player_a_new_salary || 0),
            },
            player_b: {
              id: raw.player_b_id,
              name: raw.player_b_name || 'Player B',
              type: playerBType,
              old_value: Number(raw.player_b_old_value || 0),
              new_value: Number(raw.player_b_new_value || 0),
              old_star: Number(raw.player_b_old_star || 0),
              new_star: Number(raw.player_b_new_star || 0),
              points_added: Number(raw.player_b_points_added || 0),
              new_salary: Number(raw.player_b_new_salary || 0),
            },
            teams: {
              team_a_id: raw.team_a_id || row.from_team_id || row.team_id,
              team_b_id: raw.team_b_id || row.to_team_id,
              team_a_pays: teamAPays,
              team_b_pays: teamBPays,
            },
            financial: {
              total_committee_fees: totalFees,
              cash_amount: Number(raw.cash_amount || 0),
              cash_direction: raw.cash_direction || 'none',
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
