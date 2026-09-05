import { getMainDb } from '@/lib/neon/main-config';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

/**
 * GET /api/team-seasons
 * Fetch team_season data for a user and/or season
 * Query params:
 * - user_id: Firebase user UID or team owner UID
 * - season_id: Season ID
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('user_id');
    const seasonId = searchParams.get('season_id');

    // 1. If only season_id is provided, return ALL team seasons for that season
    if (seasonId && !userId) {
      let rows: any[] = [];
      try {
        const { getMainDb } = await import('@/lib/neon/main-config');
        const sql = getMainDb();
        rows = await sql`SELECT * FROM team_seasons WHERE season_id = ${seasonId} ORDER BY team_name ASC`;
      } catch (sqlErr) {
        console.error('Error fetching team_seasons from Neon SQL:', sqlErr);
      }

      if (rows.length === 0) {
        try {
          const snapshot = await adminDb.collection('team_seasons').where('season_id', '==', seasonId).get();
          rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (fbErr) {
          console.error('Error fetching team_seasons from Firebase:', fbErr);
        }
      }

      return NextResponse.json({ success: true, data: rows, teamSeasons: rows });
    }

    // 2. If only user_id is provided, return ALL team seasons for that user
    if (userId && !seasonId) {
      let rows: any[] = [];
      try {
        const { getMainDb } = await import('@/lib/neon/main-config');
        const sql = getMainDb();
        rows = await sql`SELECT * FROM team_seasons WHERE user_id = ${userId} OR team_id = ${userId} ORDER BY joined_at DESC`;
      } catch (sqlErr) {
        console.error('Error fetching user team_seasons from Neon SQL:', sqlErr);
      }

      if (rows.length === 0) {
        try {
          const snapshot = await adminDb
            .collection('team_seasons')
            .where('user_id', '==', userId)
            .get();
          rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (fbErr) {
          console.error('Error fetching user team_seasons from Firebase:', fbErr);
        }
      }

      return NextResponse.json({ success: true, data: rows, teamSeasons: rows });
    }

    // 3. If BOTH user_id and season_id are provided
    if (userId && seasonId) {
      let teamSeasonData: any = null;

      try {
        const { getMainDb } = await import('@/lib/neon/main-config');
        const sql = getMainDb();
        const rows = await sql`SELECT * FROM team_seasons WHERE (user_id = ${userId} OR team_id = ${userId}) AND season_id = ${seasonId} LIMIT 1`;
        if (rows.length > 0) {
          teamSeasonData = rows[0];
        }
      } catch (sqlErr) {
        console.error('Error fetching single team_season from Neon SQL:', sqlErr);
      }

      if (!teamSeasonData) {
        try {
          const teamSeasonsQuery = await adminDb
            .collection('team_seasons')
            .where('user_id', '==', userId)
            .where('season_id', '==', seasonId)
            .limit(1)
            .get();

          if (!teamSeasonsQuery.empty) {
            const doc = teamSeasonsQuery.docs[0];
            teamSeasonData = { id: doc.id, ...doc.data() };
          }
        } catch (fbErr) {
          console.error('Error fetching single team_season from Firebase:', fbErr);
        }
      }

      if (!teamSeasonData) {
        // Fall back to any season for this user if specified season match wasn't found
        try {
          const snapshot = await adminDb
            .collection('team_seasons')
            .where('user_id', '==', userId)
            .get();
          if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            teamSeasonData = { id: doc.id, ...doc.data() };
          }
        } catch (fbErr) {
          console.error('Error fetching fallback team_season:', fbErr);
        }
      }

      if (!teamSeasonData) {
        return NextResponse.json(
          { success: false, error: 'No team registration found for this user' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        team_season: teamSeasonData,
        data: [teamSeasonData],
        teamSeasons: [teamSeasonData],
      });
    }

    // 4. If no parameters provided: return recent team_seasons
    let rows: any[] = [];
    try {
      const { getMainDb } = await import('@/lib/neon/main-config');
      const sql = getMainDb();
      rows = await sql`SELECT * FROM team_seasons ORDER BY joined_at DESC LIMIT 100`;
    } catch {
      const snapshot = await adminDb.collection('team_seasons').limit(100).get();
      rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    return NextResponse.json({ success: true, data: rows, teamSeasons: rows });
  } catch (error: any) {
    console.error('Error fetching team_season:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch team season' },
      { status: 500 }
    );
  }
}
