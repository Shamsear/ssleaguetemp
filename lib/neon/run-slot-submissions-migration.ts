/**
 * Run: npx tsx lib/neon/run-slot-submissions-migration.ts
 * Creates the fantasy_slot_submissions table for per-slot submission tracking.
 */

import { neon } from '@neondatabase/serverless';

const url = process.env.FANTASY_DATABASE_URL || 'postgresql://neondb_owner:npg_Tc4vRfusG6Do@ep-cold-sound-aosfvy9i-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function run() {
  const sql = neon(url);
  console.log('🔌 Connected to fantasy DB\n');

  console.log('1/3 Creating fantasy_slot_submissions table...');
  await sql`
    CREATE TABLE IF NOT EXISTS fantasy_slot_submissions (
      id SERIAL PRIMARY KEY,
      team_id VARCHAR(255) NOT NULL,
      league_id VARCHAR(255) NOT NULL,
      slot_index INTEGER NOT NULL,
      submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(team_id, league_id, slot_index)
    )
  `;
  console.log('   ✅ Table created\n');

  console.log('2/3 Creating indexes...');
  await sql`CREATE INDEX IF NOT EXISTS idx_fantasy_slot_submissions_team ON fantasy_slot_submissions(team_id, league_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_fantasy_slot_submissions_league ON fantasy_slot_submissions(league_id, slot_index)`;
  console.log('   ✅ Indexes created\n');

  // Backfill: for teams that have draft_submitted = true, insert entries for all active/completed slots
  console.log('3/3 Backfilling existing submissions...');
  const backfilled = await sql`
    INSERT INTO fantasy_slot_submissions (team_id, league_id, slot_index, submitted_at)
    SELECT t.team_id, t.league_id, r.slot_index, NOW()
    FROM fantasy_teams t
    JOIN fantasy_draft_rounds r ON r.league_id = t.league_id
    WHERE t.draft_submitted = true
      AND r.status IN ('active', 'closed', 'completed')
    ON CONFLICT (team_id, league_id, slot_index) DO NOTHING
  `;
  console.log(`   ✅ Backfill complete (${backfilled.count || 0} rows)\n`);

  // Verify
  const count = await sql`SELECT COUNT(*)::int as cnt FROM fantasy_slot_submissions`;
  console.log(`📊 Total slot submissions: ${count[0].cnt}`);
  console.log('\n✅ Migration complete!');
}

run().catch(err => { console.error('❌ Migration failed:', err); process.exit(1); });
