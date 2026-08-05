const { adminDb } = require('./lib/firebase/admin');
// Wait, we need firebase-admin setup. Let's look at how lib/firebase/admin.ts initializes it.
// We can just run a Node script importing our admin library.

async function run() {
  try {
    const { adminDb } = require('./lib/firebase/admin');
    console.log('Fetching audit logs for round SSPSLFR00039...');
    
    // We query the collection
    const snapshot = await adminDb.collection('audit_logs')
      .where('resource_id', '==', 'SSPSLFR00039')
      .orderBy('timestamp', 'asc')
      .get();
      
    if (snapshot.empty) {
      console.log('No direct resource_id audit logs found for SSPSLFR00039.');
    } else {
      console.log(`Found ${snapshot.size} audit logs:`);
      snapshot.forEach(doc => {
        const d = doc.data();
        console.log(`[${d.timestamp?.toDate()?.toISOString()}] Action: ${d.action_type} by ${d.user_email || d.user_id}`);
        console.log(`  Description: ${d.description}`);
        console.log(`  Metadata:`, d.metadata);
      });
    }

    console.log('\nFetching general audit logs that might mention SSPSLFR00039 in description...');
    const snapshot2 = await adminDb.collection('audit_logs')
      .orderBy('timestamp', 'desc')
      .limit(30)
      .get();
      
    snapshot2.forEach(doc => {
      const d = doc.data();
      if (d.description && d.description.includes('SSPSLFR00039')) {
        console.log(`[${d.timestamp?.toDate()?.toISOString()}] Action: ${d.action_type} by ${d.user_email || d.user_id}`);
        console.log(`  Description: ${d.description}`);
      }
    });

  } catch (error) {
    console.error(error);
  }
}
run();
