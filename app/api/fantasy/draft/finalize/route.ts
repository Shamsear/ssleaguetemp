import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { processSlotBids } from '@/lib/fantasy/draft-processor';
import { broadcastFantasyDraftUpdate } from '@/lib/realtime/broadcast';
import { triggerNews } from '@/lib/news/trigger';
import { sendNotification } from '@/lib/notifications/send-notification';

/**
 * POST /api/fantasy/draft/finalize
 * Finalize the slot bidding draft for the league
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verify committee admin access
    const auth = await verifyAuth(['committee_admin', 'super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Committee access required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { league_id, slot_index } = body;

    if (!league_id) {
      return NextResponse.json(
        { success: false, error: 'Missing league_id' },
        { status: 400 }
      );
    }

    // Mark the round as completed in fantasy_draft_rounds if slot_index provided
    if (slot_index !== undefined) {
      const { fantasySql } = await import('@/lib/neon/fantasy-config');
      await fantasySql`
        UPDATE fantasy_draft_rounds
        SET status = 'completed', updated_at = NOW()
        WHERE league_id = ${league_id} AND slot_index = ${Number(slot_index)}
      `;
      console.log(`✅ Marked slot ${slot_index} round as completed`);
    }

    console.log(`⚡ Finalizing fantasy draft for league ${league_id}${slot_index !== undefined ? ` slot ${slot_index}` : ''}...`);

    // 2. Execute the slot-based blind bid resolution engine
    const result = await processSlotBids(league_id);

    if (!result.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Draft processing failed', 
          details: result.errors?.join(', ') || 'Unknown error' 
        },
        { status: 500 }
      );
    }

    // 3. Broadcast update to trigger live refresh on all team dashboards
    try {
      await broadcastFantasyDraftUpdate(league_id, {
        draft_status: 'completed'
      });
    } catch (bcError) {
      console.error('Error broadcasting draft update:', bcError);
    }

    // 4. Trigger news items and notifications
    try {
      await triggerNews('fantasy_draft_complete', {
        league_id,
        total_players_drafted: result.total_players_drafted,
        total_teams_drafted: result.total_teams_drafted,
        total_budget_spent: result.total_budget_spent
      });

      await sendNotification({
        title: '🏁 Fantasy Draft Finalized!',
        body: 'The draft has been finalized! Head over to your team dashboard to view your squad.',
        icon: '/fantasy-icon.png',
        url: `/dashboard/team/fantasy/draft/results`
      }, { allUsers: true });

    } catch (notifyErr) {
      console.error('Non-critical notification/news error:', notifyErr);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in finalization route:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to finalize draft', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
