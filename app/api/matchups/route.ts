/**
 * GET /api/matchups?fixture_id=xxx&player_id=xxx
 * General-purpose matchups query from Neon tournament DB
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

export async function GET(request: NextRequest) {
  try {
    const sql = getTournamentDb();
    const { searchParams } = new URL(request.url);
    const fixtureId = searchParams.get('fixture_id');
    const playerId = searchParams.get('player_id');

    if (fixtureId) {
      const matchups = await sql`
        SELECT * FROM matchups
        WHERE fixture_id = ${fixtureId}
        ORDER BY position ASC
      `;
      return NextResponse.json({ success: true, data: matchups });
    }

    if (playerId) {
      // Get all matchups where this player participated (home or away)
      const matchups = await sql`
        SELECT * FROM matchups
        WHERE home_player_id = ${playerId} OR away_player_id = ${playerId}
        ORDER BY created_at DESC
      `;
      return NextResponse.json({ success: true, data: matchups });
    }

    // No filter — return all (limited)
    const matchups = await sql`
      SELECT * FROM matchups
      ORDER BY created_at DESC
      LIMIT 500
    `;
    return NextResponse.json({ success: true, data: matchups });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
