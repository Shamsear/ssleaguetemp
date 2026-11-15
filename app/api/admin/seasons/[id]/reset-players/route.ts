import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { getAuctionDb } from '@/lib/neon/auction-config';

/**
 * POST /api/admin/seasons/[id]/reset-players
 * Resets players with expired contracts from prior seasons into Free Agents for this season.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAuth(['admin', 'committee_admin', 'super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: seasonId } = await params;
    const seasonNum = parseInt(seasonId.replace(/\D/g, ''), 10) || 0;

    const auctionSql = getAuctionDb();

    // Reset players whose contract expired prior to this season or who are assigned to older seasons
    const result = await auctionSql`
      UPDATE footballplayers
      SET is_sold = false,
          team_id = NULL,
          team_name = NULL,
          round_id = NULL,
          status = 'free_agent',
          updated_at = NOW()
      WHERE (is_sold = true OR team_id IS NOT NULL)
      AND (
        season_id IS DISTINCT FROM ${seasonId}
        OR COALESCE(NULLIF(REGEXP_REPLACE(contract_end_season, '[^0-9]', '', 'g'), ''), '0')::int < ${seasonNum}
      )
      RETURNING id, name
    `;

    return NextResponse.json({
      success: true,
      message: `Successfully reset ${result.length} players to Free Agent status for season ${seasonId}.`,
      reset_count: result.length,
    });
  } catch (error: any) {
    console.error('Error resetting players for season:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to reset players' },
      { status: 500 }
    );
  }
}
