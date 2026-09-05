import { neon } from '@neondatabase/serverless';

const url = process.env.FANTASY_DATABASE_URL || 'postgresql://neondb_owner:npg_Tc4vRfusG6Do@ep-cold-sound-aosfvy9i-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function run() {
  const sql = neon(url);
  console.log('Connected\n');

  // Get active rounds
  const active = await sql`SELECT slot_index, slot_name FROM fantasy_draft_rounds WHERE status = 'active'`;
  console.log('Active rounds:', active.map((r: any) => r.slot_name).join(', '));

  for (const r of active) {
    const removed = await sql`DELETE FROM fantasy_slot_submissions WHERE slot_index = ${r.slot_index}`;
    console.log(`  Cleared slot ${r.slot_index} (${r.slot_name}): ${(removed as any).count ?? removed.length} entries removed`);
  }

  // Show remaining
  const remaining = await sql`SELECT COUNT(*)::int as cnt FROM fantasy_slot_submissions`;
  console.log(`\nTotal remaining: ${remaining[0].cnt}`);

  process.exit(0);
}

run().catch(e => { console.error('Failed:', e); process.exit(1); });
