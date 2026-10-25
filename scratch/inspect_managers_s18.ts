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
  
  const managersS18 = await db`
    SELECT * FROM managers WHERE season_id = 'SSPSLS18'
  `;
  console.log('Managers for S18 in managers table:', managersS18);

  const teamstatsS18 = await db`
    SELECT ts.team_id, ts.team_name, ts.tournament_id, ts.points, m.name as manager_name
    FROM teamstats ts
    LEFT JOIN managers m ON (m.team_id = ts.team_id AND m.season_id = ts.season_id)
    WHERE ts.season_id = 'SSPSLS18'
    ORDER BY ts.points DESC
    LIMIT 5
  `;
  console.log('Top teamstats with manager for S18:', teamstatsS18);

  // Check if teamstats has team_id format like 'SSPSLT0001_SSPSLS18' or 'SSPSLT0001'
  const tsRaw = await db`
    SELECT team_id, team_name, season_id FROM teamstats WHERE season_id = 'SSPSLS18' LIMIT 3
  `;
  console.log('teamstats raw S18:', tsRaw);
}

run().catch(console.error);
