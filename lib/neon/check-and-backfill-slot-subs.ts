import { neon } from '@neondatabase/serverless';

const url = 'postgresql://neondb_owner:npg_Tc4vRfusG6Do@ep-cold-sound-aosfvy9i-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function run() {
  const sql = neon(url);
  console.log('Connected\n');

  // 1. Check all leagues
  const leagues = await sql`SELECT league_id, draft_status FROM fantasy_leagues ORDER BY league_id`;
  console.log('Leagues:', JSON.stringify(leagues, null, 2));

  // 2. Check all teams
  const teams = await sql`SELECT team_id, team_name, draft_submitted, league_id FROM fantasy_teams WHERE is_enabled = true ORDER BY league_id, team_name`;
  console.log('\nTeams:', teams.length);
  const submitted = teams.filter((t: any) => t.draft_submitted);
  console.log('Submitted:', submitted.length);
  submitted.forEach((t: any) => console.log(`  - ${t.team_name} (${t.team_id}) league=${t.league_id}`));

  // 3. Check rounds
  try {
    const rounds = await sql`SELECT league_id, slot_index, slot_name, status FROM fantasy_draft_rounds ORDER BY league_id, slot_index`;
    console.log('\nRounds:', rounds.length);
    rounds.forEach((r: any) => console.log(`  - [${r.league_id}] ${r.slot_name} status=${r.status}`));
  } catch (e: any) {
    console.log('\nfantasy_draft_rounds table:', e.message);
  }

  // 4. Check bids
  try {
    const bids = await sql`SELECT team_id, league_id, slot_index, COUNT(*)::int as cnt FROM fantasy_draft_bids GROUP BY team_id, league_id, slot_index`;
    console.log('\nBid groups:', bids.length);
    bids.forEach((b: any) => console.log(`  - team=${b.team_id} slot=${b.slot_index} bids=${b.cnt}`));
  } catch (e: any) {
    console.log('\nfantasy_draft_bids table:', e.message);
  }

  // 5. Check existing slot_submissions
  const subs = await sql`SELECT team_id, league_id, slot_index, submitted_at FROM fantasy_slot_submissions ORDER BY team_id, slot_index`;
  console.log('\nExisting slot_submissions:', subs.length);
  subs.forEach((s: any) => console.log(`  - team=${s.team_id} slot=${s.slot_index}`));

  process.exit(0);
}

run().catch(e => { console.error('Failed:', e); process.exit(1); });
