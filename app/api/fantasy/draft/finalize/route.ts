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

    // ── ASSIGN RANDOM: Assign random remaining targets at average price to teams without wins ──
    if (action === 'assign_random') {
      if (slot_index === undefined) {
        return NextResponse.json({ success: false, error: 'slot_index required for assign_random' }, { status: 400 });
      }

      console.log(`🎲 [ASSIGN RANDOM] Slot ${slot_index} for league ${league_id}`);

      // Check if slot round is completed in database
      const roundRows = await fantasySql`
        SELECT status FROM fantasy_draft_rounds
        WHERE league_id = ${league_id} AND slot_index = ${Number(slot_index)}
        LIMIT 1
      `;
      const isCompleted = roundRows.length > 0 && roundRows[0].status === 'completed';

      // Try to fetch saved preview
      const previews = await fantasySql`
        SELECT preview_data FROM fantasy_draft_preview
        WHERE league_id = ${league_id} AND slot_index = ${Number(slot_index)}
        LIMIT 1
      `;
      const hasPreview = previews.length > 0;

      // Fetch league configuration (for lists, base price, etc.)
      const leagues = await fantasySql`
        SELECT category_settings FROM fantasy_leagues WHERE league_id = ${league_id} LIMIT 1
      `;
      if (leagues.length === 0) throw new Error('League not found');

      const categorySettings = typeof leagues[0].category_settings === 'string'
        ? JSON.parse(leagues[0].category_settings) : leagues[0].category_settings;
      const slot = categorySettings?.slots?.find((s: any) => s.slot_index === Number(slot_index));
      if (!slot) throw new Error(`Slot ${slot_index} not found`);

      const slotLists = categorySettings?.lists || {};
      const slotPlayerIds = slotLists[slot.list_id] || [];

      // Fetch all enabled teams in this league
      const teams = await fantasySql`
        SELECT team_id, team_name, budget_remaining, supported_team_id
        FROM fantasy_teams WHERE league_id = ${league_id} AND is_enabled = true
      `;



      if (!isCompleted) {
        let previewData: any;
        if (hasPreview) {
          previewData = typeof previews[0].preview_data === 'string'
            ? JSON.parse(previews[0].preview_data) : previews[0].preview_data;
        } else {
          console.log(`Generating fresh preview first for slot ${slot_index}`);
          const result = await processSlotBidPreview(league_id, Number(slot_index));
          if (!result.success) {
            return NextResponse.json({ success: false, error: 'Failed to generate initial preview', details: result.errors?.join(', ') }, { status: 500 });
          }
          previewData = result;
        }

        // Determine teams that ALREADY have a winning target in this preview
        const winningBids = previewData.results_by_slot?.[0]?.winning_bids || [];
        const teamsWithWin = new Set<string>(winningBids.map((w: any) => w.team_id));

        // Filter: Only teams that don't have a win in this preview
        const remainingTeams = teams.filter((t: any) => !teamsWithWin.has(t.team_id));
        if (remainingTeams.length === 0) {
          return NextResponse.json({ success: true, message: 'All teams already assigned targets in this preview.', preview: previewData });
        }

        // Determine which targets are already taken (either in squads or in preview winning_bids)
        const takenTargets = new Set<string>();
        const squadPlayers = await fantasySql`
          SELECT real_player_id FROM fantasy_squad WHERE league_id = ${league_id}
        `;
        squadPlayers.forEach((p: any) => takenTargets.add(p.real_player_id));

        const squadTeams = await fantasySql`
          SELECT supported_team_id FROM fantasy_teams WHERE league_id = ${league_id} AND supported_team_id IS NOT NULL
        `;
        squadTeams.forEach((t: any) => takenTargets.add(t.supported_team_id));

        winningBids.forEach((w: any) => takenTargets.add(w.target_id));

        // Find available pool targets for this slot
        let poolTargets: Array<{ target_id: string; target_name: string; bid_type: string; team_name?: string; position?: string }> = [];

        if (Number(slot_index) === 6) {
          const seasonId = league_id.replace('SSPSLFLS', 'SSPSLS');
          const teamsRes = await fantasySql`
            SELECT id, team_name FROM teams WHERE season_id = ${seasonId}
          `;
          const listIds = slotPlayerIds.length > 0 ? new Set(slotPlayerIds) : null;
          const base = teamsRes.filter((t: any) => !listIds || listIds.has(t.id));
          base.forEach((t: any) => {
            if (!takenTargets.has(t.id)) {
              poolTargets.push({ target_id: t.id, target_name: t.team_name, bid_type: 'real_team' });
            }
          });
        } else {
          const players = await fantasySql`
            SELECT real_player_id, player_name, real_team_name, position FROM fantasy_players
            WHERE league_id = ${league_id} AND real_player_id = ANY(${slotPlayerIds})
          `;
          players.forEach((p: any) => {
            if (!takenTargets.has(p.real_player_id)) {
              poolTargets.push({
                target_id: p.real_player_id,
                target_name: p.player_name,
                bid_type: 'player',
                team_name: p.real_team_name,
                position: p.position
              });
            }
          });
        }

        poolTargets = poolTargets.sort(() => Math.random() - 0.5);

        // Average price
        const basePrice = Number(slot.base_price || 0);
        const avgPrice = winningBids.length > 0
          ? Math.max(basePrice, Math.round(winningBids.reduce((sum: number, w: any) => sum + Number(w.bid_amount), 0) / winningBids.length))
          : basePrice;

        const newWinningBids = [...winningBids];
        const newPlayerBidIds = [...(previewData.player_bid_ids || [])];
        const teamPreviews = [...(previewData.team_previews || [])];
        let newTeamLinkBid = previewData.team_link_bid || null;

        let assignedCount = 0;

        for (const team of remainingTeams) {
          if (poolTargets.length === 0) break;

          const tpIndex = teamPreviews.findIndex((tp: any) => tp.team_id === team.team_id);
          const currentTp = teamPreviews[tpIndex] || {
            team_id: team.team_id,
            team_name: team.team_name,
            current_budget: Number(team.budget_remaining),
            projected_budget: Number(team.budget_remaining),
            budget_spent: 0,
            players_won: 0,
            teams_won: 0
          };

          const priceToCharge = Math.min(avgPrice, Math.max(0, currentTp.projected_budget));
          const target = poolTargets.pop()!;

          newWinningBids.push({
            team_id: team.team_id,
            team_name: team.team_name,
            target_id: target.target_id,
            target_name: target.target_name,
            bid_type: target.bid_type,
            bid_amount: priceToCharge
          });

          if (target.bid_type === 'player') {
            newPlayerBidIds.push({ target_id: target.target_id, team_id: team.team_id });
            currentTp.players_won = (currentTp.players_won || 0) + 1;
          } else {
            newTeamLinkBid = {
              team_id: team.team_id,
              target_id: target.target_id,
              target_name: target.target_name,
              bid_type: 'real_team',
              bid_amount: priceToCharge
            };
            currentTp.teams_won = (currentTp.teams_won || 0) + 1;
          }

          currentTp.projected_budget = currentTp.projected_budget - priceToCharge;
          currentTp.budget_spent = (currentTp.budget_spent || 0) + priceToCharge;

          if (tpIndex >= 0) {
            teamPreviews[tpIndex] = currentTp;
          } else {
            teamPreviews.push(currentTp);
          }
          assignedCount++;
        }

        const updatedTotalPlayers = newWinningBids.filter((w: any) => w.bid_type === 'player').length;
        const updatedTotalTeams = newWinningBids.filter((w: any) => w.bid_type === 'real_team').length;
        const updatedTotalSpent = newWinningBids.reduce((sum: number, w: any) => sum + Number(w.bid_amount), 0);

        const updatedPreview = {
          ...previewData,
          results_by_slot: [{
            ...previewData.results_by_slot[0],
            winners: newWinningBids.length,
            winning_bids: newWinningBids
          }],
          total_players_drafted: updatedTotalPlayers,
          total_teams_drafted: updatedTotalTeams,
          total_budget_spent: updatedTotalSpent,
          team_previews: teamPreviews,
          player_bid_ids: newPlayerBidIds,
          team_link_bid: newTeamLinkBid
        };

        await fantasySql`
          INSERT INTO fantasy_draft_preview (league_id, slot_index, preview_data)
          VALUES (${league_id}, ${Number(slot_index)}, ${JSON.stringify(updatedPreview)}::jsonb)
          ON CONFLICT (league_id, slot_index) DO UPDATE SET
            preview_data = ${JSON.stringify(updatedPreview)}::jsonb,
            created_at = NOW()
        `;

        return NextResponse.json({
          success: true,
          message: `Successfully assigned ${assignedCount} random players/teams at average price ${avgPrice} Cr.`,
          preview: updatedPreview
        });

      } else {
        // ─── CASE B: DIRECT DATABASE UPDATE (ROUND COMPLETED OR NO PREVIEW RUNNING) ───
        const teamsWithWin = new Set<string>();
        if (Number(slot_index) === 6) {
          teams.forEach((t: any) => {
            if (t.supported_team_id) teamsWithWin.add(t.team_id);
          });
        } else {
          const squadPlayers = await fantasySql`
            SELECT team_id FROM fantasy_squad
            WHERE league_id = ${league_id} AND real_player_id = ANY(${slotPlayerIds})
          `;
          squadPlayers.forEach((sp: any) => teamsWithWin.add(sp.team_id));
        }

        const remainingTeams = teams.filter((t: any) => !teamsWithWin.has(t.team_id));
        if (remainingTeams.length === 0) {
          return NextResponse.json({ success: true, message: 'All teams already have targets in this slot.' });
        }

        // Determine which targets are already taken in DB
        const takenTargets = new Set<string>();
        const squadPlayers = await fantasySql`
          SELECT real_player_id FROM fantasy_squad WHERE league_id = ${league_id}
        `;
        squadPlayers.forEach((p: any) => takenTargets.add(p.real_player_id));

        const squadTeams = await fantasySql`
          SELECT supported_team_id FROM fantasy_teams WHERE league_id = ${league_id} AND supported_team_id IS NOT NULL
        `;
        squadTeams.forEach((t: any) => takenTargets.add(t.supported_team_id));

        // Find available pool targets for this slot
        let poolTargets: Array<{ target_id: string; target_name: string; bid_type: string; team_name?: string; position?: string }> = [];

        if (Number(slot_index) === 6) {
          const seasonId = league_id.replace('SSPSLFLS', 'SSPSLS');
          const teamsRes = await fantasySql`
            SELECT id, team_name FROM teams WHERE season_id = ${seasonId}
          `;
          const listIds = slotPlayerIds.length > 0 ? new Set(slotPlayerIds) : null;
          const base = teamsRes.filter((t: any) => !listIds || listIds.has(t.id));
          base.forEach((t: any) => {
            if (!takenTargets.has(t.id)) {
              poolTargets.push({ target_id: t.id, target_name: t.team_name, bid_type: 'real_team' });
            }
          });
        } else {
          const players = await fantasySql`
            SELECT real_player_id, player_name, real_team_name, position FROM fantasy_players
            WHERE league_id = ${league_id} AND real_player_id = ANY(${slotPlayerIds})
          `;
          players.forEach((p: any) => {
            if (!takenTargets.has(p.real_player_id)) {
              poolTargets.push({
                target_id: p.real_player_id,
                target_name: p.player_name,
                bid_type: 'player',
                team_name: p.real_team_name,
                position: p.position
              });
            }
          });
        }

        poolTargets = poolTargets.sort(() => Math.random() - 0.5);

        // Average price from database
        const basePrice = Number(slot.base_price || 0);
        let avgPrice = basePrice;

        if (Number(slot_index) === 6) {
          const wonBids = await fantasySql`
            SELECT bid_amount FROM fantasy_draft_bids
            WHERE league_id = ${league_id} AND slot_index = ${Number(slot_index)} AND status = 'won'
          `;
          if (wonBids.length > 0) {
            avgPrice = Math.max(basePrice, Math.round(wonBids.reduce((sum: number, b: any) => sum + Number(b.bid_amount), 0) / wonBids.length));
          }
        } else {
          const squadPrices = await fantasySql`
            SELECT purchase_price FROM fantasy_squad
            WHERE league_id = ${league_id} AND real_player_id = ANY(${slotPlayerIds}) AND purchase_price > 0
          `;
          if (squadPrices.length > 0) {
            avgPrice = Math.max(basePrice, Math.round(squadPrices.reduce((sum: number, s: any) => sum + Number(s.purchase_price), 0) / squadPrices.length));
          }
        }

        const { v4: uuidv4 } = require('uuid');
        const directQueries: any[] = [];
        let assignedCount = 0;

        for (const team of remainingTeams) {
          if (poolTargets.length === 0) break;

          const target = poolTargets.pop()!;
          const priceToCharge = Math.min(avgPrice, Math.max(0, Number(team.budget_remaining)));

          // Deduct budget
          directQueries.push(fantasySql`
            UPDATE fantasy_teams SET budget_remaining = budget_remaining - ${priceToCharge}, updated_at = CURRENT_TIMESTAMP
            WHERE team_id = ${team.team_id} AND league_id = ${league_id}
          `);

          if (target.bid_type === 'player') {
            const squadId = `sq_${uuidv4().replace(/-/g, '')}`;
            directQueries.push(fantasySql`
              INSERT INTO fantasy_squad (squad_id, team_id, league_id, real_player_id, player_name,
                position, real_team_name, purchase_price, current_value, total_points,
                is_captain, is_vice_captain, acquisition_type, acquired_at)
              VALUES (${squadId}, ${team.team_id}, ${league_id}, ${target.target_id}, ${target.target_name},
                ${target.position || 'UNASSIGNED'}, ${target.team_name || ''}, ${priceToCharge}, ${priceToCharge},
                0, false, false, 'draft', CURRENT_TIMESTAMP)
            `);
            directQueries.push(fantasySql`
              UPDATE fantasy_players SET drafted_by_team_id = ${team.team_id},
              current_price = ${priceToCharge}, is_available = false
              WHERE real_player_id = ${target.target_id} AND league_id = ${league_id}
            `);
          } else {
            directQueries.push(fantasySql`
              UPDATE fantasy_teams SET supported_team_id = ${target.target_id},
              supported_team_name = ${target.target_name}
              WHERE team_id = ${team.team_id} AND league_id = ${league_id}
            `);
          }

          // Create synthetic won bid
          const bid_id = `bid_${uuidv4().replace(/-/g, '')}`;
          directQueries.push(fantasySql`
            INSERT INTO fantasy_draft_bids (bid_id, league_id, team_id, slot_index, priority, target_id, bid_type, bid_amount, status, submitted_at, processed_at)
            VALUES (${bid_id}, ${league_id}, ${team.team_id}, ${Number(slot_index)}, 99, ${target.target_id}, ${target.bid_type}, ${priceToCharge}, 'won', NOW(), NOW())
          `);

          assignedCount++;
        }

        if (directQueries.length > 0) {
          await fantasySql.transaction(directQueries);
        }

        return NextResponse.json({
          success: true,
          message: `Successfully assigned ${assignedCount} random players/teams directly to DB at average price ${avgPrice} Cr.`
        });
      }
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

      // ── BUDGET GUARD: Check if applying this preview would overdraw any team ──
      const teamBudgets = await fantasySql`
        SELECT team_id, team_name, budget_remaining FROM fantasy_teams
        WHERE league_id = ${league_id} AND is_enabled = true
      `;
      const budgetMap = new Map<string, { name: string; remaining: number }>();
      teamBudgets.forEach((tb: any) => budgetMap.set(tb.team_id, { name: tb.team_name, remaining: Number(tb.budget_remaining) }));

      // Sum winning bids from ALL non-finalized previews (including this one)
      const otherPreviews = await fantasySql`
        SELECT slot_index, preview_data FROM fantasy_draft_preview
        WHERE league_id = ${league_id} AND slot_index != ${Number(slot_index)}
      `;
      const allWinningBids: Array<{ team_id: string; bid_amount: number; slot_index: number }> = [];
      // Add current preview winning bids
      const currentWins = previewData?.results_by_slot?.[0]?.winning_bids || [];
      currentWins.forEach((w: any) => {
        allWinningBids.push({ team_id: w.team_id, bid_amount: Number(w.bid_amount), slot_index: Number(slot_index) });
      });
      // Add other non-finalized previews
      for (const op of otherPreviews) {
        const opRound = await fantasySql`
          SELECT status FROM fantasy_draft_rounds
          WHERE league_id = ${league_id} AND slot_index = ${op.slot_index} LIMIT 1
        `;
        if (opRound.length > 0 && opRound[0].status !== 'completed') {
          const opData = typeof op.preview_data === 'string' ? JSON.parse(op.preview_data) : op.preview_data;
          const opWins = opData?.results_by_slot?.[0]?.winning_bids || [];
          opWins.forEach((w: any) => {
            allWinningBids.push({ team_id: w.team_id, bid_amount: Number(w.bid_amount), slot_index: op.slot_index });
          });
        }
      }

      // Check each team's total commitments vs budget
      const overdraftTeams: string[] = [];
      const teamSpend = new Map<string, number>();
      allWinningBids.forEach(w => {
        teamSpend.set(w.team_id, (teamSpend.get(w.team_id) || 0) + w.bid_amount);
      });
      teamSpend.forEach((totalSpend, teamId) => {
        const budget = budgetMap.get(teamId);
        if (budget && totalSpend > budget.remaining) {
          overdraftTeams.push(`${budget.name} (needs ${totalSpend} Cr, has ${budget.remaining} Cr)`);
        }
      });

      if (overdraftTeams.length > 0) {
        return NextResponse.json({
          success: false,
          error: `Cannot finalize: the following teams would exceed their budget:\n${overdraftTeams.join('\n')}`,
        }, { status: 400 });
      }

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

      // Send push notification for per-slot finalize
      try {
        const slotRound = await fantasySql`
          SELECT slot_name FROM fantasy_draft_rounds
          WHERE league_id = ${league_id} AND slot_index = ${Number(slot_index)} LIMIT 1
        `;
        const slotName = slotRound[0]?.slot_name || `Slot ${slot_index}`;
        await sendNotification({
          title: '⚡ Draft Round Finalized!',
          body: `${slotName} has been finalized. Check your squad for new players!`,
          icon: '/fantasy-icon.png',
          url: '/dashboard/team/fantasy/draft/results',
        }, { allUsers: true });
      } catch (err) {
        console.error('Failed to send finalize notification:', err);
      }

      return NextResponse.json({ success: true, result });
    }

    // ── LEGACY FINALIZE: Process all pending slots ──
    // In multi-round mode, only allow single-slot finalization
    if (slot_index !== undefined) {
      await fantasySql`
        UPDATE fantasy_draft_rounds SET status = 'completed', updated_at = NOW()
        WHERE league_id = ${league_id} AND slot_index = ${Number(slot_index)}
      `;
    }

    // Check if any other round is still active — if so, block legacy full finalize
    const activeRounds = await fantasySql`
      SELECT slot_index FROM fantasy_draft_rounds
      WHERE league_id = ${league_id} AND status = 'active' AND slot_index != ${Number(slot_index || 0)}
    `;
    if (activeRounds.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot finalize all slots while other rounds are active. Use per-slot preview/apply instead.' },
        { status: 400 }
      );
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
