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
  console.log("=== CHECK FANTASY_LEAGUES COLUMNS & SAMPLE ===");
  const leagues = await query(`SELECT * FROM fantasy_leagues LIMIT 1`);
  console.log("Leagues sample:", leagues.rows);
}

run().catch(console.error);
