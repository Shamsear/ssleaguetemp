const admin = require('firebase-admin');
const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

// Initialize Firebase Admin
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
} else if (projectId) {
  admin.initializeApp({ projectId: projectId });
} else {
  admin.initializeApp();
}
const db = admin.firestore();

// Connect to both Neon databases
const tournamentSql = neon(process.env.NEON_TOURNAMENT_DB_URL);
const auctionConnectionString = process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
const auctionSql = auctionConnectionString ? neon(auctionConnectionString) : null;

async function runMasterSync() {
  try {
    const teamGlobalMap = new Map();
    const teamSeasonMap = new Map();

    console.log("=== 1. FETCHING & CAPITALIZING FIRESTORE TEAMS ===");
    const teamsSnap = await db.collection('teams').get();
    for (const doc of teamsSnap.docs) {
      const data = doc.data();
      const rawName = data.name || data.teamName || '';
      if (rawName) {
        const upperName = rawName.toUpperCase();
        teamGlobalMap.set(doc.id, upperName);
        if (rawName !== upperName) {
          console.log(`Firestore [teams] ${doc.id}: "${rawName}" -> "${upperName}"`);
          const updates = {};
          if (data.name) updates.name = upperName;
          if (data.teamName) updates.teamName = upperName;
          await doc.ref.update(updates);
        }
      }
    }

    console.log("\n=== 2. FETCHING & CAPITALIZING FIRESTORE TEAM_SEASONS ===");
    const tsSnap = await db.collection('team_seasons').get();
    for (const doc of tsSnap.docs) {
      const data = doc.data();
      const rawName = data.team_name || '';
      if (rawName) {
        const upperName = rawName.toUpperCase();
        const teamId = data.team_id || doc.id.split('_')[0];
        const seasonId = data.season_id || doc.id.split('_')[1];
        
        if (teamId && seasonId) {
          teamSeasonMap.set(`${teamId}_${seasonId}`, upperName);
          teamGlobalMap.set(teamId, upperName);
        }
        
        if (rawName !== upperName) {
          console.log(`Firestore [team_seasons] ${doc.id}: "${rawName}" -> "${upperName}"`);
          await doc.ref.update({ team_name: upperName });
        }
      }
    }

    console.log("\n=== 3. FETCHING FALLBACK NAMES FROM TOURNAMENT DB TEAMSTATS ===");
    try {
      const teamStatsRows = await tournamentSql`
        SELECT DISTINCT team_id, team_name, season_id 
        FROM teamstats 
        WHERE team_name IS NOT NULL AND team_name != ''
      `;
      console.log(`Fetched ${teamStatsRows.length} team names from tournament teamstats.`);
      teamStatsRows.forEach(row => {
        const upperName = row.team_name.toUpperCase();
        const key = `${row.team_id}_${row.season_id}`;
        if (!teamSeasonMap.has(key)) {
          teamSeasonMap.set(key, upperName);
        }
        if (!teamGlobalMap.has(row.team_id)) {
          teamGlobalMap.set(row.team_id, upperName);
        }
      });
    } catch (e) {
      console.error("Warning reading fallback teamstats:", e.message);
    }

    console.log("\n=== 4. UPDATING TOURNAMENT DATABASE ===");

    // Awards
    try {
      const rows = await tournamentSql`SELECT id, team_id, team_name FROM awards WHERE team_id IS NOT NULL`;
      let count = 0;
      for (const row of rows) {
        const name = teamGlobalMap.get(row.team_id);
        if (name && row.team_name !== name) {
          await tournamentSql`UPDATE awards SET team_name = ${name} WHERE id = ${row.id}`;
          count++;
        }
      }
      console.log(`Updated ${count} awards rows.`);
    } catch(e) { console.error("Error updating awards:", e.message); }

    // Fixtures (home & away)
    try {
      const rows = await tournamentSql`SELECT id, home_team_id, away_team_id, home_team_name, away_team_name FROM fixtures`;
      let count = 0;
      for (const row of rows) {
        let updated = false;
        const homeName = teamGlobalMap.get(row.home_team_id);
        const awayName = teamGlobalMap.get(row.away_team_id);
        let currentHome = row.home_team_name;
        let currentAway = row.away_team_name;
        
        if (homeName && currentHome !== homeName) {
          currentHome = homeName;
          updated = true;
        }
        if (awayName && currentAway !== awayName) {
          currentAway = awayName;
          updated = true;
        }
        if (updated) {
          await tournamentSql`UPDATE fixtures SET home_team_name = ${currentHome}, away_team_name = ${currentAway} WHERE id = ${row.id}`;
          count++;
        }
      }
      console.log(`Updated ${count} fixtures rows.`);
    } catch(e) { console.error("Error updating fixtures:", e.message); }

    // Matchups (home & away)
    try {
      const rows = await tournamentSql`SELECT id, home_team_id, away_team_id, home_team_name, away_team_name FROM matchups`;
      let count = 0;
      for (const row of rows) {
        let updated = false;
        const homeName = teamGlobalMap.get(row.home_team_id);
        const awayName = teamGlobalMap.get(row.away_team_id);
        let currentHome = row.home_team_name;
        let currentAway = row.away_team_name;
        
        if (homeName && currentHome !== homeName) {
          currentHome = homeName;
          updated = true;
        }
        if (awayName && currentAway !== awayName) {
          currentAway = awayName;
          updated = true;
        }
        if (updated) {
          await tournamentSql`UPDATE matchups SET home_team_name = ${currentHome}, away_team_name = ${currentAway} WHERE id = ${row.id}`;
          count++;
        }
      }
      console.log(`Updated ${count} matchups rows.`);
    } catch(e) { console.error("Error updating matchups:", e.message); }

    // player_seasons
    try {
      const rows = await tournamentSql`SELECT id, team_id, team, season_id FROM player_seasons WHERE team_id IS NOT NULL`;
      let count = 0;
      for (const row of rows) {
        const name = teamSeasonMap.get(`${row.team_id}_${row.season_id}`) || teamGlobalMap.get(row.team_id);
        if (name && row.team !== name) {
          await tournamentSql`UPDATE player_seasons SET team = ${name} WHERE id = ${row.id}`;
          count++;
        }
      }
      console.log(`Updated ${count} player_seasons rows.`);
    } catch(e) { console.error("Error updating player_seasons:", e.message); }

    // realplayerstats
    try {
      const rows = await tournamentSql`SELECT id, team_id, team, season_id FROM realplayerstats WHERE team_id IS NOT NULL`;
      let count = 0;
      for (const row of rows) {
        const name = teamSeasonMap.get(`${row.team_id}_${row.season_id}`) || teamGlobalMap.get(row.team_id);
        if (name && row.team !== name) {
          await tournamentSql`UPDATE realplayerstats SET team = ${name} WHERE id = ${row.id}`;
          count++;
        }
      }
      console.log(`Updated ${count} realplayerstats rows.`);
    } catch(e) { console.error("Error updating realplayerstats:", e.message); }

    // team_trophies
    try {
      const rows = await tournamentSql`SELECT id, team_id, team_name FROM team_trophies WHERE team_id IS NOT NULL`;
      let count = 0;
      for (const row of rows) {
        const name = teamGlobalMap.get(row.team_id);
        if (name && row.team_name !== name) {
          await tournamentSql`UPDATE team_trophies SET team_name = ${name} WHERE id = ${row.id}`;
          count++;
        }
      }
      console.log(`Updated ${count} team_trophies rows.`);
    } catch(e) { console.error("Error updating team_trophies:", e.message); }

    // teamstats
    try {
      const rows = await tournamentSql`SELECT team_id, team_name, season_id FROM teamstats WHERE team_id IS NOT NULL`;
      let count = 0;
      for (const row of rows) {
        const name = teamSeasonMap.get(`${row.team_id}_${row.season_id}`) || teamGlobalMap.get(row.team_id);
        if (name && row.team_name !== name) {
          await tournamentSql`UPDATE teamstats SET team_name = ${name} WHERE team_id = ${row.team_id} AND season_id = ${row.season_id}`;
          count++;
        }
      }
      console.log(`Updated ${count} teamstats rows.`);
    } catch(e) { console.error("Error updating teamstats:", e.message); }

    // tournament_penalties
    try {
      const rows = await tournamentSql`SELECT id, team_id, team_name FROM tournament_penalties WHERE team_id IS NOT NULL`;
      let count = 0;
      for (const row of rows) {
        const name = teamGlobalMap.get(row.team_id);
        if (name && row.team_name !== name) {
          await tournamentSql`UPDATE tournament_penalties SET team_name = ${name} WHERE id = ${row.id}`;
          count++;
        }
      }
      console.log(`Updated ${count} tournament_penalties rows.`);
    } catch(e) { console.error("Error updating tournament_penalties:", e.message); }


    if (auctionSql) {
      console.log("\n=== 5. UPDATING AUCTION DATABASE ===");

      // footballplayers
      try {
        const rows = await auctionSql`SELECT id, team_id, team_name FROM footballplayers WHERE team_id IS NOT NULL`;
        let count = 0;
        for (const row of rows) {
          const name = teamGlobalMap.get(row.team_id);
          if (name && row.team_name !== name) {
            await auctionSql`UPDATE footballplayers SET team_name = ${name} WHERE id = ${row.id}`;
            count++;
          }
        }
        console.log(`Updated ${count} footballplayers rows.`);
      } catch(e) { console.error("Error updating footballplayers:", e.message); }

      // bulk_tiebreaker_bids
      try {
        const rows = await auctionSql`SELECT id, team_id, team_name FROM bulk_tiebreaker_bids WHERE team_id IS NOT NULL`;
        let count = 0;
        for (const row of rows) {
          const name = teamGlobalMap.get(row.team_id);
          if (name && row.team_name !== name) {
            await auctionSql`UPDATE bulk_tiebreaker_bids SET team_name = ${name} WHERE id = ${row.id}`;
            count++;
          }
        }
        console.log(`Updated ${count} bulk_tiebreaker_bids rows.`);
      } catch(e) { console.error("Error updating bulk_tiebreaker_bids:", e.message); }

      // bulk_tiebreaker_teams
      try {
        const rows = await auctionSql`SELECT id, team_id, team_name FROM bulk_tiebreaker_teams WHERE team_id IS NOT NULL`;
        let count = 0;
        for (const row of rows) {
          const name = teamGlobalMap.get(row.team_id);
          if (name && row.team_name !== name) {
            await auctionSql`UPDATE bulk_tiebreaker_teams SET team_name = ${name} WHERE id = ${row.id}`;
            count++;
          }
        }
        console.log(`Updated ${count} bulk_tiebreaker_teams rows.`);
      } catch(e) { console.error("Error updating bulk_tiebreaker_teams:", e.message); }

      // pending_allocations
      try {
        const rows = await auctionSql`SELECT id, team_id, team_name FROM pending_allocations WHERE team_id IS NOT NULL`;
        let count = 0;
        for (const row of rows) {
          const name = teamGlobalMap.get(row.team_id);
          if (name && row.team_name !== name) {
            await auctionSql`UPDATE pending_allocations SET team_name = ${name} WHERE id = ${row.id}`;
            count++;
          }
        }
        console.log(`Updated ${count} pending_allocations rows.`);
      } catch(e) { console.error("Error updating pending_allocations:", e.message); }

      // player_history
      try {
        const rows = await auctionSql`SELECT id, team_id, team_name FROM player_history WHERE team_id IS NOT NULL`;
        let count = 0;
        for (const row of rows) {
          const name = teamGlobalMap.get(row.team_id);
          if (name && row.team_name !== name) {
            await auctionSql`UPDATE player_history SET team_name = ${name} WHERE id = ${row.id}`;
            count++;
          }
        }
        console.log(`Updated ${count} player_history rows.`);
      } catch(e) { console.error("Error updating player_history:", e.message); }

      // bids
      try {
        const rows = await auctionSql`SELECT id, team_id, team_name FROM bids WHERE team_id IS NOT NULL`;
        let count = 0;
        for (const row of rows) {
          const name = teamGlobalMap.get(row.team_id);
          if (name && row.team_name !== name) {
            await auctionSql`UPDATE bids SET team_name = ${name} WHERE id = ${row.id}`;
            count++;
          }
        }
        console.log(`Updated ${count} bids rows.`);
      } catch(e) { console.error("Error updating bids:", e.message); }

      // round_bids
      try {
        const rows = await auctionSql`SELECT id, team_id, team_name FROM round_bids WHERE team_id IS NOT NULL`;
        let count = 0;
        for (const row of rows) {
          const name = teamGlobalMap.get(row.team_id);
          if (name && row.team_name !== name) {
            await auctionSql`UPDATE round_bids SET team_name = ${name} WHERE id = ${row.id}`;
            count++;
          }
        }
        console.log(`Updated ${count} round_bids rows.`);
      } catch(e) { console.error("Error updating round_bids:", e.message); }

      // team_tiebreakers
      try {
        const rows = await auctionSql`SELECT id, team_id, team_name FROM team_tiebreakers WHERE team_id IS NOT NULL`;
        let count = 0;
        for (const row of rows) {
          const name = teamGlobalMap.get(row.team_id);
          if (name && row.team_name !== name) {
            await auctionSql`UPDATE team_tiebreakers SET team_name = ${name} WHERE id = ${row.id}`;
            count++;
          }
        }
        console.log(`Updated ${count} team_tiebreakers rows.`);
      } catch(e) { console.error("Error updating team_tiebreakers:", e.message); }

    } else {
      console.log("\n⚠️ Auction database URL not found. Skipping Auction DB updates.");
    }

    console.log("\n⭐ MASTER SYNCHRONIZATION COMPLETED SUCCESSFULLY!");
  } catch (err) {
    console.error("FATAL MASTER SYNC ERROR:", err);
  }
}
runMasterSync();
