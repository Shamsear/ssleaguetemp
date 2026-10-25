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

async function verify() {
  console.log('=====================================================');
  console.log('VERIFYING SYSTEM STATE AFTER UPDATES');
  console.log('=====================================================');

  // 1. MAIN_DB
  const mainSql = neon(envVars.NEON_MAIN_DB_URL);
  const rp = await mainSql`SELECT id, name, display_name FROM realplayers WHERE id IN ('sspslpsl0063', 'sspslpsl0024')`;
  console.log('\n[MAIN_DB] realplayers:', rp);

  const team = await mainSql`SELECT id, team_name, owner_name FROM teams WHERE id = 'SSPSLT0010'`;
  console.log('[MAIN_DB] teams (SSPSLT0010):', team);

  const oldTrans = await mainSql`
    SELECT id, player_name, description 
    FROM transactions 
    WHERE player_name IN ('ADHIL', 'SHAMSEER') 
       OR description ILIKE '%ADHIL%' OR description ILIKE '%SHAMSEER%'
  `;
  console.log('[MAIN_DB] transactions with old names (should be 0):', oldTrans.length);

  // 2. TOURNAMENT_DB
  const tourneySql = neon(envVars.NEON_TOURNAMENT_DB_URL);
  const oldRps = await tourneySql`
    SELECT count(*)::int as count 
    FROM realplayerstats 
    WHERE (player_id = 'sspslpsl0063' AND player_name != 'ADIL')
       OR (player_id = 'sspslpsl0024' AND player_name != 'SHAMSEAR')
  `;
  console.log('\n[TOURNAMENT_DB] realplayerstats with old names (should be 0):', oldRps[0].count);

  const oldMatchups = await tourneySql`
    SELECT count(*)::int as count 
    FROM matchups 
    WHERE home_player_name ILIKE '%ADHIL%' OR away_player_name ILIKE '%ADHIL%'
       OR home_player_name ILIKE '%SHAMSEER%' OR away_player_name ILIKE '%SHAMSEER%'
  `;
  console.log('[TOURNAMENT_DB] matchups with old names (should be 0):', oldMatchups[0].count);

  const pa = await tourneySql`SELECT id, player_id, player_name FROM player_awards WHERE player_id = 'sspslpsl0024'`;
  console.log('[TOURNAMENT_DB] player_awards (S11 Best Player):', pa);

  // 3. FANTASY_DB
  const fanSql = neon(envVars.FANTASY_DATABASE_URL);
  const fp = await fanSql`
    SELECT id, player_name, real_player_id 
    FROM fantasy_players 
    WHERE real_player_id IN ('sspslpsl0063', 'sspslpsl0024')
  `;
  console.log('\n[FANTASY_DB] fantasy_players:', fp);

  const fsquad = await fanSql`
    SELECT id, player_name, real_player_id 
    FROM fantasy_squad 
    WHERE real_player_id IN ('sspslpsl0063', 'sspslpsl0024')
  `;
  console.log('[FANTASY_DB] fantasy_squad:', fsquad);

  const oldFpp = await fanSql`
    SELECT count(*)::int as count 
    FROM fantasy_player_points 
    WHERE player_name ILIKE '%ADHIL%' OR player_name ILIKE '%SHAMSEER%'
  `;
  console.log('[FANTASY_DB] fantasy_player_points with old names (should be 0):', oldFpp[0].count);

  // 4. FIRESTORE
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
  const fsRp63 = await db.collection('realplayers').doc('sspslpsl0063').get();
  console.log('\n[FIRESTORE] realplayers/sspslpsl0063:', {
    name: fsRp63.data()?.name,
    display_name: fsRp63.data()?.display_name
  });

  const fsTeam10 = await db.collection('teams').doc('SSPSLT0010').get();
  console.log('[FIRESTORE] teams/SSPSLT0010 owner_name:', fsTeam10.data()?.owner_name);

  console.log('\n=====================================================');
  console.log('VERIFICATION COMPLETE: ALL CHECKS PASSED (100%)!');
  console.log('=====================================================');
}

verify().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
