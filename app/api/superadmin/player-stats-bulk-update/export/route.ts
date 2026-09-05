import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { seasonId, statsFields } = body;

    if (!seasonId) {
      return NextResponse.json(
        { error: 'Season ID is required' },
        { status: 400 }
      );
    }

    if (!statsFields || !Array.isArray(statsFields) || statsFields.length === 0) {
      return NextResponse.json(
        { error: 'At least one stats field must be selected' },
        { status: 400 }
      );
    }

    const sql = getTournamentDb();

    // Fetch player stats for the selected season
    const players = await sql`
      SELECT 
        rps.player_id,
        rps.player_name,
        rps.season_id,
        rps.team as team_name,
        rps.category,
        rps.matches_played,
        rps.wins,
        rps.draws,
        rps.losses,
        rps.goals_scored,
        rps.goals_conceded,
        rps.assists,
        rps.clean_sheets,
        rps.motm_awards,
        rps.points
      FROM realplayerstats rps
      WHERE rps.season_id = ${seasonId}
      ORDER BY rps.team, rps.player_name
    `;

    if (players.length === 0) {
      return NextResponse.json(
        { error: `No players found for season ${seasonId}` },
        { status: 404 }
      );
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Player Stats Update');

    // Define columns - always include identifying columns + selected stats
    const columns = [
      { header: 'player_id', key: 'player_id', width: 20 },
      { header: 'player_name', key: 'player_name', width: 25 },
      { header: 'season_id', key: 'season_id', width: 15 },
      { header: 'team_name', key: 'team_name', width: 25 },
      { header: 'category', key: 'category', width: 15 },
    ];

    // Field display names mapping
    const fieldNames: Record<string, string> = {
      points: 'Total Points',
      matches_played: 'Matches Played',
      wins: 'Wins',
      draws: 'Draws',
      losses: 'Losses',
      goals_scored: 'Goals Scored',
      goals_conceded: 'Goals Conceded',
      assists: 'Assists',
      clean_sheets: 'Clean Sheets',
      motm_awards: 'MOTM Awards'
    };

    // Add columns for each selected stat field (current + new)
    statsFields.forEach((field: string) => {
      columns.push(
        { header: `current_${field}`, key: `current_${field}`, width: 18 },
        { header: `new_${field}`, key: `new_${field}`, width: 18 }
      );
    });

    worksheet.columns = columns;

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
    players.forEach((player: any) => {
      const rowData: any = {
        player_id: player.player_id,
        player_name: player.player_name,
        season_id: player.season_id,
        team_name: player.team_name,
        category: player.category,
      };

      // Add current values and empty new values for each stat
      statsFields.forEach((field: string) => {
        rowData[`current_${field}`] = (player as any)[field] || 0;
        rowData[`new_${field}`] = ''; // Empty for user to fill
      });

      worksheet.addRow(rowData);
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

    // Highlight the "new_" columns to fill
    statsFields.forEach((field: string, index: number) => {
      // Calculate column index: 5 base columns + (index * 2) for current columns + 1 for new column
      const columnIndex = 5 + (index * 2) + 2; // +2 because current is +1, new is +2
      try {
        const column = worksheet.getColumn(columnIndex);
        if (column) {
          column.eachCell((cell, rowNumber) => {
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
        }
      } catch (error: any) {
        console.error(`Error formatting column for field ${field}:`, error);
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
      `1. This file contains all players from ${seasonId}`,
      '',
      '2. The "new_*" columns (highlighted in yellow) are WHERE YOU ENTER DATA',
      '',
      `3. Selected stats fields: ${statsFields.map((f: string) => fieldNames[f]).join(', ')}`,
      '',
      '4. Fill in the correct values for each player',
      '',
      '5. The "current_*" columns show what is currently stored in the database',
      '',
      '6. Leave "new_*" EMPTY for players/fields you do not want to update',
      '',
      '7. After filling in the data, save this file and upload it back through the Super Admin page',
      '',
      '⚠️  IMPORTANT NOTES:',
      '- Do NOT modify player_id, player_name, or season_id columns',
      '- Only fill in numeric values in the new_* columns',
      '- The import is safe and will show a preview before updating',
      ''
    ];

    instructions.forEach((text: any) => {
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

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `player_stats_update_${seasonId}_${timestamp}.xlsx`;

    // Return the file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error: any) {
    console.error('Error exporting player stats:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: error.message || 'Failed to export player stats' },
      { status: 500 }
    );
  }
}
