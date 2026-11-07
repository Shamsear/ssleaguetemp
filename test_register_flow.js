const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

// Let's import what route.ts imports
const { adminDb } = require('./lib/neon/admin-db-wrapper');

async function testRegister() {
  const seasonId = 'SSPSLS19';
  const userId = 'V9JF0vmyiHPVE09FQElZzBpUQW03'; // Hijas (Manchester United)
  
  console.log('1. Checking season in adminDb...');
  const seasonDoc = await adminDb.collection('seasons').doc(seasonId).get();
  console.log('Season exists?', seasonDoc.exists, seasonDoc.data()?.name);

  console.log('2. Checking user in adminDb.collection("users")...');
  const userDoc = await adminDb.collection('users').doc(userId).get();
  console.log('User exists?', userDoc.exists, userDoc.data());

  if (!userDoc.exists) {
    console.log('❌ USER DOES NOT EXIST in adminDb.collection("users")! This returns 404: Team not found!');
  }
}

testRegister().catch(console.error);
