require('dotenv').config({ path: '.env.local' });
const { getAllPlayers } = require('./lib/neon/players');

async function main() {
  const filters = {
    search: 'salah',
    limit: 10,
    offset: 0
  };
  const players = await getAllPlayers(filters);
  console.log(`🔍 API Search results for "salah": ${players.length} players found`);
  players.forEach(p => {
    console.log(`- ID: ${p.id}, Name: ${p.name}, Position: ${p.position}`);
  });
}

main().catch(console.error);
