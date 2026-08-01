import { NextRequest, NextResponse } from 'next/server';
import { tempSql, initializeTempTable } from '@/lib/neon/temp-config';

export async function GET(request: NextRequest) {
  try {
    await initializeTempTable();
    const tempPlayers = await tempSql.query('SELECT * FROM temp_players_import ORDER BY overall_rating DESC, name ASC');
    return NextResponse.json({ success: true, players: tempPlayers });
  } catch (error: any) {
    console.error('❌ Error fetching temp players:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'clear') {
      await tempSql.query('TRUNCATE TABLE temp_players_import');
      return NextResponse.json({ success: true, message: 'Temporary import table successfully cleared.' });
    }

    if (action === 'delete') {
      const { playerId } = body;
      if (!playerId) {
        return NextResponse.json({ success: false, error: 'playerId is required' }, { status: 400 });
      }
      await tempSql.query('DELETE FROM temp_players_import WHERE player_id = $1', [playerId]);
      return NextResponse.json({ success: true, message: `Player ${playerId} successfully deleted.` });
    }

    if (action === 'delete_multiple') {
      const { playerIds } = body;
      if (!playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
        return NextResponse.json({ success: false, error: 'playerIds array is required' }, { status: 400 });
      }
      await tempSql.query('DELETE FROM temp_players_import WHERE player_id = ANY($1)', [playerIds]);
      return NextResponse.json({ success: true, message: `${playerIds.length} players successfully deleted.` });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('❌ Error updating temp players:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
