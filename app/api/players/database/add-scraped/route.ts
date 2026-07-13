import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon/config';
import { tempSql } from '@/lib/neon/temp-config';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { playerIds } = body;

    if (!playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
      return NextResponse.json({ success: false, error: 'playerIds array is required' }, { status: 400 });
    }

    // 1. Fetch the selected players from temp table
    // PostgreSQL IN query parameterized using placeholders
    const placeholders = playerIds.map((_, idx) => `$${idx + 1}`).join(', ');
    const selectQuery = `SELECT * FROM temp_players_import WHERE player_id IN (${placeholders})`;
    
    let tempPlayers: any[] = [];
    try {
      tempPlayers = await tempSql.query(selectQuery, playerIds);
    } catch (e: any) {
      console.error('Error querying temp players:', e);
      return NextResponse.json({ success: false, error: 'Failed to retrieve selected players from temporary database.' }, { status: 500 });
    }

    if (tempPlayers.length === 0) {
      return NextResponse.json({ success: false, error: 'No matching players found in temporary import table.' }, { status: 404 });
    }

    // 2. Fetch existing active player IDs to double-check duplicates
    const activeRows = await sql.query('SELECT player_id FROM footballplayers');
    const activeIds = new Set(activeRows.map((r: any) => r.player_id?.toString()).filter(Boolean));

    // Filter out any players that might have been created in the meantime
    const newPlayers = tempPlayers.filter(p => !activeIds.has(p.player_id?.toString()));

    if (newPlayers.length === 0) {
      return NextResponse.json({ success: true, message: 'All selected players already exist in the active database.', count: 0 });
    }

    // 3. Batch insert new players into active table
    const columns = [
      'id', 'player_id', 'name', 'position', 'team_name', 'nationality', 'age', 'club', 'playing_style', 'overall_rating',
      'offensive_awareness', 'ball_control', 'dribbling', 'tight_possession', 'low_pass', 'lofted_pass',
      'finishing', 'heading', 'set_piece_taking', 'curl', 'speed', 'acceleration', 'kicking_power', 'jumping',
      'physical_contact', 'balance', 'stamina', 'defensive_awareness', 'tackling', 'aggression',
      'defensive_engagement', 'gk_awareness', 'gk_catching', 'gk_parrying', 'gk_reflexes', 'gk_reach',
      'is_auction_eligible', 'is_sold'
    ];

    const chunkSize = 500;
    let addedCount = 0;

    const { Pool } = await import('@neondatabase/serverless');
    const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

    try {
      for (let i = 0; i < newPlayers.length; i += chunkSize) {
        const chunk = newPlayers.slice(i, i + chunkSize);
        const chunkPlaceholders: string[] = [];
        const chunkParams: any[] = [];
        let chunkParamIndex = 1;

        chunk.forEach(p => {
          const rowPlaceholders: string[] = [];
          const uuid = randomUUID();

          rowPlaceholders.push(`$${chunkParamIndex++}`);
          chunkParams.push(uuid);

          rowPlaceholders.push(`$${chunkParamIndex++}`);
          chunkParams.push(p.player_id);

          rowPlaceholders.push(`$${chunkParamIndex++}`);
          chunkParams.push(p.name);

          rowPlaceholders.push(`$${chunkParamIndex++}`);
          chunkParams.push(p.position || null);

          rowPlaceholders.push(`$${chunkParamIndex++}`);
          chunkParams.push(p.team_name || null);

          rowPlaceholders.push(`$${chunkParamIndex++}`);
          chunkParams.push(p.nationality || null);

          rowPlaceholders.push(`$${chunkParamIndex++}`);
          chunkParams.push(p.age ? Number(p.age) : null);

          rowPlaceholders.push(`$${chunkParamIndex++}`);
          chunkParams.push(p.team_name || null); // club

          rowPlaceholders.push(`$${chunkParamIndex++}`);
          chunkParams.push(p.playing_style || null);

          rowPlaceholders.push(`$${chunkParamIndex++}`);
          chunkParams.push(p.overall_rating ? Number(p.overall_rating) : null);

          // stats (28 columns)
          const statsFields = [
            'offensive_awareness', 'ball_control', 'dribbling', 'tight_possession', 'low_pass', 'lofted_pass',
            'finishing', 'heading', 'set_piece_taking', 'curl', 'speed', 'acceleration', 'kicking_power', 'jumping',
            'physical_contact', 'balance', 'stamina', 'defensive_awareness', 'tackling', 'aggression',
            'defensive_engagement', 'gk_awareness', 'gk_catching', 'gk_parrying', 'gk_reflexes', 'gk_reach'
          ];

          statsFields.forEach(field => {
            rowPlaceholders.push(`$${chunkParamIndex++}`);
            chunkParams.push(p[field] !== undefined ? Number(p[field]) : 0);
          });

          rowPlaceholders.push(`$${chunkParamIndex++}`);
          chunkParams.push(true); // is_auction_eligible

          rowPlaceholders.push(`$${chunkParamIndex++}`);
          chunkParams.push(false); // is_sold

          chunkPlaceholders.push(`(${rowPlaceholders.join(', ')})`);
        });

        const insertQuery = `
          INSERT INTO footballplayers (${columns.join(', ')})
          VALUES ${chunkPlaceholders.join(', ')}
          ON CONFLICT (player_id) DO NOTHING;
        `;

        await pool.query(insertQuery, chunkParams);
        addedCount += chunk.length;
      }
    } finally {
      await pool.end();
    }

    // 4. Delete the added players from temp table so they no longer show up as new
    const deleteQuery = `DELETE FROM temp_players_import WHERE player_id IN (${placeholders})`;
    try {
      await tempSql.query(deleteQuery, playerIds);
    } catch (e) {
      console.error('Failed to clean up added players from temp table:', e);
    }

    return NextResponse.json({
      success: true,
      count: addedCount,
      message: `Successfully added ${addedCount} new players to the active database.`
    });

  } catch (error: any) {
    console.error('❌ Error adding scraped players:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
