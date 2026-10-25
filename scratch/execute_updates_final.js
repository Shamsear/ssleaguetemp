const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
const admin = require('firebase-admin');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const envVars = {};
env.split('\n').forEach(l => {
  const idx = l.indexOf('=');
  if (idx !== -1) envVars[l.substring(0, idx).trim()] = l.substring(idx+1).trim().replace(/^["']|["']$/g, '');
});

async function runRemaining() {
  console.log('=====================================================');
  console.log('UPDATING FANTASY_PLAYER_POINTS & FIRESTORE');
  console.log('=====================================================');

  // FANTASY_DB fantasy_player_points
  const fanSql = neon(envVars.FANTASY_DATABASE_URL);
  
  const fppAdil = await fanSql`
    UPDATE fantasy_player_points
    SET player_name = 'ADIL'
    WHERE real_player_id = 'sspslpsl0063' OR player_name ILIKE '%adhil%'
    RETURNING id;
  `;
  console.log(`[FANTASY_DB] fantasy_player_points (ADIL) updated: ${fppAdil.length} rows`);

  const fppSham = await fanSql`
    UPDATE fantasy_player_points
    SET player_name = 'SHAMSEAR'
    WHERE real_player_id = 'sspslpsl0024' OR player_name ILIKE '%shamseer%'
    RETURNING id;
  `;
  console.log(`[FANTASY_DB] fantasy_player_points (SHAMSEAR) updated: ${fppSham.length} rows`);

  // FIRESTORE
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: envVars.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: envVars.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: envVars.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
  const db = admin.firestore();

  // 1. realplayers/sspslpsl0063
  const fsRpRef = db.collection('realplayers').doc('sspslpsl0063');
  const fsRpDoc = await fsRpRef.get();
  if (fsRpDoc.exists) {
    await fsRpRef.update({
      name: 'ADIL',
      display_name: 'ADIL',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('[FIRESTORE] realplayers/sspslpsl0063 updated to ADIL');
  }

  // 2. teams/SSPSLT0010 (Varsity Soccers)
  const fsTeamRef = db.collection('teams').doc('SSPSLT0010');
  const fsTeamDoc = await fsTeamRef.get();
  if (fsTeamDoc.exists) {
    await fsTeamRef.update({
      owner_name: 'ADIL',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('[FIRESTORE] teams/SSPSLT0010 owner_name updated to ADIL');
  }

  // 3. notifications
  const notifSnap = await db.collection('notifications')
    .where('season_id', '==', 'SSPSLS18')
    .get();
  let notifsUpdated = 0;
  for (const doc of notifSnap.docs) {
    const data = doc.data();
    let updated = false;
    const updateData = {};
    if (data.message && /adhil/i.test(data.message)) {
      updateData.message = data.message.replace(/adhil/gi, 'ADIL');
      updated = true;
    }
    if (data.message && /shamseer/i.test(data.message)) {
      updateData.message = data.message.replace(/shamseer/gi, 'SHAMSEAR');
      updated = true;
    }
    if (data.data?.player_name && /adhil/i.test(data.data.player_name)) {
      updateData['data.player_name'] = 'ADIL';
      updated = true;
    }
    if (data.data?.player_name && /shamseer/i.test(data.data.player_name)) {
      updateData['data.player_name'] = 'SHAMSEAR';
      updated = true;
    }
    if (updated) {
      await doc.ref.update(updateData);
      notifsUpdated++;
    }
  }
  console.log(`[FIRESTORE] notifications updated: ${notifsUpdated} document(s)`);

  // 4. transactions
  const transSnap = await db.collection('transactions').get();
  let transUpdated = 0;
  for (const doc of transSnap.docs) {
    const data = doc.data();
    if (data.player_id?.includes('sspslpsl0063') || data.player_name === 'ADHIL' || (data.description && /adhil/i.test(data.description))) {
      const updateData = {
        player_name: 'ADIL',
        description: data.description ? data.description.replace(/adhil/gi, 'ADIL') : 'ADIL assignment',
      };
      await doc.ref.update(updateData);
      transUpdated++;
    } else if (data.player_id?.includes('sspslpsl0024') || data.player_name === 'SHAMSEER' || (data.description && /shamseer/i.test(data.description))) {
      const updateData = {
        player_name: 'SHAMSEAR',
        description: data.description ? data.description.replace(/shamseer/gi, 'SHAMSEAR') : 'SHAMSEAR assignment',
      };
      await doc.ref.update(updateData);
      transUpdated++;
    }
  }
  console.log(`[FIRESTORE] transactions updated: ${transUpdated} document(s)`);

  console.log('\n=====================================================');
  console.log('ALL REMAINING UPDATES FINISHED!');
  console.log('=====================================================');
}

runRemaining().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
