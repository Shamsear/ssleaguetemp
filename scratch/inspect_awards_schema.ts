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
  const tsCols = await db`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'teamstats'
  `;
  console.log('teamstats columns:', tsCols.map((c: any) => c.column_name));

  const mgrCols = await db`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'managers'
  `;
  console.log('managers columns:', mgrCols.map((c: any) => c.column_name));

  const mgrSample = await db`SELECT * FROM managers LIMIT 3`;
  console.log('managers sample:', mgrSample);

  const tsSample = await db`SELECT * FROM teamstats LIMIT 1`;
  console.log('teamstats sample:', tsSample);

  // Check categories in Season 18
  const catRows = await db`
    SELECT DISTINCT category 
    FROM realplayerstats 
    WHERE season_id = 'SSPSLS18'
  `;
  console.log('Categories in Season 18:', catRows.map((r: any) => r.category));

  // Also check categories table
  const catTable = await db`
    SELECT * FROM categories
  `;
  console.log('categories table:', catTable);

  // Check player_awards table schema
  const paCols = await db`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'player_awards'
  `;
  console.log('player_awards columns:', paCols.map((c: any) => c.column_name));

  const paSample = await db`SELECT * FROM player_awards LIMIT 3`;
  console.log('player_awards sample:', paSample);
}

run().catch(console.error);
