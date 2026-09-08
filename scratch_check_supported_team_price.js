const NEON_URL = 'https://ep-cold-sound-aosfvy9i.c-2.ap-southeast-1.aws.neon.tech/sql';
const CONN_STR = 'postgresql://neondb_owner:npg_Tc4vRfusG6Do@ep-cold-sound-aosfvy9i-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function query(sqlText, params = []) {
  const res = await fetch(NEON_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': CONN_STR
    },
    body: JSON.stringify({ query: sqlText, params })
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error || json.message);
  return json;
}

async function run() {
  console.log("=== 1. CHECK FANTASY_TEAMS COLUMNS & SUPPORTED TEAM FIELDS ===");
  const teams = await query(`
    SELECT team_id, team_name, supported_team_id, supported_team_name, budget_remaining 
    FROM fantasy_teams
  `);
  console.log("Teams:", teams.rows);

  console.log("\n=== 2. CHECK FANTASY_DRAFT_BIDS / POST_RELEASE_BIDS FOR PASSIVE TEAMS ===");
  try {
    const bids = await query(`SELECT * FROM fantasy_draft_bids WHERE is_passive_team = true OR is_supported_team = true`);
    console.log("Draft Bids for passive teams:", bids.rows);
  } catch(e) { console.log("draft bids query:", e.message); }

  try {
    const postBids = await query(`SELECT * FROM fantasy_post_release_bids WHERE is_passive_team = true`);
    console.log("Post release bids for passive teams:", postBids.rows);
  } catch(e) { console.log("post bids query:", e.message); }

  try {
    const changes = await query(`SELECT * FROM supported_team_changes`);
    console.log("Supported team changes:", changes.rows);
  } catch(e) { console.log("changes query:", e.message); }

  console.log("\n=== 3. CHECK SUPPORTED TEAMS PRICE IN SCHEMAS OR CONSTANTS ===");
}

run().catch(console.error);
