import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { getTournamentDb } from '@/lib/neon/tournament-config';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(['team'], request);
    if (!auth.authenticated) {
      return NextResponse.json({
        success: false,
        error: auth.error || 'Unauthorized',
      }, { status: 401 });
    }

    const userId = auth.userId!;
    const sql = getTournamentDb();

    // 1. Resolve Team ID directly from Neon PostgreSQL (teams & team_seasons tables)
    let teamId: string | null = (auth as any).teamId || (auth as any).user?.team_id || (auth as any).user?.teamId || null;

    if (!teamId) {
      try {
        const neonTeams = await sql`
          SELECT id FROM teams WHERE firebase_uid = ${userId} OR id = ${userId} LIMIT 1
        `;
        if (neonTeams.length > 0) {
          teamId = neonTeams[0].id;
        }
      } catch (err) {
        console.warn('Neon teams lookup warning:', err);
      }
    }

    if (!teamId) {
      try {
        const neonTS = await sql`
          SELECT team_id FROM team_seasons WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 1
        `;
        if (neonTS.length > 0) {
          teamId = neonTS[0].team_id;
        }
      } catch (err) {
        console.warn('Neon team_seasons user lookup warning:', err);
      }
    }

    // 2. Resolve Season ID directly from query params or active season in Neon PostgreSQL
    const { searchParams } = new URL(request.url);
    let seasonId = searchParams.get('season_id');

    if (!seasonId) {
      try {
        const activeSeasons = await sql`
          SELECT id FROM seasons WHERE is_active = true OR status = 'active' ORDER BY season_number DESC LIMIT 1
        `;
        if (activeSeasons.length > 0) {
          seasonId = activeSeasons[0].id;
        }
      } catch (err) {
        console.warn('Neon active season lookup warning:', err);
      }
    }

    if (!seasonId) {
      seasonId = 'SSPSLS18';
    }

    // 3. Fetch Team Season Data directly from Neon PostgreSQL
    let teamSeasonData: any = null;
    if (teamId) {
      try {
        const tsRows = await sql`
          SELECT * FROM team_seasons WHERE (team_id = ${teamId} OR user_id = ${userId}) AND season_id = ${seasonId} LIMIT 1
        `;
        if (tsRows.length > 0) {
          teamSeasonData = tsRows[0];
        }
      } catch (err) {
        console.warn('Neon team_seasons lookup warning:', err);
      }
    }

    // 4. Fetch Transactions directly from Neon PostgreSQL transactions table
    let allTransactions: any[] = [];
    if (teamId) {
      try {
        const txRows = await sql`
          SELECT * FROM transactions
          WHERE (team_id = ${teamId} OR (raw_data->>'team_id') = ${teamId})
            AND (season_id = ${seasonId} OR (raw_data->>'season_id') = ${seasonId})
          ORDER BY created_at DESC
          LIMIT 500
        `;
        allTransactions = txRows;
      } catch (err) {
        console.warn('Neon transactions table lookup warning:', err);
        allTransactions = [];
      }
    }

    // If no team ID resolved yet, return graceful empty structure
    if (!teamId) {
      console.warn(`No team ID resolved for user ${userId} in Neon PostgreSQL.`);
      return NextResponse.json({
        success: true,
        season_id: seasonId,
        currency_system: 'single',
        football: { current_balance: 0, starting_balance: 0, total_spent: 0, total_earned: 0, transactions: [] },
        real_player: { current_balance: 0, starting_balance: 0, total_spent: 0, total_earned: 0, transactions: [] }
      });
    }

    // Determine currency system
    const currencySystem = teamSeasonData?.currency_system || 'single';
    const isDualCurrency = currencySystem === 'dual';

    // Separate transactions by currency type
    let footballTransactions: any[] = [];
    let realPlayerTransactions: any[] = [];

    allTransactions.forEach(transaction => {
      const data = transaction;
      const rawData = typeof data.raw_data === 'string' ? JSON.parse(data.raw_data) : (data.raw_data || {});

      const formattedTransaction = {
        id: data.id,
        date: data.created_at?.toISOString?.() || data.created_at || new Date().toISOString(),
        type: data.transaction_type || data.type || 'unknown',
        amount: Number(data.amount || 0),
        reason: data.reason || data.description || 'Transaction',
        balance_after: Number(data.balance_after || 0),
        metadata: rawData
      };

      const reasonLower = (formattedTransaction.reason).toLowerCase();
      const isRealPlayerTransaction = 
        data.currency_type === 'real_player' || 
        formattedTransaction.type === 'real_player_fee' ||
        formattedTransaction.type === 'real_player' ||
        reasonLower.includes('real player') ||
        reasonLower.includes('sscoin') ||
        reasonLower.includes('ss coin') ||
        reasonLower.includes('tournament player');
      
      if (isRealPlayerTransaction) {
        realPlayerTransactions.push(formattedTransaction);
      } else {
        footballTransactions.push(formattedTransaction);
      }
    });

    // Sort transactions chronologically
    const sortTransactions = (transactions: any[]) => {
      return transactions.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateB !== dateA) {
          return dateB - dateA;
        }
        return a.balance_after - b.balance_after;
      });
    };

    footballTransactions = sortTransactions(footballTransactions);
    realPlayerTransactions = sortTransactions(realPlayerTransactions);

    if (isDualCurrency) {
      return NextResponse.json({
        success: true,
        season_id: seasonId,
        currency_system: 'dual',
        football: {
          current_balance: Number(teamSeasonData?.football_budget || 0),
          starting_balance: Number(teamSeasonData?.football_starting_balance || 0),
          total_spent: Number(teamSeasonData?.football_spent || 0),
          total_earned: Number(teamSeasonData?.football_earned || 0),
          transactions: footballTransactions,
        },
        real_player: {
          current_balance: Number(teamSeasonData?.real_player_budget || 0),
          starting_balance: Number(teamSeasonData?.real_player_starting_balance || 0),
          total_spent: Number(teamSeasonData?.real_player_spent || 0),
          total_earned: Number(teamSeasonData?.real_player_earned || 0),
          transactions: realPlayerTransactions,
        },
      });
    } else {
      return NextResponse.json({
        success: true,
        season_id: seasonId,
        currency_system: 'single',
        football: {
          current_balance: Number(teamSeasonData?.budget || teamSeasonData?.football_budget || 0),
          starting_balance: Number(teamSeasonData?.initial_budget || teamSeasonData?.budget_initial || teamSeasonData?.football_starting_balance || 0),
          total_spent: Number(teamSeasonData?.total_spent || teamSeasonData?.football_spent || 0),
          total_earned: Number(teamSeasonData?.total_earned || teamSeasonData?.football_earned || 0),
          transactions: [...footballTransactions, ...realPlayerTransactions],
        },
        real_player: {
          current_balance: 0,
          starting_balance: 0,
          total_spent: 0,
          total_earned: 0,
          transactions: [],
        },
      });
    }

  } catch (error: any) {
    console.error('❌ Error fetching team transactions from Neon:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch transactions from Neon main database',
      message: error.message || 'Unknown error',
    }, { status: 500 });
  }
}
