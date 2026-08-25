import { neon } from '@neondatabase/serverless';

const url = process.env.FANTASY_DATABASE_URL || 'postgresql://neondb_owner:npg_Tc4vRfusG6Do@ep-cold-sound-aosfvy9i-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function run() {
  const sql = neon(url);
  
  // Sync draft_submitted with actual slot_submissions
  const teams = await sql`SELECT team_id, draft_submitted FROM fantasy_teams WHERE is_enabled = true AND league_id = 'SSPSLFLS18'`;
  for (const t of teams) {
    const subs = await sql`SELECT COUNT(*)::int as cnt FROM fantasy_slot_submissions WHERE team_id = ${t.team_id} AND league_id = 'SSPSLFLS18'`;
    const hasSubs = (subs[0]?.cnt || 0) > 0;
    if (t.draft_submitted !== hasSubs) {
      await sql`UPDATE fantasy_teams SET draft_submitted = ${hasSubs}, updated_at = NOW() WHERE team_id = ${t.team_id}`;
      console.log(`Updated ${t.team_id}: draft_submitted ${t.draft_submitted} → ${hasSubs}`);
    }
  }

  // Show final state
  const final = await sql`SELECT team_name, draft_submitted FROM fantasy_teams WHERE league_id = 'SSPSLFLS18' AND is_enabled = true ORDER BY team_name`;
  final.forEach((t: any) => console.log(`  ${t.team_name}: draft_submitted=${t.draft_submitted}`));
  
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
