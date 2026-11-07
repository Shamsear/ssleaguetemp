const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

const { adminDb } = require('./lib/neon/admin-db-wrapper');
const { neon } = require('@neondatabase/serverless');
const mainSql = neon(process.env.NEON_MAIN_DB_URL);

async function testSync() {
  console.log('Testing direct doc.set on team_seasons...');
  const docId = 'SSPSLT0002_SSPSLS19';
  const data = {
    team_id: 'SSPSLT0002',
    team_name: 'Manchester United',
    season_id: 'SSPSLS19',
    user_id: 'V9JF0vmyiHPVE09FQElZzBpUQW03',
    status: 'registered',
    football_budget: 10000,
    football_spent: 0,
    real_player_budget: 500,
    real_player_spent: 0,
    currency_system: 'dual',
    players_count: 0
  };

  try {
    await adminDb.collection('team_seasons').doc(docId).set(data);
    console.log('doc.set finished.');
  } catch (err) {
    console.error('Error on doc.set:', err);
  }

  const rows = await mainSql`SELECT * FROM team_seasons WHERE id = ${docId}`;
  console.log('Rows in Neon after doc.set:', rows.length, rows);
}

testSync().catch(console.error);
