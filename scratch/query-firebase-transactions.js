const { adminDb } = require('../lib/firebase/admin');

async function queryFirebase() {
  try {
    const snaps = await Promise.all([
      adminDb.collection('player_transactions').where('player_id', '==', '110626').get(),
      adminDb.collection('transactions').where('player_id', '==', '110626').get(),
      adminDb.collection('player_transactions').where('player_id', '==', '2985').get(),
      adminDb.collection('transactions').where('player_id', '==', '2985').get()
    ]);
    
    console.log("=== player_transactions (110626) ===");
    snaps[0].docs.forEach(d => console.log(d.id, JSON.stringify(d.data(), null, 2)));
    
    console.log("\n=== transactions (110626) ===");
    snaps[1].docs.forEach(d => console.log(d.id, JSON.stringify(d.data(), null, 2)));
    
    console.log("\n=== player_transactions (2985) ===");
    snaps[2].docs.forEach(d => console.log(d.id, JSON.stringify(d.data(), null, 2)));
    
    console.log("\n=== transactions (2985) ===");
    snaps[3].docs.forEach(d => console.log(d.id, JSON.stringify(d.data(), null, 2)));
  } catch (err) {
    console.error(err);
  }
}
queryFirebase();
