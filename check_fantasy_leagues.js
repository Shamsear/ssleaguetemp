const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

const { fantasySql } = require('./lib/neon/fantasy-config');

async function checkFantasyLeagues() {
  const leagues = await fantasySql`SELECT * FROM fantasy_leagues ORDER BY league_id DESC`;
  console.log('Existing fantasy leagues:', leagues);
}

checkFantasyLeagues().catch(console.error);
