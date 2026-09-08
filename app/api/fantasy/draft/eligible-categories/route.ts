import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/draft/eligible-categories?team_id=xxx&window_id=yyy&league_id=zzz
 * Get allowed categories and counts for a team based on releases in the linked transfer window
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');
    const windowId = searchParams.get('window_id');
    const leagueId = searchParams.get('league_id');

    if (!teamId || (!windowId && !leagueId)) {
      return NextResponse.json(
        { error: 'team_id and window_id or league_id are required' },
        { status: 400 }
      );
    }

    // Find windowId if not provided
    let targetWindowId = windowId;
    if (!targetWindowId && leagueId) {
      const [activeWin] = await fantasySql`
        SELECT window_id FROM fantasy_transfer_windows
        WHERE league_id = ${leagueId}
          AND is_active = true
        ORDER BY opens_at DESC LIMIT 1
      `;
      targetWindowId = activeWin?.window_id || null;
    }

    if (!targetWindowId) {
      return NextResponse.json({
        success: true,
        eligible_categories: {},
        total_released_count: 0
      });
    }

    // Query releases for this team in this window
    const releases = await fantasySql`
      SELECT category, is_passive_team, COUNT(*) as count
      FROM fantasy_releases
      WHERE team_id = ${teamId}
        AND window_id = ${targetWindowId}
      GROUP BY category, is_passive_team
    `;

    const eligibleCategories: Record<string, number> = {};
    let totalCount = 0;

    for (const r of releases) {
      const catName = r.is_passive_team ? 'Passive Team' : (r.category || 'Uncategorized');
      const count = parseInt(r.count || '0');
      eligibleCategories[catName] = (eligibleCategories[catName] || 0) + count;
      totalCount += count;
    }

    return NextResponse.json({
      success: true,
      window_id: targetWindowId,
      eligible_categories: eligibleCategories,
      total_released_count: totalCount
    });

  } catch (error: any) {
    console.error('Error fetching eligible categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch eligible categories', details: error.message },
      { status: 500 }
    );
  }
}
