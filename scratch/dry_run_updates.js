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

async function dryRun() {
  const summary = [];

  // 1. MAIN_DB
  const mainSql = neon(envVars.NEON_MAIN_DB_URL);
  
  // realplayers
  const rpRows = await mainSql`
    SELECT id, name, display_name 
    FROM realplayers 
    WHERE id = 'sspslpsl0063' AND (name ILIKE '%adhil%' OR display_name ILIKE '%adhil%')
  `;
  summary.push({ db: 'MAIN_DB', table: 'realplayers', action: "Update name & display_name 'ADHIL' -> 'ADIL' (ID: sspslpsl0063)", count: rpRows.length });

  // teams
  const teamRows = await mainSql`
    SELECT id, team_name, owner_name 
    FROM teams 
    WHERE id = 'SSPSLT0010' AND owner_name ILIKE '%adhil%'
  `;
  summary.push({ db: 'MAIN_DB', table: 'teams', action: "Update owner_name 'ADHIL' -> 'ADIL' (Team: SSPSLT0010 / Varsity Soccers)", count: teamRows.length });

  // transactions
  const transRows = await mainSql`
    SELECT id, player_name, description 
    FROM transactions 
    WHERE (player_id LIKE '%sspslpsl0063%' OR player_name = 'ADHIL' OR description ILIKE '%adhil%')
       OR (player_id LIKE '%sspslpsl0024%' OR player_name = 'SHAMSEER' OR description ILIKE '%shamseer%')
  `;
  summary.push({ db: 'MAIN_DB', table: 'transactions', action: "Update player_name & description in transaction records", count: transRows.length });

  // 2. TOURNAMENT_DB
  const tourneySql = neon(envVars.NEON_TOURNAMENT_DB_URL);
  
  // realplayerstats
  const rpsRowsAdil = await tourneySql`
    SELECT id, season_id, player_name 
    FROM realplayerstats 
    WHERE player_id = 'sspslpsl0063' AND player_name ILIKE '%adhil%'
  `;
  summary.push({ db: 'TOURNAMENT_DB', table: 'realplayerstats', action: "Update player_name 'ADHIL' -> 'ADIL' (ID: sspslpsl0063)", count: rpsRowsAdil.length, seasons: rpsRowsAdil.map(r => r.season_id) });

  const rpsRowsShamsear = await tourneySql`
    SELECT id, season_id, player_name 
    FROM realplayerstats 
    WHERE player_id = 'sspslpsl0024' AND player_name ILIKE '%shamseer%'
  `;
  summary.push({ db: 'TOURNAMENT_DB', table: 'realplayerstats', action: "Update player_name 'SHAMSEER' -> 'SHAMSEAR' (ID: sspslpsl0024)", count: rpsRowsShamsear.length, seasons: rpsRowsShamsear.map(r => r.season_id) });

  // matchups
  const mRows = await tourneySql`
    SELECT id, season_id, home_player_name, away_player_name 
    FROM matchups 
    WHERE home_player_id IN ('sspslpsl0063', 'sspslpsl0024') 
       OR away_player_id IN ('sspslpsl0063', 'sspslpsl0024')
       OR home_player_name ILIKE '%adhil%' OR away_player_name ILIKE '%adhil%'
       OR home_player_name ILIKE '%shamseer%' OR away_player_name ILIKE '%shamseer%'
  `;
  summary.push({ db: 'TOURNAMENT_DB', table: 'matchups', action: "Update home/away player names in matchups", count: mRows.length });

  // player_awards
  const paRows = await tourneySql`
    SELECT id, player_name, season_id 
    FROM player_awards 
    WHERE player_id = 'sspslpsl0024' AND player_name ILIKE '%shamseer%'
  `;
  summary.push({ db: 'TOURNAMENT_DB', table: 'player_awards', action: "Update player_name 'Shamseer' -> 'Shamsear' (Award ID: 47)", count: paRows.length });

  // 3. FANTASY_DB
  const fanSql = neon(envVars.FANTASY_DATABASE_URL);
  
  // fantasy_players
  const fpRows = await fanSql`
    SELECT id, player_name, real_player_id 
    FROM fantasy_players 
    WHERE (real_player_id = 'sspslpsl0063' OR player_name ILIKE '%adhil%')
       OR (real_player_id = 'sspslpsl0024' OR player_name ILIKE '%shamseer%')
  `;
  summary.push({ db: 'FANTASY_DB', table: 'fantasy_players', action: "Update player_name to ADIL and SHAMSEAR", count: fpRows.length });

  // fantasy_squad
  const fsRows = await fanSql`
    SELECT id, player_name, real_player_id 
    FROM fantasy_squad 
    WHERE (real_player_id = 'sspslpsl0063' OR player_name ILIKE '%adhil%')
       OR (real_player_id = 'sspslpsl0024' OR player_name ILIKE '%shamseer%')
  `;
  summary.push({ db: 'FANTASY_DB', table: 'fantasy_squad', action: "Update player_name to ADIL and SHAMSEAR", count: fsRows.length });

  // fantasy_player_points
  const fppRows = await fanSql`
    SELECT count(*)::int as count 
    FROM fantasy_player_points 
    WHERE player_name ILIKE '%adhil%' OR player_name ILIKE '%shamseer%'
  `;
  summary.push({ db: 'FANTASY_DB', table: 'fantasy_player_points', action: "Update player_name to ADIL and SHAMSEAR in fantasy point logs", count: fppRows[0].count });

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

  // Firestore realplayers
  const fsRpDoc = await db.collection('realplayers').doc('sspslpsl0063').get();
  summary.push({
    db: 'FIRESTORE',
    collection: 'realplayers',
    action: "Update name & display_name 'ADHIL' -> 'ADIL' (Doc: sspslpsl0063)",
    count: fsRpDoc.exists && /adhil/i.test(fsRpDoc.data().name) ? 1 : 0
  });

  // Firestore teams
  const fsTeamDoc = await db.collection('teams').doc('SSPSLT0010').get();
  summary.push({
    db: 'FIRESTORE',
    collection: 'teams',
    action: "Update owner_name 'ADHIL' -> 'ADIL' (Doc: SSPSLT0010 / Varsity Soccers)",
    count: fsTeamDoc.exists && /adhil/i.test(fsTeamDoc.data().owner_name) ? 1 : 0
  });

  // Firestore notifications
  const notifSnap = await db.collection('notifications')
    .where('season_id', '==', 'SSPSLS18')
    .get();
  let notifCount = 0;
  notifSnap.forEach(d => {
    const data = d.data();
    if (/adhil|shamseer/i.test(data.message || '') || /adhil|shamseer/i.test(data.data?.player_name || '')) {
      notifCount++;
    }
  });
  summary.push({
    db: 'FIRESTORE',
    collection: 'notifications',
    action: "Update player assignment notifications (S18)",
    count: notifCount
  });

  // Firestore transactions
  const transSnap = await db.collection('transactions').get();
  let fsTransCount = 0;
  transSnap.forEach(d => {
    const data = d.data();
    if (data.player_id?.includes('sspslpsl0063') || data.player_id?.includes('sspslpsl0024')) {
      if (/adhil|shamseer/i.test(data.player_name || '') || /adhil|shamseer/i.test(data.description || '')) {
        fsTransCount++;
      }
    }
  });
  summary.push({
    db: 'FIRESTORE',
    collection: 'transactions',
    action: "Update player_name & description in S18 player assignment transactions",
    count: fsTransCount
  });

  console.log('=== DRY RUN SUMMARY ===');
  summary.forEach(s => {
    console.log(`[${s.db}] ${s.table || s.collection}: ${s.action} (Matches: ${s.count}${s.seasons ? `, Seasons: ${s.seasons.join(', ')}` : ''})`);
  });
}

dryRun().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
