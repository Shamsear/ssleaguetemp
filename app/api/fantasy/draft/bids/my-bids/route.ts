import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

/**
 * GET /api/fantasy/draft/bids/my-bids?user_id=xxx
 * Retrieve the current team's draft bids
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing user_id parameter' },
        { status: 400 }
      );
    }

    // 1. Get the fantasy team for this owner (with fallback for mismatched owner_uid)
    let teams = await fantasySql`
      SELECT team_id, league_id, budget_remaining, draft_submitted 
      FROM fantasy_teams
      WHERE owner_uid = ${userId} AND is_enabled = true
      LIMIT 1
    `;

    // Fallback: if not found by owner_uid, try via Firebase team lookup (self-heal)
    if (teams.length === 0) {
      // Try owner_uid first, then uid field (enable-all stores it under either)
      let firebaseTeamId: string | null = null;
      let teamsSnap = await adminDb.collection('teams').where('owner_uid', '==', userId).limit(1).get();
      if (!teamsSnap.empty) {
        firebaseTeamId = teamsSnap.docs[0].id;
      } else {
        teamsSnap = await adminDb.collection('teams').where('uid', '==', userId).limit(1).get();
        if (!teamsSnap.empty) {
          firebaseTeamId = teamsSnap.docs[0].id;
        }
      }

      if (firebaseTeamId) {
        teams = await fantasySql`
          SELECT team_id, league_id, budget_remaining, draft_submitted 
          FROM fantasy_teams
          WHERE team_id = ${firebaseTeamId} AND is_enabled = true
          LIMIT 1
        `;
        if (teams.length > 0) {
          await fantasySql`
            UPDATE fantasy_teams
            SET owner_uid = ${userId}, updated_at = NOW()
            WHERE team_id = ${firebaseTeamId} AND owner_uid != ${userId}
          `;
        }
      }
    }

    if (teams.length === 0) {
      return NextResponse.json(
        { error: 'Fantasy team not found or not enabled' },
        { status: 404 }
      );
    }

    const { team_id, league_id, budget_remaining, draft_submitted } = teams[0];

    // 2. Fetch all bids submitted by this team
    const bids = await fantasySql`
      SELECT 
        id,
        bid_id,
        slot_index,
        priority,
        target_id,
        bid_type,
        bid_amount,
        status,
        submitted_at
      FROM fantasy_draft_bids
      WHERE team_id = ${team_id} AND league_id = ${league_id}
      ORDER BY slot_index ASC, priority ASC
    `;

    return NextResponse.json({
      success: true,
      team_id,
      league_id,
      budget_remaining: Number(budget_remaining),
      draft_submitted: !!draft_submitted,
      bids: bids.map((b: any) => ({
        id: b.id,
        bid_id: b.bid_id,
        slot_index: b.slot_index,
        priority: b.priority,
        target_id: b.target_id,
        bid_type: b.bid_type,
        bid_amount: Number(b.bid_amount),
        status: b.status,
        submitted_at: b.submitted_at
      }))
    });
  } catch (error: any) {
    console.error('Error fetching my bids:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bids', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
