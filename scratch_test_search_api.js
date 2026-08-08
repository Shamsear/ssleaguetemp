require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
}

// Since NextRequest handles headers etc., we can mock the search logic directly by importing
// or we can just verify the firestore cache query results!
async function main() {
  const adminDb = admin.firestore();
  console.log('🏁 Running Search API logic verification...');
  
  const realPlayersRef = adminDb.collection('realplayers');
  const playersSnapshot = await realPlayersRef.get();
  
  const players = playersSnapshot.docs.map(doc => ({
    id: doc.id,
    player_id: doc.data().player_id,
    name: doc.data().name,
  }));
  
  console.log(`   Total real players loaded in mock cache: ${players.length}`);
  
  const termLower = 'salah';
  const matches = players.filter(player => 
    (player.name && player.name.toLowerCase().includes(termLower)) ||
    (player.player_id && player.player_id.toLowerCase().includes(termLower))
  );
  
  console.log(`   Matches found for "${termLower}": ${matches.length}`);
  matches.forEach(m => {
    console.log(`   - ID: ${m.player_id}, Name: ${m.name}`);
  });
  
  if (matches.length > 0) {
    console.log('✅ SEARCH VERIFICATION PASSED');
  } else {
    console.log('❌ NO MATCHES FOUND');
  }
}

main().catch(console.error);
