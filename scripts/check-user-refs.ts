import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const { adminDb } = await import('../lib/firebase/admin');
  
  const userId = '0D2MUyXlj0draiNOmU8TSYh9yDI3';
  console.log(`🔍 Checking user document for ${userId} in Firestore "users" collection...`);
  
  const userDoc = await adminDb.collection('users').doc(userId).get();
  if (userDoc.exists) {
    console.log(`  - User document exists!`);
    console.log(`  - Data: ${JSON.stringify(userDoc.data())}`);
  } else {
    console.log(`  - User document NOT found.`);
  }

  // Also query users collection to see if any other document references sspslpsl0199 or sspslpsl0085
  console.log(`\n🔍 Searching all users for references to player IDs...`);
  const usersSnap = await adminDb.collection('users').get();
  for (const doc of usersSnap.docs) {
    const data = doc.data();
    if (data.player_id === 'sspslpsl0199' || data.player_id === 'sspslpsl0085') {
      console.log(`  - User "${data.username}" (${doc.id}): player_id = "${data.player_id}"`);
    }
  }
}

main().catch(console.error);
