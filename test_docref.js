const { adminDb } = require('./lib/neon/admin-db-wrapper');

async function testDocRef() {
  const docRef = adminDb.collection('team_seasons').doc('test_id');
  console.log('docRef keys:', Object.keys(docRef));
  console.log('docRef.id:', docRef.id);
  console.log('docRef.path:', docRef.path);
  console.log('docRef.parent.id:', docRef.parent?.id);
  console.log('docRef.parent.path:', docRef.parent?.path);
}

testDocRef().catch(console.error);
