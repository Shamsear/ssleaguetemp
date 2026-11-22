import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { decryptBidData } from '@/lib/encryption';
import { neonGetActiveSeason } from '@/lib/neon/seasons';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Fetch player history including transactions and contract timeline
const sql = neon(process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    console.log('=== CONTRACT HISTORY DEBUG ===');
    console.log('Requested player ID:', id);
    
    // First, get the player's player_id and id from the database to handle both formats
    const playerData = await sql`
      SELECT id, player_id, team_id, season_id, status FROM footballplayers WHERE id = ${id} OR player_id = ${id}
    `;
    
    const dbId = playerData[0]?.id || id;
    const stringPlayerId = playerData[0]?.player_id;
    const currentTeamId = playerData[0]?.team_id;
    const currentSeasonId = playerData[0]?.season_id;
    const playerIdForTransactions = stringPlayerId || dbId;
    console.log('Player database ID:', dbId, 'String player ID:', stringPlayerId, 'Current team:', currentTeamId);

    // Determine current active season
    let activeSeasonNum = 19;
    let activeSeasonId = 'SSPSLS19';
    try {
      const activeSeason = await neonGetActiveSeason();
      if (activeSeason) {
        activeSeasonId = activeSeason.id || 'SSPSLS19';
        activeSeasonNum =
          activeSeason.season_number ||
          parseInt(activeSeason.id.replace(/\D/g, '')) ||
          19;
      }
    } catch {
      // default 19
    }
    
    // Fetch transactions from Firebase for cross-reference only
    const transactionsSnapshot = await adminDb
      .collection('transactions')
      .where('player_id', '==', playerIdForTransactions.toString())
      .get();
    
    const transactions = transactionsSnapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .sort((a: any, b: any) => {
        const aTime = a.created_at?._seconds || a.created_at?.seconds || 0;
        const bTime = b.created_at?._seconds || b.created_at?.seconds || 0;
        return bTime - aTime;
      });
    
    console.log('Firebase transactions found:', transactions.length);
    console.log('Transaction types:', transactions.map((t: any) => t.transaction_type));
    
    // Fetch ALL player history from Neon (primary source for contract history)
    const playerHistory = await sql`
      SELECT 
        ph.player_id,
        ph.team_id,
        ph.season_id,
        ph.acquisition_type,
        ph.acquisition_date,
        ph.acquisition_value,
        ph.status,
        ph.end_date,
        ph.end_reason,
        ph.transaction_id,
        ph.contract_start_season,
        ph.contract_end_season
      FROM player_history ph
      WHERE LOWER(ph.player_id) = LOWER(${dbId.toString()})
        ${stringPlayerId ? sql`OR LOWER(ph.player_id) = LOWER(${stringPlayerId.toString()})` : sql``}
      ORDER BY ph.acquisition_date ASC
    `;
    
    console.log('Player history records found:', playerHistory.length);
    
    // Fetch team names from Firebase for each unique team_id in parallel
    const uniqueTeamIds = [...new Set(playerHistory.map((h: any) => h.team_id).filter(Boolean))];
    const teamNamesMap: Record<string, string> = {};
    
    console.log('Fetching team names in parallel for:', uniqueTeamIds);
    
    if (uniqueTeamIds.length > 0) {
      await Promise.all(
        uniqueTeamIds.map(async (teamId) => {
          try {
            const teamDoc = await adminDb.collection('teams').doc(teamId).get();
            console.log(`Team ${teamId}: exists=${teamDoc.exists}`);
            if (teamDoc.exists) {
              const teamData = teamDoc.data();
              // Try team_name first, then name, then fallback to Unknown Team
              teamNamesMap[teamId] = teamData?.team_name || teamData?.name || 'Unknown Team';
              console.log(`  -> Name: ${teamNamesMap[teamId]}`);
            } else {
              console.log(`  -> Team ${teamId} not found in Firebase`);
              teamNamesMap[teamId] = 'Unknown Team';
            }
          } catch (error: any) {
            console.error(`Error fetching team ${teamId}:`, error.message);
            teamNamesMap[teamId] = 'Unknown Team';
          }
        })
      );
    }
    
    // Add team names to player history records
    const playerHistoryWithTeams = playerHistory.map((h: any) => ({
      ...h,
      team_name: teamNamesMap[h.team_id] || 'Unknown Team'
    }));
    
    console.log('Player history details:', JSON.stringify(playerHistoryWithTeams, null, 2));
    
    // Build roadmap from player_history
    console.log('Building roadmap from player_history...');
    const roadmap = playerHistoryWithTeams.map((history: any) => {
      const recordSeasonNum = parseInt(history.season_id?.replace(/\D/g, '') || '0');
      let status = history.status;
      let endReason = history.end_reason;
      let endDate = history.end_date;

      // Rule: For S18 and after, players are taken for one season only.
      // Therefore, any contract from a past season is completed and CANNOT be active.
      if (status === 'active') {
        if (recordSeasonNum >= 18 && recordSeasonNum < activeSeasonNum) {
          status = 'completed';
          endReason = endReason || '1-Season Contract Completed';
        } else if (recordSeasonNum < activeSeasonNum) {
          const endNum = history.contract_end_season 
            ? parseInt(history.contract_end_season.replace(/\D/g, '') || '0')
            : recordSeasonNum;
          if (endNum < activeSeasonNum) {
            status = 'completed';
            endReason = endReason || 'Contract Expired';
          }
        } else if (recordSeasonNum === activeSeasonNum && currentTeamId && history.team_id !== currentTeamId) {
          status = 'swapped';
          endReason = endReason || 'Transferred / Swapped';
        }
      }

      const baseData = {
        team_id: history.team_id,
        team_name: history.team_name,
        season_id: history.season_id,
        acquisition_date: history.acquisition_date,
        acquisition_value: history.acquisition_value,
        status,
        end_date: endDate,
        end_reason: endReason,
        transaction_id: history.transaction_id,
        contract_start_season: history.contract_start_season,
        contract_end_season: history.contract_end_season
      };
      
      if (history.acquisition_type === 'swap') {
        return {
          type: 'swap',
          ...baseData
        };
      } else if (history.acquisition_type === 'auction') {
        return {
          type: 'auction',
          ...baseData,
          acquisition_amount: history.acquisition_value
        };
      } else {
        return {
          type: history.acquisition_type || 'unknown',
          ...baseData
        };
      }
    });
    
    console.log('Final roadmap entries:', roadmap.length);
    console.log('Roadmap summary:', roadmap.map((r: any) => ({ type: r.type, team: r.team_name, date: r.acquisition_date })));
    console.log('=== END CONTRACT HISTORY DEBUG ===');
    
    return NextResponse.json({
      success: true,
      data: {
        transactions, // For cross-reference only
        playerHistory: playerHistoryWithTeams,
        roadmap
      }
    });
  } catch (error: any) {
    console.error('Error fetching player history:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
