import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { triggerNews } from '@/lib/news/trigger';
import { broadcastFantasyDraftUpdate } from '@/lib/realtime/broadcast';
import { sendNotification } from '@/lib/notifications/send-notification';

/**
 * POST /api/fantasy/draft/control
 * Committee endpoint to control draft periods
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { league_id, draft_status, draft_opens_at, draft_closes_at, active_slot_index } = body;

    console.log('🔵 Received from client:', {
      draft_opens_at,
      draft_closes_at,
      active_slot_index
    });

    // Ensure PostgreSQL session uses UTC timezone
    await fantasySql`SET timezone = 'UTC'`;

    if (!league_id || !draft_status) {
      return NextResponse.json(
        { error: 'league_id and draft_status are required' },
        { status: 400 }
      );
    }

    // Validate draft_status
    if (!['pending', 'active', 'closed'].includes(draft_status)) {
      return NextResponse.json(
        { error: 'draft_status must be pending, active, or closed' },
        { status: 400 }
      );
    }

    // Update draft settings
    // Use string literals with AT TIME ZONE 'UTC' to force UTC interpretation
    // Get current category settings to preserve other slots (pre-fetch for transaction)
    const currentLeagues = await fantasySql`
      SELECT category_settings, draft_status FROM fantasy_leagues WHERE league_id = ${league_id}
    `;
    
    const categorySettings = currentLeagues[0]?.category_settings || {};
    if (active_slot_index !== undefined) {
      categorySettings.active_slot_index = Number(active_slot_index);
    }

    // Get current draft status to detect status transitions
    const currentStatus = currentLeagues[0]?.draft_status || 'pending';
    const isTransitioningToActive = draft_status === 'active' && currentStatus !== 'active';

    // Build transaction queries array (draft_opens_at/draft_closes_at removed —
    // timing is now managed per-slot via fantasy_draft_rounds)
    const queries: any[] = [
      fantasySql`
        UPDATE fantasy_leagues
        SET 
          draft_status = ${draft_status},
          category_settings = ${categorySettings},
          updated_at = CURRENT_TIMESTAMP
        WHERE league_id = ${league_id}
        RETURNING *
      `
    ];

    // Only reset bids/locks when STARTING a new round (transitioning TO active)
    // Not when just updating the close time on an already-active round
    if (isTransitioningToActive) {
      // If we are open for a specific slot, delete draft bids and submissions for that slot only
      // Do NOT reset draft_submitted globally — other rounds may be active
      const targetSlot = Number(categorySettings.active_slot_index);
      if (targetSlot) {
        queries.push(fantasySql`
          DELETE FROM fantasy_draft_bids
          WHERE league_id = ${league_id} AND slot_index = ${targetSlot}
        `);
        console.log(`🔄 Cleared previous bids for slot ${targetSlot} for league ${league_id}`);
      } else {
        queries.push(fantasySql`
          DELETE FROM fantasy_draft_bids
          WHERE league_id = ${league_id}
        `);
      }
    }

    const transactionResults = await fantasySql.transaction(queries);

    // Clean up per-slot submissions (separate — table may not exist yet)
    if (isTransitioningToActive) {
      try {
        const targetSlot = Number(categorySettings.active_slot_index);
        if (targetSlot) {
          await fantasySql`DELETE FROM fantasy_slot_submissions WHERE league_id = ${league_id} AND slot_index = ${targetSlot}`;
        } else {
          await fantasySql`DELETE FROM fantasy_slot_submissions WHERE league_id = ${league_id}`;
        }
      } catch {}
    }
    const result = transactionResults[0];

    console.log('🟢 Stored in database:', {
      draft_status: result[0]?.draft_status,
    });

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Fantasy league not found' },
        { status: 404 }
      );
    }

    console.log(`✅ Draft status updated to ${draft_status} for league ${league_id}`);

    // Trigger news generation and push notifications for draft status changes
    try {
      const leagueData = result[0];
      
      // Only trigger news/notifications on actual status transitions
      if (draft_status === 'active' && currentStatus !== 'active') {
        // Trigger news
        await triggerNews('fantasy_opened', {
          season_id: leagueData.season_id,
          season_name: leagueData.season_name,
          league_name: leagueData.league_name,
          budget_per_team: leagueData.budget_per_team,
          max_squad_size: leagueData.max_squad_size,
        });
        console.log('📰 Fantasy draft opening news triggered');
        
        // Send push notification to all users
        await sendNotification(
          {
            title: '🎮 Fantasy Draft is Now Open!',
            body: `Start building your squad for ${leagueData.league_name}! The draft is now active.`,
            icon: '/fantasy-icon.png',
            url: '/dashboard/fantasy/draft',
          },
          { allUsers: true }
        );
        console.log('📬 Fantasy draft opening notification sent');
      } else if (draft_status === 'closed' && currentStatus !== 'closed') {
        // Trigger news
        await triggerNews('fantasy_draft_complete', {
          season_id: leagueData.season_id,
          season_name: leagueData.season_name,
          league_name: leagueData.league_name,
        });
        console.log('📰 Fantasy draft completion news triggered');
        
        // Send push notification to all users
        await sendNotification(
          {
            title: '🏁 Fantasy Draft Closed',
            body: `Draft period has ended for ${leagueData.league_name}. Check your squad and prepare for the season!`,
            icon: '/fantasy-icon.png',
            url: '/dashboard/fantasy',
          },
          { allUsers: true }
        );
        console.log('📬 Fantasy draft completion notification sent');
      }
    } catch (newsError) {
      console.error('Error triggering fantasy news/notifications (non-critical):', newsError);
    }

    // Broadcast to Firebase Realtime DB
    await broadcastFantasyDraftUpdate(league_id, {
      draft_status,
      draft_opens_at: draft_opens_at || null,
      draft_closes_at: draft_closes_at || null,
    });

    return NextResponse.json({
      success: true,
      message: 'Draft settings updated successfully',
      draft_status,
      draft_opens_at: draft_opens_at || null,
      draft_closes_at: draft_closes_at || null,
    });
  } catch (error) {
    console.error('Error updating draft control:', error);
    return NextResponse.json(
      { error: 'Failed to update draft settings', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
