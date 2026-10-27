import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon/config';
import { cookies } from 'next/headers';
import { getFirebaseUidFromToken } from '@/lib/jwt-decode';
import { neonGetActiveSeason } from '@/lib/neon/seasons';

// Simple in-memory cache for team_id lookups (expires after 5 minutes)
const teamIdCache = new Map<string, { teamId: string; expiresAt: number }>();

function getCachedTeamId(firebaseUid: string): string | null {
  const cached = teamIdCache.get(firebaseUid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.teamId;
  }
  teamIdCache.delete(firebaseUid);
  return null;
}

function setCachedTeamId(firebaseUid: string, teamId: string) {
  teamIdCache.set(firebaseUid, {
    teamId,
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = (page - 1) * limit;
    const search = searchParams.get('search') || '';
    const position = searchParams.get('position') || '';
    const positionGroup = searchParams.get('position_group') || '';
    const playingStyle = searchParams.get('playing_style') || '';
    const teamIdFilter = searchParams.get('team_id') || '';
    const starredOnly = searchParams.get('starred_only') === 'true';
    const assignedOnly = searchParams.get('assigned_only') === 'true';
    const seasonId = searchParams.get('season_id') || '';

    // Determine current active season number from Neon Main DB
    let activeSeasonNum = 19;
    try {
      const activeSeason = await neonGetActiveSeason();
      if (activeSeason) {
        activeSeasonNum =
          activeSeason.season_number ||
          parseInt(activeSeason.id.replace(/\D/g, '')) ||
          19;
      }
    } catch {
      // default 19
    }

    // Get Neon team_id from Firebase token (if authenticated)
    let teamId: string | null = null;
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get('token')?.value;
      if (token) {
        try {
          const firebaseUid = getFirebaseUidFromToken(token);

          if (firebaseUid) {
            teamId = getCachedTeamId(firebaseUid);

            if (!teamId) {
              const teamResult = await sql`
                SELECT id FROM teams WHERE firebase_uid = ${firebaseUid} LIMIT 1
              `;

              if (teamResult.length > 0 && teamResult[0].id) {
                const fetchedTeamId = teamResult[0].id as string;
                teamId = fetchedTeamId;
                setCachedTeamId(firebaseUid, fetchedTeamId);
              }
            }
          }
        } catch (decodeError) {
          console.log('Token decode skipped:', decodeError);
        }
      }
    } catch (authError) {
      console.log('Auth check skipped for database request:', authError);
    }

    // Build query with filters - use conditional queries
    let players, countResult;

    // Build WHERE conditions dynamically
    const whereParts: string[] = ['(fp.retired IS NOT TRUE)'];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (search) {
      whereParts.push(`unaccent(fp.name) ILIKE unaccent($${paramIndex++})`);
      queryParams.push(`%${search}%`);
    }

    if (position) {
      whereParts.push(`fp.position = $${paramIndex++}`);
      queryParams.push(position);
    }

    if (positionGroup) {
      whereParts.push(`fp.position_group = $${paramIndex++}`);
      queryParams.push(positionGroup);
    }

    if (playingStyle) {
      whereParts.push(`fp.playing_style = $${paramIndex++}`);
      queryParams.push(playingStyle);
    }

    if (teamIdFilter) {
      if (teamIdFilter === 'free_agent') {
        if (!seasonId) {
          // In active season, Free Agent means team_id IS NULL OR contract has expired
          whereParts.push(
            `(fp.team_id IS NULL OR COALESCE(NULLIF(REGEXP_REPLACE(fp.contract_end_season, '[^0-9]', '', 'g'), ''), '0')::int < ${activeSeasonNum})`
          );
        } else {
          whereParts.push('fp.team_id IS NULL');
        }
      } else {
        if (!seasonId) {
          whereParts.push(
            `(fp.team_id = $${paramIndex++} AND COALESCE(NULLIF(REGEXP_REPLACE(fp.contract_end_season, '[^0-9]', '', 'g'), ''), '0')::int >= ${activeSeasonNum})`
          );
          queryParams.push(teamIdFilter);
        } else {
          whereParts.push(`fp.team_id = $${paramIndex++}`);
          queryParams.push(teamIdFilter);
        }
      }
    }

    // Filter for only assigned players (have active team_id)
    if (assignedOnly) {
      if (!seasonId) {
        whereParts.push(
          `(fp.team_id IS NOT NULL AND COALESCE(NULLIF(REGEXP_REPLACE(fp.contract_end_season, '[^0-9]', '', 'g'), ''), '0')::int >= ${activeSeasonNum})`
        );
      } else {
        whereParts.push('fp.team_id IS NOT NULL');
      }
    }

    if (seasonId) {
      whereParts.push(`fp.team_id IN (SELECT id FROM teams WHERE season_id = $${paramIndex++})`);
      queryParams.push(seasonId);
    }

    if (starredOnly && teamId) {
      whereParts.push('sp.id IS NOT NULL');
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    // Add teamId for the JOIN (handle null case)
    const teamIdParam = paramIndex++;
    queryParams.push(teamId || null);

    // Add limit and offset
    const limitParam = paramIndex++;
    const offsetParam = paramIndex++;
    queryParams.push(limit, offset);

    // Build the query with proper $1, $2, etc. placeholders
    const queryText = `
      SELECT 
        fp.id, fp.player_id, fp.name, fp.position, fp.position_group, fp.playing_style,
        fp.overall_rating, fp.speed, fp.acceleration, fp.ball_control, fp.dribbling,
        fp.low_pass, fp.lofted_pass, fp.finishing, fp.team_id, fp.acquisition_value,
        fp.contract_start_season, fp.contract_end_season,
        CASE WHEN sp.id IS NOT NULL THEN true ELSE false END as is_starred
      FROM footballplayers fp
      LEFT JOIN starred_players sp ON fp.id = sp.player_id AND sp.team_id = $${teamIdParam}
      ${whereClause}
      ORDER BY fp.overall_rating DESC NULLS LAST, fp.name ASC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    players = await sql.query(queryText, queryParams);

    // Fetch team names from auction DB for players that have an active team_id
    const activeTeamIds = players
      .filter((p: any) => {
        if (!p.team_id) return false;
        if (seasonId) return true;
        const endNum = p.contract_end_season
          ? parseInt(p.contract_end_season.replace(/\D/g, '')) || 0
          : 0;
        return endNum >= activeSeasonNum;
      })
      .map((p: any) => p.team_id);

    const uniqueTeamIds = [...new Set(activeTeamIds)];
    const teamNamesMap = new Map<string, string>();

    if (uniqueTeamIds.length > 0) {
      try {
        const teamsResult = await sql`
          SELECT id, name
          FROM teams
          WHERE id = ANY(${uniqueTeamIds})
        `;

        teamsResult.forEach((team: any) => {
          teamNamesMap.set(team.id, team.name || 'Unknown Team');
        });
      } catch (dbError) {
        console.error('Error fetching team names from auction DB:', dbError);
      }
    }

    // Add team_name and normalize expired contracts to free agent for current active season
    players = players.map((player: any) => {
      let effectiveTeamId = player.team_id;

      if (!seasonId && player.team_id) {
        const endNum = player.contract_end_season
          ? parseInt(player.contract_end_season.replace(/\D/g, '')) || 0
          : 0;
        if (endNum < activeSeasonNum) {
          effectiveTeamId = null;
        }
      }

      return {
        ...player,
        team_id: effectiveTeamId,
        team_name: effectiveTeamId ? teamNamesMap.get(effectiveTeamId) || null : null,
      };
    });

    // Count query (reuse params without limit/offset)
    const countParams = queryParams.slice(0, -2);
    const countQueryText = `
      SELECT COUNT(*) as total 
      FROM footballplayers fp
      LEFT JOIN starred_players sp ON fp.id = sp.player_id AND sp.team_id = $${teamIdParam}
      ${whereClause}
    `;

    countResult = await sql.query(countQueryText, countParams);

    const total = parseInt(countResult[0]?.total || '0');
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      data: {
        players,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      },
      message: 'Players fetched successfully'
    });
  } catch (error: any) {
    console.error('Error fetching players:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch players'
      },
      { status: 500 }
    );
  }
}
