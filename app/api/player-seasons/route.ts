import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

export async function GET(request: NextRequest) {
  try {
    const sql = getTournamentDb();
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get('team_id');
    const seasonId = searchParams.get('season_id');

    if (!seasonId) {
      return NextResponse.json(
        { error: 'season_id is required' },
        { status: 400 }
      );
    }

    const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
    const isModern = seasonNum === 16 || seasonNum === 17;

    console.log('🔍 Fetching players for:', { teamId: teamId || 'all', seasonId, table: isModern ? 'player_seasons' : 'realplayerstats' });

    // Fetch players from correct table
    let players;
    if (teamId) {
      if (isModern) {
        players = await sql`
          SELECT *
          FROM player_seasons
          WHERE team_id = ${teamId}
            AND season_id = ${seasonId}
          ORDER BY category, player_name
        `;
      } else {
        players = await sql`
          SELECT *
          FROM realplayerstats
          WHERE team_id = ${teamId}
            AND season_id = ${seasonId}
          ORDER BY category, player_name
        `;
      }
    } else {
      if (isModern) {
        players = await sql`
          SELECT *
          FROM player_seasons
          WHERE season_id = ${seasonId}
          ORDER BY category, player_name
        `;
      } else {
        players = await sql`
          SELECT *
          FROM realplayerstats
          WHERE season_id = ${seasonId}
          ORDER BY category, player_name
        `;
      }
    }

    console.log('📊 Found players:', players.length);

    return NextResponse.json({ players });
  } catch (error: any) {
    console.error('Error fetching players from player_seasons:', error);
    console.error('Error details:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch players', details: error.message },
      { status: 500 }
    );
  }
}
