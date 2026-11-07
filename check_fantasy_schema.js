const fs = require('fs');
const { neon } = require('@neondatabase/serverless');

const env = fs.readFileSync('.env.local', 'utf-8');
const lines = env.split('\n');
const getVal = (k) => {
  const line = lines.find(l => l.trim().startsWith(k + '='));
  if (!line) return null;
  const val = line.split('=')[1].trim();
  return val.replace(/^["']|["']$/g, '');
};

const fantasySql = neon(getVal('NEON_FANTASY_DB_URL'));

async function main() {
  const leagues = await fantasySql`SELECT * FROM fantasy_leagues LIMIT 5`;
  console.log('Fantasy leagues:', leagues);
  
  const sample = await fantasySql`SELECT * FROM fantasy_teams LIMIT 1`;
  console.log('fantasy_teams columns:', Object.keys(sample[0]));
}

main().catch(console.error);
