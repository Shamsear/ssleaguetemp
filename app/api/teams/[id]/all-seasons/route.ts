import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

const sql = process.env.NEON_TOURNAMENT_DB_URL ? neon(process.env.NEON_TOURNAMENT_DB_URL) : null;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await context.params;

    if (!sql) {
      return NextResponse.json({
        success: false,
        error: 'Database not configured'
      }, { status: 500 });
    }

    // Fetch team owner from tournament database
    let ownerName = null;
    try {
      const ownerResult = await sql`
        SELECT name FROM owners 
        WHERE team_id = ${teamId} 
        AND is_active = true 
        LIMIT 1
      `;
      if (ownerResult && ownerResult.length > 0) {
        ownerName = ownerResult[0].name;
      }
    } catch (ownerError) {
      console.error('Error fetching team owner:', ownerError);
    }

    // Fetch team info from Firebase for logo
    let logoUrl = null;
    try {
      const teamDoc = await adminDb.collection('teams').doc(teamId).get();
      if (teamDoc.exists) {
        const teamData = teamDoc.data();
        logoUrl = teamData?.logo_url || null;

        // Fallback to users collection if no logo in teams
        if (!logoUrl && teamData?.user_id) {
          try {
            const userDoc = await adminDb.collection('users').doc(teamData.user_id).get();
            if (userDoc.exists) {
              
            }
          } catch (userError) {
            console.error('Error fetching user for logo fallback:', userError);
          }
        }
      }
    } catch (error: any) {
      console.error('Error fetching team from Firebase:', error);
    }

    // Fetch active seasons from Firebase to know which seasons have actually started
    const firebaseSeasons = await adminDb.collection('seasons').get();
    const activeSeasonIds = new Set();
    const seasonStatuses: Record<string, { is_active: boolean; status: string }> = {};

    firebaseSeasons.docs.forEach(doc => {
      const data = doc.data();
      seasonStatuses[doc.id] = {
        is_active: data.is_active === true,
        status: data.status
      };

      // Check if season has actually started
      let hasStarted = false;
      if (data.start_date) {
        const startDate = data.start_date.toDate ? data.start_date.toDate() : new Date(data.start_date);
        const now = new Date();
        hasStarted = startDate <= now;
      } else {
        // If no start_date, check status (backward compatibility)
        hasStarted = data.status === 'completed' || data.status === 'active';
      }

      // Include seasons that have started (based on start_date or status)
      if (hasStarted) {
        activeSeasonIds.add(doc.id);
      }
    });

    // Fetch all seasons for this team from Neon
    // NOTE: team_name is fetched per season to get historical team names
    // (e.g., "Hooligans" for S11, "Skill 555" for S12+)
    // Aggregate across all tournaments per season
    const seasonStats = await sql`
      SELECT 
        team_id,
        MAX(team_name) as team_name,
        season_id,
        SUM(matches_played) as matches_played,
        SUM(wins) as wins,
        SUM(draws) as draws,
        SUM(losses) as losses,
        SUM(goals_for) as goals_for,
        SUM(goals_against) as goals_against,
        SUM(goal_difference) as goal_difference,
        SUM(points) as points,
        MAX(position) as position
      FROM teamstats
      WHERE team_id = ${teamId}
      GROUP BY team_id, season_id
      ORDER BY COALESCE(NULLIF(REGEXP_REPLACE(season_id, '[^0-9]', '', 'g'), ''), '0')::integer DESC
    `;

    // Find any seasons the team is registered for in Firestore but has no SQL stats yet
    // (e.g. newly registered for the active season but hasn't played a match yet)
    try {
      const teamSeasonSnapshot = await adminDb
        .collection('team_seasons')
        .where('team_id', '==', teamId)
        .where('status', '==', 'registered')
        .get();

      if (!teamSeasonSnapshot.empty) {
        const sqlSeasonIds = new Set((seasonStats || []).map((s: any) => s.season_id));
        const teamDoc = await adminDb.collection('teams').doc(teamId).get();
        const fbTeamName = teamDoc.exists
          ? (teamDoc.data()?.team_name || teamDoc.data()?.name || teamId)
          : teamId;

        teamSeasonSnapshot.docs.forEach(doc => {
          const regData = doc.data();
          const regSeasonId: string = regData.season_id;

          // Only inject if not already in SQL results and the season has started
          if (!sqlSeasonIds.has(regSeasonId) && activeSeasonIds.has(regSeasonId)) {
            console.log(`[all-seasons] Injecting registered-but-unplayed season ${regSeasonId} for team ${teamId}`);
            (seasonStats as any[]).push({
              team_id: teamId,
              team_name: regData.team_name || fbTeamName,
              season_id: regSeasonId,
              matches_played: 0,
              wins: 0,
              draws: 0,
              losses: 0,
              goals_for: 0,
              goals_against: 0,
              goal_difference: 0,
              points: 0,
              position: null,
              _injected: true // mark so we know it came from registration, not SQL
            });
          }
        });
      }
    } catch (regErr) {
      console.error('[all-seasons] Error checking team_seasons registrations:', regErr);
    }

    if (!seasonStats || seasonStats.length === 0) {
      // Fallback: Check if team exists in Firebase teams collection
      try {
        const teamDoc = await adminDb.collection('teams').doc(teamId).get();
        if (teamDoc.exists) {
          const teamData = teamDoc.data()!;
          const fbTeamName = teamData.team_name || teamData.name || teamId;
          const fbOwnerName = teamData.owner_name || teamData.ownerName || null;
          const fbManagerName = teamData.manager_name || teamData.managerName || null;
          const logoUrl = teamData.logo_url || teamData.logoUrl || null;

          // Only show seasons the team is actually registered for
          const registeredSeasons: string[] = teamData.seasons || [];

          if (registeredSeasons.length === 0) {
            // Team exists but has never been registered for any season yet
            return NextResponse.json({
              success: true,
              seasons: [],
              team: {
                team_id: teamId,
                team_name: fbTeamName,
                logo_url: logoUrl,
                owner_name: ownerName || fbOwnerName,
                manager_name: fbManagerName,
              },
              message: 'Team has not been registered for any season yet'
            });
          }

          // Build a starter entry for each registered season (with 0 stats since no SQL records exist yet)
          const fallbackSeasons = registeredSeasons.map((seasonId: string) => ({
            id: `${teamId}_${seasonId}`,
            team_id: teamId,
            team_name: fbTeamName,
            team_code: teamId,
            season_id: seasonId,
            season_name: seasonId,
            logo_url: logoUrl,
            owner_name: ownerName || fbOwnerName,
            manager_name: fbManagerName,
            stats: {
              matches_played: 0,
              wins: 0,
              draws: 0,
              losses: 0,
              goals_for: 0,
              goals_against: 0,
              goal_difference: 0,
              points: 0,
              clean_sheets: 0,
              position: null,
              form: null
            },
            players: [],
            trophies: []
          }));

          // Sort most recent season first
          fallbackSeasons.sort((a: any, b: any) => {
            const numA = parseInt(a.season_id.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.season_id.replace(/\D/g, '')) || 0;
            return numB - numA;
          });

          return NextResponse.json({
            success: true,
            seasons: fallbackSeasons
          });
        }
      } catch (fbError) {
        console.error('Error fetching fallback team from Firebase:', fbError);
      }

      return NextResponse.json({
        success: false,
        error: 'No team data found'
      }, { status: 404 });
    }

    const seasons: any[] = [];

    // Process each season (only those that have started)
    for (const seasonData of seasonStats) {
      const seasonId = seasonData.season_id;

      // Skip seasons that haven't started yet (future contract seasons)
      if (!activeSeasonIds.has(seasonId)) {
        console.log(`Skipping future season ${seasonId} for team ${teamId}`);
        continue;
      }

      // Fetch manager for this team and season
      let managerName = null;
      try {
        const managerResult = await sql`
          SELECT name FROM managers 
          WHERE team_id = ${teamId} 
          AND season_id = ${seasonId}
          AND is_active = true 
          LIMIT 1
        `;
        if (managerResult && managerResult.length > 0) {
          managerName = managerResult[0].name;
        }
      } catch (managerError) {
        console.error('Error fetching manager:', managerError);
      }

      // Fetch players for this team and season
      let players: any[] = [];
      try {
        const neonPlayers = await sql`
          SELECT 
            player_id,
            player_name,
            matches_played,
            goals_scored,
            assists,
            clean_sheets,
            points,
            category
          FROM realplayerstats
          WHERE team_id = ${teamId} AND season_id = ${seasonId}
          ORDER BY points DESC
        `;

        players = neonPlayers.map((player: any) => ({
          player_id: player.player_id,
          player_name: player.player_name,
          matches_played: player.matches_played || 0,
          goals: player.goals_scored || 0,
          assists: player.assists || 0,
          clean_sheets: player.clean_sheets || 0,
          points: player.points || 0,
          category: player.category
        }));
      } catch (error: any) {
        console.error('Error fetching players:', error);
      }

      // Fetch trophies for this team and season
      let trophies: any[] = [];
      try {
        const neonTrophies = await sql`
          SELECT 
            id,
            trophy_name,
            trophy_type,
            position,
            trophy_position,
            notes
          FROM team_trophies
          WHERE team_id = ${teamId} AND season_id = ${seasonId}
          ORDER BY id DESC
        `;

        trophies = neonTrophies.map((trophy: any) => ({
          id: trophy.id,
          trophy_name: trophy.trophy_name,
          trophy_type: trophy.trophy_type,
          position: trophy.position,
          trophy_position: trophy.trophy_position,
          notes: trophy.notes
        }));
      } catch (error: any) {
        console.error('Error fetching trophies:', error);
      }

      seasons.push({
        id: `${teamId}_${seasonId}`,
        team_id: teamId,
        team_name: seasonData.team_name || teamId,
        team_code: teamId,
        season_id: seasonId,
        season_name: seasonId,
        logo_url: logoUrl,
        owner_name: ownerName,
        manager_name: managerName,
        stats: {
          matches_played: seasonData.matches_played || 0,
          wins: seasonData.wins || 0,
          draws: seasonData.draws || 0,
          losses: seasonData.losses || 0,
          goals_for: seasonData.goals_for || 0,
          goals_against: seasonData.goals_against || 0,
          goal_difference: seasonData.goal_difference || 0,
          points: seasonData.points || 0,
          clean_sheets: 0,
          position: seasonData.position,
          form: null
        },
        players,
        trophies
      });
    }

    if (seasons.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No team data found'
      }, { status: 404 });
    }

    // Sort by most recent season first
    seasons.sort((a, b) => {
      const numA = parseInt(a.season_id.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.season_id.replace(/\D/g, '')) || 0;
      return numB - numA;
    });

    return NextResponse.json({
      success: true,
      seasons
    });
  } catch (error: any) {
    console.error('Error fetching team seasons:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch team data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
