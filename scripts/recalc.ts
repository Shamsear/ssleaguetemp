import fs from 'fs';
import path from 'path';

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

async function main() {
  const { syncPlayerStatsForSeason } = await import('../lib/neon/sync-player-stats');
  console.log('🔄 Recalculating S18 player stats in realplayerstats (excluding is_null matchups)...');
  const res = await syncPlayerStatsForSeason('SSPSLS18');
  console.log('✅ Recalculation result:', res);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error recalculating:', err);
  process.exit(1);
});
