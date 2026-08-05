import { neon } from '@neondatabase/serverless';
import { adminDb } from '../lib/firebase/admin';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);

async function syncBalances() {
  try {
    const seasonId = 'SSPSLS18';
    console.log(`🔄 Starting balance synchronization for season: ${seasonId}\n`);

    // Fetch all teams in the season
    const pgTeams = await sql`
      SELECT id, name
      FROM teams
      WHERE season_id = ${seasonId}
      ORDER BY name ASC
    `;

    console.log(`📊 Processing ${pgTeams.length} teams...`);

    for (const team of pgTeams) {
      console.log(`----------------------------------------`);
      console.log(`⚽ Processing Team: ${team.name} (ID: ${team.id})`);

      // 1. Get all players from footballplayers table currently marked as owned by this team
      const players = await sql`
        SELECT id, name, position, acquisition_value
        FROM footballplayers
        WHERE team_id = ${team.id} AND is_sold = true AND round_id IN (
          SELECT id FROM rounds WHERE season_id = ${seasonId}
        )
      `;

      const actualPlayersCount = players.length;
      const actualSumSpent = players.reduce((sum, p) => sum + Number(p.acquisition_value || 0), 0);
      const actualBudget = 10000 - actualSumSpent;

      // Calculate position counts
      const positionCounts: Record<string, number> = {};
      players.forEach(p => {
        if (p.position) {
          positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
        }
      });

      console.log(`  - True Squad Count: ${actualPlayersCount}`);
      console.log(`  - True Spent: £${actualSumSpent}`);
      console.log(`  - True Budget: £${actualBudget}`);
      console.log(`  - True Position Counts:`, positionCounts);

      // 2. Update Postgres teams table
      await sql`
        UPDATE teams
        SET football_spent = ${actualSumSpent},
            football_budget = ${actualBudget},
            football_players_count = ${actualPlayersCount},
            updated_at = NOW()
        WHERE id = ${team.id} AND season_id = ${seasonId}
      `;
      console.log(`  ✅ Updated SQL teams table.`);

      // 3. Update Firebase team_seasons document
      const tsId = `${team.id}_${seasonId}`;
      const tsRef = adminDb.collection('team_seasons').doc(tsId);
      const tsDoc = await tsRef.get();

      if (tsDoc.exists) {
        const tsd = tsDoc.data();
        const curr = tsd?.currency_system || 'single';

        const upd: any = {
          total_spent: actualSumSpent,
          players_count: actualPlayersCount,
          position_counts: positionCounts,
          updated_at: new Date()
        };

        if (curr === 'dual') {
          upd.football_budget = actualBudget;
          upd.football_spent = actualSumSpent;
        } else {
          upd.budget = actualBudget;
        }

        await tsRef.update(upd);
        console.log(`  ✅ Updated Firebase team_seasons document.`);
      } else {
        console.log(`  ⚠️  Firebase team_seasons document not found for ID: ${tsId}`);
      }
    }

    console.log(`----------------------------------------`);
    console.log(`\n🎉 Balance synchronization completed successfully!`);

  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
}

syncBalances();
