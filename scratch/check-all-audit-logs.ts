import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  try {
    const { adminDb } = await import('../lib/firebase/admin');
    
    const startTime = new Date('2026-08-05T20:30:00.000Z');
    const endTime = new Date('2026-08-05T20:45:00.000Z');
    
    console.log(`Querying audit logs between ${startTime.toISOString()} and ${endTime.toISOString()}...`);
    
    const snapshot = await adminDb.collection('audit_logs')
      .where('timestamp', '>=', startTime)
      .where('timestamp', '<=', endTime)
      .get();
      
    if (snapshot.empty) {
      console.log('No audit logs found in this time range.');
    } else {
      console.log(`Found ${snapshot.size} audit logs in time range:`);
      const logs: any[] = [];
      snapshot.forEach(doc => {
        logs.push(doc.data());
      });
      logs.sort((a, b) => (a.timestamp?.toDate() || 0) - (b.timestamp?.toDate() || 0));
      
      logs.forEach(d => {
        console.log(`[${d.timestamp?.toDate()?.toISOString()}] Action: ${d.action_type} by ${d.user_email || d.user_id}`);
        console.log(`  Description: ${d.description}`);
        console.log(`  Metadata:`, d.metadata);
      });
    }

    console.log('\nQuerying ALL audit logs of today (2026-08-05) to check for revert/finalization activities:');
    const todayStart = new Date('2026-08-05T00:00:00.000Z');
    const snapshotToday = await adminDb.collection('audit_logs')
      .where('timestamp', '>=', todayStart)
      .get();
      
    console.log(`Total logs today: ${snapshotToday.size}`);
    const todayLogs: any[] = [];
    snapshotToday.forEach(doc => {
      todayLogs.push(doc.data());
    });
    todayLogs.sort((a, b) => (a.timestamp?.toDate() || 0) - (b.timestamp?.toDate() || 0));
    todayLogs.forEach(d => {
      console.log(`[${d.timestamp?.toDate()?.toISOString()}] Action: ${d.action_type} - ${d.description}`);
    });

  } catch (error) {
    console.error(error);
  }
}
run();
