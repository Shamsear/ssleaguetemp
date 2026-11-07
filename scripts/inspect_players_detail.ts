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

async function main() {
  const { getMainDb } = await import('../lib/neon/main-config');
  const { getTournamentDb } = await import('../lib/neon/tournament-config');
  const { adminDb } = await import('../lib/neon/admin-db-wrapper');
  const mainSql = getMainDb();
  const tourSql = getTournamentDb();

  // Check realplayerstats for SSPSLS19
  try {
    const s19Stats = await tourSql`SELECT COUNT(*) FROM realplayerstats WHERE season_id = 'SSPSLS19'`;
    console.log('realplayerstats SSPSLS19 count:', s19Stats[0].count);
    const sample = await tourSql`SELECT id, player_id, player_name, category, season_id FROM realplayerstats WHERE season_id = 'SSPSLS19' LIMIT 5`;
    console.log('realplayerstats SSPSLS19 sample:', sample);
  } catch (e: any) {
    console.log('realplayerstats err:', e.message);
  }

  // Check realplayerstats for SSPSLS18
  try {
    const s18Stats = await tourSql`SELECT COUNT(*) FROM realplayerstats WHERE season_id = 'SSPSLS18'`;
    console.log('realplayerstats SSPSLS18 count:', s18Stats[0].count);
    const sample18 = await tourSql`SELECT id, player_id, player_name, category, season_id FROM realplayerstats WHERE season_id = 'SSPSLS18' LIMIT 5`;
    console.log('realplayerstats SSPSLS18 sample:', sample18);
  } catch (e: any) {
    console.log('realplayerstats S18 err:', e.message);
  }

  // Check realplayers table in Main DB
  try {
    const rpSample = await mainSql`SELECT id, player_id, name, display_name, category_id, season_id FROM realplayers LIMIT 5`;
    console.log('realplayers sample:', rpSample);
  } catch (e: any) {
    console.log('realplayers err:', e.message);
  }

  process.exit(0);
}

main().catch(console.error);
