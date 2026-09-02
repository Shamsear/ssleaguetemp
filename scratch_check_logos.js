process.env.FIREBASE_DATABASE_URL = "https://eaguedemo-default-rtdb.asia-southeast1.firebasedatabase.app/";
process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL = "https://eaguedemo-default-rtdb.asia-southeast1.firebasedatabase.app/";
process.env.FIREBASE_ADMIN_PROJECT_ID = "eaguedemo";

const { adminDb } = require('./lib/neon/admin-db-wrapper');

(async () => {
  try {
    console.log('=== FIREBASE TEAMS ===');
    const fbSnap = await adminDb.collection('teams').get();
    console.log('Total FB teams:', fbSnap.docs.length);
    fbSnap.docs.forEach(doc => {
      const d = doc.data();
      console.log(doc.id, d.name || d.team_name, d.team_logo || d.logo_url || d.logoUrl);
    });

    console.log('=== FIREBASE TEAM_SEASONS ===');
    const fbTSSnap = await adminDb.collection('team_seasons').get();
    console.log('Total FB team_seasons:', fbTSSnap.docs.length);
    fbTSSnap.docs.forEach(doc => {
      const d = doc.data();
      console.log(doc.id, d.team_name, d.team_logo || d.logo_url);
    });

  } catch(e) {
    console.error(e);
  }
  process.exit(0);
})();
