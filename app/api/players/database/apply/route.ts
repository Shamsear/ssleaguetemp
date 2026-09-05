import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon/config';
import { tempSql } from '@/lib/neon/temp-config';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { createNew } = body;

    // 1. Fetch temp players
    const tempPlayers = await tempSql.query('SELECT * FROM temp_players_import');
    if (tempPlayers.length === 0) {
      return NextResponse.json({ success: false, error: 'No players found in temporary table to apply.' }, { status: 400 });
    }

    // 2. Fetch existing active player IDs to determine what can be updated
    const activeRows = await sql.query('SELECT player_id FROM footballplayers');
    const activeIds = new Set(activeRows.map((r: any) => r.player_id?.toString()).filter(Boolean));

    // 3. Filter players based on apply settings
    const playersToApply = tempPlayers.filter((p: any) => {
      const exists = activeIds.has(p.player_id?.toString());
      if (exists) return true; // Always update existing
      return !!createNew;      // Only create new if createNew is enabled
    });

    if (playersToApply.length === 0) {
      return NextResponse.json({ success: true, message: 'No players needed sync based on current settings.' });
    }

    // 4. Build single bulk parameterized query
    // Columns list matching schema exactly
    const columns = [
      'id', 'player_id', 'name', 'position', 'team_name', 'nationality', 'age', 'club', 'playing_style', 'overall_rating',
      'offensive_awareness', 'ball_control', 'dribbling', 'tight_possession', 'low_pass', 'lofted_pass',
      'finishing', 'heading', 'set_piece_taking', 'curl', 'speed', 'acceleration', 'kicking_power', 'jumping',
      'physical_contact', 'balance', 'stamina', 'defensive_awareness', 'tackling', 'aggression',
      'defensive_engagement', 'gk_awareness', 'gk_catching', 'gk_parrying', 'gk_reflexes', 'gk_reach',
      'is_auction_eligible', 'is_sold'
    ];

    const valuePlaceholders: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    playersToApply.forEach((p: any) => {
      const rowPlaceholders: string[] = [];
      const uuid = randomUUID();

      // Push values for each column
      rowPlaceholders.push(`$${paramIndex++}`);
      queryParams.push(uuid); // id (new uuid generated for new players, will be ignored/overwritten on conflict for existing ones)

      rowPlaceholders.push(`$${paramIndex++}`);
      queryParams.push(p.player_id);

      rowPlaceholders.push(`$${paramIndex++}`);
      queryParams.push(p.name);

      rowPlaceholders.push(`$${paramIndex++}`);
      queryParams.push(p.position || null);

      rowPlaceholders.push(`$${paramIndex++}`);
      queryParams.push(p.team_name || null);

      rowPlaceholders.push(`$${paramIndex++}`);
      queryParams.push(p.nationality || null);

      rowPlaceholders.push(`$${paramIndex++}`);
      queryParams.push(p.age ? Number(p.age) : null);

      rowPlaceholders.push(`$${paramIndex++}`);
      queryParams.push(p.team_name || null); // club (mirror team_name)

      rowPlaceholders.push(`$${paramIndex++}`);
      queryParams.push(p.playing_style || null);

      rowPlaceholders.push(`$${paramIndex++}`);
      queryParams.push(p.overall_rating ? Number(p.overall_rating) : null);

      // Push 28 stats columns
      const statsFields = [
        'offensive_awareness', 'ball_control', 'dribbling', 'tight_possession', 'low_pass', 'lofted_pass',
        'finishing', 'heading', 'set_piece_taking', 'curl', 'speed', 'acceleration', 'kicking_power', 'jumping',
        'physical_contact', 'balance', 'stamina', 'defensive_awareness', 'tackling', 'aggression',
        'defensive_engagement', 'gk_awareness', 'gk_catching', 'gk_parrying', 'gk_reflexes', 'gk_reach'
      ];

      statsFields.forEach((field: any) => {
        rowPlaceholders.push(`$${paramIndex++}`);
        queryParams.push(p[field] !== undefined ? Number(p[field]) : 0);
      });

      // Default values for eligible/sold
      rowPlaceholders.push(`$${paramIndex++}`);
      queryParams.push(true); // is_auction_eligible

      rowPlaceholders.push(`$${paramIndex++}`);
      queryParams.push(false); // is_sold

      valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
    });

    // Chunk size safety (PostgreSQL max parameters is 65535, we use 38 parameters per player)
    // 38 params * 1000 players = 38000 (well within limits). We will execute in chunks of 500 players for safety.
    const chunkSize = 500;
    let appliedCount = 0;

    const { Pool } = await import('@neondatabase/serverless');
    const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

    try {
      for (let i = 0; i < playersToApply.length; i += chunkSize) {
        const chunk = playersToApply.slice(i, i + chunkSize);
        const chunkPlaceholders: string[] = [];
        const chunkParams: any[] = [];
        let chunkParamIndex = 1;

        chunk.forEach((p: any) => {
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
          chunkParams.push(null); // team_name (fantasy team, initially null)

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

          const statsFields = [
            'offensive_awareness', 'ball_control', 'dribbling', 'tight_possession', 'low_pass', 'lofted_pass',
            'finishing', 'heading', 'set_piece_taking', 'curl', 'speed', 'acceleration', 'kicking_power', 'jumping',
            'physical_contact', 'balance', 'stamina', 'defensive_awareness', 'tackling', 'aggression',
            'defensive_engagement', 'gk_awareness', 'gk_catching', 'gk_parrying', 'gk_reflexes', 'gk_reach'
          ];

          statsFields.forEach((field: any) => {
            rowPlaceholders.push(`$${chunkParamIndex++}`);
            chunkParams.push(p[field] !== undefined ? Number(p[field]) : 0);
          });

          rowPlaceholders.push(`$${chunkParamIndex++}`);
          chunkParams.push(true); // is_auction_eligible

          rowPlaceholders.push(`$${chunkParamIndex++}`);
          chunkParams.push(false); // is_sold

          chunkPlaceholders.push(`(${rowPlaceholders.join(', ')})`);
        });

        const query = `
          INSERT INTO footballplayers (${columns.join(', ')})
          VALUES ${chunkPlaceholders.join(', ')}
          ON CONFLICT (player_id) DO UPDATE SET
            position = COALESCE(NULLIF(EXCLUDED.position, ''), footballplayers.position),
            overall_rating = COALESCE(NULLIF(EXCLUDED.overall_rating, 0), footballplayers.overall_rating),
            playing_style = COALESCE(NULLIF(EXCLUDED.playing_style, ''), footballplayers.playing_style),
            club = COALESCE(NULLIF(EXCLUDED.club, ''), footballplayers.club),
            age = COALESCE(NULLIF(EXCLUDED.age, 0), footballplayers.age),
            nationality = COALESCE(NULLIF(EXCLUDED.nationality, ''), footballplayers.nationality),
            offensive_awareness = COALESCE(NULLIF(EXCLUDED.offensive_awareness, 0), footballplayers.offensive_awareness),
            ball_control = COALESCE(NULLIF(EXCLUDED.ball_control, 0), footballplayers.ball_control),
            dribbling = COALESCE(NULLIF(EXCLUDED.dribbling, 0), footballplayers.dribbling),
            tight_possession = COALESCE(NULLIF(EXCLUDED.tight_possession, 0), footballplayers.tight_possession),
            low_pass = COALESCE(NULLIF(EXCLUDED.low_pass, 0), footballplayers.low_pass),
            lofted_pass = COALESCE(NULLIF(EXCLUDED.lofted_pass, 0), footballplayers.lofted_pass),
            finishing = COALESCE(NULLIF(EXCLUDED.finishing, 0), footballplayers.finishing),
            heading = COALESCE(NULLIF(EXCLUDED.heading, 0), footballplayers.heading),
            set_piece_taking = COALESCE(NULLIF(EXCLUDED.set_piece_taking, 0), footballplayers.set_piece_taking),
            curl = COALESCE(NULLIF(EXCLUDED.curl, 0), footballplayers.curl),
            speed = COALESCE(NULLIF(EXCLUDED.speed, 0), footballplayers.speed),
            acceleration = COALESCE(NULLIF(EXCLUDED.acceleration, 0), footballplayers.acceleration),
            kicking_power = COALESCE(NULLIF(EXCLUDED.kicking_power, 0), footballplayers.kicking_power),
            jumping = COALESCE(NULLIF(EXCLUDED.jumping, 0), footballplayers.jumping),
            physical_contact = COALESCE(NULLIF(EXCLUDED.physical_contact, 0), footballplayers.physical_contact),
            balance = COALESCE(NULLIF(EXCLUDED.balance, 0), footballplayers.balance),
            stamina = COALESCE(NULLIF(EXCLUDED.stamina, 0), footballplayers.stamina),
            defensive_awareness = COALESCE(NULLIF(EXCLUDED.defensive_awareness, 0), footballplayers.defensive_awareness),
            tackling = COALESCE(NULLIF(EXCLUDED.tackling, 0), footballplayers.tackling),
            aggression = COALESCE(NULLIF(EXCLUDED.aggression, 0), footballplayers.aggression),
            defensive_engagement = COALESCE(NULLIF(EXCLUDED.defensive_engagement, 0), footballplayers.defensive_engagement),
            gk_awareness = COALESCE(NULLIF(EXCLUDED.gk_awareness, 0), footballplayers.gk_awareness),
            gk_catching = COALESCE(NULLIF(EXCLUDED.gk_catching, 0), footballplayers.gk_catching),
            gk_parrying = COALESCE(NULLIF(EXCLUDED.gk_parrying, 0), footballplayers.gk_parrying),
            gk_reflexes = COALESCE(NULLIF(EXCLUDED.gk_reflexes, 0), footballplayers.gk_reflexes),
            gk_reach = COALESCE(NULLIF(EXCLUDED.gk_reach, 0), footballplayers.gk_reach),
            updated_at = NOW();
        `;

        await pool.query(query, chunkParams);
        appliedCount += chunk.length;
      }
    } finally {
      await pool.end();
    }

    // Commented out: Auto truncate the temp table. We now keep the temp data.
    /*
    try {
      await tempSql.query('TRUNCATE TABLE temp_players_import');
      console.log('✅ Temporary import table successfully cleared.');
    } catch (e: any) {
      console.error('Failed to clear temp players table:', e);
    }
    */

    return NextResponse.json({
      success: true,
      message: `Successfully sync-applied stats and attributes for ${appliedCount} players.`
    });

  } catch (error: any) {
    console.error('❌ Error applying temp changes:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
