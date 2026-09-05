import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * POST /api/fantasy/draft/auto-close
 * Legacy auto-close endpoint.
 * Per-slot timing is now managed via fantasy_draft_rounds (closes_at column).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { league_id } = body;

    if (!league_id) {
      return NextResponse.json(
        { error: 'league_id is required' },
        { status: 400 }
      );
    }

    // Get league settings
    const leagues = await fantasySql`
      SELECT league_id, draft_status FROM fantasy_leagues
      WHERE league_id = ${league_id}
      LIMIT 1
    `;

    if (leagues.length === 0) {
      return NextResponse.json(
        { error: 'Fantasy league not found' },
        { status: 404 }
      );
    }

    const league = leagues[0];

    // Trigger auto-finalize for rounds past their closes_at in auto mode
    const autoRounds = await fantasySql`
      SELECT r.slot_index, r.slot_name, r.closes_at
      FROM fantasy_draft_rounds r
      WHERE r.league_id = ${league_id}
        AND r.status = 'active'
        AND r.closes_at IS NOT NULL
        AND r.closes_at < NOW()
        AND r.finalization_mode = 'auto'
    `;

    if (autoRounds.length > 0) {
      // Forward to auto-finalize endpoint
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const resp = await fetch(`${baseUrl}/api/fantasy/draft/auto-finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_id }),
      });
      const data = await resp.json();
      return NextResponse.json({
        success: true,
        message: `Auto-finalized ${data.processed} round(s)`,
        status: league.draft_status,
        changed: true,
        auto_finalized: data.results,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'No rounds ready for auto-finalization',
      status: league.draft_status,
      changed: false,
    });
  } catch (error: any) {
    console.error('Error in draft auto-close:', error);
    return NextResponse.json(
      { error: 'Failed to auto-close draft', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
