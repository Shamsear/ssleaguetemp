const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

// Load .env.local manually
const envPath = path.join(__dirname, '../.env.local');
let dbUrl = '';

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.startsWith('NEON_TOURNAMENT_DB_URL=')) {
      dbUrl = line.split('NEON_TOURNAMENT_DB_URL=')[1].trim();
      if (dbUrl.startsWith('"') && dbUrl.endsWith('"')) dbUrl = dbUrl.substring(1, dbUrl.length - 1);
      if (dbUrl.startsWith("'") && dbUrl.endsWith("'")) dbUrl = dbUrl.substring(1, dbUrl.length - 1);
      break;
    }
  }
}

async function run() {
  try {
    const sql = neon(dbUrl);
    console.log("Connected to database. Querying tables related to categories...");
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE '%cat%'
    `;
    console.log("=== Category-related tables ===");
    tables.forEach(t => {
      console.log(t.table_name);
    });
    
    // Also check if there is a table named 'categories' or 'player_categories'
    const allTables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log("\n=== All database tables ===");
    allTables.forEach(t => {
      console.log(t.table_name);
    });
  } catch (err) {
    console.error("Query failed:", err);
  }
}

run();
