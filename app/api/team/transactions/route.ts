import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { verifyAuth } from '@/lib/auth-helper';
import { 
  getCachedUserTeamId, 
  getCachedActiveSeason, 
  getCachedTeamSeason,
  CACHE_DURATIONS 
} from '@/lib/firebase/smart-cache';
import { getCached, setCached } from '@/lib/firebase/cache';

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

    // 1. Multi-tier Team ID resolution (token -> smart cache -> Neon -> Firestore team_seasons -> Firestore users)
    let teamId: string | null = (auth as any).teamId || (auth as any).user?.team_id || (auth as any).user?.teamId || null;

    if (!teamId) {
      teamId = await getCachedUserTeamId(userId);
    }

    if (!teamId) {
      // Tier 3: Query Neon PostgreSQL teams table
      try {
        const sql = getTournamentDb();
        const neonTeams = await sql`
          SELECT id FROM teams WHERE firebase_uid = ${userId} OR id = ${userId} LIMIT 1
        `;
        if (neonTeams.length > 0) {
          teamId = neonTeams[0].id;
        }
      } catch (err) {
        console.warn('Neon team lookup error:', err);
      }
    }

    if (!teamId) {
      // Tier 4: Query Firestore team_seasons collection by user_id
      try {
        const tsSnap = await adminDb.collection('team_seasons')
          .where('user_id', '==', userId)
          .limit(1)
          .get();

        if (!tsSnap.empty) {
          const tsData = tsSnap.docs[0].data();
          teamId = tsData.team_id || tsSnap.docs[0].id.split('_')[0] || null;
        }
      } catch (err) {
        console.warn('Firebase team_seasons lookup error:', err);
      }
    }

    if (!teamId) {
      // Tier 5: Query Firestore users collection
      try {
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const uData = userDoc.data();
          teamId = uData?.team_id || uData?.teamId || uData?.team || null;
        }
      } catch (err) {
        console.warn('Firebase user doc lookup error:', err);
      }
    }

    // 2. Season ID resolution
    const { searchParams } = new URL(request.url);
    let seasonId = searchParams.get('season_id');

    if (!seasonId) {
      const activeSeason = await getCachedActiveSeason();
      if (activeSeason) {
        seasonId = activeSeason.id;
      }
    }

    if (!seasonId) {
      seasonId = 'SSPSLS18';
    }

    // 3. Multi-tier Team Season data resolution
    let teamSeasonData: any = null;
    let actualDocId = teamId ? `${teamId}_${seasonId}` : null;

    if (actualDocId) {
      try {
        const tsDoc = await adminDb.collection('team_seasons').doc(actualDocId).get();
        if (tsDoc.exists) {
          teamSeasonData = tsDoc.data();
        }
      } catch (err) {
        console.warn('Direct team_seasons lookup error:', err);
      }
    }

    if (!teamSeasonData && teamId) {
      try {
        const tsResult = await getCachedTeamSeason(userId, seasonId);
        if (tsResult) {
          teamSeasonData = tsResult.data;
          actualDocId = tsResult.id;
        }
      } catch (err) {
        console.warn('getCachedTeamSeason lookup error:', err);
      }
    }

    if (!teamSeasonData && userId) {
      try {
        const tsSnap = await adminDb.collection('team_seasons')
          .where('user_id', '==', userId)
          .where('season_id', '==', seasonId)
          .limit(1)
          .get();
        if (!tsSnap.empty) {
          teamSeasonData = tsSnap.docs[0].data();
          actualDocId = tsSnap.docs[0].id;
          if (!teamId) {
            teamId = teamSeasonData.team_id;
          }
        }
      } catch (err) {
        console.warn('Query team_seasons lookup error:', err);
      }
    }

    // Also check Neon team_seasons table if teamSeasonData is missing
    if (!teamSeasonData && teamId) {
      try {
        const sql = getTournamentDb();
        const neonTeamSeasons = await sql`
          SELECT * FROM team_seasons WHERE (team_id = ${teamId} OR user_id = ${userId}) AND season_id = ${seasonId} LIMIT 1
        `;
        if (neonTeamSeasons.length > 0) {
          teamSeasonData = neonTeamSeasons[0];
        }
      } catch (err) {
        console.warn('Neon team_seasons lookup error:', err);
      }
    }

    if (!teamId) {
      console.warn(`No team ID found for user ${userId}, returning empty transaction structure.`);
      return NextResponse.json({
        success: true,
        season_id: seasonId,
        currency_system: 'single',
        football: { current_balance: 0, starting_balance: 0, total_spent: 0, total_earned: 0, transactions: [] },
        real_player: { current_balance: 0, starting_balance: 0, total_spent: 0, total_earned: 0, transactions: [] }
      });
    }

    console.log(`Team season data for team ${teamId}, season ${seasonId}:`, {
      football_budget: teamSeasonData?.football_budget,
      football_starting_balance: teamSeasonData?.football_starting_balance,
      real_player_budget: teamSeasonData?.real_player_budget,
      real_player_starting_balance: teamSeasonData?.real_player_starting_balance,
    });

    // Determine currency system
    const currencySystem = teamSeasonData?.currency_system || 'single';
    const isDualCurrency = currencySystem === 'dual';

    // Fetch transactions with fallback queries
    const transactionsCacheKey = `${teamId}_${seasonId}`;
    let allTransactions = getCached<any[]>('transactions', transactionsCacheKey, CACHE_DURATIONS.TRANSACTIONS);
    
    if (!allTransactions) {
      console.log(`❌ [Cache MISS] transactions for team ${teamId}, season ${seasonId}`);
      try {
        const transactionsSnapshot = await adminDb
          .collection('transactions')
          .where('team_id', '==', teamId)
          .where('season_id', '==', seasonId)
          .orderBy('created_at', 'desc')
          .limit(500)
          .get();
        
        console.log(`Found ${transactionsSnapshot.size} transactions from Firebase`);
        allTransactions = transactionsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      } catch (txErr) {
        console.warn('Firestore query error on transactions:', txErr);
        allTransactions = [];
      }
      
      setCached('transactions', transactionsCacheKey, allTransactions);
    } else {
      console.log(`✅ [Cache HIT] transactions for team ${teamId} (${allTransactions.length} transactions)`);
    }

    // Separate transactions by currency type
    let footballTransactions: any[] = [];
    let realPlayerTransactions: any[] = [];

    allTransactions.forEach(transaction => {
      const data = transaction;
      
      const formattedTransaction = {
        id: transaction.id,
        date: data.created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
        type: data.transaction_type || 'unknown',
        amount: data.amount || 0,
        reason: data.reason || data.description || 'Transaction',
        balance_after: data.balance_after || 0,
        metadata: data.metadata || {}
      };

      // Categorize by currency type or transaction type
      // Also check description/reason for SSCoin/real player keywords
      const reasonLower = (data.reason || data.description || '').toLowerCase();
      const isRealPlayerTransaction = 
        data.currency_type === 'real_player' || 
        data.transaction_type === 'real_player_fee' ||
        data.transaction_type === 'real_player' ||
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

    // Sort transactions by created_at DESC, then by balance_after ASC for same timestamps
    const sortTransactions = (transactions: any[]) => {
      return transactions.sort((a, b) => {
        // First sort by date (newest first)
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateB !== dateA) {
          return dateB - dateA;
        }
        // If same timestamp, sort by balance (ascending = chronological order)
        return a.balance_after - b.balance_after;
      });
    };

    footballTransactions = sortTransactions(footballTransactions);
    realPlayerTransactions = sortTransactions(realPlayerTransactions);

    // Build response based on currency system
    if (isDualCurrency) {
      return NextResponse.json({
        success: true,
        season_id: seasonId,
        currency_system: 'dual',
        football: {
          current_balance: teamSeasonData?.football_budget || 0,
          starting_balance: teamSeasonData?.football_starting_balance || 0,
          total_spent: teamSeasonData?.football_spent || 0,
          total_earned: teamSeasonData?.football_earned || 0,
          transactions: footballTransactions,
        },
        real_player: {
          current_balance: teamSeasonData?.real_player_budget || 0,
          starting_balance: teamSeasonData?.real_player_starting_balance || 0,
          total_spent: teamSeasonData?.real_player_spent || 0,
          total_earned: teamSeasonData?.real_player_earned || 0,
          transactions: realPlayerTransactions,
        },
      });
    } else {
      // Single currency system - put all transactions in football budget
      return NextResponse.json({
        success: true,
        season_id: seasonId,
        currency_system: 'single',
        football: {
          current_balance: teamSeasonData?.budget || 0,
          starting_balance: teamSeasonData?.initial_budget || teamSeasonData?.budget_initial || 0,
          total_spent: teamSeasonData?.total_spent || 0,
          total_earned: teamSeasonData?.total_earned || 0,
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
    console.error('❌ Error fetching transactions:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      name: error.name,
      code: error.code,
      details: error.details
    });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch transactions',
      message: error.message || 'Unknown error',
      details: error.code || error.name || 'No additional details',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
