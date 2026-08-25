import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/draft/bids/slot-status?user_id=xxx
 * Returns per-slot submission status for a team.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('user_id');
    if (!userId) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    // Get team
    let teams = await fantasySql`
      SELECT team_id, league_id FROM fantasy_teams
      WHERE owner_uid = ${userId} AND is_enabled = true LIMIT 1
    `;

    if (teams.length === 0) {
      return NextResponse.json({ slot_submissions: {} });
    }

    const { team_id, league_id } = teams[0];

    const result: Record<number, { submitted: boolean; submitted_at: string }> = {};
    try {
      const subs = await fantasySql`
        SELECT slot_index, submitted_at FROM fantasy_slot_submissions
        WHERE team_id = ${team_id} AND league_id = ${league_id}
      `;
      for (const s of subs) {
        result[s.slot_index] = { submitted: true, submitted_at: s.submitted_at };
      }
    } catch {
      // Table may not exist yet — fall back to legacy draft_submitted
      if (teams[0]) {
        const teamRow = await fantasySql`
          SELECT draft_submitted FROM fantasy_teams WHERE team_id = ${team_id} LIMIT 1
        `;
        if (teamRow[0]?.draft_submitted) {
          const rounds = await fantasySql`
            SELECT slot_index FROM fantasy_draft_rounds WHERE league_id = ${league_id}
          `;
          for (const r of rounds) {
            result[r.slot_index] = { submitted: true, submitted_at: '' };
          }
        }
      }
    }

    return NextResponse.json({ success: true, slot_submissions: result });
  } catch (error) {
    console.error('Error fetching slot status:', error);
    return NextResponse.json({ error: 'Failed to fetch slot status' }, { status: 500 });
  }
}
