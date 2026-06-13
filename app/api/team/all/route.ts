import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyAuth } from '@/lib/auth-helper';
import { batchGetFirebaseFields } from '@/lib/firebase/batch';
import { getCached, setCached } from '@/lib/firebase/cache';
import { getTournamentDb } from '@/lib/neon/tournament-config';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(['team', 'admin', 'committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = auth.userId!;

    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('season_id');

    if (!seasonId) {
      return NextResponse.json({
        success: false,
        error: 'Season ID is required',
      }, { status: 400 });
    }

    // OPTIMIZED: Get season details with cache
    let seasonData = getCached<any>('seasons', seasonId, 10 * 60 * 1000); // 10 min TTL
    if (!seasonData) {
      const seasonDoc = await adminDb.collection('seasons').doc(seasonId).get();
      if (!seasonDoc.exists) {
        return NextResponse.json({
          success: false,
          error: 'Season not found',
        }, { status: 404 });
      }
      seasonData = seasonDoc.data();
      setCached('seasons', seasonId, seasonData);
    }

    const seasonName = seasonData?.name || 'Current Season';

    // Get all teams registered for this season
    console.log('🔍 Fetching team_seasons for season:', seasonId);
    const teamSeasonsSnapshot = await adminDb
      .collection('team_seasons')
      .where('season_id', '==', seasonId)
      .where('status', '==', 'registered')
      .get();
    
    console.log('📊 Team seasons found:', teamSeasonsSnapshot.docs.length);
    teamSeasonsSnapshot.docs.forEach(doc => {
      console.log('  - Doc ID:', doc.id, '| Status:', doc.data().status, '| Team ID:', doc.data().team_id);
    });
    
    // Also check without status filter to see all team_seasons for this season
    const allTeamSeasonsSnapshot = await adminDb
      .collection('team_seasons')
      .where('season_id', '==', seasonId)
      .get();
    console.log('📊 Total team_seasons for this season (no status filter):', allTeamSeasonsSnapshot.docs.length);
    allTeamSeasonsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log('  - Doc ID:', doc.id, '| Status:', data.status, '| Team ID:', data.team_id);
    });

    console.time('⚡ Batch fetch team details');
    
    // Step 1: Extract all team IDs
    const teamSeasonDocs = teamSeasonsSnapshot.docs;
    const teamIds = teamSeasonDocs.map(doc => doc.data().team_id).filter(Boolean);
    
    console.log('📋 Team IDs to fetch:', teamIds);
    
    // Step 2: Batch fetch team details from teams collection
    const teamsInfoMap = await batchGetFirebaseFields<{ team_name: string; logoUrl: string; logoURL: string; logo_url: string; balance: number }>(
      'teams',
      teamIds,
      ['team_name', 'logoUrl', 'logoURL', 'logo_url', 'balance']
    );
    
    console.log('📋 Teams info fetched:', teamsInfoMap.size, 'teams');
    teamsInfoMap.forEach((info, teamId) => {
      console.log('  - Team:', teamId, '| Name:', info?.team_name, '| Logo:', info?.logo_url);
    });
    
    console.timeEnd('⚡ Batch fetch team details');
    
    // If no teams registered for this season, return empty result
    if (teamIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          teams: [],
          seasonName,
          seasonId,
        },
      });
    }
    
    console.time('⚡ Batch fetch all football players');
    
    // Step 3a: Batch fetch all football players for all teams
    const allFootballPlayersSnapshot = await adminDb
      .collection('footballplayers')
      .where('season_id', '==', seasonId)
      .where('team_id', 'in', teamIds.slice(0, 10)) // Firebase 'in' query limit is 10
      .get();
    
    // If there are more than 10 teams, fetch additional batches
    const additionalFootballPlayersBatches = [];
    for (let i = 10; i < teamIds.length; i += 10) {
      const batch = teamIds.slice(i, i + 10);
      additionalFootballPlayersBatches.push(
        adminDb
          .collection('footballplayers')
          .where('season_id', '==', seasonId)
          .where('team_id', 'in', batch)
          .get()
      );
    }
    
    const additionalFootballPlayersSnapshots = await Promise.all(additionalFootballPlayersBatches);
    
    // Combine all football player documents
    const allFootballPlayerDocs = [
      ...allFootballPlayersSnapshot.docs,
      ...additionalFootballPlayersSnapshots.flatMap(snapshot => snapshot.docs)
    ];
    
    console.timeEnd('⚡ Batch fetch all football players');
    console.log('📋 Total football players fetched:', allFootballPlayerDocs.length);
    
    console.time('⚡ Batch fetch all real players');
    
    // Determine if this is a modern season (16+)
    const isModernSeason = (season: string) => {
      const seasonNum = parseInt(season.replace(/\D/g, '')) || 0;
      return seasonNum >= 16;
    };
    
    // Step 3b: Fetch all real players for all teams from Neon
    const sql = getTournamentDb();
    let allRealPlayers;
    
    if (isModernSeason(seasonId)) {
      // Season 16+: Query player_seasons table
      allRealPlayers = await sql`
        SELECT * FROM player_seasons 
        WHERE season_id = ${seasonId}
        AND team_id = ANY(${teamIds})
      `;
    } else {
      // Season 1-15: Query realplayerstats table
      allRealPlayers = await sql`
        SELECT * FROM realplayerstats 
        WHERE season_id = ${seasonId}
        AND team_id = ANY(${teamIds})
      `;
    }
    
    // Convert to document-like format for compatibility
    const allRealPlayerDocs = allRealPlayers.map((player: any) => ({
      id: player.id,
      data: () => player
    }));
    
    console.timeEnd('⚡ Batch fetch all real players');
    console.log('📋 Total real players fetched:', allRealPlayerDocs.length);
    
    // Step 4: Group players by team_id
    const footballPlayersByTeam = new Map<string, any[]>();
    allFootballPlayerDocs.forEach(doc => {
      const player = doc.data();
      const teamId = player.team_id;
      if (!footballPlayersByTeam.has(teamId)) {
        footballPlayersByTeam.set(teamId, []);
      }
      footballPlayersByTeam.get(teamId)!.push(player);
    });
    
    const realPlayersByTeam = new Map<string, any[]>();
    allRealPlayerDocs.forEach((doc: any) => {
      const data = doc.data();
      const teamId = data.team_id;
      if (!realPlayersByTeam.has(teamId)) {
        realPlayersByTeam.set(teamId, []);
      }
      realPlayersByTeam.get(teamId)!.push(data);
    });
    
    // Step 5: Build teams data
    const teamsData = [];

    for (const teamSeasonDoc of teamSeasonDocs) {
      const teamSeasonData = teamSeasonDoc.data();
      const teamId = teamSeasonData.team_id;
      if (!teamId) continue;

      // Get team details from batch-fetched data
      const teamInfo = teamsInfoMap.get(teamId);
      if (!teamInfo) {
        console.log('⚠️ No team info found for team ID:', teamId);
        continue;
      }

      // Get team's players from grouped data
      const teamFootballPlayers = footballPlayersByTeam.get(teamId) || [];
      const teamRealPlayers = realPlayersByTeam.get(teamId) || [];

      // Calculate statistics
      // Note: Football players are in Neon DB, not Firebase
      // So we use budget data from team_seasons instead
      const footballSpent = teamSeasonData?.football_spent || 0; // € spent on football players
      const realPlayerSpent = teamSeasonData?.real_player_spent || 0; // $ spent on real players
      
      let totalRealPlayerValue = 0;
      let totalRating = 0;
      const positionBreakdown: { [key: string]: number } = {
        GK: 0,
        CB: 0,
        LB: 0,
        RB: 0,
        DMF: 0,
        CMF: 0,
        AMF: 0,
        LMF: 0,
        RMF: 0,
        LWF: 0,
        RWF: 0,
        SS: 0,
        CF: 0,
      };

      // Process football players (from Neon DB - not fetched here)
      teamFootballPlayers.forEach((player) => {
        // Count positions (use primary_position)
        const position = player.primary_position || 'Unknown';
        if (position in positionBreakdown) {
          positionBreakdown[position]++;
        }

        // Sum ratings from attributes
        if (player.attributes && player.attributes.overall) {
          totalRating += player.attributes.overall;
        }
      });
      
      // Process real players (from Firebase)
      teamRealPlayers.forEach((player) => {
        // Sum real player auction values (in dollars)
        const playerValue = player.auction_value || 0;
        totalRealPlayerValue += playerValue;
        
        // Real players might have star ratings
        if (player.star_rating) {
          totalRating += player.star_rating * 20; // Convert 1-5 stars to 20-100 scale
        }
      });

      const totalPlayers = teamRealPlayers.length; // Only count real players fetched from Firebase
      const footballPlayerCount = teamSeasonData?.players_count || 0; // Total from team_seasons
      const avgRating = totalPlayers > 0 ? totalRating / totalPlayers : 0;

      // Try different logo field names
      const logoUrl = teamInfo?.logo_url || null;
      
      console.log(`Team ${teamId} logo:`, logoUrl, 'Available fields:', Object.keys(teamInfo || {}));
      
      teamsData.push({
        team: {
          id: teamId,
          name: teamInfo?.team_name || 'Unknown Team',
          logoUrl: logoUrl,
          balance: teamInfo?.balance || 0,
          // Note: Multi-season fields removed for single-season UI compatibility
          // Historical data still available in database if needed
        },
        totalPlayers: footballPlayerCount,
        totalValue: totalRealPlayerValue, // Real player value in $
        footballSpent: footballSpent, // € spent on football players
        realPlayerSpent: realPlayerSpent, // $ spent on real players
        footballBudget: teamSeasonData?.football_budget || 0,
        realPlayerBudget: teamSeasonData?.real_player_budget || 0,
        currencySystem: teamSeasonData?.currency_system || 'single',
        avgRating: Math.round(avgRating * 10) / 10,
        positionBreakdown,
      });
    }

    // Sort teams by total value (descending)
    teamsData.sort((a, b) => b.totalValue - a.totalValue);

    return NextResponse.json({
      success: true,
      data: {
        teams: teamsData,
        seasonName,
        seasonId,
        seasonType: seasonData?.type || 'single',
        maxPlayers: seasonData?.football_base_slots || seasonData?.max_football_players || 25,
      },
    });

  } catch (error: any) {
    console.error('Error fetching all teams:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch teams',
    }, { status: 500 });
  }
}
