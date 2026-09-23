import fs from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';

function loadEnvFile(envPath: string) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
      }
    }
  }
}

loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), '.env.local'));

async function main() {
  const sql = neon(process.env.NEON_TOURNAMENT_DB_URL!);

  // Get Nidhul stats id from realplayerstats
  const p = await sql`SELECT id, player_id, player_name FROM realplayerstats WHERE player_id = 'sspslpsl0136' AND season_id = 'SSPSLS18'`;
  console.log('Nidhul realplayerstats:', p);

  if (p.length > 0) {
    const actualPlayerId = 'sspslpsl0136';
    const rawMatchdayStats = await sql`
      WITH player_matches AS (
        SELECT 
          m.fixture_id,
          m.round_number,
          m.home_player_id,
          m.away_player_id,
          m.home_goals,
          m.away_goals,
          m.home_player_name,
          m.away_player_name,
          f.home_team_name,
          f.away_team_name,
          f.status,
          CASE 
            WHEN m.home_player_id = ${actualPlayerId} THEN 'home'
            WHEN m.away_player_id = ${actualPlayerId} THEN 'away'
          END as player_side,
          CASE 
            WHEN m.home_player_id = ${actualPlayerId} THEN m.home_goals
            WHEN m.away_player_id = ${actualPlayerId} THEN m.away_goals
          END as goals_scored,
          CASE 
            WHEN m.home_player_id = ${actualPlayerId} THEN m.away_goals
            WHEN m.away_player_id = ${actualPlayerId} THEN m.home_goals
          END as goals_conceded,
          COALESCE(m.is_null, false) as is_null
        FROM matchups m
        JOIN fixtures f ON m.fixture_id = f.id
        WHERE m.season_id = 'SSPSLS18'
        AND (
          m.home_player_id = ${actualPlayerId} 
          OR m.away_player_id = ${actualPlayerId}
        )
        AND (f.status = 'completed' OR f.status = 'cancelled' OR f.result = 'null')
        AND m.home_goals IS NOT NULL
        AND m.away_goals IS NOT NULL
      )
      SELECT 
        pm.round_number as matchday,
        pm.fixture_id,
        pm.player_side,
        pm.home_team_name,
        pm.away_team_name,
        pm.home_player_name,
        pm.away_player_name,
        pm.goals_scored,
        pm.goals_conceded,
        (pm.goals_scored - pm.goals_conceded) as goal_difference
      FROM player_matches pm
      ORDER BY pm.round_number ASC
    `;
    console.log('Nidhul matchday rounds count:', rawMatchdayStats.length);
    console.log('Nidhul rounds list:', rawMatchdayStats.map((r: any) => `R${r.matchday}: ${r.home_player_name} (${r.goals_scored}) vs ${r.away_player_name} (${r.goals_conceded})`));
  }

  process.exit(0);
}

main().catch(console.error);
