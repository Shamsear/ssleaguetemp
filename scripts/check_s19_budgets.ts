import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
      }
    }
  });
}

async function check() {
  const { getMainDb } = await import('../lib/neon/main-config');
  const sql = getMainDb();
  const rows = await sql`
    SELECT *
    FROM team_seasons
    WHERE season_id = 'SSPSLS19'
  `;
  console.log('S19 team_seasons count:', rows.length);
  rows.forEach(r => {
    console.log(r.team_name, '| id:', r.id, '| real_player_budget:', r.real_player_budget, '| initial_real_player_budget:', r.initial_real_player_budget, '| real_player_budget_initial:', r.real_player_budget_initial, '| total_budget:', r.total_budget, '| raw_data budget:', r.raw_data?.real_player_budget, r.raw_data?.initial_real_player_budget);
  });
}
check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
