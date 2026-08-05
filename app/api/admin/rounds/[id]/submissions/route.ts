import { NextRequest, NextResponse } from 'next/server';
import { getAuctionDb } from '@/lib/neon/auction-config';
import { verifyAuth } from '@/lib/auth-helper';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const auth = await verifyAuth(['admin', 'committee_admin']);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: roundId } = await params;
    const sql = getAuctionDb();

    console.log('🔍 [Submissions API] Fetching submissions for round:', roundId);

    // Get round details
    const roundResult = await sql`
      SELECT id, position, max_bids_per_team, status, season_id
      FROM rounds
      WHERE id = ${roundId}
    `;

    console.log('🔍 [Submissions API] Round result:', roundResult);

    if (roundResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Round not found' },
        { status: 404 }
      );
    }

    const round = roundResult[0];

    // Get all teams registered for this season
    const teamsResult = await sql`
      SELECT 
        t.id as team_id,
        t.name as team_name,
        t.firebase_uid
      FROM teams t
      WHERE t.season_id = ${round.season_id}
      ORDER BY t.name ASC
    `;

    console.log('🔍 [Submissions API] Teams found:', teamsResult.length);
    console.log('🔍 [Submissions API] Teams:', teamsResult);

    // Get submissions for this round
    const submissionsResult = await sql`
      SELECT 
        team_id,
        submitted_at,
        bid_count,
        is_locked
      FROM bid_submissions
      WHERE round_id = ${roundId}
    `;

    console.log('🔍 [Submissions API] Submissions found:', submissionsResult.length);
    console.log('🔍 [Submissions API] Submissions:', submissionsResult);

    // Get draft bids (saved but not locked) for this round
    const draftBidsResult = await sql`
      SELECT team_id, COUNT(*) as draft_count
      FROM bids
      WHERE round_id = ${roundId} AND status = 'active'
      GROUP BY team_id
    `;

    const draftBidsMap = new Map<string, number>();
    draftBidsResult.forEach((row: any) => {
      draftBidsMap.set(row.team_id, Number(row.draft_count));
    });

    // Create a map of submissions by team_id
    const submissionsMap = new Map();
    submissionsResult.forEach(sub => {
      submissionsMap.set(sub.team_id, sub);
    });

    // Combine team data with submission data
    const teamSubmissions = teamsResult.map((team: any) => {
      const submission = submissionsMap.get(team.team_id);
      const draftCount = draftBidsMap.get(team.team_id) || 0;
      return {
        team_id: team.team_id,
        team_name: team.team_name,
        has_submitted: !!submission,
        submitted_at: submission?.submitted_at || null,
        bid_count: submission?.bid_count || 0,
        is_locked: submission?.is_locked || false,
        has_draft: !submission && draftCount > 0,
        draft_bid_count: !submission ? draftCount : 0,
      };
    });

    // Calculate statistics
    const totalTeams = teamsResult.length;
    const submittedTeams = teamSubmissions.filter((t: any) => t.has_submitted).length;
    const draftedTeams = teamSubmissions.filter((t: any) => t.has_draft).length;
    const pendingTeams = totalTeams - submittedTeams - draftedTeams;

    console.log('📊 [Submissions API] Stats:', { totalTeams, submittedTeams, draftedTeams, pendingTeams });
    console.log('📊 [Submissions API] Team submissions:', teamSubmissions);

    return NextResponse.json({
      success: true,
      round: {
        id: round.id,
        position: round.position,
        max_bids_per_team: round.max_bids_per_team,
        status: round.status,
      },
      stats: {
        total_teams: totalTeams,
        submitted: submittedTeams,
        drafted: draftedTeams,
        pending: pendingTeams,
        submission_rate: totalTeams > 0 ? Math.round((submittedTeams / totalTeams) * 100) : 0,
      },
      teams: teamSubmissions,
    });
  } catch (error: any) {
    console.error('Error fetching round submissions:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify admin authorization
    const auth = await verifyAuth(['admin', 'committee_admin']);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: roundId } = await params;
    const body = await request.json();
    const { teamId, action } = body;

    if (!teamId || !action || !['submit', 'draft'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid parameters' },
        { status: 400 }
      );
    }

    const sql = getAuctionDb();

    // Fetch round details
    const roundResult = await sql`
      SELECT id, max_bids_per_team, season_id FROM rounds WHERE id = ${roundId}
    `;
    if (roundResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Round not found' },
        { status: 404 }
      );
    }
    const round = roundResult[0];

    if (action === 'submit') {
      // Get the team's active bids count for this round
      const bidsResult = await sql`
        SELECT COUNT(*)::integer as count FROM bids
        WHERE team_id = ${teamId} AND round_id = ${roundId} AND status = 'active'
      `;
      const bidCount = bidsResult[0]?.count || 0;

      // Insert or update submission
      const submissionResult = await sql`
        INSERT INTO bid_submissions (
          team_id,
          round_id,
          bid_count,
          is_locked,
          submitted_at,
          updated_at
        ) VALUES (
          ${teamId},
          ${roundId},
          ${bidCount},
          true,
          NOW(),
          NOW()
        )
        ON CONFLICT (team_id, round_id)
        DO UPDATE SET
          bid_count = ${bidCount},
          is_locked = true,
          submitted_at = NOW(),
          updated_at = NOW()
        RETURNING *
      `;

      // Broadcast update
      const { broadcastRoundUpdate } = require('@/lib/realtime/broadcast');
      await broadcastRoundUpdate(round.season_id, roundId, {
        type: 'submission',
        team_id: teamId,
        action: 'submitted',
        bid_count: bidCount,
      });

      return NextResponse.json({
        success: true,
        message: 'Team submission forced successfully',
        data: submissionResult[0]
      });

    } else if (action === 'draft') {
      // Revert to draft: Delete submission
      await sql`
        DELETE FROM bid_submissions
        WHERE team_id = ${teamId} AND round_id = ${roundId}
      `;

      // Broadcast update
      const { broadcastRoundUpdate } = require('@/lib/realtime/broadcast');
      await broadcastRoundUpdate(round.season_id, roundId, {
        type: 'submission',
        team_id: teamId,
        action: 'unlocked',
      });

      return NextResponse.json({
        success: true,
        message: 'Team submission reverted to draft successfully'
      });
    }

  } catch (error: any) {
    console.error('Error modifying round submission:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
