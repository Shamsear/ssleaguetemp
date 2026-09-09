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

    // Query releases for this team in this window with resolved category
    const releases = await fantasySql`
      SELECT 
        CASE
          WHEN fr.is_passive_team = true THEN 'Passive Team'
          WHEN (fl.category_settings->'lists'->'red_list_2')::jsonb @> jsonb_build_array(fr.real_player_id) THEN 'RED 2'
          WHEN (fl.category_settings->'lists'->'red_list_1')::jsonb @> jsonb_build_array(fr.real_player_id) THEN 'RED 1'
          WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' AND (fdb.slot_index = 2 OR fdr.slot_name ILIKE '%Slot 2%') THEN 'RED 2'
          WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' AND (fdb.slot_index = 1 OR fdr.slot_name ILIKE '%Slot 1%') THEN 'RED 1'
          WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' THEN 'RED 1'
          ELSE UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, 'Red'))
        END as resolved_category,
        COUNT(*) as count
      FROM fantasy_releases fr
      LEFT JOIN fantasy_leagues fl ON fr.league_id = fl.league_id
      LEFT JOIN fantasy_players fp ON (fr.real_player_id = fp.real_player_id OR fr.real_player_id = fp.id::text)
      LEFT JOIN fantasy_draft_bids fdb ON (
        (fdb.target_id::text = fp.id::text OR fdb.target_id::text = fp.real_player_id::text OR fdb.target_id::text = fr.real_player_id::text)
        AND fdb.status = 'won'
      )
      LEFT JOIN fantasy_draft_rounds fdr ON fdb.round_id = fdr.id
      WHERE fr.team_id = ${teamId}
        AND (fr.window_id = ${targetWindowId} OR fr.league_id = ${leagueId})
      GROUP BY 1
    `;

    const eligibleCategories: Record<string, number> = {};
    let totalCount = 0;

    for (const r of releases) {
      const catName = r.resolved_category;
      const count = parseInt(r.count || '0');

      // Exact category
      eligibleCategories[catName] = (eligibleCategories[catName] || 0) + count;

      if (catName.startsWith('RED')) {
        eligibleCategories['RED'] = (eligibleCategories['RED'] || 0) + count;
      }

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
