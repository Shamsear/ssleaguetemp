import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/firebase/admin';

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
    const isModern = seasonNum === 16 || seasonNum === 17;

    let activePlayers;
    if (isModern) {
      activePlayers = await sql`
        SELECT id, player_id, player_name, category, points, matches_played, NULL as used_smart_assist
        FROM player_seasons
        WHERE season_id = ${seasonId}
        ORDER BY player_name ASC
      `;
    } else {
      activePlayers = await sql`
        SELECT id, player_id, player_name, category, points, matches_played, used_smart_assist
        FROM realplayerstats
        WHERE season_id = ${seasonId}
        ORDER BY player_name ASC
      `;
    }

    const playerIds = activePlayers.map((p: any) => p.player_id);

    let historicalStats: any[] = [];
    if (playerIds.length > 0) {
      historicalStats = await sql`
        -- Subquery wraps DISTINCT ON so ORDER BY is valid inside UNION ALL.
        -- DISTINCT ON groups by the BASE season ID (SSPSLS16% → SSPSLS16, SSPSLS17% → SSPSLS17)
        -- so sub-seasons (SSPSLS165, SSPSLS16P, etc.) don't get summed with the main season row.
        -- Within each (player, base-season) group, the row with the MOST matches_played wins —
        -- this drops free-agent / registration rows (0 matches) that would otherwise inflate points.
        SELECT player_id, season_id, points, matches_played, goals_scored, clean_sheets, assists, wins, draws, losses
        FROM (
          SELECT DISTINCT ON (
            ps.player_id,
            CASE
              WHEN ps.season_id LIKE 'SSPSLS16%' THEN 'SSPSLS16'
              WHEN ps.season_id LIKE 'SSPSLS17%' THEN 'SSPSLS17'
              ELSE ps.season_id
            END
          )
            ps.player_id,
            CASE
              WHEN ps.season_id LIKE 'SSPSLS16%' THEN 'SSPSLS16'
              WHEN ps.season_id LIKE 'SSPSLS17%' THEN 'SSPSLS17'
              ELSE ps.season_id
            END AS season_id,
            (ps.points - COALESCE(ps.base_points, 0)) AS points,
            ps.matches_played, ps.goals_scored, ps.clean_sheets, ps.assists, ps.wins, ps.draws, ps.losses
          FROM player_seasons ps
          WHERE ps.player_id = ANY(${playerIds}) AND ps.season_id != ${seasonId}
          ORDER BY
            ps.player_id,
            CASE
              WHEN ps.season_id LIKE 'SSPSLS16%' THEN 'SSPSLS16'
              WHEN ps.season_id LIKE 'SSPSLS17%' THEN 'SSPSLS17'
              ELSE ps.season_id
            END,
            ps.matches_played DESC
        ) ps_deduped

        UNION ALL

        SELECT
          player_id, season_id, points,
          matches_played, goals_scored, clean_sheets, assists, wins, draws, losses
        FROM realplayerstats
        WHERE player_id = ANY(${playerIds})
          AND season_id != ${seasonId}
          -- Exclude S16/S17: those belong only in player_seasons (no double-counting).
          AND season_id NOT LIKE 'SSPSLS16%'
          AND season_id NOT LIKE 'SSPSLS17%'
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
    const isModern = seasonNum === 16 || seasonNum === 17;

    // For S18+: look up each category's base_price from Firestore so we can
    // write it onto the player row when the category is assigned.
    const categoryBasePriceMap = new Map<string, number>();
    if (!isModern) {
      const catsSnap = await adminDb.collection('categories').get();
      catsSnap.docs.forEach(doc => {
        const d = doc.data();
        if (d.name) {
          categoryBasePriceMap.set(d.name.toLowerCase(), d.base_price || 0);
        }
      });
    }

    const promises = updates.map(async (u: { id: string; category: string }) => {
      // Always capitalize the category
      const capitalizedCategory = u.category.toUpperCase().trim();
      
      if (isModern) {
        return sql`
          UPDATE player_seasons
          SET category = ${capitalizedCategory}, updated_at = NOW()
          WHERE id = ${u.id}
        `;
      } else {
        const basePrice = categoryBasePriceMap.get(u.category.toLowerCase()) ?? 0;
        return sql`
          UPDATE realplayerstats
          SET category  = ${capitalizedCategory},
              base_price = ${basePrice},
              updated_at = NOW()
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
