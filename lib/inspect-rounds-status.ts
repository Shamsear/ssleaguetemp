import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf-8');
envFile.split('\n').forEach(line => {
  const t = line.trim();
  if (t && !t.startsWith('#')) {
    const idx = t.indexOf('=');
    if (idx !== -1) {
      let v = t.substring(idx + 1).trim().replace(/^['\"]|['\"]$/g, '');
      process.env[t.substring(0, idx).trim()] = v;
    }
  }
});

import { getTournamentDb } from './neon/tournament-config';

async function check() {
  const db = getTournamentDb();
  const res = await db`SELECT round_number, count(*) as fixture_count, status FROM fixtures WHERE season_id = 'SSPSLS18' GROUP BY round_number, status ORDER BY round_number`;
  console.table(res);
}

check().catch(console.error);
