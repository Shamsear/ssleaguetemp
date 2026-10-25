import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

// POST - Preview player awards based on tournament statistics
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { season_id, tournament_id, award_types } = body;

    if (!season_id || !tournament_id || !award_types || !Array.isArray(award_types)) {
      return NextResponse.json(
        { success: false, error: 'season_id, tournament_id, and award_types array are required' },
        { status: 400 }
      );
    }

    const sql = getTournamentDb();
    const preview: any[] = [];

    console.log(`🔍 Previewing player awards for tournament ${tournament_id}...`);

    for (const awardType of award_types) {
      console.log(`  📊 Previewing ${awardType}...`);

      if (awardType === 'Golden Boot') {
        // Top goal scorer - aggregate from matchups (home + away)
        const topScorer = await sql`
          WITH player_goals AS (
            SELECT 
              home_player_id as player_id,
              home_player_name as player_name,
              SUM(home_goals) as total_goals
            FROM matchups
            WHERE tournament_id = ${tournament_id}
              AND season_id = ${season_id}
            GROUP BY home_player_id, home_player_name
            
            UNION ALL
            
            SELECT 
              away_player_id as player_id,
              away_player_name as player_name,
              SUM(away_goals) as total_goals
            FROM matchups
            WHERE tournament_id = ${tournament_id}
              AND season_id = ${season_id}
            GROUP BY away_player_id, away_player_name
          )
          SELECT 
            player_id,
            player_name,
            SUM(total_goals) as total_goals
          FROM player_goals
          GROUP BY player_id, player_name
          ORDER BY total_goals DESC
          LIMIT 1
        `;

        if (topScorer.length > 0) {
          preview.push({
            award_type: 'Golden Boot',
            award_category: 'individual',
            award_position: 'Winner',
            player_id: topScorer[0].player_id,
            player_name: topScorer[0].player_name,
            player_category: null,
            stats: { goals: topScorer[0].total_goals }
          });
        }
      } else if (awardType === 'Golden Glove') {
        // Best goalkeeper (lowest goals conceded per match)
        const topKeeper = await sql`
          WITH keeper_stats AS (
            SELECT 
              home_player_id as player_id,
              home_player_name as player_name,
              COUNT(*) as matches_played,
              SUM(away_goals) as goals_conceded,
              SUM(CASE WHEN away_goals = 0 THEN 1 ELSE 0 END) as clean_sheets
            FROM matchups
            WHERE tournament_id = ${tournament_id}
              AND season_id = ${season_id}
            GROUP BY home_player_id, home_player_name
            
            UNION ALL
            
            SELECT 
              away_player_id as player_id,
              away_player_name as player_name,
              COUNT(*) as matches_played,
              SUM(home_goals) as goals_conceded,
              SUM(CASE WHEN home_goals = 0 THEN 1 ELSE 0 END) as clean_sheets
            FROM matchups
            WHERE tournament_id = ${tournament_id}
              AND season_id = ${season_id}
            GROUP BY away_player_id, away_player_name
          )
          SELECT 
            player_id,
            player_name,
            SUM(matches_played) as total_matches,
            SUM(goals_conceded) as total_goals_conceded,
            SUM(clean_sheets) as total_clean_sheets,
            CAST(SUM(goals_conceded) AS FLOAT) / NULLIF(SUM(matches_played), 0) as goals_per_match
          FROM keeper_stats
          GROUP BY player_id, player_name
          HAVING SUM(matches_played) >= 5
          ORDER BY goals_per_match ASC, total_clean_sheets DESC
          LIMIT 1
        `;

        if (topKeeper.length > 0) {
          preview.push({
            award_type: 'Golden Glove',
            award_category: 'individual',
            award_position: 'Winner',
            player_id: topKeeper[0].player_id,
            player_name: topKeeper[0].player_name,
            player_category: null,
            stats: { 
              goals_conceded: topKeeper[0].total_goals_conceded,
              matches: topKeeper[0].total_matches,
              goals_per_match: parseFloat(topKeeper[0].goals_per_match).toFixed(2),
              clean_sheets: topKeeper[0].total_clean_sheets
            }
          });
        }
      } else if (awardType === 'Golden Ball') {
        // Golden Ball: Player with most points
        const seasonNum = parseInt(season_id.replace(/\D/g, '')) || 0;
        const isModern = seasonNum === 16 || seasonNum === 17;
        const bestPlayer = isModern
          ? await sql`
              SELECT 
                ps.player_id,
                ps.player_name,
                ps.category,
                ps.points,
                ps.goals_scored,
                (ps.goals_scored - ps.goals_conceded) as goal_difference,
                ps.matches_played,
                ps.clean_sheets
              FROM player_seasons ps
              WHERE ps.season_id = ${season_id}
              ORDER BY ps.points DESC, (ps.goals_scored - ps.goals_conceded) DESC, ps.goals_scored DESC
              LIMIT 1
            `
          : await sql`
              SELECT 
                ps.player_id,
                ps.player_name,
                ps.category,
                ps.points,
                ps.goals_scored,
                (ps.goals_scored - ps.goals_conceded) as goal_difference,
                ps.matches_played,
                ps.clean_sheets
              FROM realplayerstats ps
              WHERE ps.season_id = ${season_id}
              ORDER BY ps.points DESC, (ps.goals_scored - ps.goals_conceded) DESC, ps.goals_scored DESC
              LIMIT 1
            `;

        if (bestPlayer.length > 0) {
          preview.push({
            award_type: 'Golden Ball',
            award_category: 'individual',
            award_position: 'Winner',
            player_id: bestPlayer[0].player_id,
            player_name: bestPlayer[0].player_name,
            player_category: bestPlayer[0].category || null,
            stats: { 
              points: bestPlayer[0].points,
              goals: bestPlayer[0].goals_scored,
              goal_difference: bestPlayer[0].goal_difference,
              matches: bestPlayer[0].matches_played,
              clean_sheets: bestPlayer[0].clean_sheets
            }
          });
        }
      } else if (awardType === 'Manager of Season') {
        // Best manager (team with most points in tournament)
        const bestManager = await sql`
          SELECT 
            ts.team_id,
            ts.team_name,
            COALESCE(m.name, ts.team_name) as manager_name,
            ts.points
          FROM teamstats ts
          LEFT JOIN managers m ON (m.team_id = ts.team_id AND m.season_id = ts.season_id AND m.is_active = true)
          WHERE ts.season_id = ${season_id}
            AND ts.tournament_id = ${tournament_id}
          ORDER BY ts.points DESC, ts.goal_difference DESC
          LIMIT 1
        `;

        if (bestManager.length > 0 && bestManager[0].manager_name) {
          preview.push({
            award_type: 'Manager of Season',
            award_category: 'individual',
            award_position: 'Winner',
            player_id: bestManager[0].team_id,
            player_name: bestManager[0].manager_name,
            player_category: null,
            stats: { team: bestManager[0].team_name, points: bestManager[0].points }
          });
        }
      } else if (awardType.startsWith('Best ') || awardType.toLowerCase().includes('category')) {
        // Category awards (e.g. Best RED, Best BLACK, Best BLUE, Best WHITE)
        const catName = awardType
          .replace(/^Best\s+/i, '')
          .replace(/\s+Player$/i, '')
          .replace(/\s+Category$/i, '')
          .trim();

        const topInCat = await sql`
          SELECT 
            ps.player_id,
            ps.player_name,
            ps.category,
            ps.points,
            ps.goals_scored,
            (ps.goals_scored - ps.goals_conceded) as goal_difference,
            ps.matches_played,
            ps.clean_sheets
          FROM realplayerstats ps
          WHERE ps.season_id = ${season_id}
            AND UPPER(ps.category) = UPPER(${catName})
          ORDER BY ps.points DESC, (ps.goals_scored - ps.goals_conceded) DESC, ps.goals_scored DESC
          LIMIT 1
        `;

        if (topInCat.length > 0) {
          preview.push({
            award_type: `Best ${topInCat[0].category.toUpperCase()}`,
            award_category: 'category',
            award_position: 'Winner',
            player_id: topInCat[0].player_id,
            player_name: topInCat[0].player_name,
            player_category: topInCat[0].category.toUpperCase(),
            stats: {
              points: topInCat[0].points,
              goals: topInCat[0].goals_scored,
              goal_difference: topInCat[0].goal_difference,
              matches: topInCat[0].matches_played,
              clean_sheets: topInCat[0].clean_sheets
            }
          });
        }
      }
    }

    console.log(`\n🔍 Preview complete: ${preview.length} awards`);

    return NextResponse.json({
      success: true,
      preview
    });
  } catch (error: any) {
    console.error('❌ Error previewing player awards:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to preview player awards' },
      { status: 500 }
    );
  }
}
