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
  console.log("=== CHECK ALL FANTASY_POST_RELEASE_BIDS ===");
  try {
    const postBids = await query(`SELECT * FROM fantasy_post_release_bids`);
    console.log("Post release bids:", postBids.rows);
  } catch(e) { console.log(e.message); }

  console.log("\n=== CHECK ALL FANTASY_DRAFT_PICKS ===");
  try {
    const picks = await query(`SELECT * FROM fantasy_draft_picks`);
    console.log("Picks:", picks.rows);
  } catch(e) { console.log(e.message); }

  console.log("\n=== CHECK FANTASY_TEAMS ROW SAMPLE ===");
  const teams = await query(`SELECT * FROM fantasy_teams LIMIT 1`);
  console.log("Team sample:", teams.rows);
}

run().catch(console.error);
