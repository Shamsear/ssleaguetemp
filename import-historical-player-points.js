/**
 * Import Historical Player Points Update
 * 
 * This script reads an Excel file with updated total_points values
 * and updates ONLY the total_points column in the realplayerstats table.
 */

import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

// Load environment variables
dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get database connection
const sql = neon(process.env.NEON_TOURNAMENT_DATABASE_URL);

// Function to ask user for confirmation
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function importPlayerPoints(filename) {
  try {
    // Check if file exists
    const filepath = path.join(__dirname, filename);
    try {
      await fs.access(filepath);
    } catch {
      console.error(`❌ File not found: ${filename}`);
      console.error(`   Make sure the file is in the same directory as this script.`);
      return;
    }

    console.log(`📂 Reading file: ${filename}\n`);

    // Read Excel file
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filepath);
    
    const worksheet = workbook.getWorksheet('Player Points Update');
    if (!worksheet) {
      console.error('❌ Could not find "Player Points Update" worksheet');
      return;
    }

    // Parse data from Excel
    const updates = [];
    let rowCount = 0;
    let skippedCount = 0;

    worksheet.eachRow((row, rowNumber) => {
      // Skip header row
      if (rowNumber === 1) return;

      rowCount++;
      
      const player_id = row.getCell('player_id').value;
      const player_name = row.getCell('player_name').value;
      const season_id = row.getCell('season_id').value;
      const current_points = row.getCell('current_points').value || 0;
      const new_total_points = row.getCell('new_total_points').value;

      // Skip rows where new_total_points is empty
      if (new_total_points === null || new_total_points === undefined || new_total_points === '') {
        skippedCount++;
        return;
      }

      // Validate numeric value
      const pointsValue = Number(new_total_points);
      if (isNaN(pointsValue)) {
        console.warn(`⚠️  Row ${rowNumber}: Invalid points value "${new_total_points}" for ${player_name}`);
        skippedCount++;
        return;
      }

      updates.push({
        player_id,
        player_name,
        season_id,
        current_points: Number(current_points) || 0,
        new_total_points: pointsValue
      });
    });

    console.log(`📊 Excel file analysis:`);
    console.log(`   Total rows processed: ${rowCount}`);
    console.log(`   Updates to apply: ${updates.length}`);
    console.log(`   Skipped (empty): ${skippedCount}\n`);

    if (updates.length === 0) {
      console.log('❌ No updates found. Make sure you filled in the "new_total_points" column.');
      return;
    }

    // Show sample of what will be updated
    console.log('📋 Preview of updates (first 10):');
    console.log('─'.repeat(80));
    updates.slice(0, 10).forEach((update, idx) => {
      const change = update.new_total_points - update.current_points;
      const changeStr = change >= 0 ? `+${change}` : change;
      console.log(`${idx + 1}. ${update.player_name} (${update.season_id})`);
      console.log(`   Current: ${update.current_points} → New: ${update.new_total_points} (${changeStr})`);
    });
    if (updates.length > 10) {
      console.log(`   ... and ${updates.length - 10} more players`);
    }
    console.log('─'.repeat(80));
    console.log('');

    // Group by season for summary
    const seasonStats = {};
    updates.forEach(update => {
      if (!seasonStats[update.season_id]) {
        seasonStats[update.season_id] = {
          count: 0,
          totalPointsAdded: 0
        };
      }
      seasonStats[update.season_id].count++;
      seasonStats[update.season_id].totalPointsAdded += (update.new_total_points - update.current_points);
    });

    console.log('📊 Updates by season:');
    Object.entries(seasonStats).forEach(([season, stats]) => {
      console.log(`   ${season}: ${stats.count} players (${stats.totalPointsAdded >= 0 ? '+' : ''}${stats.totalPointsAdded} total points)`);
    });
    console.log('');

    // Ask for confirmation
    const answer = await askQuestion('⚠️  Do you want to proceed with these updates? (yes/no): ');
    
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('❌ Import cancelled by user.');
      return;
    }

    console.log('\n🔄 Creating backup before making changes...\n');

    // Create backup SQL file
    const backupTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `backup_player_points_${backupTimestamp}.sql`;
    const backupPath = path.join(__dirname, backupFilename);

    let backupContent = `-- Backup of total_points before update\n`;
    backupContent += `-- Created: ${new Date().toISOString()}\n`;
    backupContent += `-- To restore, run this SQL file\n\n`;

    for (const update of updates) {
      backupContent += `UPDATE realplayerstats SET points = ${update.current_points} WHERE player_id = '${update.player_id}' AND season_id = '${update.season_id}';\n`;
    }

    await fs.writeFile(backupPath, backupContent);
    console.log(`✅ Backup created: ${backupFilename}\n`);

    // Perform updates
    console.log('🔄 Updating player points...\n');

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const update of updates) {
      try {
        await sql`
          UPDATE realplayerstats
          SET 
            points = ${update.new_total_points},
            updated_at = NOW()
          WHERE player_id = ${update.player_id}
          AND season_id = ${update.season_id}
        `;
        
        successCount++;
        
        // Show progress every 20 updates
        if (successCount % 20 === 0) {
          console.log(`   ✅ Updated ${successCount}/${updates.length} players...`);
        }
      } catch (error) {
        errorCount++;
        errors.push({
          player: update.player_name,
          season: update.season_id,
          error: error.message
        });
        console.error(`   ❌ Error updating ${update.player_name}: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ IMPORT COMPLETE!');
    console.log('='.repeat(80));
    console.log(`📊 Summary:`);
    console.log(`   Successfully updated: ${successCount} players`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`   Backup file: ${backupFilename}`);
    console.log('');

    if (errors.length > 0) {
      console.log('❌ Errors encountered:');
      errors.forEach(err => {
        console.log(`   - ${err.player} (${err.season}): ${err.error}`);
      });
      console.log('');
    }

    // Create a summary report
    const reportFilename = `import_report_${backupTimestamp}.txt`;
    const reportPath = path.join(__dirname, reportFilename);
    
    let reportContent = `HISTORICAL PLAYER POINTS UPDATE REPORT\n`;
    reportContent += `${'='.repeat(80)}\n\n`;
    reportContent += `Date: ${new Date().toISOString()}\n`;
    reportContent += `Source file: ${filename}\n`;
    reportContent += `Backup file: ${backupFilename}\n\n`;
    reportContent += `SUMMARY:\n`;
    reportContent += `- Total updates: ${updates.length}\n`;
    reportContent += `- Successful: ${successCount}\n`;
    reportContent += `- Errors: ${errorCount}\n\n`;
    
    reportContent += `UPDATES BY SEASON:\n`;
    Object.entries(seasonStats).forEach(([season, stats]) => {
      reportContent += `${season}: ${stats.count} players (${stats.totalPointsAdded >= 0 ? '+' : ''}${stats.totalPointsAdded} points)\n`;
    });
    reportContent += `\n`;
    
    reportContent += `DETAILED UPDATE LOG:\n`;
    updates.forEach(update => {
      const change = update.new_total_points - update.current_points;
      reportContent += `${update.player_name} (${update.season_id}): ${update.current_points} → ${update.new_total_points} (${change >= 0 ? '+' : ''}${change})\n`;
    });

    if (errors.length > 0) {
      reportContent += `\nERRORS:\n`;
      errors.forEach(err => {
        reportContent += `${err.player} (${err.season}): ${err.error}\n`;
      });
    }

    await fs.writeFile(reportPath, reportContent);
    console.log(`📄 Detailed report saved: ${reportFilename}\n`);

    console.log('🎉 All done! Your historical player points have been updated.\n');
    console.log('💡 To rollback changes, run the backup SQL file:');
    console.log(`   psql -f ${backupFilename}\n`);

  } catch (error) {
    console.error('❌ Fatal error during import:', error);
    console.error(error);
  }
}

// Get filename from command line arguments
const filename = process.argv[2];

if (!filename) {
  console.error('❌ Usage: node import-historical-player-points.js <filename.xlsx>');
  console.error('   Example: node import-historical-player-points.js historical_players_points_update_S6-S9_2025-01-27.xlsx');
  process.exit(1);
}

// Run the import
importPlayerPoints(filename);
