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
  const indexes = await db`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'player_awards'
  `;
  console.log('player_awards indexes:', indexes);
}

run().catch(console.error);
