import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { syncPlayerStatsForSeason } from '@/lib/neon/sync-player-stats';

/**
 * POST /api/admin/recalculate-all-player-stats
 *
 * Recalculates real player match statistics for all completed fixtures:
 * - matches_played
 * - wins, draws, losses
 * - goals_scored, goals_conceded
 * - clean_sheets
 * - motm_awards
 * - points (Category-based for Season 18+)
 * - processed_fixtures
 */
export async function POST(request: NextRequest) {
  try {
    const tournamentDb = getTournamentDb();

    let requestedSeasonId: string | null = null;
    try {
      const body = await request.json();
      requestedSeasonId = body?.season_id || body?.seasonId || null;
    } catch {
      // Body might be empty
    }
    if (!requestedSeasonId) {
      const { searchParams } = new URL(request.url);
      requestedSeasonId = searchParams.get('season_id') || searchParams.get('seasonId') || null;
    }

    console.log(`🔄 Starting Real Player Stats Recalculation${requestedSeasonId ? ` for season ${requestedSeasonId}` : ' (All Seasons)'}...`);

    if (requestedSeasonId) {
      const result = await syncPlayerStatsForSeason(requestedSeasonId, tournamentDb);
      return NextResponse.json({
        success: true,
        message: `Real player stats recalculated successfully for ${requestedSeasonId}`,
        fixturesProcessed: result.fixturesProcessed,
        matchupsProcessed: result.matchupsProcessed,
        playersUpdated: result.playersUpdated,
      });
    }

    // If all seasons requested, get all seasons with completed fixtures
    const seasonsRows = await tournamentDb`
      SELECT DISTINCT season_id FROM fixtures WHERE status = 'completed' AND season_id IS NOT NULL
    `;
    let totalPlayers = 0;
    let totalFixtures = 0;
    let totalMatchups = 0;

    for (const row of seasonsRows) {
      const sId = row.season_id;
      const res = await syncPlayerStatsForSeason(sId, tournamentDb);
      totalPlayers += res.playersUpdated;
      totalFixtures += res.fixturesProcessed;
      totalMatchups += res.matchupsProcessed;
    }

    return NextResponse.json({
      success: true,
      message: 'Real player stats recalculated successfully for all seasons',
      seasonsProcessed: seasonsRows.length,
      fixturesProcessed: totalFixtures,
      matchupsProcessed: totalMatchups,
      playersUpdated: totalPlayers,
    });
  } catch (error: any) {
    console.error('Error recalculating real player stats:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to recalculate player stats' }, { status: 500 });
  }
}
