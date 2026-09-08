import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/releases?league_id=xxx&team_id=yyy&window_id=zzz
 * Fetch released players and passive teams log with window details
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
          fr.category,
          fr.is_passive_team,
          fr.purchase_price,
          fr.refund_amount,
          fr.refund_percentage,
          fr.released_at
        FROM fantasy_releases fr
        LEFT JOIN fantasy_teams ft ON fr.team_id = ft.team_id
        LEFT JOIN fantasy_transfer_windows tw ON fr.window_id = tw.window_id
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
          fr.category,
          fr.is_passive_team,
          fr.purchase_price,
          fr.refund_amount,
          fr.refund_percentage,
          fr.released_at
        FROM fantasy_releases fr
        LEFT JOIN fantasy_teams ft ON fr.team_id = ft.team_id
        LEFT JOIN fantasy_transfer_windows tw ON fr.window_id = tw.window_id
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
