const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.NEON_TOURNAMENT_DB_URL);

async function run() {
  const playerId = 'sspslpsl0020';
  const seasonId = 'SSPSLS17';

  try {
    // 1. Fetch matchups from completed fixtures
    const matchups = await sql`
      SELECT 
        m.fixture_id,
        f.round_number,
        f.leg,
        f.home_team_name,
        f.away_team_name,
        m.home_player_id,
        m.home_player_name,
        m.away_player_id,
        m.away_player_name,
        m.home_goals,
        m.away_goals,
        f.motm_player_id,
        f.status
      FROM matchups m
      JOIN fixtures f ON m.fixture_id = f.id
      WHERE (m.home_player_id = ${playerId} OR m.away_player_id = ${playerId})
        AND f.season_id = ${seasonId}
        AND f.status = 'completed'
      ORDER BY f.round_number ASC, f.leg ASC
    `;

    // 2. Query player_seasons stats
    const [dbStats] = await sql`
      SELECT * 
      FROM player_seasons 
      WHERE player_id = ${playerId} AND season_id = ${seasonId}
    `;

    if (!dbStats) {
      console.error(`❌ Player season record not found for player_id: ${playerId}, season_id: ${seasonId}`);
      process.exit(1);
    }

    console.log(`\n================================================================================`);
    console.log(`🔍 STATS ANALYSIS & COMPARISON PREVIEW FOR PLAYER: ${dbStats.player_name.toUpperCase()}`);
    console.log(`   Player ID: ${playerId} | Season: ${seasonId} | Team: ${dbStats.team}`);
    console.log(`================================================================================\n`);

    let calcMatchesPlayed = 0;
    let calcGoalsScored = 0;
    let calcGoalsConceded = 0;
    let calcWins = 0;
    let calcDraws = 0;
    let calcLosses = 0;
    let calcCleanSheets = 0;
    let calcMotmAwards = 0;
    let calcPointsGained = 0;

    const matchDetails = [];

    matchups.forEach((m) => {
      const isHome = m.home_player_id === playerId;
      const playerGoals = isHome ? (m.home_goals || 0) : (m.away_goals || 0);
      const opponentGoals = isHome ? (m.away_goals || 0) : (m.home_goals || 0);
      const opponentName = isHome ? m.away_player_name : m.home_player_name;

      calcMatchesPlayed++;
      calcGoalsScored += playerGoals;
      calcGoalsConceded += opponentGoals;

      let result = '';
      if (playerGoals > opponentGoals) {
        calcWins++;
        result = 'WIN';
      } else if (playerGoals === opponentGoals) {
        calcDraws++;
        result = 'DRAW';
      } else {
        calcLosses++;
        result = 'LOSS';
      }

      let isCleanSheet = opponentGoals === 0;
      if (isCleanSheet) {
        calcCleanSheets++;
      }

      let isMotm = m.motm_player_id === playerId;
      if (isMotm) {
        calcMotmAwards++;
      }

      // Formula: GD capped at -5 to +5
      const gd = playerGoals - opponentGoals;
      const pointsChange = Math.max(-5, Math.min(5, gd));
      calcPointsGained += pointsChange;

      matchDetails.push({
        round: m.round_number,
        leg: m.leg === 'first' ? '1st' : '2nd',
        match: `${m.home_team_name} vs ${m.away_team_name}`,
        score: `${playerGoals}-${opponentGoals}`,
        opponent: opponentName.trim(),
        result,
        cleanSheet: isCleanSheet ? 'Yes' : 'No',
        motm: isMotm ? 'Yes' : 'No',
        pointsChange: (pointsChange >= 0 ? '+' : '') + pointsChange
      });
    });

    console.log('⚽ MATCH-BY-MATCH CALCULATION breakdown:');
    console.log('─'.repeat(120));
    console.log('Round | Match'.padEnd(45) + ' | Score | Opponent Player'.padEnd(25) + ' | Result | Clean Sheet | MOTM | Points Change');
    console.log('─'.repeat(120));
    matchDetails.forEach(d => {
      console.log(
        `R${String(d.round).padEnd(2)} ${d.leg} | ${d.match.padEnd(35)} |  ${d.score}  | ${d.opponent.padEnd(20)} | ${d.result.padEnd(6)} | ${d.cleanSheet.padEnd(11)} | ${d.motm.padEnd(4)} | ${d.pointsChange}`
      );
    });
    console.log('─'.repeat(120));

    const expectedPoints = (dbStats.base_points || 0) + calcPointsGained;

    console.log('\n📊 COMPARISON TABLE: MATCHUPS VS PLAYER_SEASONS DATABASE RECORD');
    console.log('================================================================================');
    console.log(`Metric             | Calculated (Matchups) | Database Record | Discrepancy`);
    console.log(`-------------------|-----------------------|-----------------|--------------`);
    console.log(`Matches Played     | ${String(calcMatchesPlayed).padEnd(21)} | ${String(dbStats.matches_played).padEnd(15)} | ${calcMatchesPlayed - dbStats.matches_played}`);
    console.log(`Goals Scored       | ${String(calcGoalsScored).padEnd(21)} | ${String(dbStats.goals_scored).padEnd(15)} | ${calcGoalsScored - dbStats.goals_scored}`);
    console.log(`Goals Conceded     | ${String(calcGoalsConceded).padEnd(21)} | ${String(dbStats.goals_conceded).padEnd(15)} | ${calcGoalsConceded - dbStats.goals_conceded}`);
    console.log(`Wins               | ${String(calcWins).padEnd(21)} | ${String(dbStats.wins).padEnd(15)} | ${calcWins - dbStats.wins}`);
    console.log(`Draws              | ${String(calcDraws).padEnd(21)} | ${String(dbStats.draws).padEnd(15)} | ${calcDraws - dbStats.draws}`);
    console.log(`Losses             | ${String(calcLosses).padEnd(21)} | ${String(dbStats.losses).padEnd(15)} | ${calcLosses - dbStats.losses}`);
    console.log(`Clean Sheets       | ${String(calcCleanSheets).padEnd(21)} | ${String(dbStats.clean_sheets).padEnd(15)} | ${calcCleanSheets - dbStats.clean_sheets}`);
    console.log(`MOTM Awards        | ${String(calcMotmAwards).padEnd(21)} | ${String(dbStats.motm_awards).padEnd(15)} | ${calcMotmAwards - dbStats.motm_awards}`);
    console.log(`Base Points        | ${String(dbStats.base_points || 0).padEnd(21)} | ${String(dbStats.base_points || 0).padEnd(15)} | 0`);
    console.log(`Points Change (GD) | ${String(calcPointsGained).padEnd(21)} | ${String(dbStats.points - dbStats.base_points).padEnd(15)} | ${calcPointsGained - (dbStats.points - dbStats.base_points)}`);
    console.log(`Total Points       | ${String(expectedPoints).padEnd(21)} | ${String(dbStats.points).padEnd(15)} | ${expectedPoints - dbStats.points}`);
    console.log('================================================================================');

  } catch (error) {
    console.error('Error running preview:', error);
  }
  process.exit(0);
}

run();
