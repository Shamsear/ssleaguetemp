// Migration script: move all S17 data to S18 and deactivate S17 league
// Run with: node --env-file=.env.local scripts/migrate-s17-to-s18.mjs

import { neon } from '@neondatabase/serverless';

const FROM = 'SSPSLFLS17';
const TO   = 'SSPSLFLS18';

const connectionString = process.env.FANTASY_DATABASE_URL;
if (!connectionString) {
  console.error('❌ FANTASY_DATABASE_URL not set in .env.local');
  process.exit(1);
}

const sql = neon(connectionString);

async function run() {
  console.log(`\n🔍 Auditing S17 data...\n`);

  const [teams]   = await sql`SELECT COUNT(*)::int as c FROM fantasy_teams WHERE league_id = ${FROM}`;
  const [players] = await sql`SELECT COUNT(*)::int as c FROM fantasy_players WHERE league_id = ${FROM}`;
  const [rounds]  = await sql`SELECT COUNT(*)::int as c FROM fantasy_rounds WHERE league_id = ${FROM}`;
  const [squad]   = await sql`SELECT COUNT(*)::int as c FROM fantasy_squad WHERE league_id = ${FROM}`;

  console.log(`  fantasy_teams:   ${teams.c}`);
  console.log(`  fantasy_players: ${players.c}`);
  console.log(`  fantasy_rounds:  ${rounds.c}`);
  console.log(`  fantasy_squad:   ${squad.c}`);
  console.log('');

  if (teams.c === 0 && players.c === 0 && rounds.c === 0 && squad.c === 0) {
    console.log('✅ No S17 data found — already migrated or empty.');
  } else {
    console.log(`🔄 Migrating ${teams.c} teams, ${players.c} players, ${rounds.c} rounds, ${squad.c} squad rows...\n`);

    if (teams.c > 0) {
      await sql`UPDATE fantasy_teams SET league_id = ${TO} WHERE league_id = ${FROM}`;
      console.log(`  ✅ fantasy_teams migrated`);
    }
    if (players.c > 0) {
      await sql`UPDATE fantasy_players SET league_id = ${TO} WHERE league_id = ${FROM}`;
      console.log(`  ✅ fantasy_players migrated`);
    }
    if (rounds.c > 0) {
      await sql`UPDATE fantasy_rounds SET league_id = ${TO} WHERE league_id = ${FROM}`;
      console.log(`  ✅ fantasy_rounds migrated`);
    }
    if (squad.c > 0) {
      await sql`UPDATE fantasy_squad SET league_id = ${TO} WHERE league_id = ${FROM}`;
      console.log(`  ✅ fantasy_squad migrated`);
    }

    // Migrate other tables silently (may not exist or may be empty)
    for (const table of ['fantasy_player_points', 'fantasy_drafts', 'fantasy_transfers']) {
      try {
        await sql`UPDATE ${sql(table)} SET league_id = ${TO} WHERE league_id = ${FROM}`;
      } catch { /* table doesn't exist or no data */ }
    }
  }

  // Always deactivate S17 league
  await sql`UPDATE fantasy_leagues SET is_active = false WHERE league_id = ${FROM}`;
  console.log(`\n✅ S17 league deactivated`);

  // Verify final state
  const [s17Final] = await sql`SELECT COUNT(*)::int as c FROM fantasy_teams WHERE league_id = ${FROM}`;
  const [s18Final] = await sql`SELECT COUNT(*)::int as c FROM fantasy_teams WHERE league_id = ${TO}`;
  console.log(`\n📊 Final state:`);
  console.log(`  S17 teams: ${s17Final.c} (should be 0)`);
  console.log(`  S18 teams: ${s18Final.c}`);
  console.log('\n🎉 Done!');
}

run().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
