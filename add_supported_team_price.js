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
  console.log("=== ADDING supported_team_price COLUMN TO fantasy_teams ===");
  try {
    await query(`
      ALTER TABLE fantasy_teams 
      ADD COLUMN IF NOT EXISTS supported_team_price NUMERIC DEFAULT 0.00
    `);
    console.log("Column supported_team_price added/verified successfully!");
  } catch(e) {
    console.error("Error adding column:", e);
  }
}

run().catch(console.error);
