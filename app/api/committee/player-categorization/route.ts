import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

// Helper to map star rating to priority level (Red=1, Black=2, Blue=3, White=4)
function getPriority(stars: number): number {
  if (stars >= 7) return 1; // Red
  if (stars === 6) return 2; // Black
  if (stars === 5) return 3; // Blue
  return 4; // White (3-4 stars)
}

// Helper to calculate category matchup points using the S18+ rules
function calculateMatchupPointsForPlayer(
  playerStars: number,
  opponentStars: number,
  playerGoals: number,
  opponentGoals: number
): number {
  const playerPriority = getPriority(playerStars);
  const opponentPriority = getPriority(opponentStars);
  const levelDiff = Math.abs(playerPriority - opponentPriority);

  let result: 'win' | 'draw' | 'loss' = 'draw';
  if (playerGoals > opponentGoals) result = 'win';
  else if (playerGoals < opponentGoals) result = 'loss';

  // Category point tables:
  const categoryRules: Record<number, {
    win: [number, number, number, number]; // [same, diff1, diff2, diff3]
    draw: [number, number, number, number];
    loss: [number, number, number, number];
  }> = {
    1: { // Red
      win: [8, 7, 6, 5],
      draw: [4, 3, 2, 1],
      loss: [-3, -4, -5, -6]
    },
    2: { // Black
      win: [7, 8, 6, 5],
      draw: [3, 4, 2, 1],
      loss: [-4, -3, -5, -6]
    },
    3: { // Blue
      win: [6, 7, 8, 5],
      draw: [2, 3, 4, 1],
      loss: [-5, -4, -3, -6]
    },
    4: { // White
      win: [5, 6, 7, 8],
      draw: [1, 2, 3, 4],
      loss: [-6, -5, -4, -3]
    }
  };

  const rules = categoryRules[playerPriority] || categoryRules[4];
  const idx = Math.min(levelDiff, 3);

  return rules[result][idx];
}

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

    // Recalculate S16 & S17 stats dynamically using category-based opponent strength (Method A)
    const s16_17_seasons = ['SSPSLS16', 'SSPSLS16.0', 'SSPSLS16.5', 'SSPSLS17', 'SSPSLS17.5'];
    const hasS16S17InHistory = historicalStats.some((s: any) => s16_17_seasons.includes(s.season_id));

    if (playerIds.length > 0 && hasS16S17InHistory) {
      const matchups = await sql`
        SELECT 
          m.season_id,
          m.home_player_id,
          m.away_player_id,
          m.home_goals,
          m.away_goals,
          COALESCE(ps_home.star_rating, 3) as home_stars,
          COALESCE(ps_away.star_rating, 3) as away_stars
        FROM matchups m
        LEFT JOIN player_seasons ps_home ON ps_home.player_id = m.home_player_id AND ps_home.season_id = m.season_id
        LEFT JOIN player_seasons ps_away ON ps_away.player_id = m.away_player_id AND ps_away.season_id = m.season_id
        WHERE m.season_id = ANY(${s16_17_seasons})
          AND m.is_null = false 
          AND m.home_goals IS NOT NULL
          AND (m.home_player_id = ANY(${playerIds}) OR m.away_player_id = ANY(${playerIds}))
      `;

      // Group matchups by player_id and season_id to get points
      const playerSeasonPoints = new Map<string, number>();

      matchups.forEach((m: any) => {
        const homeKey = `${m.home_player_id}_${m.season_id}`;
        const awayKey = `${m.away_player_id}_${m.season_id}`;

        // Calculate points for home player
        if (playerIds.includes(m.home_player_id)) {
          const homePts = calculateMatchupPointsForPlayer(
            m.home_stars,
            m.away_stars,
            m.home_goals,
            m.away_goals
          );
          playerSeasonPoints.set(homeKey, (playerSeasonPoints.get(homeKey) || 0) + homePts);
        }

        // Calculate points for away player
        if (playerIds.includes(m.away_player_id)) {
          const awayPts = calculateMatchupPointsForPlayer(
            m.away_stars,
            m.home_stars,
            m.away_goals,
            m.home_goals
          );
          playerSeasonPoints.set(awayKey, (playerSeasonPoints.get(awayKey) || 0) + awayPts);
        }
      });

      // Update historicalStats points for S16/S17
      historicalStats = historicalStats.map((s: any) => {
        if (s16_17_seasons.includes(s.season_id)) {
          const key = `${s.player_id}_${s.season_id}`;
          const calculatedPoints = playerSeasonPoints.get(key) || 0;
          return {
            ...s,
            points: calculatedPoints
          };
        }
        return s;
      });
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
