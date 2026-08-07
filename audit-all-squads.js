require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
  } else {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    admin.initializeApp({ projectId });
  }
}

const db = admin.firestore();
const sql = neon(process.env.NEON_DATABASE_URL);

const seasonId = 'SSPSLS18';

async function auditAllSquads() {
  try {
    console.log(`🔍 Auditing squad composition for all teams in season ${seasonId}...\n`);

    // 1. Fetch all registered teams for season S18 from Firebase
    const teamSeasonsSnapshot = await db
      .collection('team_seasons')
      .where('season_id', '==', seasonId)
      .get();

    console.log(`Found ${teamSeasonsSnapshot.size} teams registered in Firestore for ${seasonId}.\n`);

    const auditResults = [];
    let mismatchCount = 0;

    for (const doc of teamSeasonsSnapshot.docs) {
      const teamSeasonData = doc.data();
      const teamId = teamSeasonData.team_id;
      const teamName = teamSeasonData.team_name || 'Unknown Team';
      const firebaseCount = teamSeasonData.players_count || 0;
      const firebasePositions = teamSeasonData.position_counts || {};

      // 2. Fetch actual active squad list from Neon footballplayers
      const players = await sql`
        SELECT id, name, position
        FROM footballplayers
        WHERE team_id = ${teamId} 
          AND is_sold = true 
          AND season_id = ${seasonId}
      `;

      const actualCount = players.length;

      // Recalculate true position counts
      const truePositions = {
        GK: 0, CB: 0, LB: 0, RB: 0,
        DMF: 0, CMF: 0, AMF: 0, LMF: 0, RMF: 0,
        LWF: 0, RWF: 0, SS: 0, CF: 0
      };

      players.forEach(p => {
        if (p.position && truePositions[p.position] !== undefined) {
          truePositions[p.position]++;
        }
      });

      // 3. Compare count and position counts
      let isMismatch = false;
      if (firebaseCount !== actualCount) {
        isMismatch = true;
      } else {
        // Compare position counts
        for (const pos of Object.keys(truePositions)) {
          if ((firebasePositions[pos] || 0) !== truePositions[pos]) {
            isMismatch = true;
            break;
          }
        }
      }

      auditResults.push({
        teamId,
        teamName,
        firebaseCount,
        actualCount,
        isMismatch
      });

      if (isMismatch) {
        mismatchCount++;
        console.log(`❌ Mismatch found for ${teamName} (${teamId}):`);
        console.log(`   - Firestore Player Count: ${firebaseCount} | Actual Count: ${actualCount}`);
        
        // Print difference in positions
        const differences = [];
        for (const pos of Object.keys(truePositions)) {
          const fbVal = firebasePositions[pos] || 0;
          const trueVal = truePositions[pos];
          if (fbVal !== trueVal) {
            differences.push(`${pos}: Firestore=${fbVal} / Actual=${trueVal}`);
          }
        }
        console.log(`   - Position differences: ${differences.join(', ')}`);
        
        // 4. Update both databases to match true values
        console.log(`   ⚙️  Correcting counts in databases...`);
        
        // Update Postgres team player count
        await sql`
          UPDATE teams
          SET football_players_count = ${actualCount},
              updated_at = NOW()
          WHERE id = ${teamId} AND season_id = ${seasonId}
        `;
        
        // Update Firestore team_seasons document
        await doc.ref.update({
          players_count: actualCount,
          position_counts: truePositions,
          updated_at: new Date()
        });
        
        console.log(`   ✅ Corrected and synced ${teamName}.\n`);
      }
    }

    console.log('--- Summary ---');
    console.table(auditResults.map(r => ({
      Team: r.teamName,
      ID: r.teamId,
      'Firestore Count': r.firebaseCount,
      'Actual Count': r.actualCount,
      Status: r.isMismatch ? '❌ Corrected' : '✅ Match'
    })));

    console.log(`\nAudit finished. Resolved ${mismatchCount} mismatched teams.`);
  } catch (error) {
    console.error('Error auditing squads:', error);
  }
}

auditAllSquads();
