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

async function executeUpdates() {
  console.log('=====================================================');
  console.log('STARTING DATABASE UPDATES TO "ADIL" AND "SHAMSEAR"');
  console.log('=====================================================');

  // ==========================================
  // 1. MAIN_DB
  // ==========================================
  console.log('\n--- Updating MAIN_DB ---');
  const mainSql = neon(envVars.NEON_MAIN_DB_URL);

  // realplayers: sspslpsl0063
  const rpRes = await mainSql`
    UPDATE realplayers
    SET name = 'ADIL',
        display_name = 'ADIL',
        raw_data = jsonb_set(
          jsonb_set(
            COALESCE(raw_data::jsonb, '{}'::jsonb),
            '{name}',
            '"ADIL"'
          ),
          '{display_name}',
          '"ADIL"'
        ),
        updated_at = NOW()
    WHERE id = 'sspslpsl0063'
    RETURNING id, name, display_name;
  `;
  console.log(`[MAIN_DB] realplayers updated: ${rpRes.length} row(s) ->`, rpRes);

  // teams: SSPSLT0010 (Varsity Soccers)
  const teamRes = await mainSql`
    UPDATE teams
    SET owner_name = 'ADIL',
        raw_data = jsonb_set(
          COALESCE(raw_data::jsonb, '{}'::jsonb),
          '{owner_name}',
          '"ADIL"'
        ),
        updated_at = NOW()
    WHERE id = 'SSPSLT0010'
    RETURNING id, team_name, owner_name;
  `;
  console.log(`[MAIN_DB] teams updated: ${teamRes.length} row(s) ->`, teamRes);

  // transactions: ADHIL -> ADIL
  const transAdilRes = await mainSql`
    UPDATE transactions
    SET player_name = 'ADIL',
        description = REPLACE(description, 'ADHIL', 'ADIL'),
        raw_data = jsonb_set(
          jsonb_set(
            COALESCE(raw_data::jsonb, '{}'::jsonb),
            '{player_name}',
            '"ADIL"'
          ),
          '{description}',
          to_jsonb(REPLACE(COALESCE(raw_data->>'description', ''), 'ADHIL', 'ADIL'))
        )
    WHERE player_id LIKE '%sspslpsl0063%' OR player_name = 'ADHIL' OR description ILIKE '%ADHIL%'
    RETURNING id, player_name, description;
  `;
  console.log(`[MAIN_DB] transactions (ADIL) updated: ${transAdilRes.length} row(s)`);

  // transactions: SHAMSEER -> SHAMSEAR
  const transShamRes = await mainSql`
    UPDATE transactions
    SET player_name = 'SHAMSEAR',
        description = REPLACE(description, 'SHAMSEER', 'SHAMSEAR'),
        raw_data = jsonb_set(
          jsonb_set(
            COALESCE(raw_data::jsonb, '{}'::jsonb),
            '{player_name}',
            '"SHAMSEAR"'
          ),
          '{description}',
          to_jsonb(REPLACE(COALESCE(raw_data->>'description', ''), 'SHAMSEER', 'SHAMSEAR'))
        )
    WHERE player_id LIKE '%sspslpsl0024%' OR player_name = 'SHAMSEER' OR description ILIKE '%SHAMSEER%'
    RETURNING id, player_name, description;
  `;
  console.log(`[MAIN_DB] transactions (SHAMSEAR) updated: ${transShamRes.length} row(s)`);


  // ==========================================
  // 2. TOURNAMENT_DB
  // ==========================================
  console.log('\n--- Updating TOURNAMENT_DB ---');
  const tourneySql = neon(envVars.NEON_TOURNAMENT_DB_URL);

  // realplayerstats: sspslpsl0063 -> ADIL
  const rpsAdilRes = await tourneySql`
    UPDATE realplayerstats
    SET player_name = 'ADIL',
        updated_at = NOW()
    WHERE player_id = 'sspslpsl0063' AND player_name != 'ADIL'
    RETURNING id, season_id, player_name;
  `;
  console.log(`[TOURNAMENT_DB] realplayerstats (ADIL) updated: ${rpsAdilRes.length} row(s) across seasons:`, rpsAdilRes.map(r => r.season_id).join(', '));

  // realplayerstats: sspslpsl0024 -> SHAMSEAR
  const rpsShamRes = await tourneySql`
    UPDATE realplayerstats
    SET player_name = 'SHAMSEAR',
        updated_at = NOW()
    WHERE player_id = 'sspslpsl0024' AND player_name != 'SHAMSEAR'
    RETURNING id, season_id, player_name;
  `;
  console.log(`[TOURNAMENT_DB] realplayerstats (SHAMSEAR) updated: ${rpsShamRes.length} row(s) across seasons:`, rpsShamRes.map(r => r.season_id).join(', '));

  // matchups: home_player & away_player for Adil
  const mAdilHome = await tourneySql`
    UPDATE matchups
    SET home_player_name = 'ADIL'
    WHERE home_player_id = 'sspslpsl0063' OR home_player_name ILIKE '%ADHIL%'
    RETURNING id;
  `;
  const mAdilAway = await tourneySql`
    UPDATE matchups
    SET away_player_name = 'ADIL'
    WHERE away_player_id = 'sspslpsl0063' OR away_player_name ILIKE '%ADHIL%'
    RETURNING id;
  `;
  console.log(`[TOURNAMENT_DB] matchups (ADIL) updated: home=${mAdilHome.length}, away=${mAdilAway.length}`);

  // matchups: home_player & away_player for Shamsear
  const mShamHome = await tourneySql`
    UPDATE matchups
    SET home_player_name = 'SHAMSEAR'
    WHERE home_player_id = 'sspslpsl0024' OR home_player_name ILIKE '%SHAMSEER%'
    RETURNING id;
  `;
  const mShamAway = await tourneySql`
    UPDATE matchups
    SET away_player_name = 'SHAMSEAR'
    WHERE away_player_id = 'sspslpsl0024' OR away_player_name ILIKE '%SHAMSEER%'
    RETURNING id;
  `;
  console.log(`[TOURNAMENT_DB] matchups (SHAMSEAR) updated: home=${mShamHome.length}, away=${mShamAway.length}`);

  // player_awards: Shamseer -> Shamsear
  const paRes = await tourneySql`
    UPDATE player_awards
    SET player_name = 'Shamsear',
        updated_at = NOW()
    WHERE player_id = 'sspslpsl0024' AND player_name != 'Shamsear'
    RETURNING id, player_name, season_id;
  `;
  console.log(`[TOURNAMENT_DB] player_awards updated: ${paRes.length} row(s) ->`, paRes);


  // ==========================================
  // 3. FANTASY_DB
  // ==========================================
  console.log('\n--- Updating FANTASY_DB ---');
  const fanSql = neon(envVars.FANTASY_DATABASE_URL);

  // fantasy_players
  const fpAdil = await fanSql`
    UPDATE fantasy_players
    SET player_name = 'ADIL'
    WHERE real_player_id = 'sspslpsl0063' OR player_name ILIKE '%adhil%'
    RETURNING id, player_name;
  `;
  const fpSham = await fanSql`
    UPDATE fantasy_players
    SET player_name = 'SHAMSEAR'
    WHERE real_player_id = 'sspslpsl0024' OR player_name ILIKE '%shamseer%'
    RETURNING id, player_name;
  `;
  console.log(`[FANTASY_DB] fantasy_players updated: ADIL=${fpAdil.length}, SHAMSEAR=${fpSham.length}`);

  // fantasy_squad
  const fsAdil = await fanSql`
    UPDATE fantasy_squad
    SET player_name = 'ADIL'
    WHERE real_player_id = 'sspslpsl0063' OR player_name ILIKE '%adhil%'
    RETURNING id, player_name;
  `;
  const fsSham = await fanSql`
    UPDATE fantasy_squad
    SET player_name = 'SHAMSEAR'
    WHERE real_player_id = 'sspslpsl0024' OR player_name ILIKE '%shamseer%'
    RETURNING id, player_name;
  `;
  console.log(`[FANTASY_DB] fantasy_squad updated: ADIL=${fsAdil.length}, SHAMSEAR=${fsSham.length}`);

  // fantasy_player_points
  const fppAdil = await fanSql`
    UPDATE fantasy_player_points
    SET player_name = 'ADIL'
    WHERE player_name ILIKE '%adhil%' OR (fantasy_player_id IN (SELECT id FROM fantasy_players WHERE real_player_id = 'sspslpsl0063'))
    RETURNING id;
  `;
  const fppSham = await fanSql`
    UPDATE fantasy_player_points
    SET player_name = 'SHAMSEAR'
    WHERE player_name ILIKE '%shamseer%' OR (fantasy_player_id IN (SELECT id FROM fantasy_players WHERE real_player_id = 'sspslpsl0024'))
    RETURNING id;
  `;
  console.log(`[FANTASY_DB] fantasy_player_points updated: ADIL=${fppAdil.length}, SHAMSEAR=${fppSham.length}`);


  // ==========================================
  // 4. FIRESTORE
  // ==========================================
  console.log('\n--- Updating FIRESTORE ---');
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

  // Firestore realplayers/sspslpsl0063
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

  // Firestore teams/SSPSLT0010
  const fsTeamRef = db.collection('teams').doc('SSPSLT0010');
  const fsTeamDoc = await fsTeamRef.get();
  if (fsTeamDoc.exists) {
    await fsTeamRef.update({
      owner_name: 'ADIL',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('[FIRESTORE] teams/SSPSLT0010 owner_name updated to ADIL');
  }

  // Firestore notifications
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

  // Firestore transactions
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
  console.log('ALL UPDATES SUCCESSFULLY COMPLETED!');
  console.log('=====================================================');
}

executeUpdates().then(() => process.exit(0)).catch(e => {
  console.error('Update execution error:', e);
  process.exit(1);
});
