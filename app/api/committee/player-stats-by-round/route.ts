import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

/**
 * GET /api/committee/player-stats-by-round
 * Get player statistics calculated from matchups table for a specific round or all rounds
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tournamentId = searchParams.get('tournament_id');
    const seasonId = searchParams.get('season_id');
    const roundNumber = searchParams.get('round_number'); // Optional: specific round or 'all'
    const startRound = searchParams.get('start_round'); // Optional: for range filtering
    const endRound = searchParams.get('end_round'); // Optional: for range filtering
    const viewMode = searchParams.get('view'); // Optional: 'full-season' for all tournaments

    if (!seasonId) {
      return NextResponse.json(
        { error: 'Missing required parameter: season_id' },
        { status: 400 }
      );
    }
    
    // For full season view, tournament_id is optional
    if (viewMode !== 'full-season' && !tournamentId) {
      return NextResponse.json(
        { error: 'Missing required parameter: tournament_id (unless view=full-season)' },
        { status: 400 }
      );
    }

    const sql = getTournamentDb();

    console.log(`[Player Stats By Round] Fetching stats for ${viewMode === 'full-season' ? 'FULL SEASON' : `tournament=${tournamentId}`}, season=${seasonId}, round=${roundNumber}, range=${startRound}-${endRound}`);

    // Get all matchups with fixture information
    let matchups;

    if (startRound && endRound) {
      // Filter by round range (e.g., rounds 8-13 for Week 2)
      const startNum = parseInt(startRound);
      const endNum = parseInt(endRound);
      console.log(`[Player Stats By Round] Filtering by rounds ${startNum} to ${endNum} (range)`);
      
      if (viewMode === 'full-season') {
        matchups = await sql`
          SELECT 
            m.home_player_id,
            m.home_player_name,
            m.away_player_id,
            m.away_player_name,
            m.home_goals,
            m.away_goals,
            f.round_number,
            f.home_team_id,
            f.home_team_name,
            f.away_team_id,
            f.away_team_name,
            f.motm_player_id,
            f.status,
            f.tournament_id
          FROM matchups m
          JOIN fixtures f ON m.fixture_id = f.id
          WHERE f.season_id = ${seasonId}
            AND f.round_number >= ${startNum}
            AND f.round_number <= ${endNum}
            AND f.status = 'completed'
          ORDER BY f.round_number, m.home_player_name
        `;
      } else {
        matchups = await sql`
          SELECT 
            m.home_player_id,
            m.home_player_name,
            m.away_player_id,
            m.away_player_name,
            m.home_goals,
            m.away_goals,
            f.round_number,
            f.home_team_id,
            f.home_team_name,
            f.away_team_id,
            f.away_team_name,
            f.motm_player_id,
            f.status
          FROM matchups m
          JOIN fixtures f ON m.fixture_id = f.id
          WHERE f.tournament_id = ${tournamentId}
            AND f.season_id = ${seasonId}
            AND f.round_number >= ${startNum}
            AND f.round_number <= ${endNum}
            AND f.status = 'completed'
          ORDER BY f.round_number, m.home_player_name
        `;
      }
      console.log(`[Player Stats By Round] Found ${matchups.length} matchups for rounds ${startNum}-${endNum}`);
    } else if (roundNumber && roundNumber !== 'all') {
      // Filter by rounds up to and including the selected round (cumulative)
      const roundNum = parseInt(roundNumber);
      console.log(`[Player Stats By Round] Filtering by rounds 1 to ${roundNum} (cumulative)`);
      
      if (viewMode === 'full-season') {
        matchups = await sql`
          SELECT 
            m.home_player_id,
            m.home_player_name,
            m.away_player_id,
            m.away_player_name,
            m.home_goals,
            m.away_goals,
            f.round_number,
            f.home_team_id,
            f.home_team_name,
            f.away_team_id,
            f.away_team_name,
            f.motm_player_id,
            f.status,
            f.tournament_id
          FROM matchups m
          JOIN fixtures f ON m.fixture_id = f.id
          WHERE f.season_id = ${seasonId}
            AND f.round_number <= ${roundNum}
            AND f.status = 'completed'
          ORDER BY f.round_number, m.home_player_name
        `;
      } else {
        matchups = await sql`
          SELECT 
            m.home_player_id,
            m.home_player_name,
            m.away_player_id,
            m.away_player_name,
            m.home_goals,
            m.away_goals,
            f.round_number,
            f.home_team_id,
            f.home_team_name,
            f.away_team_id,
            f.away_team_name,
            f.motm_player_id,
            f.status
          FROM matchups m
          JOIN fixtures f ON m.fixture_id = f.id
          WHERE f.tournament_id = ${tournamentId}
            AND f.season_id = ${seasonId}
            AND f.round_number <= ${roundNum}
            AND f.status = 'completed'
          ORDER BY f.round_number, m.home_player_name
        `;
      }
      console.log(`[Player Stats By Round] Found ${matchups.length} matchups for rounds 1-${roundNum}`);
    } else {
      // Get all rounds
      console.log(`[Player Stats By Round] Fetching all rounds`);
      
      if (viewMode === 'full-season') {
        matchups = await sql`
          SELECT 
            m.home_player_id,
            m.home_player_name,
            m.away_player_id,
            m.away_player_name,
            m.home_goals,
            m.away_goals,
            f.round_number,
            f.home_team_id,
            f.home_team_name,
            f.away_team_id,
            f.away_team_name,
            f.motm_player_id,
            f.status,
            f.tournament_id
          FROM matchups m
          JOIN fixtures f ON m.fixture_id = f.id
          WHERE f.season_id = ${seasonId}
            AND f.status = 'completed'
          ORDER BY f.round_number, m.home_player_name
        `;
      } else {
        matchups = await sql`
          SELECT 
            m.home_player_id,
            m.home_player_name,
            m.away_player_id,
            m.away_player_name,
            m.home_goals,
            m.away_goals,
            f.round_number,
            f.home_team_id,
            f.home_team_name,
            f.away_team_id,
            f.away_team_name,
            f.motm_player_id,
            f.status
          FROM matchups m
          JOIN fixtures f ON m.fixture_id = f.id
          WHERE f.tournament_id = ${tournamentId}
            AND f.season_id = ${seasonId}
            AND f.status = 'completed'
          ORDER BY f.round_number, m.home_player_name
        `;
      }
      console.log(`[Player Stats By Round] Found ${matchups.length} total matchups`);
    }

    // Aggregate stats for each player
    const playerStatsMap = new Map<string, any>();

    matchups.forEach((matchup: any) => {
      // Process home player
      if (matchup.home_player_id && matchup.home_player_name) {
        if (!playerStatsMap.has(matchup.home_player_id)) {
          playerStatsMap.set(matchup.home_player_id, {
            player_id: matchup.home_player_id,
            player_name: matchup.home_player_name,
            team_name: matchup.home_team_name,
            
            matches_played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goals_scored: 0,
            goals_conceded: 0,
            clean_sheets: 0,
            motm_awards: 0,
            points: 0, // Track points based on GD per match
            rounds_played: new Set(),
          });
        }

        const player = playerStatsMap.get(matchup.home_player_id);
        player.matches_played++;
        player.goals_scored += matchup.home_goals || 0;
        player.goals_conceded += matchup.away_goals || 0;
        player.rounds_played.add(matchup.round_number);

        // Calculate goal difference for this match
        const matchGD = (matchup.home_goals || 0) - (matchup.away_goals || 0);
        // Cap points at +5 or -5 per match
        const matchPoints = Math.max(-5, Math.min(5, matchGD));
        player.points += matchPoints;

        if (matchup.home_goals > matchup.away_goals) player.wins++;
        else if (matchup.home_goals === matchup.away_goals) player.draws++;
        else player.losses++;

        if (matchup.away_goals === 0) player.clean_sheets++;
        if (matchup.motm_player_id === matchup.home_player_id) player.motm_awards++;
      }

      // Process away player
      if (matchup.away_player_id && matchup.away_player_name) {
        if (!playerStatsMap.has(matchup.away_player_id)) {
          playerStatsMap.set(matchup.away_player_id, {
            player_id: matchup.away_player_id,
            player_name: matchup.away_player_name,
            team_name: matchup.away_team_name,
            
            matches_played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goals_scored: 0,
            goals_conceded: 0,
            clean_sheets: 0,
            motm_awards: 0,
            points: 0, // Track points based on GD per match
            rounds_played: new Set(),
          });
        }

        const player = playerStatsMap.get(matchup.away_player_id);
        player.matches_played++;
        player.goals_scored += matchup.away_goals || 0;
        player.goals_conceded += matchup.home_goals || 0;
        player.rounds_played.add(matchup.round_number);

        // Calculate goal difference for this match
        const matchGD = (matchup.away_goals || 0) - (matchup.home_goals || 0);
        // Cap points at +5 or -5 per match
        const matchPoints = Math.max(-5, Math.min(5, matchGD));
        player.points += matchPoints;

        if (matchup.away_goals > matchup.home_goals) player.wins++;
        else if (matchup.away_goals === matchup.home_goals) player.draws++;
        else player.losses++;

        if (matchup.home_goals === 0) player.clean_sheets++;
        if (matchup.motm_player_id === matchup.away_player_id) player.motm_awards++;
      }
    });

    // Convert to array and calculate derived stats
    const playerStats = Array.from(playerStatsMap.values()).map((player) => {
      const winRate = player.matches_played > 0
        ? Math.round((player.wins / player.matches_played) * 100 * 10) / 10
        : 0;

      const goalDifference = player.goals_scored - player.goals_conceded;

      // Return player object with calculated fields - will be augmented with photo_url and team_logo later
      player.goal_difference = goalDifference;
      player.win_rate = winRate;
      player.rounds_played = Array.from(player.rounds_played).sort((a, b) => a - b);
      
      return player;
    });

    // Fetch player photos from Firebase
    try {
      console.log('[Player Stats By Round] Starting Firebase photo fetch...');
      const { initializeApp, getApps, cert } = await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');
      
      // Initialize Firebase Admin if not already initialized
      if (getApps().length === 0) {
        console.log('[Player Stats By Round] Initializing Firebase Admin...');
        // Use individual environment variables
        const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

        if (!projectId || !clientEmail || !privateKey) {
          console.error('[Player Stats By Round] Missing Firebase Admin credentials:', {
            hasProjectId: !!projectId,
            hasClientEmail: !!clientEmail,
            hasPrivateKey: !!privateKey
          });
          throw new Error('Firebase Admin credentials not configured');
        }

        initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        console.log('[Player Stats By Round] Firebase Admin initialized successfully');
      } else {
        console.log('[Player Stats By Round] Using existing Firebase Admin instance');
      }

      const adminDb = getFirestore();
      
      // Fetch player photos
      console.log('[Player Stats By Round] Fetching realplayers collection from Firestore...');
      const playersSnapshot = await adminDb.collection('realplayers').get();
      console.log(`[Player Stats By Round] Retrieved ${playersSnapshot.size} players from Firestore`);
      
      const photoMap = new Map<string, string>();
      playersSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.photo_url && data.player_id) {
          photoMap.set(data.player_id, data.photo_url);
        }
      });
      console.log(`[Player Stats By Round] Found ${photoMap.size} players with photos`);

      // Fetch team logos
      console.log('[Player Stats By Round] Fetching team logos from team_seasons...');
      const teamSeasonsQuery = seasonId 
        ? adminDb.collection('team_seasons').where('season_id', '==', seasonId)
        : adminDb.collection('team_seasons');
      const teamSeasonsSnapshot = await teamSeasonsQuery.get();
      console.log(`[Player Stats By Round] Retrieved ${teamSeasonsSnapshot.size} team seasons`);
      
      const teamLogoMap = new Map<string, string>();
      teamSeasonsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const teamName = data.team_name;
        // Try multiple possible field names for the logo
        const logoUrl = data.logo_url || data.team_logo || data.logoUrl || null;
        if (teamName && logoUrl) {
          teamLogoMap.set(teamName, logoUrl);
          console.log(`[Player Stats By Round] Mapped logo for team: "${teamName}" -> ${logoUrl}`);
        } else {
          console.warn(`[Player Stats By Round] Team missing logo: ${teamName}`, {
            has_logo_url: !!data.logo_url,
            has_team_logo: !!data.team_logo,
            has_logoUrl: !!data.logoUrl,
            allFields: Object.keys(data)
          });
        }
      });
      console.log(`[Player Stats By Round] Found ${teamLogoMap.size} teams with logos`);
      
      // Debug: Log all team names from the map
      console.log('[Player Stats By Round] Team logo map keys:', Array.from(teamLogoMap.keys()));

      // Add photo_url and team_logo to each player
      let photosAdded = 0;
      let logosAdded = 0;
      playerStats.forEach(player => {
        const photoUrl = photoMap.get(player.player_id);
        if (photoUrl) {
          player.photo_url = photoUrl;
          photosAdded++;
        }
        
        // Normalize team name (trim spaces, lowercase for comparison)
        const normalizedPlayerTeam = player.team_name?.trim().toLowerCase();
        
        // Try to find team logo with multiple strategies
        let teamLogo = null;
        
        // Strategy 1: Exact match
        teamLogo = teamLogoMap.get(player.team_name);
        
        // Strategy 2: Try variations with trimmed spaces
        if (!teamLogo && player.team_name) {
          const trimmedName = player.team_name.trim();
          teamLogo = teamLogoMap.get(trimmedName);
        }
        
        // Strategy 3: Case-insensitive and FC suffix matching
        if (!teamLogo && normalizedPlayerTeam) {
          for (const [dbTeam, logo] of teamLogoMap.entries()) {
            const normalizedDbTeam = dbTeam.trim().toLowerCase();
            
            // Remove common suffixes for comparison
            const playerCore = normalizedPlayerTeam.replace(/\s+(fc|f\.c\.|football club)$/i, '').trim();
            const dbCore = normalizedDbTeam.replace(/\s+(fc|f\.c\.|football club)$/i, '').trim();
            
            // Check if the core team names match
            if (playerCore && dbCore && playerCore === dbCore) {
              teamLogo = logo;
              console.log(`[Player Stats By Round] Matched "${player.team_name}" to "${dbTeam}" (core: "${playerCore}")`);
              break;
            }
          }
        }
        
        if (teamLogo) {
          player.team_logo = teamLogo;
          logosAdded++;
        } else {
          console.warn(`[Player Stats By Round] No logo found for player ${player.player_name} team "${player.team_name}"`);
        }
      });
      
      console.log(`[Player Stats By Round] Successfully added ${photosAdded} photos and ${logosAdded} team logos to ${playerStats.length} players`);
      
      // Debug: Log first 3 players with their team info
      console.log('[Player Stats By Round] First 3 players team data:', playerStats.slice(0, 3).map(p => ({
        player_name: p.player_name,
        team_name: p.team_name,
        team_logo: (p as any).team_logo,
        photo_url: (p as any).photo_url
      })));
    } catch (photoError) {
      console.error('[Player Stats By Round] Error fetching player photos/team logos:', photoError);
      console.error('[Player Stats By Round] Error details:', {
        message: photoError instanceof Error ? photoError.message : String(photoError),
        stack: photoError instanceof Error ? photoError.stack : undefined
      });
      // Continue without photos/logos - non-critical
    }

    // Sort by points, then goal difference, then goals scored
    playerStats.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
      return b.goals_scored - a.goals_scored;
    });

    console.log(`[Player Stats By Round] Returning ${playerStats.length} players for round ${roundNumber || 'all'}`);
    if (playerStats.length > 0) {
      console.log(`[Player Stats By Round] Sample player (full data):`, {
        name: playerStats[0].player_name,
        team_name: playerStats[0].team_name,
        matches: playerStats[0].matches_played,
        wins: playerStats[0].wins,
        rounds: playerStats[0].rounds_played,
        photo_url: (playerStats[0] as any).photo_url,
        team_logo: (playerStats[0] as any).team_logo,
        allKeys: Object.keys(playerStats[0])
      });
    }

    return NextResponse.json({
      success: true,
      players: playerStats,
      round_filter: roundNumber || 'all',
      total_players: playerStats.length,
    });
  } catch (error) {
    console.error('Error fetching player stats by round:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch player statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
