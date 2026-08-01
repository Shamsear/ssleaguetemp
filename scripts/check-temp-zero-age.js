const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

// Load temp DB
const envPath = path.join(__dirname, '..', '.env.local');
let tempConnectionString = '';
try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('TEMP_DATABASE_URL=')) {
      tempConnectionString = line.substring(line.indexOf('=') + 1).trim();
      if ((tempConnectionString.startsWith('"') && tempConnectionString.endsWith('"')) ||
          (tempConnectionString.startsWith("'") && tempConnectionString.endsWith("'"))) {
        tempConnectionString = tempConnectionString.substring(1, tempConnectionString.length - 1);
      }
      break;
    }
  }
} catch (err) {}

const tempSql = neon(tempConnectionString);

async function run() {
  try {
    const [{ count: tempZeroAge }] = await tempSql.query('SELECT COUNT(*)::int as count FROM temp_players_import WHERE age = 0 OR age IS NULL');
    const samples = await tempSql.query('SELECT player_id, name, age FROM temp_players_import WHERE age = 0 OR age IS NULL LIMIT 10');
    console.log(`TEMP_ZERO_AGE_PLAYERS: ${tempZeroAge}`);
    console.log('SAMPLES IN TEMP TABLE WITH 0 AGE:');
    console.log(JSON.stringify(samples, null, 2));
  } catch (error) {
    console.error('Failed:', error);
  }
}

run();
