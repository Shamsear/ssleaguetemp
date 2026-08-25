import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { processSlotBids, processSlotBidPreview, applySlotBidResults } from '@/lib/fantasy/draft-processor';
import { broadcastFantasyDraftUpdate } from '@/lib/realtime/broadcast';
import { triggerNews } from '@/lib/news/trigger';
import { sendNotification } from '@/lib/notifications/send-notification';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * POST /api/fantasy/draft/finalize
 * Actions:
 *   - "preview"  → calculate results for a slot, save to fantasy_draft_preview
 *   - "apply"    → apply a saved preview to the database
 *   - "finalize" → legacy: full auto-finalize (processSlotBids)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(['committee_admin', 'super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Committee access required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { league_id, slot_index, action } = body;

    if (!league_id) {
      return NextResponse.json({ success: false, error: 'Missing league_id' }, { status: 400 });
    }

    // ── PREVIEW: Calculate results and save to DB ──
    if (action === 'preview') {
      if (slot_index === undefined) {
        return NextResponse.json({ success: false, error: 'slot_index required for preview' }, { status: 400 });
      }

      console.log(`🔍 [PREVIEW] Slot ${slot_index} for league ${league_id}`);
      const result = await processSlotBidPreview(league_id, Number(slot_index));

      if (!result.success) {
        return NextResponse.json({ success: false, error: 'Preview failed', details: result.errors?.join(', ') }, { status: 500 });
      }

      // Save preview to database so it persists
      await fantasySql`
        INSERT INTO fantasy_draft_preview (league_id, slot_index, preview_data)
        VALUES (${league_id}, ${Number(slot_index)}, ${JSON.stringify(result)}::jsonb)
        ON CONFLICT (league_id, slot_index) DO UPDATE SET
          preview_data = ${JSON.stringify(result)}::jsonb,
          created_at = NOW()
      `;

      return NextResponse.json({ success: true, preview: result });
    }

    // ── APPLY: Commit a saved preview ──
    if (action === 'apply') {
      if (slot_index === undefined) {
        return NextResponse.json({ success: false, error: 'slot_index required for apply' }, { status: 400 });
      }

      // Fetch saved preview
      const previews = await fantasySql`
        SELECT preview_data FROM fantasy_draft_preview
        WHERE league_id = ${league_id} AND slot_index = ${Number(slot_index)}
        LIMIT 1
      `;

      if (previews.length === 0) {
        return NextResponse.json({ success: false, error: 'No preview found. Run preview first.' }, { status: 400 });
      }

      const previewData = typeof previews[0].preview_data === 'string'
        ? JSON.parse(previews[0].preview_data) : previews[0].preview_data;

      console.log(`⚡ [APPLY] Slot ${slot_index} for league ${league_id}`);
      const result = await applySlotBidResults(league_id, previewData);

      if (!result.success) {
        return NextResponse.json({ success: false, error: 'Apply failed', details: result.errors?.join(', ') }, { status: 500 });
      }

      // Mark round as completed
      await fantasySql`
        UPDATE fantasy_draft_rounds SET status = 'completed', updated_at = NOW()
        WHERE league_id = ${league_id} AND slot_index = ${Number(slot_index)}
      `;

      // Broadcast
      try {
        await broadcastFantasyDraftUpdate(league_id, { draft_status: 'active', slot_index: Number(slot_index), finalized: true });
      } catch {}

      return NextResponse.json({ success: true, result });
    }

    // ── LEGACY FINALIZE: Process all pending slots ──
    if (slot_index !== undefined) {
      await fantasySql`
        UPDATE fantasy_draft_rounds SET status = 'completed', updated_at = NOW()
        WHERE league_id = ${league_id} AND slot_index = ${Number(slot_index)}
      `;
    }

    console.log(`⚡ Finalizing fantasy draft for league ${league_id}...`);
    const result = await processSlotBids(league_id);

    if (!result.success) {
      return NextResponse.json({ success: false, error: 'Draft processing failed', details: result.errors?.join(', ') }, { status: 500 });
    }

    try {
      await broadcastFantasyDraftUpdate(league_id, { draft_status: 'completed' });
    } catch {}

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
    } catch {}

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in finalization route:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to finalize draft', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
