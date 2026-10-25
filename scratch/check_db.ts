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

async function main() {
  const tournamentDb = getTournamentDb();
  const tables = await tournamentDb`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name ASC
  `;
  console.log('--- Tournament Tables ---', tables.map(t => t.table_name));
}

main().catch(console.error);
