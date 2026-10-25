const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    let key = trimmed.substring(0, idx).trim();
    let val = trimmed.substring(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    envVars[key] = val;
  }
});

const dbs = [
  { name: 'AUCTION_DB', url: envVars.NEON_AUCTION_DB_URL },
  { name: 'TOURNAMENT_DB', url: envVars.NEON_TOURNAMENT_DB_URL },
  { name: 'FANTASY_DB', url: envVars.FANTASY_DATABASE_URL },
  { name: 'TEMP_DB', url: envVars.TEMP_DATABASE_URL },
  { name: 'MAIN_DB', url: envVars.NEON_MAIN_DB_URL },
];

async function run() {
  const allMatches = [];

  for (const dbInfo of dbs) {
    if (!dbInfo.url) continue;
    console.log(`\n======================================================`);
    console.log(`Scanning Database: ${dbInfo.name}`);
    console.log(`======================================================`);
    
    try {
      const sql = neon(dbInfo.url);
      const tables = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `;

      for (const t of tables) {
        const tableName = t.table_name;
        try {
          const query = `
            SELECT * FROM "${tableName}" t 
            WHERE row_to_json(t)::text ILIKE '%adhil%' 
               OR row_to_json(t)::text ILIKE '%shamseer%'
               OR row_to_json(t)::text ILIKE '%shamsear%'
               OR row_to_json(t)::text ILIKE '%adil%'
          `;
          const rows = await sql.query(query);
          if (rows && rows.length > 0) {
            console.log(`[MATCH] Table "${tableName}": ${rows.length} rows matched`);
            allMatches.push({
              database: dbInfo.name,
              table: tableName,
              count: rows.length,
              rows: rows
            });
          }
        } catch (err) {
          console.error(`Error querying "${tableName}": ${err.message}`);
        }
      }
    } catch (e) {
      console.error(`Failed connecting to ${dbInfo.name}: ${e.message}`);
    }
  }

  console.log(`\n================ ALL POSTGRES MATCHES ================`);
  console.log(`Tables with matches: ${allMatches.length}`);
  fs.writeFileSync(path.join(__dirname, 'postgres_all_matches.json'), JSON.stringify(allMatches, null, 2));
}

run().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
