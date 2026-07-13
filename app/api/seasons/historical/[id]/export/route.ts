import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyAuth } from '@/lib/auth-helper';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import * as XLSX from 'xlsx';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    console.log(`📤 Exporting season data for ID: ${sessionId}`);

    // Verify authentication
    const auth = await verifyAuth(['super_admin'], request);
    if (!auth.authenticated) {
      console.log(`❌ Access denied: ${auth.error}`);
      return NextResponse.json({ error: auth.error || 'Forbidden: Super admin access required' }, { status: 401 });
    }
    
    console.log('✅ Super admin access confirmed');

    // Parse season number to determine table (S16+ use player_seasons)
    const seasonNum = parseInt(sessionId.match(/\d+/)?.[0] || '0');
    const isModernSeason = seasonNum === 16 || seasonNum === 17;
    const isAdjustedSeason = seasonNum === 16 || seasonNum === 17;
    
    console.log(`🔍 Fetching data for season ${sessionId} (isModern: ${isModernSeason})`);
    
    const sql = getTournamentDb();
    
    const playerStatsPromise = isModernSeason
      ? sql`SELECT * FROM player_seasons WHERE season_id = ${sessionId}`
      : sql`SELECT * FROM realplayerstats WHERE season_id = ${sessionId}`;

    const [seasonDoc, teamsSnapshot, teamStatsData, playerStatsData] = await Promise.all([
      adminDb.collection('seasons').doc(sessionId).get(),
      adminDb.collection('teams').where('seasons', 'array-contains', sessionId).get(),
      sql`SELECT * FROM teamstats WHERE season_id = ${sessionId}`,
      playerStatsPromise
    ]);

    if (!seasonDoc.exists) {
      return NextResponse.json({ error: 'Season not found' }, { status: 404 });
    }

    const season = { id: seasonDoc.id, ...seasonDoc.data() } as any;

    console.log(`📊 Fetched data counts:`);
    console.log(`  - Teams snapshot: ${teamsSnapshot.docs.length}`);
    console.log(`  - Team stats from NEON: ${teamStatsData.length}`);
    console.log(`  - Player stats from NEON: ${playerStatsData.length}`);
    
    // Collect unique player IDs to fetch their permanent data
    const playerIds = playerStatsData.map((stats: any) => stats.player_id).filter(Boolean);
    const uniquePlayerIds = [...new Set(playerIds)];
    
    console.log(`👤 Fetching permanent data for ${uniquePlayerIds.length} unique players...`);
    
    const playerDataMap = new Map();
    if (uniquePlayerIds.length > 0) {
      const batchSize = 30; // Firestore maximum where ... in batch limit
      
      for (let i = 0; i < uniquePlayerIds.length; i += batchSize) {
        const batch = uniquePlayerIds.slice(i, i + batchSize);
        const playersQuery = adminDb.collection('realplayers').where('player_id', 'in', batch);
        const playersSnapshot = await playersQuery.get();
        playersSnapshot.docs.forEach(doc => {
          const data = doc.data();
          playerDataMap.set(data.player_id, data);
        });
      }
    }
    
    console.log(`✅ Retrieved permanent data for ${playerDataMap.size} players`);
    
    // Fetch player awards from Neon for this season
    const awardsData = await sql`
      SELECT player_id, award_category, award_type, season_id
      FROM player_awards
      WHERE season_id = ${sessionId}
    `;
    console.log(`🏆 Player awards fetched: ${awardsData.length}`);
    
    // Group awards by player_id
    const playerAwardsMap = new Map<string, { category_trophies: string[], individual_trophies: string[] }>();
    awardsData.forEach((award: any) => {
      if (!playerAwardsMap.has(award.player_id)) {
        playerAwardsMap.set(award.player_id, { category_trophies: [], individual_trophies: [] });
      }
      const awards = playerAwardsMap.get(award.player_id)!;
      if (award.award_category === 'category') {
        awards.category_trophies.push(award.award_type);
      } else if (award.award_category === 'individual') {
        awards.individual_trophies.push(award.award_type);
      }
    });

    // Create a map of team stats by team_id
    const teamStatsMap = new Map();
    teamStatsData.forEach((data: any) => {
      if (data.team_id) {
        teamStatsMap.set(data.team_id, data);
      }
    });
    
    // Process teams data
    const rawTeams = teamsSnapshot.docs.map(doc => {
      const teamData = doc.data();
      const teamStats = teamStatsMap.get(doc.id) || {};
      
      return {
        id: doc.id,
        team_name: teamData.team_name || '',
        team_code: teamData.team_code || '',
        owner_name: teamData.owner_name || '',
        owner_email: teamData.owner_email || '',
        p: parseInt(teamStats.points) || 0,
        mp: parseInt(teamStats.matches_played) || 0,
        w: parseInt(teamStats.wins) || 0,
        d: parseInt(teamStats.draws) || 0,
        l: parseInt(teamStats.losses) || 0,
        f: parseInt(teamStats.goals_for) || 0,
        a: parseInt(teamStats.goals_against) || 0,
        gd: parseInt(teamStats.goal_difference) || 0,
        percentage: parseFloat(teamStats.win_percentage) || 0,
        cup: teamStats.cup_achievement || ''
      };
    });

    // Sort teams by points desc, then goal difference desc, then goals scored desc
    rawTeams.sort((a, b) => {
      if (b.p !== a.p) return b.p - a.p;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return b.f - a.f;
    });

    // Map to teams with rank
    const teams = rawTeams.map((team, index) => ({
      ...team,
      rank: index + 1
    }));

    // Process players data
    const players = playerStatsData.map((statsData: any) => {
      const permanentData = playerDataMap.get(statsData.player_id) || {};
      const playerAwards = playerAwardsMap.get(statsData.player_id) || { category_trophies: [], individual_trophies: [] };
      
      // Calculate adjusted points if needed
      const rawPoints = parseInt(statsData.points) || 0;
      const basePoints = parseInt(statsData.base_points) || 0;
      const points = isAdjustedSeason ? (rawPoints - basePoints) : rawPoints;

      return {
        player_id: statsData.player_id || statsData.id,
        name: permanentData.name || statsData.player_name || statsData.name || '',
        display_name: permanentData.display_name || '',
        email: permanentData.email || '',
        phone: permanentData.phone || '',
        role: permanentData.role || 'player',
        psn_id: permanentData.psn_id || '',
        xbox_id: permanentData.xbox_id || '',
        steam_id: permanentData.steam_id || '',
        is_registered: permanentData.is_registered || false,
        notes: permanentData.notes || '',
        category: statsData.category || '',
        team_name: statsData.team || '',
        season_id: statsData.season_id || sessionId,
        is_active: statsData.is_active !== false,
        is_available: statsData.is_available !== false,
        matches_played: statsData.matches_played || statsData.stats?.matches_played || 0,
        matches_won: statsData.wins || statsData.matches_won || statsData.stats?.matches_won || 0,
        matches_lost: statsData.losses || statsData.matches_lost || statsData.stats?.matches_lost || 0,
        matches_drawn: statsData.draws || statsData.matches_drawn || statsData.stats?.matches_drawn || 0,
        goals_scored: statsData.goals_scored || statsData.stats?.goals_scored || 0,
        goals_conceded: statsData.goals_conceded || statsData.stats?.goals_conceded || 0,
        assists: statsData.assists || statsData.stats?.assists || 0,
        clean_sheets: statsData.clean_sheets || statsData.stats?.clean_sheets || 0,
        win_rate: statsData.win_rate || statsData.stats?.win_rate || 0,
        average_rating: statsData.average_rating || statsData.stats?.average_rating || 0,
        potm: statsData.motm_awards || statsData.potm || statsData.stats?.potm || 0,
        points: points,
        base_points: basePoints,
        raw_points: rawPoints,
        category_trophies: playerAwards.category_trophies,
        individual_trophies: playerAwards.individual_trophies
      };
    });

    // Create Excel workbook
    const workbook = XLSX.utils.book_new();

    // Teams Sheet (full structure with standings)
    const teamsSheetData = teams.map(team => ({
      rank: team.rank,
      team: team.team_name || '',
      owner_name: team.owner_name || '',
      p: team.p,
      mp: team.mp,
      w: team.w,
      d: team.d,
      l: team.l,
      f: team.f,
      a: team.a,
      gd: team.gd,
      percentage: team.percentage,
      cup: team.cup
    }));
    
    const teamsSheet = teamsSheetData.length > 0 
      ? XLSX.utils.json_to_sheet(teamsSheetData)
      : XLSX.utils.aoa_to_sheet([['rank', 'team', 'owner_name', 'p', 'mp', 'w', 'd', 'l', 'f', 'a', 'gd', 'percentage', 'cup']]);
    
    teamsSheet['!cols'] = [
      { width: 8 },  // rank
      { width: 25 }, // team
      { width: 20 }, // owner_name
      { width: 8 },  // p
      { width: 8 },  // mp
      { width: 8 },  // w
      { width: 8 },  // d
      { width: 8 },  // l
      { width: 8 },  // f
      { width: 8 },  // a
      { width: 8 },  // gd
      { width: 10 }, // percentage
      { width: 15 }  // cup
    ];
    
    XLSX.utils.book_append_sheet(workbook, teamsSheet, 'Teams');

    // Players Sheet
    const playersSheetData = players.map(player => {
      const totalMatches = player.matches_played || 0;
      const goalsScored = player.goals_scored || 0;
      const goalsConceded = player.goals_conceded || 0;
      const wins = player.matches_won || 0;
      const draws = player.matches_drawn || 0;
      const losses = player.matches_lost || 0;
      const cleansheets = player.clean_sheets || 0;
      
      const playerRow: any = {
        player_id: player.player_id,
        name: player.name || '',
        team: player.team_name || '',
        category: player.category || '',
        goals_scored: goalsScored,
        goals_per_game: totalMatches > 0 ? (goalsScored / totalMatches).toFixed(2) : 0,
        goals_conceded: goalsConceded,
        conceded_per_game: totalMatches > 0 ? (goalsConceded / totalMatches).toFixed(2) : 0,
        net_goals: goalsScored - goalsConceded,
        cleansheets: cleansheets,
        points: player.points,
        potm: player.potm,
        win: wins,
        draw: draws,
        loss: losses,
        total_matches: totalMatches,
        base_points: player.base_points,
        raw_points: player.raw_points
      };
      
      // Add trophy columns
      for (let i = 1; i <= 5; i++) {
        playerRow[`Cat Trophy ${i}`] = player.category_trophies?.[i - 1] || '';
      }
      for (let i = 1; i <= 5; i++) {
        playerRow[`Ind Trophy ${i}`] = player.individual_trophies?.[i - 1] || '';
      }
      
      return playerRow;
    });
    
    const playersSheet = playersSheetData.length > 0
      ? XLSX.utils.json_to_sheet(playersSheetData)
      : XLSX.utils.aoa_to_sheet([[
          'player_id', 'name', 'team', 'category', 'goals_scored', 'goals_per_game',
          'goals_conceded', 'conceded_per_game', 'net_goals', 'cleansheets',
          'points', 'potm', 'win', 'draw', 'loss', 'total_matches', 'base_points', 'raw_points',
          'Cat Trophy 1', 'Cat Trophy 2', 'Cat Trophy 3', 'Cat Trophy 4', 'Cat Trophy 5',
          'Ind Trophy 1', 'Ind Trophy 2', 'Ind Trophy 3', 'Ind Trophy 4', 'Ind Trophy 5'
        ]]);
    
    playersSheet['!cols'] = [
      { width: 15 }, // player_id
      { width: 25 }, // name
      { width: 25 }, // team
      { width: 15 }, // category
      { width: 12 }, // goals_scored
      { width: 12 }, // goals_per_game
      { width: 12 }, // goals_conceded
      { width: 12 }, // conceded_per_game
      { width: 12 }, // net_goals
      { width: 12 }, // cleansheets
      { width: 10 }, // points
      { width: 10 }, // potm
      { width: 8 },  // win
      { width: 8 },  // draw
      { width: 8 },  // loss
      { width: 15 }, // total_matches
      { width: 12 }, // base_points
      { width: 12 }  // raw_points
    ];
    
    XLSX.utils.book_append_sheet(workbook, playersSheet, 'Players');

    // Generate Excel buffer
    const buffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx',
      compression: true
    });

    const filename = `season_stats_${season.short_name || season.name || sessionId}_${new Date().toISOString().split('T')[0]}.xlsx`;

    console.log(`✅ Excel export generated: ${filename} (Teams: ${teamsSheetData.length}, Players: ${playersSheetData.length})`);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString()
      }
    });

  } catch (error: any) {
    console.error('❌ Error exporting season data:', error);
    return NextResponse.json({ 
      error: 'Failed to export season data',
      details: error.message 
    }, { status: 500 });
  }
}