require('dotenv').config({ path: '.env.local' });
const { getAllPlayers } = require('./lib/neon/players');

async function main() {
  // Test search with "salah"
  console.log('🔍 Running getAllPlayers search for "salah"...');
  const results = await getAllPlayers({ search: 'salah' });
  console.log(`   Found ${results.length} players:`);
  results.forEach(p => {
    console.log(`   - ID: ${p.id}, Name: ${p.name}, Position: ${p.position}`);
  });
}

main().catch(console.error);
