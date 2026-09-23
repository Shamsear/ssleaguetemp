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

async function check() {
  const sql = neon(process.env.NEON_TOURNAMENT_DB_URL!);
  const rows = await sql`SELECT player_id, player_name, matches_played, points, goals_scored, updated_at FROM realplayerstats WHERE season_id = 'SSPSLS18' ORDER BY points DESC LIMIT 10`;
  console.log('Realplayerstats sample S18:', rows);
  process.exit(0);
}

check().catch(console.error);
