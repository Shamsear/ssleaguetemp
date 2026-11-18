import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { neon } from '@neondatabase/serverless';

/**
 * GET /api/cached/firebase/team-seasons
 * Returns team_seasons data with authoritative Neon DB balances
 * 
 * Query params:
 * - seasonId: Filter by season (optional)
 * - teamId: Filter by team (optional)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('seasonId');
    const teamId = searchParams.get('teamId');
    
    let query = adminDb.collection('team_seasons');
    
    if (seasonId) {
      query = query.where('season_id', '==', seasonId) as any;
    }
    
    if (teamId) {
      query = query.where('team_id', '==', teamId) as any;
    }
    
    const snapshot = await query.get();
    
    // Fetch base teams data to get logo positioning adjustments
    const teamsSnapshot = await adminDb.collection('teams').get();
    const teamsMap = new Map();
    teamsSnapshot.forEach(doc => {
      const data = doc.data();
      teamsMap.set(doc.id, {
        logo_position_x_circle: data.logo_position_x_circle,
        logo_position_y_circle: data.logo_position_y_circle,
        logo_scale_circle: data.logo_scale_circle,
        logo_position_x_square: data.logo_position_x_square,
        logo_position_y_square: data.logo_position_y_square,
        logo_scale_square: data.logo_scale_square,
      });
    });

    // Cross-reference authoritative team budget/spent from Neon Auction DB
    const auctionDbMap = new Map<string, any>();
    try {
      const auctionDbUrl = process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
      if (auctionDbUrl) {
        const auctionSql = neon(auctionDbUrl);
        const auctionTeams = seasonId 
          ? await auctionSql`SELECT id, name, season_id, football_budget, football_spent, football_players_count FROM teams WHERE season_id = ${seasonId}`
          : await auctionSql`SELECT id, name, season_id, football_budget, football_spent, football_players_count FROM teams`;
        auctionTeams.forEach((at: any) => {
          auctionDbMap.set(at.id, at);
        });
      }
    } catch (neonErr) {
      console.warn('Could not query auction neon teams in team-seasons:', neonErr);
    }
    
    const teamSeasons = snapshot.docs.map(doc => {
      const data = doc.data() as any;
      const tId = data.team_id || doc.id.split('_')[0];
      const positioning = teamsMap.get(tId) || {};
      const at = auctionDbMap.get(tId);

      const football_budget = at?.football_budget !== undefined && at?.football_budget !== null
        ? Number(at.football_budget)
        : (data.football_budget !== undefined ? Number(data.football_budget) : 0);

      const football_spent = at?.football_spent !== undefined && at?.football_spent !== null
        ? Number(at.football_spent)
        : (data.football_spent !== undefined ? Number(data.football_spent) : 0);

      const football_players_count = at?.football_players_count !== undefined && at?.football_players_count !== null
        ? Number(at.football_players_count)
        : (data.football_players_count !== undefined ? Number(data.football_players_count) : 0);

      return {
        id: doc.id,
        ...data,
        ...positioning,
        football_budget,
        football_spent,
        football_players_count,
        players_count: football_players_count,
        budget: football_budget,
      };
    });
    
    console.log('[API team-seasons] Query results:', {
      seasonIdFilter: seasonId,
      teamIdFilter: teamId,
      totalResults: teamSeasons.length,
      sampleSeasonIds: teamSeasons.slice(0, 5).map((ts: any) => ({
        id: ts.id,
        season_id: ts.season_id,
        team_name: ts.team_name
      }))
    });
    
    return NextResponse.json(
      {
        success: true,
        data: teamSeasons,
        cached: false,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('Error fetching team_seasons:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch team seasons',
      },
      { status: 500 }
    );
  }
}

export const revalidate = 0;
export const dynamic = 'force-dynamic';
