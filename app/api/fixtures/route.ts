import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { getMainDb } from '@/lib/neon/main-config';
import { adminDb } from '@/lib/firebase/admin';

// GET - Get fixtures with optional filters
export async function GET(request: NextRequest) {
  try {
    const sql = getTournamentDb();
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('season_id');
    const tournamentId = searchParams.get('tournament_id');
    const status = searchParams.get('status');
    const roundNumber = searchParams.get('round_number');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : null;

    let fixtures: any[];

    if (seasonId && status && limit) {
      // Most common case: season + status + limit
      fixtures = await sql`
        SELECT f.*
        FROM fixtures f
        WHERE LOWER(f.season_id) = LOWER(${seasonId})
          AND f.status = ${status}
        ORDER BY f.round_number DESC, f.match_number ASC
        LIMIT ${limit}
      `;
    } else if (seasonId && status) {
      fixtures = await sql`
        SELECT f.*
        FROM fixtures f
        WHERE LOWER(f.season_id) = LOWER(${seasonId})
          AND f.status = ${status}
        ORDER BY f.round_number DESC, f.match_number ASC
      `;
    } else if (tournamentId && roundNumber) {
      fixtures = await sql`
        SELECT f.*
        FROM fixtures f
        WHERE f.tournament_id = ${tournamentId}
          AND f.round_number = ${parseInt(roundNumber)}
        ORDER BY f.match_number ASC
      `;
    } else if (tournamentId) {
      fixtures = await sql`
        SELECT f.*
        FROM fixtures f
        WHERE f.tournament_id = ${tournamentId}
        ORDER BY f.round_number ASC, f.match_number ASC
      `;
    } else if (seasonId) {
      fixtures = await sql`
        SELECT f.*
        FROM fixtures f
        WHERE LOWER(f.season_id) = LOWER(${seasonId})
        ORDER BY f.round_number ASC, f.match_number ASC
      `;
    } else {
      // No filters - return recent fixtures
      fixtures = await sql`
        SELECT f.*
        FROM fixtures f
        ORDER BY f.created_at DESC
        LIMIT 100
      `;
    }

    // Enrich fixtures with team logos from mainDb (or adminDb fallback)
    const logosMap: Record<string, string | null> = {};
    if (fixtures && fixtures.length > 0) {
      try {
        const mainSql = getMainDb();
        const activeSeason = seasonId || fixtures[0]?.season_id;
        const tsRows = activeSeason ? await mainSql`
          SELECT team_id, team_name, logo_url, raw_data
          FROM team_seasons
          WHERE LOWER(season_id) = LOWER(${activeSeason})
        ` : [];
        const tRows = await mainSql`
          SELECT id, team_id, team_name, logo_url, raw_data
          FROM teams
        `;

        tsRows.forEach((r: any) => {
          const logo = r.logo_url || r.raw_data?.logo_url || r.raw_data?.team_logo || r.raw_data?.logoUrl || null;
          if (logo) {
            if (r.team_id) logosMap[r.team_id] = logo;
            if (r.team_name) logosMap[r.team_name.toLowerCase()] = logo;
          }
        });

        tRows.forEach((r: any) => {
          const logo = r.logo_url || r.raw_data?.logo_url || r.raw_data?.team_logo || r.raw_data?.logoUrl || null;
          if (logo) {
            if (r.id && !logosMap[r.id]) logosMap[r.id] = logo;
            if (r.team_id && !logosMap[r.team_id]) logosMap[r.team_id] = logo;
            if (r.team_name && !logosMap[r.team_name.toLowerCase()]) logosMap[r.team_name.toLowerCase()] = logo;
          }
        });
      } catch (e) {
        console.warn('Error fetching team logos from mainDb in /api/fixtures:', e);
      }

      // Fallback to adminDb if mainDb had no logos
      if (Object.keys(logosMap).length === 0) {
        try {
          const teamDocs = await adminDb.collection('teams').get();
          teamDocs.docs.forEach((doc: any) => {
            const d = doc.data();
            const logo = d.logo_url || d.team_logo || d.logoUrl || d.logoURL || null;
            if (logo) {
              logosMap[doc.id] = logo;
              if (d.name) logosMap[d.name.toLowerCase()] = logo;
              if (d.team_name) logosMap[d.team_name.toLowerCase()] = logo;
            }
          });
        } catch (fbErr) {
          console.warn('Error fetching fallback team logos from Firebase:', fbErr);
        }
      }
    }

    const enrichedFixtures = fixtures.map((f: any) => ({
      ...f,
      home_team_logo: f.home_team_logo || logosMap[f.home_team_id] || (f.home_team_name ? logosMap[f.home_team_name.toLowerCase()] : null) || null,
      away_team_logo: f.away_team_logo || logosMap[f.away_team_id] || (f.away_team_name ? logosMap[f.away_team_name.toLowerCase()] : null) || null,
    }));

    return NextResponse.json({
      success: true,
      fixtures: enrichedFixtures,
      count: enrichedFixtures.length
    });

  } catch (error: any) {
    console.error('Error fetching fixtures:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch fixtures'
    }, { status: 500 });
  }
}
