import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/releases?league_id=xxx&team_id=yyy&window_id=zzz
 * Fetch released players and passive teams log with resolved category & window details
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('league_id');
    const teamId = searchParams.get('team_id');
    const windowId = searchParams.get('window_id');

    if (!leagueId && !teamId) {
      return NextResponse.json(
        { error: 'league_id or team_id is required' },
        { status: 400 }
      );
    }

    let releases;
    if (teamId) {
      releases = await fantasySql`
        SELECT 
          fr.release_id,
          fr.league_id,
          fr.team_id,
          ft.team_name,
          fr.window_id,
          tw.window_name,
          tw.opens_at as window_opens_at,
          tw.closes_at as window_closes_at,
          fr.real_player_id,
          fr.player_name,
          CASE
            WHEN fr.is_passive_team = true THEN 'Passive Team'
            WHEN (fl.category_settings->'lists'->'red_list_2')::jsonb @> jsonb_build_array(fr.real_player_id) THEN 'RED 2'
            WHEN (fl.category_settings->'lists'->'red_list_1')::jsonb @> jsonb_build_array(fr.real_player_id) THEN 'RED 1'
            WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' AND (fdb.slot_index = 2 OR fdr.slot_name ILIKE '%Slot 2%') THEN 'RED 2'
            WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' AND (fdb.slot_index = 1 OR fdr.slot_name ILIKE '%Slot 1%') THEN 'RED 1'
            WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' THEN 'RED 1'
            ELSE UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, 'Red'))
          END as category,
          fr.is_passive_team,
          fr.purchase_price,
          fr.refund_amount,
          fr.refund_percentage,
          fr.released_at
        FROM fantasy_releases fr
        LEFT JOIN fantasy_leagues fl ON fr.league_id = fl.league_id
        LEFT JOIN fantasy_teams ft ON fr.team_id = ft.team_id
        LEFT JOIN fantasy_transfer_windows tw ON fr.window_id = tw.window_id
        LEFT JOIN fantasy_players fp ON (
          (fr.real_player_id = fp.real_player_id OR fr.real_player_id = fp.id::text)
        )
        LEFT JOIN fantasy_draft_bids fdb ON (
          (fdb.target_id::text = fp.id::text OR fdb.target_id::text = fp.real_player_id::text OR fdb.target_id::text = fr.real_player_id::text)
          AND fdb.status = 'won'
        )
        LEFT JOIN fantasy_draft_rounds fdr ON fdb.round_id = fdr.id
        WHERE fr.team_id = ${teamId}
          ${windowId ? fantasySql`AND fr.window_id = ${windowId}` : fantasySql``}
        ORDER BY fr.released_at DESC
      `;
    } else {
      releases = await fantasySql`
        SELECT 
          fr.release_id,
          fr.league_id,
          fr.team_id,
          ft.team_name,
          fr.window_id,
          tw.window_name,
          tw.opens_at as window_opens_at,
          tw.closes_at as window_closes_at,
          fr.real_player_id,
          fr.player_name,
          CASE
            WHEN fr.is_passive_team = true THEN 'Passive Team'
            WHEN (fl.category_settings->'lists'->'red_list_2')::jsonb @> jsonb_build_array(fr.real_player_id) THEN 'RED 2'
            WHEN (fl.category_settings->'lists'->'red_list_1')::jsonb @> jsonb_build_array(fr.real_player_id) THEN 'RED 1'
            WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' AND (fdb.slot_index = 2 OR fdr.slot_name ILIKE '%Slot 2%') THEN 'RED 2'
            WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' AND (fdb.slot_index = 1 OR fdr.slot_name ILIKE '%Slot 1%') THEN 'RED 1'
            WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' THEN 'RED 1'
            ELSE UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, 'Red'))
          END as category,
          fr.is_passive_team,
          fr.purchase_price,
          fr.refund_amount,
          fr.refund_percentage,
          fr.released_at
        FROM fantasy_releases fr
        LEFT JOIN fantasy_leagues fl ON fr.league_id = fl.league_id
        LEFT JOIN fantasy_teams ft ON fr.team_id = ft.team_id
        LEFT JOIN fantasy_transfer_windows tw ON fr.window_id = tw.window_id
        LEFT JOIN fantasy_players fp ON (
          (fr.real_player_id = fp.real_player_id OR fr.real_player_id = fp.id::text)
        )
        LEFT JOIN fantasy_draft_bids fdb ON (
          (fdb.target_id::text = fp.id::text OR fdb.target_id::text = fp.real_player_id::text OR fdb.target_id::text = fr.real_player_id::text)
          AND fdb.status = 'won'
        )
        LEFT JOIN fantasy_draft_rounds fdr ON fdb.round_id = fdr.id
        WHERE fr.league_id = ${leagueId}
          ${windowId ? fantasySql`AND fr.window_id = ${windowId}` : fantasySql``}
        ORDER BY fr.released_at DESC
      `;
    }

    return NextResponse.json({
      success: true,
      releases
    });
  } catch (error: any) {
    console.error('Error fetching releases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch releases', details: error.message },
      { status: 500 }
    );
  }
}
