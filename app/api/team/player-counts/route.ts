import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

/**
 * GET /api/team/player-counts
 * Returns player counts for all teams in a season
 * 
 * Query params:
 * - seasonId: Season ID (required)
 * 
 * Returns:
 * {
 *   success: true,
 *   data: {
 *     [team_id]: {
 *       footballPlayersCount: number,
 *       realPlayersCount: number
 *     }
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('seasonId');

    if (!seasonId) {
      return NextResponse.json(
        { success: false, error: 'seasonId is required' },
        { status: 400 }
      );
    }

    const auctionDbUrl = process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL;
    const tournamentDbUrl = process.env.NEON_TOURNAMENT_DB_URL;

    if (!auctionDbUrl || !tournamentDbUrl) {
      return NextResponse.json(
        { success: false, error: 'Database configuration missing' },
        { status: 500 }
      );
    }

    const auctionDb = neon(auctionDbUrl);
    const tournamentDb = neon(tournamentDbUrl);

    // Fetch football players count from auction DB
    // Use contract-based filtering: show players whose contract is active during this season
    const footballPlayerCounts = await auctionDb`
      SELECT 
        team_id,
        COUNT(*) as count
      FROM footballplayers
      WHERE (
        contract_start_season <= ${seasonId}
        AND contract_end_season >= ${seasonId}
      )
      AND team_id IS NOT NULL
      GROUP BY team_id
    `;

    const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
    const isModern = seasonNum === 16 || seasonNum === 17;

    // Fetch real players count from correct database table
    let realPlayerCounts;
    if (isModern) {
      realPlayerCounts = await tournamentDb`
        SELECT 
          team_id,
          COUNT(*) as count
        FROM player_seasons
        WHERE season_id = ${seasonId}
          AND team_id IS NOT NULL
        GROUP BY team_id
      `;
    } else {
      realPlayerCounts = await tournamentDb`
        SELECT 
          team_id,
          COUNT(*) as count
        FROM realplayerstats
        WHERE season_id = ${seasonId}
          AND team_id IS NOT NULL
        GROUP BY team_id
      `;
    }

    // Combine the results
    const playerCounts: { [key: string]: { footballPlayersCount: number; realPlayersCount: number; footballBudget?: number; footballSpent?: number } } = {};

    // Add football player counts
    footballPlayerCounts.forEach((row: any) => {
      if (!playerCounts[row.team_id]) {
        playerCounts[row.team_id] = { footballPlayersCount: 0, realPlayersCount: 0 };
      }
      playerCounts[row.team_id].footballPlayersCount = parseInt(row.count);
    });

    // Add real player counts
    realPlayerCounts.forEach((row: any) => {
      if (!playerCounts[row.team_id]) {
        playerCounts[row.team_id] = { footballPlayersCount: 0, realPlayersCount: 0 };
      }
      playerCounts[row.team_id].realPlayersCount = parseInt(row.count);
    });

    // Add authoritative budget & spent from Neon teams table
    try {
      const neonTeams = await auctionDb`
        SELECT id, football_budget, football_spent, football_players_count
        FROM teams
        WHERE season_id = ${seasonId}
      `;
      neonTeams.forEach((nt: any) => {
        if (!playerCounts[nt.id]) {
          playerCounts[nt.id] = { footballPlayersCount: 0, realPlayersCount: 0 };
        }
        if (nt.football_budget !== null && nt.football_budget !== undefined) {
          playerCounts[nt.id].footballBudget = Number(nt.football_budget);
        }
        if (nt.football_spent !== null && nt.football_spent !== undefined) {
          playerCounts[nt.id].footballSpent = Number(nt.football_spent);
        }
        if (nt.football_players_count !== null && nt.football_players_count !== undefined) {
          playerCounts[nt.id].footballPlayersCount = parseInt(nt.football_players_count);
        }
      });
    } catch (teamErr) {
      console.warn('Could not fetch neon teams budget in player-counts:', teamErr);
    }

    return NextResponse.json(
      {
        success: true,
        data: playerCounts,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('Error fetching player counts:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch player counts',
      },
      { status: 500 }
    );
  }
}

export const revalidate = 0;
export const dynamic = 'force-dynamic';
