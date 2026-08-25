/**
 * Run: NEON_FANTASY_DB_URL=your_url npx tsx lib/neon/run-fantasy-rounds-migration.ts
 * Or: npx tsx lib/neon/run-fantasy-rounds-migration.ts  (uses FANTASY_DATABASE_URL from .env)
 */

import { neon } from '@neondatabase/serverless';

const url = process.env.FANTASY_DATABASE_URL || 'postgresql://neondb_owner:npg_K1IGoDtlkPA3@ep-silent-sun-a1hf5mn7-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function run() {
  const sql = neon(url);
  console.log('🔌 Connected to fantasy DB\n');

  // 1. Create table
  console.log('1/5 Creating fantasy_draft_rounds table...');
  await sql`
    CREATE TABLE IF NOT EXISTS fantasy_draft_rounds (
      id              SERIAL PRIMARY KEY,
      league_id       VARCHAR(50) NOT NULL,
      slot_index      INTEGER NOT NULL,
      slot_name       VARCHAR(100),
      opens_at        TIMESTAMP,
      closes_at       TIMESTAMP,
      status          VARCHAR(20) DEFAULT 'pending',
      created_at      TIMESTAMP DEFAULT NOW(),
      updated_at      TIMESTAMP DEFAULT NOW(),
      UNIQUE(league_id, slot_index)
    )
  `;
  console.log('   ✅ Table created\n');

  // 2. Create index
  console.log('2/5 Creating indexes...');
  await sql`CREATE INDEX IF NOT EXISTS idx_fantasy_draft_rounds_league ON fantasy_draft_rounds(league_id)`;
  console.log('   ✅ Indexes created\n');

  // 3. Migrate existing data
  console.log('3/5 Migrating existing round data from fantasy_leagues...');
  const leagues = await sql`
    SELECT league_id, draft_status, draft_opens_at, draft_closes_at, category_settings
    FROM fantasy_leagues
  `;
  console.log(`   Found ${leagues.length} league(s)`);

  let migrated = 0;
  for (const league of leagues) {
    const cs = typeof league.category_settings === 'string'
      ? JSON.parse(league.category_settings)
      : league.category_settings;
    const slots = cs?.slots || [];
    const activeSlotIdx = Number(cs?.active_slot_index) || null;

    for (const slot of slots) {
      const slotIdx = Number(slot.slot_index);
      const slotStatus =
        league.draft_status === 'active' && activeSlotIdx === slotIdx ? 'active'
        : league.draft_status === 'completed' ? 'completed'
        : 'pending';

      await sql`
        INSERT INTO fantasy_draft_rounds (league_id, slot_index, slot_name, opens_at, closes_at, status)
        VALUES (
          ${league.league_id}, ${slotIdx}, ${slot.name},
          ${league.draft_opens_at}, ${league.draft_closes_at}, ${slotStatus}
        )
        ON CONFLICT (league_id, slot_index) DO NOTHING
      `;
      migrated++;
    }
  }
  console.log(`   ✅ ${migrated} round(s) migrated\n`);

  // 4. Add round_id column to fantasy_draft_bids
  console.log('4/5 Adding round_id column to fantasy_draft_bids...');
  await sql`
    ALTER TABLE fantasy_draft_bids
    ADD COLUMN IF NOT EXISTS round_id INTEGER
  `;
  console.log('   ✅ Column added\n');

  // 5. Backfill round_id on existing bids
  console.log('5/5 Backfilling round_id on existing bids...');
  await sql`
    UPDATE fantasy_draft_bids b
    SET round_id = r.id
    FROM fantasy_draft_rounds r
    WHERE b.league_id = r.league_id
      AND b.slot_index = r.slot_index
      AND b.round_id IS NULL
  `;
  console.log('   ✅ Backfill complete\n');

  // 6. Clean up: drop old columns from fantasy_leagues
  console.log('6/6 Dropping old timing columns from fantasy_leagues...');
  try {
    await sql`ALTER TABLE fantasy_leagues DROP COLUMN IF EXISTS draft_opens_at`;
    console.log('   ✅ Dropped draft_opens_at');
  } catch (e: any) { console.log(`   ⏭️ ${e.message}`); }
  try {
    await sql`ALTER TABLE fantasy_leagues DROP COLUMN IF EXISTS draft_closes_at`;
    console.log('   ✅ Dropped draft_closes_at');
  } catch (e: any) { console.log(`   ⏭️ ${e.message}`); }

  // 7. Add auto-update trigger
  console.log('\n7/7 Creating update trigger...');
  await sql`
    CREATE OR REPLACE FUNCTION update_fantasy_draft_rounds_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql'
  `;
  await sql`DROP TRIGGER IF EXISTS update_fantasy_draft_rounds_updated_at ON fantasy_draft_rounds`;
  await sql`
    CREATE TRIGGER update_fantasy_draft_rounds_updated_at BEFORE UPDATE
      ON fantasy_draft_rounds FOR EACH ROW
      EXECUTE FUNCTION update_fantasy_draft_rounds_updated_at()
  `;
  console.log('   ✅ Trigger created\n');

  // Verify
  const rounds = await sql`SELECT * FROM fantasy_draft_rounds ORDER BY league_id, slot_index`;
  console.log('📊 Final state of fantasy_draft_rounds:');
  for (const r of rounds) {
    console.log(`   Slot ${r.slot_index} (${r.slot_name}): ${r.status} | opens: ${r.opens_at} | closes: ${r.closes_at}`);
  }

  const bidsWithRound = await sql`SELECT COUNT(*)::int as cnt FROM fantasy_draft_bids WHERE round_id IS NOT NULL`;
  const bidsTotal = await sql`SELECT COUNT(*)::int as cnt FROM fantasy_draft_bids`;
  console.log(`\n📊 Bids with round_id: ${bidsWithRound[0].cnt} / ${bidsTotal[0].cnt}`);

  console.log('\n✅ Migration complete!');
}

run().catch(err => { console.error('❌ Migration failed:', err); process.exit(1); });
