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
        const val = trimmed.slice(idx + 1).trim().replace(/^[\"']|[\"']$/g, '');
        process.env[key] = val;
      }
    }
  }
}

loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), '.env.local'));

async function main() {
  const { getTournamentDb } = await import('../lib/neon/tournament-config');
  const sql = getTournamentDb();

  // Try realplayerstats table
  console.log('\n=== Players matching Hyder/Hijaz/Prajith in realplayerstats ===');
  const players = await sql`
    SELECT player_id, player_name, team_id
    FROM realplayerstats
    WHERE season_id = 'SSPSLS18'
      AND (
        player_name ILIKE '%hyder%'
        OR player_name ILIKE '%hijaz%'
        OR player_name ILIKE '%prajith%'
        OR player_name ILIKE '%nihal%'
      )
    ORDER BY player_name
  `;
  console.log(JSON.stringify(players, null, 2));

  // Also check matchups for round 17 to find who played
  console.log('\n=== All R17 matchups ===');
  const matchups = await sql`
    SELECT m.fixture_id, m.home_player_id, m.home_player_name, m.away_player_id, m.away_player_name,
           m.home_substituted, m.away_substituted, m.home_original_player_id, m.away_original_player_id,
           m.home_original_player_name, m.away_original_player_name
    FROM matchups m
    JOIN fixtures f ON f.id = m.fixture_id
    WHERE f.season_id = 'SSPSLS18' AND f.round_number = 17
    ORDER BY m.fixture_id, m.position
  `;
  for (const m of matchups) {
    if (
      (m.home_player_name || '').toLowerCase().includes('hyder') ||
      (m.home_player_name || '').toLowerCase().includes('hijaz') ||
      (m.home_player_name || '').toLowerCase().includes('prajith') ||
      (m.home_player_name || '').toLowerCase().includes('nihal') ||
      (m.away_player_name || '').toLowerCase().includes('hyder') ||
      (m.away_player_name || '').toLowerCase().includes('hijaz') ||
      (m.away_player_name || '').toLowerCase().includes('prajith') ||
      (m.away_player_name || '').toLowerCase().includes('nihal')
    ) {
      console.log('MATCH FOUND:', JSON.stringify(m, null, 2));
    }
  }

  // Just print all player names in r17 matchups
  console.log('\n=== All player names in R17 matchups ===');
  const allNames = new Set<string>();
  for (const m of matchups) {
    allNames.add(m.home_player_name);
    allNames.add(m.away_player_name);
    if (m.home_original_player_name) allNames.add(m.home_original_player_name);
    if (m.away_original_player_name) allNames.add(m.away_original_player_name);
  }
  console.log([...allNames].sort().join('\n'));

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
