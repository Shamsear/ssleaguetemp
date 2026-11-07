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
  const { getTournamentDb } = await import('../lib/neon/tournament-config');
  const { adminDb } = await import('../lib/neon/admin-db-wrapper');
  const tourSql = getTournamentDb();

  try {
    const ps = await tourSql`SELECT COUNT(*) FROM player_seasons WHERE season_id = 'SSPSLS19'`;
    console.log('player_seasons SSPSLS19 count:', ps[0].count);
  } catch (e: any) {
    console.log('player_seasons err:', e.message);
  }

  try {
    const fbSnap = await adminDb.collection('realplayerstats').where('season_id', '==', 'SSPSLS19').get();
    console.log('Firestore realplayerstats SSPSLS19 count:', fbSnap.docs.length);
  } catch (e: any) {
    console.log('FB realplayerstats err:', e.message);
  }

  process.exit(0);
}

main().catch(console.error);
