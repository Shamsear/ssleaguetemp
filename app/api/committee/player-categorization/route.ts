import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

// GET handler: Fetch active season players and their bulk historical stats
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

    const sql = getTournamentDb();
    const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
    const isModern = seasonNum === 16 || seasonNum === 17 || seasonNum >= 18;

    let activePlayers;
    if (isModern) {
      activePlayers = await sql`
        SELECT id, player_id, player_name, category, points, matches_played
        FROM player_seasons
        WHERE season_id = ${seasonId}
        ORDER BY player_name ASC
      `;
    } else {
      activePlayers = await sql`
        SELECT id, player_id, player_name, category, points, matches_played
        FROM realplayerstats
        WHERE season_id = ${seasonId}
        ORDER BY player_name ASC
      `;
    }

    const playerIds = activePlayers.map((p: any) => p.player_id);

    let historicalStats: any[] = [];
    if (playerIds.length > 0) {
      historicalStats = await sql`
        SELECT player_id, season_id, points, matches_played, goals_scored, clean_sheets, assists, wins, draws, losses
        FROM player_seasons
        WHERE player_id = ANY(${playerIds}) AND season_id != ${seasonId}
        UNION ALL
        SELECT player_id, season_id, points, matches_played, goals_scored, clean_sheets, assists, wins, draws, losses
        FROM realplayerstats
        WHERE player_id = ANY(${playerIds}) AND season_id != ${seasonId}
      `;
    }

    return NextResponse.json({
      success: true,
      activePlayers,
      historicalStats
    });

  } catch (error: any) {
    console.error('Error fetching player categorization data:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch player stats' },
      { status: 500 }
    );
  }
}

// POST handler: Bulk save player categories
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { seasonId, updates } = body;

    if (!seasonId || !updates || !Array.isArray(updates)) {
      return NextResponse.json(
        { success: false, error: 'Invalid parameters: seasonId and updates array required' },
        { status: 400 }
      );
    }

    const sql = getTournamentDb();
    const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
    const isModern = seasonNum === 16 || seasonNum === 17 || seasonNum >= 18;

    const promises = updates.map(async (u: { id: string; category: string }) => {
      if (isModern) {
        return sql`
          UPDATE player_seasons
          SET category = ${u.category}, updated_at = NOW()
          WHERE id = ${u.id}
        `;
      } else {
        return sql`
          UPDATE realplayerstats
          SET category = ${u.category}, updated_at = NOW()
          WHERE id = ${u.id}
        `;
      }
    });

    await Promise.all(promises);

    return NextResponse.json({
      success: true,
      count: updates.length
    });

  } catch (error: any) {
    console.error('Error saving player categorization updates:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update categories' },
      { status: 500 }
    );
  }
}
