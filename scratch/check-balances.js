const { neon } = require('@neondatabase/serverless');
const admin = require('firebase-admin');
require('dotenv').config({ path: '.env.local' });

// Initialize Firebase Admin if not already initialized
if (admin.apps.length === 0) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
  });
}

const db = admin.firestore();
const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function checkBalances() {
  try {
    const seasonId = 'SSPSLS18';
    console.log(`🔍 Starting balance diagnostic for season: ${seasonId}\n`);

    // 1. Fetch Postgres teams
    const pgTeams = await sql`
      SELECT id, name, football_budget, football_spent, football_players_count
      FROM teams
      WHERE season_id = ${seasonId}
      ORDER BY name ASC
    `;

    console.log(`📋 Found ${pgTeams.length} teams in Postgres.`);

    for (const team of pgTeams) {
      console.log(`----------------------------------------`);
      console.log(`⚽ Team: ${team.name} (ID: ${team.id})`);

      // A. Fetch allocations from Postgres team_players
      const players = await sql`
        SELECT tp.player_id, tp.purchase_price, p.name as player_name, p.position
        FROM team_players tp
        JOIN footballplayers p ON tp.player_id = p.id
        WHERE tp.team_id = ${team.id} AND tp.round_id IN (
          SELECT id FROM rounds WHERE season_id = ${seasonId}
        )
      `;

      const actualPlayersCount = players.length;
      const actualSumSpent = players.reduce((sum, p) => sum + Number(p.purchase_price), 0);

      // B. Fetch Firestore document
      const tsId = `${team.id}_${seasonId}`;
      const tsDoc = await db.collection('team_seasons').doc(tsId).get();
      let fsData = null;
      if (tsDoc.exists) {
        fsData = tsDoc.data();
      }

      // C. Compare results
      console.log(`[Players Count]`);
      console.log(`  - Postgres team_players rows: ${actualPlayersCount}`);
      console.log(`  - Postgres teams.football_players_count: ${team.football_players_count}`);
      console.log(`  - Firebase players_count: ${fsData ? fsData.players_count : 'N/A'}`);
      
      const countMatch = actualPlayersCount === Number(team.football_players_count) && (!fsData || actualPlayersCount === fsData.players_count);
      console.log(`  => Status: ${countMatch ? '✅ MATCH' : '❌ MISMATCH'}`);

      console.log(`[Spent Balance]`);
      console.log(`  - Sum of Postgres team_players prices: £${actualSumSpent}`);
      console.log(`  - Postgres teams.football_spent: £${team.football_spent}`);
      const fsSpent = fsData ? (fsData.currency_system === 'dual' ? fsData.football_spent : fsData.total_spent) : 0;
      console.log(`  - Firebase spent: £${fsSpent}`);

      const spentMatch = actualSumSpent === Number(team.football_spent) && actualSumSpent === Number(fsSpent);
      console.log(`  => Status: ${spentMatch ? '✅ MATCH' : '❌ MISMATCH'}`);

      console.log(`[Budget]`);
      console.log(`  - Postgres teams.football_budget: £${team.football_budget}`);
      const fsBudget = fsData ? (fsData.currency_system === 'dual' ? fsData.football_budget : fsData.budget) : 0;
      console.log(`  - Firebase budget: £${fsBudget}`);

      const budgetMatch = Number(team.football_budget) === Number(fsBudget);
      console.log(`  => Status: ${budgetMatch ? '✅ MATCH' : '❌ MISMATCH'}`);

      if (players.length > 0) {
        console.log(`[Squad Players]:`);
        players.forEach(p => {
          console.log(`  • ${p.player_name} (${p.position}) - £${Number(p.purchase_price).toLocaleString()}`);
        });
      } else {
        console.log(`[Squad Players]: (None)`);
      }
    }
    
    console.log(`----------------------------------------`);
    console.log(`\n🎉 Balance diagnostic complete.`);

  } catch (error) {
    console.error('❌ Error executing diagnostics:', error);
  }
}

checkBalances();
