/**
 * Update S18+ team_seasons real_player_budget to 500 (from 1000)
 * This script updates all S18+ season team budgets to the new standard
 */

import { adminDb } from './lib/firebase/admin';

async function updateS18BudgetTo500() {
  try {
    console.log('\n🔧 Updating S18+ Team Budgets to 500 SSCoins...\n');

    // Get all team_seasons for S18+
    const teamSeasonsSnap = await adminDb.collection('team_seasons')
      .where('season_id', '>=', 'SSPSLS18')
      .get();

    console.log(`📋 Found ${teamSeasonsSnap.size} team_seasons for S18+\n`);

    let updated = 0;
    let skipped = 0;
    const batch = adminDb.batch();
    let batchCount = 0;

    for (const doc of teamSeasonsSnap.docs) {
      const data = doc.data();
      const seasonId = data.season_id;
      
      // Skip if not S18+
      const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
      if (seasonNum < 18) {
        skipped++;
        continue;
      }

      // Check current budget values
      const currentInitialBudget = data.initial_real_player_budget || data.real_player_budget_initial || 1000;
      const currentBudget = data.real_player_budget || 1000;
      const currentSpent = data.real_player_spent || 0;

      // Only update if currently set to 1000
      if (currentInitialBudget === 1000) {
        // Calculate new budget: 500 - spent
        const newBudget = 500 - currentSpent;

        batch.update(doc.ref, {
          initial_real_player_budget: 500,
          real_player_budget_initial: 500,
          real_player_budget: newBudget,
          real_player_starting_balance: 500,
          updated_at: new Date(),
        });

        console.log(`✅ ${doc.id} (${seasonId}): 1000 → 500 | Current: ${currentBudget} → ${newBudget} | Spent: ${currentSpent}`);
        updated++;
        batchCount++;

        // Commit batch every 500 operations (Firestore limit)
        if (batchCount >= 500) {
          await batch.commit();
          console.log(`\n💾 Committed batch of ${batchCount} updates\n`);
          batchCount = 0;
        }
      } else {
        console.log(`⏭️  ${doc.id} (${seasonId}): Already at ${currentInitialBudget} (skipped)`);
        skipped++;
      }
    }

    // Commit remaining updates
    if (batchCount > 0) {
      await batch.commit();
      console.log(`\n💾 Committed final batch of ${batchCount} updates\n`);
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Updated: ${updated} team_seasons`);
    console.log(`   ⏭️  Skipped: ${skipped} team_seasons`);
    console.log(`   📋 Total: ${teamSeasonsSnap.size} team_seasons\n`);

    console.log('✅ Budget update complete!\n');

  } catch (error) {
    console.error('❌ Error updating budgets:', error);
  }
}

updateS18BudgetTo500().then(() => {
  console.log('✅ Script completed');
  process.exit(0);
});
