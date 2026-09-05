import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
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

    worksheet.eachRow((row, rowNumber) => {
      // Skip header row
      if (rowNumber === 1) return;

      rowCount++;

      const player_id = headers.has('player_id') ? row.getCell(headers.get('player_id')!).value : null;
      const season_id = headers.has('season_id') ? row.getCell(headers.get('season_id')!).value : null;

      if (!player_id || !season_id) {
        return;
      }

      // Collect updates for this player
      const playerUpdate: any = {
        player_id: String(player_id),
        season_id: String(season_id),
        updates: {}
      };

      let hasUpdates = false;

      // Check each stats field
      statsFields.forEach((field: string) => {
        const newColIndex = headers.get(`new_${field}`);
        if (!newColIndex) return;
        
        const newValue = row.getCell(newColIndex).value;

        // Skip if new value is empty
        if (newValue === null || newValue === undefined || newValue === '') {
          return;
        }

        // Validate numeric value
        const numericValue = Number(newValue);
        if (isNaN(numericValue)) {
          return;
        }

        playerUpdate.updates[field] = numericValue;
        hasUpdates = true;
      });

      if (hasUpdates) {
        updates.push(playerUpdate);
      }
    });

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No valid updates found in the file' },
        { status: 400 }
      );
    }

    // Perform database updates
    const sql = getTournamentDb();
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Map field names to database column names
    const fieldMapping: Record<string, string> = {
      points: 'points',
      matches_played: 'matches_played',
      wins: 'wins',
      draws: 'draws',
      losses: 'losses',
      goals_scored: 'goals_scored',
      goals_conceded: 'goals_conceded',
      assists: 'assists',
      clean_sheets: 'clean_sheets',
      motm_awards: 'motm_awards'
    };

    for (const update of updates) {
      try {
        // Build updates object with all fields to update
        const fieldsToUpdate: Record<string, any> = {};
        
        Object.keys(update.updates).forEach((field: any) => {
          const dbColumn = fieldMapping[field] || field;
          fieldsToUpdate[dbColumn] = update.updates[field];
        });

        const player_id = update.player_id;
        const season_id = update.season_id;
        
        // Verify the record exists
        const existingRecord = await sql`
          SELECT id FROM realplayerstats 
          WHERE player_id = ${player_id} AND season_id = ${season_id}
        `;
        
        if (existingRecord.length === 0) {
          errorCount++;
          errors.push(`Player ${player_id}: Record not found in database`);
          continue;
        }
        
        // Update each field individually
        for (const [field, value] of Object.entries(fieldsToUpdate)) {
          switch(field) {
            case 'points':
              await sql`UPDATE realplayerstats SET points = ${value}, updated_at = NOW() WHERE player_id = ${player_id} AND season_id = ${season_id}`;
              break;
            case 'matches_played':
              await sql`UPDATE realplayerstats SET matches_played = ${value}, updated_at = NOW() WHERE player_id = ${player_id} AND season_id = ${season_id}`;
              break;
            case 'wins':
              await sql`UPDATE realplayerstats SET wins = ${value}, updated_at = NOW() WHERE player_id = ${player_id} AND season_id = ${season_id}`;
              break;
            case 'draws':
              await sql`UPDATE realplayerstats SET draws = ${value}, updated_at = NOW() WHERE player_id = ${player_id} AND season_id = ${season_id}`;
              break;
            case 'losses':
              await sql`UPDATE realplayerstats SET losses = ${value}, updated_at = NOW() WHERE player_id = ${player_id} AND season_id = ${season_id}`;
              break;
            case 'goals_scored':
              await sql`UPDATE realplayerstats SET goals_scored = ${value}, updated_at = NOW() WHERE player_id = ${player_id} AND season_id = ${season_id}`;
              break;
            case 'goals_conceded':
              await sql`UPDATE realplayerstats SET goals_conceded = ${value}, updated_at = NOW() WHERE player_id = ${player_id} AND season_id = ${season_id}`;
              break;
            case 'assists':
              await sql`UPDATE realplayerstats SET assists = ${value}, updated_at = NOW() WHERE player_id = ${player_id} AND season_id = ${season_id}`;
              break;
            case 'clean_sheets':
              await sql`UPDATE realplayerstats SET clean_sheets = ${value}, updated_at = NOW() WHERE player_id = ${player_id} AND season_id = ${season_id}`;
              break;
            case 'motm_awards':
              await sql`UPDATE realplayerstats SET motm_awards = ${value}, updated_at = NOW() WHERE player_id = ${player_id} AND season_id = ${season_id}`;
              break;
          }
        }
        
        successCount++;

      } catch (error: any) {
        errorCount++;
        errors.push(`Player ${update.player_id}: ${error.message}`);
        console.error(`Error updating player ${update.player_id}:`, error);
      }
    }

    // Calculate summary
    const summary = {
      totalUpdates: updates.length,
      successful: successCount,
      failed: errorCount,
      errors: errors.slice(0, 10) // Limit to first 10 errors
    };

    return NextResponse.json({
      success: true,
      message: `Successfully updated ${successCount} out of ${updates.length} players`,
      summary
    });

  } catch (error: any) {
    console.error('Error importing player stats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to import player stats' },
      { status: 500 }
    );
  }
}
