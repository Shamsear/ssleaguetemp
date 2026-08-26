import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * DELETE /api/fantasy/transfers/cancel-request
 * Cancel/delete the pending transfer request
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    // Get user's fantasy team
    const teams = await fantasySql`
      SELECT team_id, league_id FROM fantasy_teams
      WHERE owner_uid = ${userId} AND is_enabled = true
      LIMIT 1
    `;

    if (teams.length === 0) {
      return NextResponse.json(
        { error: 'No fantasy team found' },
        { status: 404 }
      );
    }

    const teamId = teams[0].team_id;
    const leagueId = teams[0].league_id;

    // Check if transfer window is open
    const activeWindows = await fantasySql`
      SELECT * FROM fantasy_transfer_windows
      WHERE league_id = ${leagueId}
        AND is_active = true
      LIMIT 1
    `;

    if (activeWindows.length === 0) {
      return NextResponse.json(
        { error: 'Transfer window is closed' },
        { status: 400 }
      );
    }

    const window = activeWindows[0];

    // Delete submission
    const result = await fantasySql`
      DELETE FROM fantasy_transfer_submissions
      WHERE team_id = ${teamId}
        AND window_id = ${window.window_id}
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'No pending transfer request found to cancel' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Pending transfer request cancelled successfully'
    });

  } catch (error: any) {
    console.error('Error cancelling transfer request:', error);
    return NextResponse.json(
      { error: 'Failed to cancel transfer request', details: error.message },
      { status: 500 }
    );
  }
}
