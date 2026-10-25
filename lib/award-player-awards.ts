import { getTournamentDb } from './neon/tournament-config';
import { addFantasyPointsForAward } from './fantasy-award-points';

interface PlayerAwardResult {
  success: boolean;
  awardsGiven: number;
  awards: {
    player_id: string;
    player_name: string;
    award_category: string;
    award_type: string;
    award_position: string | null;
    player_category: string | null;
  }[];
  error?: string;
}

/**
 * Auto-award player awards based on season statistics
 * 
 * Individual Awards (season-wide):
 * - Golden Boot (Top goal scorers)
 * - Most Assists (Top assists)
 * - Most Clean Sheets (Top clean sheets)
 * 
 * Category Awards (per season category):
 * - Best RED, Best BLACK, Best BLUE, Best WHITE, etc. (Top player by points in each category)
 */
export async function autoAwardPlayerAwards(
  seasonId: string,
  awardTopN: number = 3
): Promise<PlayerAwardResult> {
  try {
    const sql = getTournamentDb();
    
    console.log(`🏆 Starting player awards auto-award for season ${seasonId}...`);
    
    const awards: PlayerAwardResult['awards'] = [];
    let awardsGiven = 0;

    // ============================================
    // INDIVIDUAL AWARDS (Season-wide)
    // ============================================
    
    // 1. Golden Boot - Top goal scorers
    console.log('  📊 Awarding Golden Boot...');
    const topScorers = await sql`
      SELECT player_id, player_name, goals_scored, category
      FROM realplayerstats
      WHERE season_id = ${seasonId}
      ORDER BY goals_scored DESC, assists DESC
      LIMIT ${awardTopN}
    `;
    
    for (let i = 0; i < topScorers.length; i++) {
      const player = topScorers[i];
      const position = i === 0 ? 'Winner' : i === 1 ? 'Runner Up' : 'Third Place';
      
      const result = await sql`
        INSERT INTO player_awards (
          player_id, player_name, season_id,
          award_category, award_type, award_position,
          player_category, awarded_by, notes,
          performance_stats
        )
        VALUES (
          ${player.player_id}, ${player.player_name}, ${seasonId},
          'individual', 'Golden Boot', ${position},
          ${player.category || null}, 'system', 'Auto-awarded based on goals scored',
          ${JSON.stringify({ goals: player.goals_scored })}
        )
        ON CONFLICT (player_id, season_id, award_category, award_type, award_position) DO NOTHING
        RETURNING *
      `;
      
      if (result.length > 0) {
        awardsGiven++;
        awards.push({
          player_id: player.player_id,
          player_name: player.player_name,
          award_category: 'individual',
          award_type: 'Golden Boot',
          award_position: position,
          player_category: player.category || null
        });
        console.log(`    ✅ ${position}: ${player.player_name} (${player.goals_scored} goals)`);
        
        try {
          await sql`
            UPDATE player_season
            SET awards_count = COALESCE(awards_count, 0) + 1
            WHERE player_id = ${player.player_id} AND season_id = ${seasonId}
          `;
        } catch (e) {}
        
        await addFantasyPointsForAward(
          player.player_id,
          player.player_name,
          seasonId,
          'Golden Boot'
        );
      }
    }

    // 2. Most Assists - Top assist providers
    console.log('  📊 Awarding Most Assists...');
    const topAssisters = await sql`
      SELECT player_id, player_name, assists, category
      FROM realplayerstats
      WHERE season_id = ${seasonId} AND assists > 0
      ORDER BY assists DESC, goals_scored DESC
      LIMIT ${awardTopN}
    `;
    
    for (let i = 0; i < topAssisters.length; i++) {
      const player = topAssisters[i];
      const position = i === 0 ? 'Winner' : i === 1 ? 'Runner Up' : 'Third Place';
      
      const result = await sql`
        INSERT INTO player_awards (
          player_id, player_name, season_id,
          award_category, award_type, award_position,
          player_category, awarded_by, notes,
          performance_stats
        )
        VALUES (
          ${player.player_id}, ${player.player_name}, ${seasonId},
          'individual', 'Most Assists', ${position},
          ${player.category || null}, 'system', 'Auto-awarded based on assists',
          ${JSON.stringify({ assists: player.assists })}
        )
        ON CONFLICT (player_id, season_id, award_category, award_type, award_position) DO NOTHING
        RETURNING *
      `;
      
      if (result.length > 0) {
        awardsGiven++;
        awards.push({
          player_id: player.player_id,
          player_name: player.player_name,
          award_category: 'individual',
          award_type: 'Most Assists',
          award_position: position,
          player_category: player.category || null
        });
        console.log(`    ✅ ${position}: ${player.player_name} (${player.assists} assists)`);
        
        try {
          await sql`
            UPDATE player_season
            SET awards_count = COALESCE(awards_count, 0) + 1
            WHERE player_id = ${player.player_id} AND season_id = ${seasonId}
          `;
        } catch (e) {}
        
        await addFantasyPointsForAward(
          player.player_id,
          player.player_name,
          seasonId,
          'Most Assists'
        );
      }
    }

    // 3. Most Clean Sheets
    console.log('  📊 Awarding Most Clean Sheets...');
    const topKeepers = await sql`
      SELECT player_id, player_name, clean_sheets, category
      FROM realplayerstats
      WHERE season_id = ${seasonId} AND clean_sheets > 0
      ORDER BY clean_sheets DESC, (goals_scored - goals_conceded) DESC
      LIMIT ${awardTopN}
    `;
    
    for (let i = 0; i < topKeepers.length; i++) {
      const player = topKeepers[i];
      const position = i === 0 ? 'Winner' : i === 1 ? 'Runner Up' : 'Third Place';
      
      const result = await sql`
        INSERT INTO player_awards (
          player_id, player_name, season_id,
          award_category, award_type, award_position,
          player_category, awarded_by, notes,
          performance_stats
        )
        VALUES (
          ${player.player_id}, ${player.player_name}, ${seasonId},
          'individual', 'Most Clean Sheets', ${position},
          ${player.category || null}, 'system', 'Auto-awarded based on clean sheets',
          ${JSON.stringify({ clean_sheets: player.clean_sheets })}
        )
        ON CONFLICT (player_id, season_id, award_category, award_type, award_position) DO NOTHING
        RETURNING *
      `;
      
      if (result.length > 0) {
        awardsGiven++;
        awards.push({
          player_id: player.player_id,
          player_name: player.player_name,
          award_category: 'individual',
          award_type: 'Most Clean Sheets',
          award_position: position,
          player_category: player.category || null
        });
        console.log(`    ✅ ${position}: ${player.player_name} (${player.clean_sheets} clean sheets)`);
        
        try {
          await sql`
            UPDATE player_season
            SET awards_count = COALESCE(awards_count, 0) + 1
            WHERE player_id = ${player.player_id} AND season_id = ${seasonId}
          `;
        } catch (e) {}
        
        await addFantasyPointsForAward(
          player.player_id,
          player.player_name,
          seasonId,
          'Most Clean Sheets'
        );
      }
    }

    // ============================================
    // CATEGORY AWARDS (Per Season Category: RED, BLACK, BLUE, WHITE, etc.)
    // ============================================
    const catRows = await sql`
      SELECT DISTINCT UPPER(category) as category
      FROM realplayerstats
      WHERE season_id = ${seasonId} AND category IS NOT NULL AND category != ''
      ORDER BY category ASC
    `;
    const categories = catRows.map((r: any) => r.category);
    
    for (const category of categories) {
      console.log(`  📊 Awarding Best ${category}...`);
      
      const topPlayers = await sql`
        SELECT player_id, player_name, category, 
               points, goals_scored, assists, clean_sheets
        FROM realplayerstats
        WHERE season_id = ${seasonId} AND UPPER(category) = ${category}
        ORDER BY points DESC, (goals_scored - goals_conceded) DESC, goals_scored DESC
        LIMIT ${awardTopN}
      `;
      
      for (let i = 0; i < topPlayers.length; i++) {
        const player = topPlayers[i];
        const position = i === 0 ? 'Winner' : i === 1 ? 'Runner Up' : 'Third Place';
        const finalAwardType = `Best ${category}`;
        
        const result = await sql`
          INSERT INTO player_awards (
            player_id, player_name, season_id,
            award_category, award_type, award_position,
            player_category, awarded_by, notes,
            performance_stats
          )
          VALUES (
            ${player.player_id}, ${player.player_name}, ${seasonId},
            'category', ${finalAwardType}, ${position},
            ${category}, 'system', 'Auto-awarded based on category performance',
            ${JSON.stringify({
              points: player.points,
              goals: player.goals_scored,
              assists: player.assists,
              clean_sheets: player.clean_sheets
            })}
          )
          ON CONFLICT (player_id, season_id, award_category, award_type, award_position) DO NOTHING
          RETURNING *
        `;
        
        if (result.length > 0) {
          awardsGiven++;
          awards.push({
            player_id: player.player_id,
            player_name: player.player_name,
            award_category: 'category',
            award_type: finalAwardType,
            award_position: position,
            player_category: category
          });
          console.log(`    ✅ ${position}: ${player.player_name}`);
          
          try {
            await sql`
              UPDATE player_season
              SET awards_count = COALESCE(awards_count, 0) + 1
              WHERE player_id = ${player.player_id} AND season_id = ${seasonId}
            `;
          } catch (e) {}
          
          await addFantasyPointsForAward(
            player.player_id,
            player.player_name,
            seasonId,
            finalAwardType
          );
        }
      }
    }

    console.log(`\n🏆 Player awards auto-award complete: ${awardsGiven} awards given`);
    
    return {
      success: true,
      awardsGiven,
      awards
    };
    
  } catch (error: any) {
    console.error('❌ Error awarding player awards:', error);
    return {
      success: false,
      awardsGiven: 0,
      awards: [],
      error: error.message || 'Failed to award player awards'
    };
  }
}
