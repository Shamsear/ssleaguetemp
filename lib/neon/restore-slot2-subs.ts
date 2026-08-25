import { neon } from '@neondatabase/serverless';

const url = process.env.FANTASY_DATABASE_URL || 'postgresql://neondb_owner:npg_Tc4vRfusG6Do@ep-cold-sound-aosfvy9i-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function run() {
  const sql = neon(url);
  
  // Find teams that have bids in slot 2 (Red Slot 2 - active)
  const bidders = await sql`SELECT DISTINCT team_id FROM fantasy_draft_bids WHERE league_id = 'SSPSLFLS18' AND slot_index = 2`;
  console.log(`Teams with bids in slot 2: ${bidders.length}`);
  
  for (const b of bidders) {
    await sql`INSERT INTO fantasy_slot_submissions (team_id, league_id, slot_index, submitted_at) VALUES (${b.team_id}, 'SSPSLFLS18', 2, NOW()) ON CONFLICT DO NOTHING`;
    console.log(`  Restored: ${b.team_id}`);
  }
  
  const count = await sql`SELECT COUNT(*)::int as cnt FROM fantasy_slot_submissions WHERE slot_index = 2`;
  console.log(`\nTotal slot 2 entries: ${count[0].cnt}`);
  
  // Show all slot_submissions
  const all = await sql`SELECT ss.team_id, t.team_name, ss.slot_index FROM fantasy_slot_submissions ss JOIN fantasy_teams t ON t.team_id = ss.team_id ORDER BY ss.slot_index, t.team_name`;
  all.forEach((s: any) => console.log(`  slot ${s.slot_index}: ${s.team_name}`));
  
  process.exit(0);
}

run().catch(e => { console.error('Failed:', e); process.exit(1); });
