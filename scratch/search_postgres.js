const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      let key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      envVars[key] = val;
    }
  }
});

const dbs = [
  { name: 'AUCTION_DB (NEON_AUCTION_DB_URL)', url: envVars.NEON_AUCTION_DB_URL },
  { name: 'TOURNAMENT_DB (NEON_TOURNAMENT_DB_URL)', url: envVars.NEON_TOURNAMENT_DB_URL },
  { name: 'FANTASY_DB (FANTASY_DATABASE_URL)', url: envVars.FANTASY_DATABASE_URL },
  { name: 'TEMP_DB (TEMP_DATABASE_URL)', url: envVars.TEMP_DATABASE_URL },
  { name: 'MAIN_DB (NEON_MAIN_DB_URL)', url: envVars.NEON_MAIN_DB_URL },
];

async function searchPostgres() {
  const results = [];

  for (const dbInfo of dbs) {
    if (!dbInfo.url) {
      console.log(`Skipping ${dbInfo.name} (no URL)`);
      continue;
    }

    console.log(`\n======================================================`);
    console.log(`Checking ${dbInfo.name}...`);
    console.log(`======================================================`);

    try {
      const sql = neon(dbInfo.url);
      const tablesRes = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `;

      console.log(`Found ${tablesRes.length} tables in ${dbInfo.name}`);

      for (const tableRow of tablesRes) {
        const table = tableRow.table_name;
        try {
          // Search using row_to_json
          // We can't do dynamic table name directly with tagged template literal without formatting,
          // so we use sql.query or build template literal
          const queryStr = `SELECT * FROM "${table}" t WHERE row_to_json(t)::text ILIKE '%adhil%' OR row_to_json(t)::text ILIKE '%shamseer%'`;
          const rows = await sql(queryStr);
          if (rows.length > 0) {
            console.log(`  -> MATCH in table "${table}": ${rows.length} row(s)`);
            results.push({
              db: dbInfo.name,
              table,
              count: rows.length,
              rows
            });
          }
        } catch (tableErr) {
          console.error(`  Error querying table "${table}":`, tableErr.message);
        }
      }
    } catch (e) {
      console.error(`Error connecting/querying ${dbInfo.name}:`, e.message);
    }
  }

  console.log(`\n\n================ SUMMARY OF POSTGRES MATCHES ================`);
  console.log(`Total table matches found: ${results.length}`);
  
  fs.writeFileSync(
    path.join(__dirname, 'postgres_search_results.json'),
    JSON.stringify(results, null, 2),
    'utf-8'
  );
  console.log('Detailed results written to scratch/postgres_search_results.json');
}

searchPostgres()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
