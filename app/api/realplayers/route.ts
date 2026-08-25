/**
 * GET /api/realplayers?team_id=xxx&season_id=xxx&player_id=xxx&name=xxx
 * Serves realplayer data from Neon for client-side pages.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';

export async function GET(request: NextRequest) {
  try {
    if (!isMainDbAvailable()) {
      return NextResponse.json({ success: false, error: 'Neon not configured' }, { status: 500 });
    }
    const sql = getMainDb();
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');
    const seasonId = searchParams.get('season_id');
    const playerId = searchParams.get('player_id');
    const name = searchParams.get('name');
    const categoryId = searchParams.get('category_id');

    let result;

    if (playerId) {
      result = await sql`
        SELECT rp.*, s.name as season_name, c.name as category_name,
          ts.team_name, ts.team_code
        FROM realplayers rp
        LEFT JOIN seasons s ON rp.season_id = s.id
        LEFT JOIN categories c ON rp.category_id = c.id
        LEFT JOIN team_seasons ts ON rp.team_id = ts.team_id AND rp.season_id = ts.season_id
        WHERE rp.player_id = ${playerId} OR rp.id = ${playerId}
        LIMIT 1
      `;
    } else if (teamId && seasonId) {
      result = await sql`
        SELECT rp.*, s.name as season_name, c.name as category_name,
          ts.team_name, ts.team_code
        FROM realplayers rp
        LEFT JOIN seasons s ON rp.season_id = s.id
        LEFT JOIN categories c ON rp.category_id = c.id
        LEFT JOIN team_seasons ts ON rp.team_id = ts.team_id AND rp.season_id = ts.season_id
        WHERE rp.team_id = ${teamId} AND rp.season_id = ${seasonId}
        ORDER BY rp.name ASC
      `;
    } else if (teamId) {
      result = await sql`
        SELECT rp.*, s.name as season_name, c.name as category_name,
          ts.team_name, ts.team_code
        FROM realplayers rp
        LEFT JOIN seasons s ON rp.season_id = s.id
        LEFT JOIN categories c ON rp.category_id = c.id
        LEFT JOIN team_seasons ts ON rp.team_id = ts.team_id AND rp.season_id = ts.season_id
        WHERE rp.team_id = ${teamId}
        ORDER BY rp.name ASC
      `;
    } else if (seasonId) {
      result = await sql`
        SELECT rp.*, c.name as category_name, ts.team_name, ts.team_code
        FROM realplayers rp
        LEFT JOIN categories c ON rp.category_id = c.id
        LEFT JOIN team_seasons ts ON rp.team_id = ts.team_id AND rp.season_id = ts.season_id
        WHERE rp.season_id = ${seasonId}
        ORDER BY rp.name ASC
      `;
    } else {
      // All players
      result = await sql`
        SELECT rp.*, s.name as season_name, c.name as category_name,
          ts.team_name, ts.team_code
        FROM realplayers rp
        LEFT JOIN seasons s ON rp.season_id = s.id
        LEFT JOIN categories c ON rp.category_id = c.id
        LEFT JOIN team_seasons ts ON rp.team_id = ts.team_id AND rp.season_id = ts.season_id
        ORDER BY rp.created_at DESC
      `;
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/realplayers
 * Create or update a realplayer
 */
export async function POST(request: NextRequest) {
  try {
    if (!isMainDbAvailable()) {
      return NextResponse.json({ success: false, error: 'Neon not configured' }, { status: 500 });
    }
    const sql = getMainDb();
    const body = await request.json();
    const { action, data } = body;

    if (action === 'create') {
      const playerId = data.player_id || `sspslpsl${Date.now().toString(36).slice(-4)}`;
      const now = new Date().toISOString();
      await sql`
        INSERT INTO realplayers (
          id, player_id, name, team, season_id, category_id, team_id,
          is_registered, display_name, email, phone, role, is_active, is_available,
          stats, psn_id, xbox_id, steam_id, assigned_by, notes,
          created_at, updated_at
        ) VALUES (
          ${playerId}, ${playerId}, ${data.name}, ${data.team || null},
          ${data.season_id || null}, ${data.category_id || null}, ${data.team_id || null},
          ${data.is_registered || false}, ${data.display_name || null},
          ${data.email || null}, ${data.phone || null}, ${data.role || 'player'},
          true, true, ${JSON.stringify(data.stats || {})},
          ${data.psn_id || null}, ${data.xbox_id || null}, ${data.steam_id || null},
          ${data.assigned_by || null}, ${data.notes || null},
          ${now}, ${now}
        )
        ON CONFLICT (id) DO NOTHING
      `;
      return NextResponse.json({ success: true, player_id: playerId });
    }

    if (action === 'update') {
      const { player_id, ...updates } = data;
      const setClauses: string[] = ['updated_at = $1'];
      const values: any[] = [new Date().toISOString()];
      let idx = 2;
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) continue;
        setClauses.push(`${key} = $${idx}`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        idx++;
      }
      if (setClauses.length > 1) {
        await sql.query(
          `UPDATE realplayers SET ${setClauses.join(', ')} WHERE player_id = $${idx} OR id = $${idx}`,
          [...values, player_id]
        );
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'create') {
      const { id, ...fields } = data;
      const columns = ['id', ...Object.keys(fields).map(k => k)];
      const values = [id, ...Object.values(fields)];
      const placeholders = columns.map((_, i) => `$${i + 1}`);
      await sql.query(
        `INSERT INTO realplayers (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (id) DO NOTHING`,
        values
      );
      return NextResponse.json({ success: true, id });
    }

    if (action === 'updateStats') {
      const { player_id, stats } = data;
      const now = new Date().toISOString();
      await sql`UPDATE realplayers SET stats = ${JSON.stringify(stats)}, updated_at = ${now} WHERE player_id = ${player_id} OR id = ${player_id}`;
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      await sql`DELETE FROM realplayers WHERE player_id = ${data.player_id} OR id = ${data.player_id}`;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
