import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  try {
    const { adminDb } = await import('../lib/firebase/admin');
    console.log('Fetching last 20 audit logs...');
    
    const snapshot = await adminDb.collection('audit_logs')
      .get();
      
    if (snapshot.empty) {
      console.log('No audit logs found.');
      return;
    }

    const logs: any[] = [];
    snapshot.forEach(doc => {
      logs.push(doc.data());
    });
    
    // Sort descending by timestamp
    logs.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));
    
    console.log(`Displaying top 20 logs:`);
    logs.slice(0, 20).forEach(d => {
      console.log(`[${d.timestamp?.toDate()?.toISOString()}] Action: ${d.action_type} by ${d.user_email || d.user_id}`);
      console.log(`  Description: ${d.description}`);
      console.log(`  Metadata:`, d.metadata);
    });

  } catch (error) {
    console.error(error);
  }
}
run();
