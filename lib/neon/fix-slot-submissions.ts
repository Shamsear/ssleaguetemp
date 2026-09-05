import { neon } from '@neondatabase/serverless';

const url = process.env.FANTASY_DATABASE_URL || 'postgresql://neondb_owner:npg_Tc4vRfusG6Do@ep-cold-sound-aosfvy9i-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function run() {
  const sql = neon(url);
  console.log('Connected\n');

  // Show current state
  const before = await sql`SELECT team_id, slot_index FROM fantasy_slot_submissions ORDER BY team_id, slot_index`;
  console.log(`Before: ${before.length} entries`);
  
  // Find active rounds
  const activeRounds = await sql`SELECT slot_index, slot_name, status FROM fantasy_draft_rounds WHERE status IN ('active')`;
  console.log(`Active rounds: ${activeRounds.map((r: any) => r.slot_name).join(', ')}`);

  // For ACTIVE rounds: only keep submissions where team actually has bids
  for (const r of activeRounds) {
    const removed = await sql`
      DELETE FROM fantasy_slot_submissions ss
      WHERE ss.slot_index = ${r.slot_index}
        AND NOT EXISTS (
          SELECT 1 FROM fantasy_draft_bids b
          WHERE b.team_id = ss.team_id
            AND b.league_id = ss.league_id
            AND b.slot_index = ss.slot_index
        )
    `;
    console.log(`  Cleaned slot ${r.slot_index} (${r.slot_name}): removed ${(removed as any).count || 0} entries`);
  }

  // Show final state
  const after = await sql`SELECT ss.team_id, t.team_name, ss.slot_index, r.slot_name, r.status FROM fantasy_slot_submissions ss JOIN fantasy_teams t ON t.team_id = ss.team_id JOIN fantasy_draft_rounds r ON r.slot_index = ss.slot_index AND r.league_id = ss.league_id ORDER BY ss.slot_index, t.team_name`;
  console.log(`\nAfter: ${after.length} entries`);
  after.forEach((s: any) => console.log(`  slot ${s.slot_index} (${s.slot_name}): ${s.team_name} [${s.status}]`));

  process.exit(0);
}

run().catch(e => { console.error('Failed:', e); process.exit(1); });
