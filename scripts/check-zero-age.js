const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

// Load main DB
const envPath = path.join(__dirname, '..', '.env.local');
let connectionString = '';
try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('NEON_DATABASE_URL=')) {
      connectionString = line.substring(line.indexOf('=') + 1).trim();
      if ((connectionString.startsWith('"') && connectionString.endsWith('"')) ||
          (connectionString.startsWith("'") && connectionString.endsWith("'"))) {
        connectionString = connectionString.substring(1, connectionString.length - 1);
      }
      break;
    }
  }
} catch (err) {}

// Load temp DB
let tempConnectionString = connectionString; // default to same
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

const sql = neon(connectionString);
const tempSql = neon(tempConnectionString);

async function run() {
  try {
    const [{ count: tempCount }] = await tempSql.query('SELECT COUNT(*)::int as count FROM temp_players_import');
    console.log(`TEMP_TABLE_ROWS: ${tempCount}`);
    
    if (tempCount > 0) {
      // Find Jordi Alba and Sergio Busquets in temp table
      const tempSamples = await tempSql.query(
        "SELECT player_id, name, age FROM temp_players_import WHERE player_id IN ('40425', '38568', '118075')"
      );
      console.log('TEMP_TABLE_SAMPLES (Jordi Alba, Busquets, Marcin Bułka):');
      console.log(JSON.stringify(tempSamples, null, 2));
      
      // Let's see if any players in the temp table have age > 0 while they have age = 0 in active table
      const activeZeros = await sql.query('SELECT player_id, name, age FROM footballplayers WHERE age = 0 OR age IS NULL');
      const activeZeroIds = activeZeros.map(p => p.player_id);
      
      if (activeZeroIds.length > 0) {
        // Chunk query due to SQL query parameter limits
        const matchingTemp = await tempSql.query(
          `SELECT player_id, name, age FROM temp_players_import WHERE player_id = ANY($1) AND age > 0 LIMIT 10`,
          [activeZeroIds]
        );
        console.log('TEMP_PLAYERS_WITH_VALID_AGE_BUT_ZERO_IN_ACTIVE:');
        console.log(JSON.stringify(matchingTemp, null, 2));
      }
    }
  } catch (error) {
    console.error('Failed:', error);
  }
}

run();
