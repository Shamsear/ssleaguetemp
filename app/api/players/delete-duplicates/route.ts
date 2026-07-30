import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);

/**
 * POST /api/players/delete-duplicates
 * Delete specific player records by their database IDs
 */
export async function POST(request: NextRequest) {
  try {
    const { playerIds } = await request.json();

    if (!playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'playerIds array is required' },
        { status: 400 }
      );
    }

    console.log(`🗑️ Deleting ${playerIds.length} duplicate players...`);

    // Fetch scraped player_ids first for player_history deletion
    const players = await sql`
      SELECT player_id FROM footballplayers 
      WHERE id = ANY(${playerIds})
    `;
    const scrapedIds = players.map((p: any) => p.player_id).filter(Boolean);

    if (scrapedIds.length > 0) {
      await sql`
        DELETE FROM player_history 
        WHERE player_id = ANY(${scrapedIds})
      `;
    }

    // Delete from other referencing tables
    await sql`DELETE FROM starred_players WHERE player_id = ANY(${playerIds})`;
    await sql`DELETE FROM team_players WHERE player_id = ANY(${playerIds})`;
    await sql`DELETE FROM round_players WHERE player_id = ANY(${playerIds})`;
    await sql`DELETE FROM bids WHERE player_id = ANY(${playerIds})`;
    await sql`DELETE FROM round_bids WHERE player_id = ANY(${playerIds})`;

    // Delete players by their database IDs
    const result = await sql`
      DELETE FROM footballplayers
      WHERE id = ANY(${playerIds})
      RETURNING id, name, player_id
    `;

    console.log(`✅ Deleted ${result.length} players`);

    return NextResponse.json({
      success: true,
      deleted: result.length,
      players: result
    });
  } catch (error: any) {
    console.error('Error deleting duplicates:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
