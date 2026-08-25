import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { broadcastFantasyDraftUpdate } from '@/lib/realtime/broadcast';

/**
 * POST /api/fantasy/draft/auto-close
 * Automatically open/close draft based on time windows
 * - Opens draft when draft_opens_at time is reached
 * - Closes draft when draft_closes_at time is reached
 * Similar to lineup auto-lock system
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
      SELECT * FROM fantasy_leagues
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
    const now = new Date();

    console.log('\n🔍 Draft Auto-Check:', {
      league_id,
      current_status: league.draft_status,
      current_time_utc: now.toISOString(),
    });

    // NOTE: Global draft_opens_at/draft_closes_at have been removed from fantasy_leagues.
    // Per-slot timing is now managed via fantasy_draft_rounds.
    // This auto-close endpoint now only handles the legacy batch draft_status.

    // Auto-close: Check if draft is active (no global close time — per-slot rounds handle timing)
    if (false) { // Disabled: per-slot rounds handle auto-close via their own closes_at
      await fantasySql`
          UPDATE fantasy_leagues
          SET 
            draft_status = 'closed',
            updated_at = CURRENT_TIMESTAMP
          WHERE league_id = ${league_id}
        `;

        console.log(`✅ Draft auto-closed for league ${league_id} at ${now.toISOString()}`);

        // Broadcast to Firebase Realtime DB
        await broadcastFantasyDraftUpdate(league_id, {
          draft_status: 'closed',
          auto_closed: true,
        });
        console.log(`📢 Broadcast auto-close to league:${league_id}:draft`);

        return NextResponse.json({
          success: true,
          message: 'Draft automatically closed',
          status: 'closed',
          closed: true,
          closed_at: now.toISOString(),
        });
      }
    }

    // No action needed
    console.log('\n✋ No action needed - conditions not met\n');
    return NextResponse.json({
      success: true,
      message: 'No automatic status change needed',
      status: league.draft_status,
      changed: false,
    });
  } catch (error) {
    console.error('Error in draft auto-open/close:', error);
    return NextResponse.json(
      { error: 'Failed to auto-open/close draft', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
