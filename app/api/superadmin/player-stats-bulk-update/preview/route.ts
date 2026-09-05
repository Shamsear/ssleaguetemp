import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Read Excel file
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.getWorksheet('Player Stats Update');
    if (!worksheet) {
      return NextResponse.json(
        { error: 'Invalid file format. Could not find "Player Stats Update" worksheet' },
        { status: 400 }
      );
    }

    // Parse headers to find which stats fields are being updated
    const headerRow = worksheet.getRow(1);
    const headers: Map<string, number> = new Map();
    
    headerRow.eachCell((cell, colNumber) => {
      const headerName = String(cell.value || '').trim();
      if (headerName) {
        headers.set(headerName, colNumber);
      }
    });

    // Find all "new_" columns
    const statsFields: string[] = [];
    headers.forEach((colIndex, headerName) => {
      if (headerName.startsWith('new_')) {
        statsFields.push(headerName.replace('new_', ''));
      }
    });

    if (statsFields.length === 0) {
      return NextResponse.json(
        { error: 'No stats fields found in the file' },
        { status: 400 }
      );
    }

    // Parse data from Excel
    const updates: any[] = [];
    let rowCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    worksheet.eachRow((row: any, rowNumber: any) => {
      // Skip header row
      if (rowNumber === 1) return;

      rowCount++;

      const player_id = headers.has('player_id') ? row.getCell(headers.get('player_id')!).value : null;
      const player_name = headers.has('player_name') ? row.getCell(headers.get('player_name')!).value : null;
      const season_id = headers.has('season_id') ? row.getCell(headers.get('season_id')!).value : null;
      const team_name = headers.has('team_name') ? row.getCell(headers.get('team_name')!).value : null;

      if (!player_id || !season_id) {
        errors.push(`Row ${rowNumber}: Missing player_id or season_id`);
        errorCount++;
        return;
      }

      // Collect updates for this player
      const playerUpdate: any = {
        player_id: String(player_id),
        player_name: String(player_name || ''),
        season_id: String(season_id),
        team_name: String(team_name || ''),
        updates: {}
      };

      let hasUpdates = false;

      // Check each stats field
      statsFields.forEach((field: string) => {
        const currentColIndex = headers.get(`current_${field}`);
        const newColIndex = headers.get(`new_${field}`);
        
        if (!currentColIndex || !newColIndex) return;
        
        const currentValue = row.getCell(currentColIndex).value;
        const newValue = row.getCell(newColIndex).value;

        // Skip if new value is empty
        if (newValue === null || newValue === undefined || newValue === '') {
          return;
        }

        // Validate numeric value
        const numericValue = Number(newValue);
        if (isNaN(numericValue)) {
          errors.push(`Row ${rowNumber} (${player_name}): Invalid ${field} value "${newValue}"`);
          errorCount++;
          return;
        }

        playerUpdate.updates[field] = {
          current: Number(currentValue) || 0,
          new: numericValue,
          change: numericValue - (Number(currentValue) || 0)
        };
        hasUpdates = true;
      });

      if (hasUpdates) {
        updates.push(playerUpdate);
      } else {
        skippedCount++;
      }
    });

    // Calculate summary statistics
    const summary = {
      totalRows: rowCount,
      playersToUpdate: updates.length,
      playersSkipped: skippedCount,
      errors: errorCount,
      errorMessages: errors.slice(0, 10), // Limit to first 10 errors
      statsFields: statsFields
    };

    // Group by season
    const seasonStats: Record<string, any> = {};
    updates.forEach((update: any) => {
      if (!seasonStats[update.season_id]) {
        seasonStats[update.season_id] = {
          playerCount: 0,
          fieldChanges: {}
        };
        statsFields.forEach((field: any) => {
          seasonStats[update.season_id].fieldChanges[field] = 0;
        });
      }
      seasonStats[update.season_id].playerCount++;
      Object.keys(update.updates).forEach((field: any) => {
        seasonStats[update.season_id].fieldChanges[field] += update.updates[field].change;
      });
    });

    return NextResponse.json({
      success: true,
      summary,
      seasonStats,
      updates: updates.slice(0, 50), // Return first 50 for preview
      totalUpdates: updates.length
    });

  } catch (error: any) {
    console.error('Error parsing Excel file:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to parse Excel file' },
      { status: 500 }
    );
  }
}
