/**
 * Export Historical Player Points for Update
 * 
 * This script exports player data from seasons 6-9 to an Excel file
 * so you can fill in the missing total_points values.
 */

import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get database connection
const sql = neon(process.env.NEON_TOURNAMENT_DATABASE_URL);

async function exportPlayersForUpdate() {
  try {
    console.log('🔍 Fetching historical player data from seasons 6-9...\n');

    // Query to get all players from seasons 6-9
    const players = await sql`
      SELECT 
        rps.player_id,
        rps.player_name,
        rps.season_id,
        rps.team as team_name,
        rps.category,
        rps.points as current_points,
        rps.matches_played,
        rps.goals_scored,
        rps.goals_conceded,
        rps.clean_sheets,
        rps.motm_awards
      FROM realplayerstats rps
      WHERE rps.season_id IN ('SSPSLS6', 'SSPSLS7', 'SSPSLS8', 'SSPSLS9')
      ORDER BY rps.season_id, rps.team, rps.player_name
    `;

    if (players.length === 0) {
      console.log('❌ No players found for seasons 6-9. Make sure the seasons exist.');
      return;
    }

    console.log(`✅ Found ${players.length} players across seasons 6-9\n`);

    // Group by season for summary
    const seasonCounts = {};
    players.forEach(p => {
      seasonCounts[p.season_id] = (seasonCounts[p.season_id] || 0) + 1;
    });

    console.log('📊 Players per season:');
    Object.entries(seasonCounts).forEach(([season, count]) => {
      console.log(`   ${season}: ${count} players`);
    });
    console.log('');

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Player Points Update');

    // Define columns
    worksheet.columns = [
      { header: 'player_id', key: 'player_id', width: 20 },
      { header: 'player_name', key: 'player_name', width: 25 },
      { header: 'season_id', key: 'season_id', width: 15 },
      { header: 'team_name', key: 'team_name', width: 25 },
      { header: 'category', key: 'category', width: 15 },
      { header: 'current_points', key: 'current_points', width: 18 },
      { header: 'new_total_points', key: 'new_total_points', width: 20 },
      { header: 'matches_played', key: 'matches_played', width: 18 },
      { header: 'goals_scored', key: 'goals_scored', width: 15 },
      { header: 'goals_conceded', key: 'goals_conceded', width: 18 },
      { header: 'clean_sheets', key: 'clean_sheets', width: 15 },
      { header: 'motm_awards', key: 'motm_awards', width: 15 },
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    headerRow.height = 20;
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add data rows
    players.forEach(player => {
      worksheet.addRow({
        player_id: player.player_id,
        player_name: player.player_name,
        season_id: player.season_id,
        team_name: player.team_name,
        category: player.category,
        current_points: player.current_points || 0,
        new_total_points: '', // Empty for user to fill
        matches_played: player.matches_played || 0,
        goals_scored: player.goals_scored || 0,
        goals_conceded: player.goals_conceded || 0,
        clean_sheets: player.clean_sheets || 0,
        motm_awards: player.motm_awards || 0,
      });
    });

    // Add alternating row colors
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' }
        };
      }
    });

    // Highlight the column to fill
    const newPointsColumn = worksheet.getColumn('new_total_points');
    newPointsColumn.eachCell((cell, rowNumber) => {
      if (rowNumber > 1) { // Skip header
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFEB9C' } // Light yellow
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE7E6E6' } },
          left: { style: 'thin', color: { argb: 'FFE7E6E6' } },
          bottom: { style: 'thin', color: { argb: 'FFE7E6E6' } },
          right: { style: 'thin', color: { argb: 'FFE7E6E6' } }
        };
      }
    });

    // Add instructions sheet
    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.columns = [
      { header: 'Instructions', key: 'instruction', width: 100 }
    ];

    const instructions = [
      '📋 HOW TO USE THIS FILE:',
      '',
      '1. This file contains all players from seasons 6-9 (SSPSLS6 through SSPSLS9)',
      '',
      '2. The "new_total_points" column (highlighted in yellow) is WHERE YOU ENTER DATA',
      '',
      '3. Fill in the correct total_points value for each player from your historical records',
      '',
      '4. The "current_points" column shows what is currently stored in the database',
      '',
      '5. Other columns (matches_played, goals_scored, etc.) are for reference only',
      '',
      '6. Leave "new_total_points" EMPTY for players you do not want to update',
      '',
      '7. After filling in the data, save this file and run:',
      '   node import-historical-player-points.js [filename].xlsx',
      '',
      '8. The import script will:',
      '   ✅ Create a backup before making changes',
      '   ✅ Show you a preview of what will be updated',
      '   ✅ Only update the total_points column (nothing else)',
      '   ✅ Provide a summary of all changes made',
      '',
      '⚠️  IMPORTANT NOTES:',
      '- Do NOT modify player_id, player_name, or season_id columns',
      '- Only fill in numeric values in the new_total_points column',
      '- The import is safe and can be run multiple times',
      ''
    ];

    instructions.forEach(text => {
      const row = instructionsSheet.addRow({ instruction: text });
      if (text.startsWith('📋') || text.startsWith('⚠️')) {
        row.font = { bold: true, size: 14 };
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE7E6E6' }
        };
      } else if (text.match(/^\d+\./)) {
        row.font = { bold: true };
      }
    });

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `historical_players_points_update_S6-S9_${timestamp}.xlsx`;
    const filepath = path.join(__dirname, filename);

    // Save the file
    await workbook.xlsx.writeFile(filepath);

    console.log('✅ Excel file created successfully!\n');
    console.log(`📁 File location: ${filename}\n`);
    console.log('📝 Next steps:');
    console.log('   1. Open the Excel file');
    console.log('   2. Fill in the "new_total_points" column (highlighted in yellow)');
    console.log('   3. Save the file');
    console.log('   4. Run: node import-historical-player-points.js ' + filename);
    console.log('');

  } catch (error) {
    console.error('❌ Error exporting player data:', error);
    console.error(error);
  }
}

// Run the export
exportPlayersForUpdate();
