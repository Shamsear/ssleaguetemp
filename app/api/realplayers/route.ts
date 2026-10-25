/**
 * GET /api/realplayers?team_id=xxx&season_id=xxx&player_id=xxx&name=xxx
 * Serves realplayer data from Neon for client-side pages.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';
import { getTournamentDb, isTournamentDbAvailable } from '@/lib/neon/tournament-config';

function formatRealPlayerRow(row: any) {
  const rawData = typeof row.raw_data === 'object' && row.raw_data !== null ? row.raw_data : {};
  const stats = typeof row.stats === 'string' ? JSON.parse(row.stats) : (row.stats || {});

  return {
    ...row,
    ...rawData,
    id: row.id,
    player_id: row.player_id || row.id,
    name: row.name || rawData.name || '',
    display_name: row.display_name || rawData.display_name || row.name || rawData.name || '',
    email: row.email || rawData.email || '',
    phone: row.phone || rawData.phone || '',
    team: row.team || row.team_name || rawData.team || '',
    team_name: row.team_name || row.team || rawData.team || '',
    team_code: row.team_code || rawData.team_code || '',
    team_id: row.team_id || rawData.team_id || '',
    season_id: row.season_id || rawData.season_id || '',
    season_name: row.season_name || rawData.season_name || '',
    category: row.category || row.category_name || row.category_id || rawData.category || '',
    category_name: row.category_name || row.category || rawData.category_name || '',
    category_id: row.category_id || rawData.category_id || '',
    role: row.role || rawData.role || 'player',
    is_registered: row.is_registered ?? rawData.is_registered ?? false,
    is_active: row.is_active ?? rawData.is_active ?? true,
    is_available: row.is_available ?? rawData.is_available ?? true,
    place: row.place || rawData.place || '',
    date_of_birth: row.date_of_birth || rawData.date_of_birth || '',
    photo_url: row.photo_url || rawData.photo_url || row.profile_image || rawData.profile_image || '',
    photo_file_id: row.photo_file_id || rawData.photo_file_id || '',
    used_smart_assist: row.used_smart_assist || rawData.used_smart_assist || '',
    previous_season_team: row.previous_season_team || rawData.previous_season_team || '',
    previous_season_team_id: row.previous_season_team_id || rawData.previous_season_team_id || '',
    previous_season_category: row.previous_season_category || rawData.previous_season_category || '',
    previous_season_id: row.previous_season_id || rawData.previous_season_id || '',
    stats,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

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

    let result: any[];

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

      if (result.length > 0 && isTournamentDbAvailable()) {
        try {
          const tSql = getTournamentDb();
          const pId = result[0].player_id || playerId;
          const targetSeasonNum = seasonId ? parseInt(seasonId.replace(/\D/g, '')) || 999 : 999;

          const [rpsHistory, psHistory] = await Promise.all([
            tSql`
              SELECT season_id, team, team_id, category, used_smart_assist
              FROM realplayerstats
              WHERE (player_id = ${pId} OR id = ${pId}) AND team IS NOT NULL AND team != ''
            `.catch(() => []),
            tSql`
              SELECT season_id, team, team_id, category
              FROM player_seasons
              WHERE (player_id = ${pId} OR id = ${pId}) AND team IS NOT NULL AND team != ''
            `.catch(() => []),
          ]);

          const combined = [...rpsHistory, ...psHistory]
            .map((entry: any) => {
              const sNum = parseInt((entry.season_id || '').replace(/\D/g, '')) || 0;
              return { ...entry, sNum };
            })
            .filter((entry: any) => entry.sNum < targetSeasonNum)
            .sort((a: any, b: any) => b.sNum - a.sNum);

          if (combined.length > 0) {
            const latestPrev = combined[0];
            result[0].previous_season_team = latestPrev.team;
            result[0].previous_season_team_id = latestPrev.team_id;
            result[0].previous_season_category = latestPrev.category;
            result[0].previous_season_id = latestPrev.season_id;
            if (latestPrev.used_smart_assist && !result[0].used_smart_assist) {
              result[0].used_smart_assist = latestPrev.used_smart_assist;
            }
          }
        } catch (e: any) {
          console.warn('Could not fetch player season history:', e.message);
        }
      }
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

    return NextResponse.json({ success: true, data: result.map(formatRealPlayerRow) });
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
