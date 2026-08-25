import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { processSlotBidPreview, applySlotBidResults } from '@/lib/fantasy/draft-processor';
import { broadcastFantasyDraftUpdate } from '@/lib/realtime/broadcast';
import { triggerNews } from '@/lib/news/trigger';
import { sendNotification } from '@/lib/notifications/send-notification';

/**
 * POST /api/fantasy/draft/auto-finalize
 * Scans all leagues for rounds that:
 *   1. Are currently 'active'
 *   2. Have closes_at in the past
 *   3. Have finalization_mode = 'auto'
 *
 * For each match it:
 *   - Closes the round
 *   - Runs preview (calculate results)
 *   - Applies results (write to DB)
 *   - Marks round as 'completed'
 *
 * No auth required — intended to be called by cron or polling.
 * Also accepts league_id to check only one league.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { league_id } = body;

    // Find rounds that are active, past closes_at, and in auto mode
    let rounds;
    if (league_id) {
      rounds = await fantasySql`
        SELECT r.id, r.league_id, r.slot_index, r.slot_name, r.closes_at, r.finalization_mode, r.status
        FROM fantasy_draft_rounds r
        WHERE r.league_id = ${league_id}
          AND r.status = 'active'
          AND r.closes_at IS NOT NULL
          AND r.closes_at < NOW()
          AND r.finalization_mode = 'auto'
      `;
    } else {
      rounds = await fantasySql`
        SELECT r.id, r.league_id, r.slot_index, r.slot_name, r.closes_at, r.finalization_mode, r.status
        FROM fantasy_draft_rounds r
        WHERE r.status = 'active'
          AND r.closes_at IS NOT NULL
          AND r.closes_at < NOW()
          AND r.finalization_mode = 'auto'
      `;
    }

    if (rounds.length === 0) {
      return NextResponse.json({ success: true, message: 'No rounds to auto-finalize', processed: 0 });
    }

    console.log(`⚡ [AUTO-FINALIZE] Found ${rounds.length} round(s) to auto-finalize`);

    const results: any[] = [];

    for (const round of rounds) {
      const lid = round.league_id;
      const slotIdx = Number(round.slot_index);

      console.log(`⚡ [AUTO-FINALIZE] Processing league=${lid} slot=${slotIdx} (${round.slot_name})`);

      try {
        // 1. Close the round
        await fantasySql`
          UPDATE fantasy_draft_rounds SET status = 'closed', updated_at = NOW()
          WHERE league_id = ${lid} AND slot_index = ${slotIdx}
        `;

        // 2. Calculate preview (no DB writes)
        const preview = await processSlotBidPreview(lid, slotIdx);

        if (!preview.success) {
          console.error(`❌ [AUTO-FINALIZE] Preview failed for slot ${slotIdx}:`, preview.errors);
          results.push({ league_id: lid, slot_index: slotIdx, success: false, error: preview.errors?.join(', ') });
          // Reset round back to active so admin can retry
          await fantasySql`
            UPDATE fantasy_draft_rounds SET status = 'active', updated_at = NOW()
            WHERE league_id = ${lid} AND slot_index = ${slotIdx}
          `;
          continue;
        }

        // 3. Save preview for audit trail
        await fantasySql`
          INSERT INTO fantasy_draft_preview (league_id, slot_index, preview_data)
          VALUES (${lid}, ${slotIdx}, ${JSON.stringify(preview)}::jsonb)
          ON CONFLICT (league_id, slot_index) DO UPDATE SET
            preview_data = ${JSON.stringify(preview)}::jsonb,
            created_at = NOW()
        `;

        // 4. Apply results (write to DB)
        const applyResult = await applySlotBidResults(lid, preview);

        if (!applyResult.success) {
          console.error(`❌ [AUTO-FINALIZE] Apply failed for slot ${slotIdx}:`, applyResult.errors);
          results.push({ league_id: lid, slot_index: slotIdx, success: false, error: applyResult.errors?.join(', ') });
          continue;
        }

        // 5. Mark round as completed
        await fantasySql`
          UPDATE fantasy_draft_rounds SET status = 'completed', updated_at = NOW()
          WHERE league_id = ${lid} AND slot_index = ${slotIdx}
        `;

        // 6. Clean up preview
        await fantasySql`
          DELETE FROM fantasy_draft_preview WHERE league_id = ${lid} AND slot_index = ${slotIdx}
        `;

        // 7. Broadcast update
        try {
          await broadcastFantasyDraftUpdate(lid, {
            draft_status: 'active',
            slot_index: slotIdx,
            finalized: true,
            auto_finalized: true,
          });
        } catch {}

        console.log(`✅ [AUTO-FINALIZE] Slot ${slotIdx} finalized: ${applyResult.total_players_drafted} players, ${applyResult.total_teams_drafted} teams`);

        results.push({
          league_id: lid,
          slot_index: slotIdx,
          slot_name: round.slot_name,
          success: true,
          total_players_drafted: applyResult.total_players_drafted,
          total_teams_drafted: applyResult.total_teams_drafted,
        });

      } catch (err) {
        console.error(`❌ [AUTO-FINALIZE] Error processing slot ${slotIdx}:`, err);
        results.push({
          league_id: lid,
          slot_index: slotIdx,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // 8. Send notifications for successfully finalized rounds
    const successful = results.filter(r => r.success);
    if (successful.length > 0) {
      try {
        await triggerNews('fantasy_draft_complete', {
          leagues: successful.map(r => r.league_id),
          total_finalized: successful.length,
        });
        await sendNotification({
          title: '⚡ Draft Round Auto-Finalized',
          body: `${successful.length} round(s) have been auto-finalized. Check your squad!`,
          icon: '/fantasy-icon.png',
          url: '/dashboard/team/fantasy/draft',
        }, { allUsers: true });
      } catch {}
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('Error in auto-finalize:', error);
    return NextResponse.json(
      { success: false, error: 'Auto-finalize failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
