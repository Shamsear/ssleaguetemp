const { adminDb } = require('./lib/neon/admin-db-wrapper');

async function main() {
  const snapshot = await adminDb.collection('teams').orderBy('team_name').get();
  console.log('Total teams returned by adminDb:', snapshot.docs.length);
  const sample = snapshot.docs[0].data();
  console.log('Sample team doc keys:', Object.keys(sample));
  console.log('Sample team doc:', {
    id: snapshot.docs[0].id,
    team_name: sample.team_name,
    owner_uid: sample.owner_uid,
    userId: sample.userId,
    user_id: sample.user_id,
    owner_id: sample.owner_id,
    uid: sample.uid
  });

  // Check how many teams have NO userId/user_id/owner_id in sample
  let noUserId = 0;
  snapshot.docs.forEach(d => {
    const data = d.data();
    const u = data.userId || data.user_id || data.owner_id;
    const o = data.owner_uid || data.uid;
    if (!u && o) {
      console.log(`Team ${d.id} (${data.team_name}) has owner_uid: ${o} but NO userId/user_id/owner_id!`);
    }
    if (!u && !o) {
      console.log(`Team ${d.id} (${data.team_name}) has NO UID at all!`);
      noUserId++;
    }
  });
  console.log('Teams with NO UID at all:', noUserId);
}

main().catch(console.error);
