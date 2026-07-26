import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const p199 = 'sspslpsl0199';
const p85 = 'sspslpsl0085';

const tournamentUrl = 'postgresql://neondb_owner:npg_nrIQRAS1F4Be@ep-patient-tooth-aoxamv38-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const sql = neon(tournamentUrl);

async function main() {
  console.log(`\n📊 --- TOURNAMENT DB: DEEP PLAYER CHECK ---\n`);

  // realplayerstats
  const rs199 = await sql`SELECT COUNT(*) FROM realplayerstats WHERE player_id = ${p199}`;
  const rs85 = await sql`SELECT COUNT(*) FROM realplayerstats WHERE player_id = ${p85}`;
  console.log(`realplayerstats:   199=${rs199[0].count}  085=${rs85[0].count}`);
  if (Number(rs85[0].count) > 0) {
    const rows = await sql`SELECT * FROM realplayerstats WHERE player_id = ${p85} LIMIT 5`;
    console.log(`  085 sample:`, JSON.stringify(rows, null, 2));
  }
  if (Number(rs199[0].count) > 0) {
    const rows = await sql`SELECT * FROM realplayerstats WHERE player_id = ${p199} LIMIT 5`;
    console.log(`  199 sample:`, JSON.stringify(rows, null, 2));
  }

  // player_seasons
  const ps199 = await sql`SELECT COUNT(*) FROM player_seasons WHERE player_id = ${p199}`;
  const ps85 = await sql`SELECT COUNT(*) FROM player_seasons WHERE player_id = ${p85}`;
  console.log(`\nplayer_seasons:    199=${ps199[0].count}  085=${ps85[0].count}`);
  if (Number(ps85[0].count) > 0) {
    const rows = await sql`SELECT * FROM player_seasons WHERE player_id = ${p85}`;
    console.log(`  085 data:`, JSON.stringify(rows, null, 2));
  }
  if (Number(ps199[0].count) > 0) {
    const rows = await sql`SELECT * FROM player_seasons WHERE player_id = ${p199}`;
    console.log(`  199 data:`, JSON.stringify(rows, null, 2));
  }

  // team_players
  const tp199 = await sql`SELECT COUNT(*) FROM team_players WHERE player_id = ${p199}`;
  const tp85 = await sql`SELECT COUNT(*) FROM team_players WHERE player_id = ${p85}`;
  console.log(`\nteam_players:      199=${tp199[0].count}  085=${tp85[0].count}`);
  if (Number(tp85[0].count) > 0) {
    const rows = await sql`SELECT * FROM team_players WHERE player_id = ${p85}`;
    console.log(`  085 data:`, JSON.stringify(rows, null, 2));
  }
  if (Number(tp199[0].count) > 0) {
    const rows = await sql`SELECT * FROM team_players WHERE player_id = ${p199}`;
    console.log(`  199 data:`, JSON.stringify(rows, null, 2));
  }

  // lineups (JSONB)
  const l199 = await sql`SELECT COUNT(*) FROM lineups WHERE starting_xi::text LIKE ${'%' + p199 + '%'} OR substitutes::text LIKE ${'%' + p199 + '%'}`;
  const l85 = await sql`SELECT COUNT(*) FROM lineups WHERE starting_xi::text LIKE ${'%' + p85 + '%'} OR substitutes::text LIKE ${'%' + p85 + '%'}`;
  console.log(`\nlineups (jsonb):   199=${l199[0].count}  085=${l85[0].count}`);

  // Let's also check what columns realplayerstats has, and look at a few rows to understand the data structure
  console.log('\n--- realplayerstats structure (first 3 rows) ---');
  const sample = await sql`SELECT * FROM realplayerstats LIMIT 3`;
  if (sample.length > 0) {
    console.log(`Columns: ${Object.keys(sample[0]).join(', ')}`);
    console.log(`Sample:`, JSON.stringify(sample, null, 2));
  } else {
    console.log('Table is empty!');
  }

  // Count total rows in key tables
  const totalRps = await sql`SELECT COUNT(*) FROM realplayerstats`;
  const totalPs = await sql`SELECT COUNT(*) FROM player_seasons`;
  const totalTp = await sql`SELECT COUNT(*) FROM team_players`;
  console.log(`\nTotal rows: realplayerstats=${totalRps[0].count}, player_seasons=${totalPs[0].count}, team_players=${totalTp[0].count}`);
}

main().catch(console.error);
