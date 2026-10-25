import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { sendNotificationToSeason } from '@/lib/notifications/send-notification';

// POST - Auto-award or batch award player awards based on tournament statistics
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { season_id, tournament_id, award_types, awards: customAwards } = body;

    if (!season_id) {
      return NextResponse.json(
        { success: false, error: 'season_id is required' },
        { status: 400 }
      );
    }

    // If custom edited awards are passed directly from preview
    if (customAwards && Array.isArray(customAwards) && customAwards.length > 0) {
      return await saveCustomAwards(season_id, tournament_id, customAwards);
    }

    // If tournament_id and award_types provided, use tournament-specific logic
    if (tournament_id && award_types && Array.isArray(award_types)) {
      return await awardTournamentSpecificAwards(season_id, tournament_id, award_types);
    }

    // Otherwise, fall back to season-wide logic
    const { autoAwardPlayerAwards } = await import('@/lib/award-player-awards');
    const result = await autoAwardPlayerAwards(season_id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      awardsGiven: result.awardsGiven,
      awards: result.awards,
      message: `Successfully awarded ${result.awardsGiven} player awards`
    });
  } catch (error: any) {
    console.error('Error auto-awarding player awards:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to auto-award player awards' },
      { status: 500 }
    );
  }
}

// Save custom / edited awards directly
async function saveCustomAwards(
  seasonId: string,
  tournamentId: string | undefined,
  customAwards: any[]
) {
  try {
    const sql = getTournamentDb();
    const awards: any[] = [];
    let awardsGiven = 0;

    console.log(`🏆 Saving ${customAwards.length} custom / previewed awards for season ${seasonId}...`);

    for (const item of customAwards) {
      if (!item.player_id || !item.player_name || !item.award_type) continue;

      const awardCategory = item.award_category || (item.player_category ? 'category' : 'individual');
      const awardPosition = item.award_position || 'Winner';
      const playerCategory = item.player_category || null;
      const notes = item.notes || `Awarded by committee for ${item.award_type}`;
      const statsJson = JSON.stringify(item.stats || item.performance_stats || {});

      const result = await sql`
        INSERT INTO player_awards (
          player_id, player_name, season_id, tournament_id,
          award_category, award_type, award_position,
          player_category, awarded_by, notes,
          performance_stats
        )
        VALUES (
          ${item.player_id}, ${item.player_name}, ${seasonId}, ${tournamentId || null},
          ${awardCategory}, ${item.award_type}, ${awardPosition},
          ${playerCategory}, 'committee', ${notes},
          ${statsJson}
        )
        ON CONFLICT (player_id, season_id, tournament_id, award_category, award_type, award_position)
        DO UPDATE SET
          player_name = EXCLUDED.player_name,
          player_category = EXCLUDED.player_category,
          notes = EXCLUDED.notes,
          performance_stats = EXCLUDED.performance_stats,
          updated_at = NOW()
        RETURNING *
      `;

      if (result.length > 0) {
        awardsGiven++;
        awards.push({ award_type: item.award_type, player_name: item.player_name });

        // Update awards count in player_season
        try {
          await sql`
            UPDATE player_season
            SET awards_count = COALESCE(awards_count, 0) + 1, updated_at = NOW()
            WHERE player_id = ${item.player_id} AND season_id = ${seasonId}
          `;
        } catch (e) {
          // ignore if table doesn't have row
        }
      }
    }

    // Send notification
    if (awardsGiven > 0) {
      try {
        await sendNotificationToSeason(
          {
            title: '🎖️ Season Awards Announced!',
            body: `${awardsGiven} player awards have been finalized and awarded!`,
            url: `/awards`,
            icon: '/logo.png',
            data: {
              type: 'tournament_awards_auto',
              season_id: seasonId,
              tournament_id: tournamentId || '',
              awards_count: awardsGiven.toString(),
            }
          },
          seasonId
        );
      } catch (notifError) {
        console.error('Failed to send awards notification:', notifError);
      }
    }

    return NextResponse.json({
      success: true,
      awardsGiven,
      awards,
      message: `Successfully awarded ${awardsGiven} player awards`
    });
  } catch (error: any) {
    console.error('❌ Error saving custom player awards:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save awards' },
      { status: 500 }
    );
  }
}

// Tournament-specific automated award logic
async function awardTournamentSpecificAwards(
  seasonId: string,
  tournamentId: string,
  awardTypes: string[]
) {
  try {
    const sql = getTournamentDb();
    const awards: any[] = [];
    let awardsGiven = 0;

    console.log(`🏆 Awarding player awards for tournament ${tournamentId}...`);

    for (const awardType of awardTypes) {
      console.log(`  📊 Awarding ${awardType}...`);

      if (awardType === 'Golden Boot') {
        // Top goal scorer - aggregate from matchups (home + away)
        const topScorer = await sql`
          WITH player_goals AS (
            SELECT 
              home_player_id as player_id,
              home_player_name as player_name,
              SUM(home_goals) as total_goals
            FROM matchups
            WHERE tournament_id = ${tournamentId}
              AND season_id = ${seasonId}
            GROUP BY home_player_id, home_player_name
            
            UNION ALL
            
            SELECT 
              away_player_id as player_id,
              away_player_name as player_name,
              SUM(away_goals) as total_goals
            FROM matchups
            WHERE tournament_id = ${tournamentId}
              AND season_id = ${seasonId}
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
          const result = await sql`
            INSERT INTO player_awards (
              player_id, player_name, season_id, tournament_id,
              award_category, award_type, award_position,
              player_category, awarded_by, notes,
              performance_stats
            )
            VALUES (
              ${topScorer[0].player_id}, ${topScorer[0].player_name}, ${seasonId}, ${tournamentId},
              'individual', 'Golden Boot', 'Winner',
              NULL, 'system', 'Auto-awarded based on goals scored',
              ${JSON.stringify({ goals: topScorer[0].total_goals })}
            )
            ON CONFLICT (player_id, season_id, tournament_id, award_category, award_type, award_position)
            DO UPDATE SET
              player_name = EXCLUDED.player_name,
              performance_stats = EXCLUDED.performance_stats,
              updated_at = NOW()
            RETURNING *
          `;

          if (result.length > 0) {
            awardsGiven++;
            awards.push({ award_type: 'Golden Boot', player_name: topScorer[0].player_name });
            console.log(`    ✅ Winner: ${topScorer[0].player_name} (${topScorer[0].total_goals} goals)`);
          }
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
            WHERE tournament_id = ${tournamentId}
              AND season_id = ${seasonId}
            GROUP BY home_player_id, home_player_name
            
            UNION ALL
            
            SELECT 
              away_player_id as player_id,
              away_player_name as player_name,
              COUNT(*) as matches_played,
              SUM(home_goals) as goals_conceded,
              SUM(CASE WHEN home_goals = 0 THEN 1 ELSE 0 END) as clean_sheets
            FROM matchups
            WHERE tournament_id = ${tournamentId}
              AND season_id = ${seasonId}
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
          const result = await sql`
            INSERT INTO player_awards (
              player_id, player_name, season_id, tournament_id,
              award_category, award_type, award_position,
              player_category, awarded_by, notes,
              performance_stats
            )
            VALUES (
              ${topKeeper[0].player_id}, ${topKeeper[0].player_name}, ${seasonId}, ${tournamentId},
              'individual', 'Golden Glove', 'Winner',
              NULL, 'system', 'Auto-awarded based on goals conceded per match',
              ${JSON.stringify({ 
                goals_conceded: topKeeper[0].total_goals_conceded,
                matches: topKeeper[0].total_matches,
                goals_per_match: parseFloat(topKeeper[0].goals_per_match).toFixed(2),
                clean_sheets: topKeeper[0].total_clean_sheets
              })}
            )
            ON CONFLICT (player_id, season_id, tournament_id, award_category, award_type, award_position)
            DO UPDATE SET
              player_name = EXCLUDED.player_name,
              performance_stats = EXCLUDED.performance_stats,
              updated_at = NOW()
            RETURNING *
          `;

          if (result.length > 0) {
            awardsGiven++;
            awards.push({ award_type: 'Golden Glove', player_name: topKeeper[0].player_name });
            console.log(`    ✅ Winner: ${topKeeper[0].player_name}`);
          }
        }
      } else if (awardType === 'Golden Ball') {
        // Golden Ball: Player with most points
        const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
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
              WHERE ps.season_id = ${seasonId}
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
              WHERE ps.season_id = ${seasonId}
              ORDER BY ps.points DESC, (ps.goals_scored - ps.goals_conceded) DESC, ps.goals_scored DESC
              LIMIT 1
            `;

        if (bestPlayer.length > 0) {
          const result = await sql`
            INSERT INTO player_awards (
              player_id, player_name, season_id, tournament_id,
              award_category, award_type, award_position,
              player_category, awarded_by, notes,
              performance_stats
            )
            VALUES (
              ${bestPlayer[0].player_id}, ${bestPlayer[0].player_name}, ${seasonId}, ${tournamentId},
              'individual', 'Golden Ball', 'Winner',
              ${bestPlayer[0].category || null}, 'system', 'Auto-awarded based on most points',
              ${JSON.stringify({ 
                points: bestPlayer[0].points,
                goals: bestPlayer[0].goals_scored,
                goal_difference: bestPlayer[0].goal_difference,
                matches: bestPlayer[0].matches_played,
                clean_sheets: bestPlayer[0].clean_sheets
              })}
            )
            ON CONFLICT (player_id, season_id, tournament_id, award_category, award_type, award_position)
            DO UPDATE SET
              player_name = EXCLUDED.player_name,
              player_category = EXCLUDED.player_category,
              performance_stats = EXCLUDED.performance_stats,
              updated_at = NOW()
            RETURNING *
          `;

          if (result.length > 0) {
            awardsGiven++;
            awards.push({ award_type: 'Golden Ball', player_name: bestPlayer[0].player_name });
            console.log(`    ✅ Winner: ${bestPlayer[0].player_name}`);
          }
        }
      } else if (awardType === 'Manager of Season') {
        const bestManager = await sql`
          SELECT 
            ts.team_id,
            ts.team_name,
            COALESCE(m.name, ts.team_name) as manager_name,
            ts.points
          FROM teamstats ts
          LEFT JOIN managers m ON (m.team_id = ts.team_id AND m.season_id = ts.season_id AND m.is_active = true)
          WHERE ts.season_id = ${seasonId}
            AND ts.tournament_id = ${tournamentId}
          ORDER BY ts.points DESC, ts.goal_difference DESC
          LIMIT 1
        `;

        if (bestManager.length > 0 && bestManager[0].manager_name) {
          const result = await sql`
            INSERT INTO player_awards (
              player_id, player_name, season_id, tournament_id,
              award_category, award_type, award_position,
              player_category, awarded_by, notes,
              performance_stats
            )
            VALUES (
              ${bestManager[0].team_id}, ${bestManager[0].manager_name}, ${seasonId}, ${tournamentId},
              'individual', 'Manager of Season', 'Winner',
              NULL, 'system', 'Auto-awarded based on team performance',
              ${JSON.stringify({ team: bestManager[0].team_name, points: bestManager[0].points })}
            )
            ON CONFLICT (player_id, season_id, tournament_id, award_category, award_type, award_position)
            DO UPDATE SET
              player_name = EXCLUDED.player_name,
              performance_stats = EXCLUDED.performance_stats,
              updated_at = NOW()
            RETURNING *
          `;

          if (result.length > 0) {
            awardsGiven++;
            awards.push({ award_type: 'Manager of Season', player_name: bestManager[0].manager_name });
            console.log(`    ✅ Winner: ${bestManager[0].manager_name} (${bestManager[0].team_name})`);
          }
        }
      } else if (awardType.startsWith('Best ') || awardType.toLowerCase().includes('category')) {
        // Category-based award for season tier categories (e.g. Best RED, Best BLACK, etc.)
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
          WHERE ps.season_id = ${seasonId}
            AND UPPER(ps.category) = UPPER(${catName})
          ORDER BY ps.points DESC, (ps.goals_scored - ps.goals_conceded) DESC, ps.goals_scored DESC
          LIMIT 1
        `;

        if (topInCat.length > 0) {
          const finalAwardType = `Best ${topInCat[0].category.toUpperCase()}`;
          const result = await sql`
            INSERT INTO player_awards (
              player_id, player_name, season_id, tournament_id,
              award_category, award_type, award_position,
              player_category, awarded_by, notes,
              performance_stats
            )
            VALUES (
              ${topInCat[0].player_id}, ${topInCat[0].player_name}, ${seasonId}, ${tournamentId},
              'category', ${finalAwardType}, 'Winner',
              ${topInCat[0].category.toUpperCase()}, 'system', 'Auto-awarded for best player in category',
              ${JSON.stringify({
                points: topInCat[0].points,
                goals: topInCat[0].goals_scored,
                goal_difference: topInCat[0].goal_difference,
                matches: topInCat[0].matches_played,
                clean_sheets: topInCat[0].clean_sheets
              })}
            )
            ON CONFLICT (player_id, season_id, tournament_id, award_category, award_type, award_position)
            DO UPDATE SET
              player_name = EXCLUDED.player_name,
              player_category = EXCLUDED.player_category,
              performance_stats = EXCLUDED.performance_stats,
              updated_at = NOW()
            RETURNING *
          `;

          if (result.length > 0) {
            awardsGiven++;
            awards.push({ award_type: finalAwardType, player_name: topInCat[0].player_name });
            console.log(`    ✅ Winner: ${topInCat[0].player_name} (${finalAwardType})`);
          }
        }
      }
    }

    console.log(`\n🏆 Tournament awards complete: ${awardsGiven} awards given`);

    // Send notification
    if (awardsGiven > 0) {
      try {
        await sendNotificationToSeason(
          {
            title: '🎖️ Tournament Awards Announced!',
            body: `${awardsGiven} player awards have been awarded for the tournament!`,
            url: `/awards`,
            icon: '/logo.png',
            data: {
              type: 'tournament_awards_auto',
              season_id: seasonId,
              tournament_id: tournamentId,
              awards_count: awardsGiven.toString(),
            }
          },
          seasonId
        );
      } catch (notifError) {
        console.error('Failed to send auto-awards notification:', notifError);
      }
    }

    return NextResponse.json({
      success: true,
      awardsGiven,
      awards,
      message: `Successfully awarded ${awardsGiven} player awards`
    });
  } catch (error: any) {
    console.error('❌ Error awarding tournament player awards:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to award player awards' },
      { status: 500 }
    );
  }
}
