import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf-8');
envFile.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[trimmed.substring(0, idx).trim()] = val;
    }
  }
});

import { getTournamentDb } from '../lib/neon/tournament-config';

async function run() {
  const db = getTournamentDb();

  const rpsCols = await db`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'realplayerstats'
  `;
  console.log('realplayerstats columns:', rpsCols.map((c: any) => c.column_name));

  // Check top players per category in Season 18
  const topRed = await db`
    SELECT player_id, player_name, category, points, goals_scored, goals_conceded, (goals_scored - goals_conceded) as gd, matches_played, clean_sheets
    FROM realplayerstats
    WHERE season_id = 'SSPSLS18' AND UPPER(category) = 'RED'
    ORDER BY points DESC, (goals_scored - goals_conceded) DESC, goals_scored DESC
    LIMIT 3
  `;
  console.log('Top RED in S18:', topRed);

  const topBlack = await db`
    SELECT player_id, player_name, category, points, goals_scored, goals_conceded, (goals_scored - goals_conceded) as gd, matches_played, clean_sheets
    FROM realplayerstats
    WHERE season_id = 'SSPSLS18' AND UPPER(category) = 'BLACK'
    ORDER BY points DESC, (goals_scored - goals_conceded) DESC, goals_scored DESC
    LIMIT 3
  `;
  console.log('Top BLACK in S18:', topBlack);

  const topBlue = await db`
    SELECT player_id, player_name, category, points, goals_scored, goals_conceded, (goals_scored - goals_conceded) as gd, matches_played, clean_sheets
    FROM realplayerstats
    WHERE season_id = 'SSPSLS18' AND UPPER(category) = 'BLUE'
    ORDER BY points DESC, (goals_scored - goals_conceded) DESC, goals_scored DESC
    LIMIT 3
  `;
  console.log('Top BLUE in S18:', topBlue);

  const topWhite = await db`
    SELECT player_id, player_name, category, points, goals_scored, goals_conceded, (goals_scored - goals_conceded) as gd, matches_played, clean_sheets
    FROM realplayerstats
    WHERE season_id = 'SSPSLS18' AND UPPER(category) = 'WHITE'
    ORDER BY points DESC, (goals_scored - goals_conceded) DESC, goals_scored DESC
    LIMIT 3
  `;
  console.log('Top WHITE in S18:', topWhite);

  // Check existing player_awards in previous seasons to see what category awards were called
  const prevAwards = await db`
    SELECT DISTINCT award_type, award_category, player_category 
    FROM player_awards 
    ORDER BY award_category, award_type
  `;
  console.log('Previous award types in player_awards:', prevAwards);
}

run().catch(console.error);
