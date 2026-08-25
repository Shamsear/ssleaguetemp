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

    // No automatic actions — per-slot rounds handle timing via their own closes_at
    return NextResponse.json({
      success: true,
      message: 'No automatic status change needed (per-slot rounds handle timing)',
      status: league.draft_status,
      changed: false,
    });
  } catch (error) {
    console.error('Error in draft auto-close:', error);
    return NextResponse.json(
      { error: 'Failed to auto-close draft', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
