import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/firebase/admin';

/**
 * POST /api/contracts/assign-bulk
 * Body: {
 *   seasonId: string,
 *   players: Array<{ id: string, teamId: string, playerName: string, auctionValue: number }>
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(['committee'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { seasonId, players } = body;

    if (!seasonId || !players || !Array.isArray(players)) {
      return NextResponse.json(
        { error: 'seasonId and players array are required' },
        { status: 400 }
      );
    }

    const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
    const isModern = seasonNum === 16 || seasonNum === 17;

    const sql = getTournamentDb();

    // Fetch team name mapping from Firestore team_seasons to set human-readable team names
    const teamNameMap = new Map<string, string>();
    try {
      const teamSeasonsSnap = await adminDb.collection('team_seasons')
        .where('season_id', '==', seasonId)
        .get();
      teamSeasonsSnap.docs.forEach(doc => {
        const data = doc.data();
        const tId = data.team_id || doc.id.split('_')[0];
        const tName = data.team_name || data.team_code || 'Unknown Team';
        teamNameMap.set(tId, tName);
      });
    } catch (e) {
      console.error('Error fetching team names from Firestore:', e);
    }

    for (const player of players) {
      const teamName = teamNameMap.get(player.teamId) || 'Unknown Team';

      if (isModern) {
        // S16 / S17: update player_seasons table
        await sql`
          UPDATE player_seasons
          SET team_id = ${player.teamId},
              team = ${teamName},
              auction_value = ${player.auctionValue},
              updated_at = NOW()
          WHERE id = ${player.id}
        `;
      } else {
        // S18+: update realplayerstats table
        await sql`
          UPDATE realplayerstats
          SET team_id = ${player.teamId},
              team = ${teamName},
              price = ${player.auctionValue},
              updated_at = NOW()
          WHERE id = ${player.id}
        `;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Assigned ${players.length} players to their teams successfully.`
    });
  } catch (error: any) {
    console.error('[assign-bulk] Error assigning players:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to assign players' },
      { status: 500 }
    );
  }
}
