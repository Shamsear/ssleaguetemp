import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/draft/all-bids?league_id=xxx
 * Returns all bids for a league grouped by slot, with team info,
 * round status, preview data, and final results.
 * Committee admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(['committee_admin', 'super_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Committee access required' },
        { status: 401 }
      );
    }

    const league_id = request.nextUrl.searchParams.get('league_id');
    if (!league_id) {
      return NextResponse.json({ success: false, error: 'Missing league_id' }, { status: 400 });
    }

    await fantasySql`SET timezone = 'UTC'`;

    // 1. Get league settings and slots
    const leagues = await fantasySql`
      SELECT league_id, budget_per_team, category_settings, draft_status
      FROM fantasy_leagues WHERE league_id = ${league_id} LIMIT 1
    `;
    if (leagues.length === 0) {
      return NextResponse.json({ success: false, error: 'League not found' }, { status: 404 });
    }
    const league = leagues[0];
    const categorySettings = typeof league.category_settings === 'string'
      ? JSON.parse(league.category_settings) : (league.category_settings || {});
    const slots = (categorySettings.slots || []).sort((a: any, b: any) => a.slot_index - b.slot_index);

    // 2. Get all draft rounds
    const rounds = await fantasySql`
      SELECT id, league_id, slot_index, slot_name, opens_at, closes_at, status, finalization_mode, updated_at
      FROM fantasy_draft_rounds
      WHERE league_id = ${league_id}
      ORDER BY slot_index ASC
    `;

    // 3. Get all teams
    const teams = await fantasySql`
      SELECT team_id, team_name, owner_name, budget_remaining, draft_submitted, is_enabled
      FROM fantasy_teams
      WHERE league_id = ${league_id} AND is_enabled = true
      ORDER BY team_name ASC
    `;

    // 4. Get ALL bids for this league
    const allBids = await fantasySql`
      SELECT 
        b.id,
        b.bid_id,
        b.team_id,
        b.slot_index,
        b.priority,
        b.target_id,
        b.bid_type,
        b.bid_amount,
        b.status,
        b.submitted_at,
        b.processed_at
      FROM fantasy_draft_bids b
      WHERE b.league_id = ${league_id}
      ORDER BY b.slot_index ASC, b.bid_amount DESC, b.submitted_at ASC
    `;

    // 5. Get preview data for all slots
    const previews = await fantasySql`
      SELECT slot_index, preview_data, created_at
      FROM fantasy_draft_preview
      WHERE league_id = ${league_id}
      ORDER BY slot_index ASC
    `;

    // 6. Get final squad (awarded players)
    const finalSquad = await fantasySql`
      SELECT 
        fs.team_id,
        fs.real_player_id,
        fs.player_name,
        fs.position,
        fs.real_team_name,
        fs.purchase_price
      FROM fantasy_squad fs
      WHERE fs.league_id = ${league_id}
      ORDER BY fs.purchase_price DESC
    `;

    // Build player-to-slot mapping from category_settings lists
    const slotLists = categorySettings?.lists || {};
    const playerToSlot = new Map<string, number>();
    for (const slot of slots) {
      const playerIds = slotLists[slot.list_id] || [];
      for (const pid of playerIds) {
        if (!playerToSlot.has(pid)) playerToSlot.set(pid, slot.slot_index);
      }
    }

    // 7. Get supported teams (real teams won)
    const supportedTeams = await fantasySql`
      SELECT team_id, supported_team_id, supported_team_name
      FROM fantasy_teams
      WHERE league_id = ${league_id} AND supported_team_id IS NOT NULL
    `;

    // Build lookup maps
    const teamMap = new Map<string, any>();
    teams.forEach((t: any) => teamMap.set(t.team_id, t));

    const teamBids = new Map<string, any[]>();
    allBids.forEach((b: any) => {
      if (!teamBids.has(b.team_id)) teamBids.set(b.team_id, []);
      teamBids.get(b.team_id)!.push(b);
    });

    const slotBids = new Map<number, any[]>();
    allBids.forEach((b: any) => {
      if (!slotBids.has(b.slot_index)) slotBids.set(b.slot_index, []);
      slotBids.get(b.slot_index)!.push(b);
    });

    const previewMap = new Map<number, any>();
    previews.forEach((p: any) => {
      const data = typeof p.preview_data === 'string' ? JSON.parse(p.preview_data) : p.preview_data;
      previewMap.set(p.slot_index, { ...data, created_at: p.created_at });
    });

    const roundMap = new Map<number, any>();
    rounds.forEach((r: any) => roundMap.set(r.slot_index, r));

    const squadByTeam = new Map<string, any[]>();
    finalSquad.forEach((s: any) => {
      if (!squadByTeam.has(s.team_id)) squadByTeam.set(s.team_id, []);
      squadByTeam.get(s.team_id)!.push(s);
    });

    const supportedTeamMap = new Map<string, any>();
    supportedTeams.forEach((st: any) => supportedTeamMap.set(st.team_id, st));

    // 8. Get team logos from main DB
    const teamIds = teams.map((t: any) => t.team_id);
    const teamLogos = new Map<string, string>();
    try {
      // Try to get logos from main DB teams collection
      const { adminDb } = await import('@/lib/neon/admin-db-wrapper');
      for (const tid of teamIds) {
        const doc = await adminDb.collection('teams').doc(tid).get();
        if (doc.exists) {
          const data = doc.data();
          if (data?.logo_url) teamLogos.set(tid, data.logo_url);
        }
      }
    } catch (e) {
      console.log('Could not fetch team logos:', e);
    }

    // 9. Fetch all player names and photo URLs for resolving target_ids
    const allPlayerIds = allBids.filter((b: any) => b.bid_type === 'player').map((b: any) => b.target_id);
    // Also include player IDs from finalSquad so their photos are always resolved
    const squadPlayerIds = finalSquad.map((s: any) => s.real_player_id);
    const uniquePlayerIds = [...new Set([...allPlayerIds, ...squadPlayerIds])];
    const playerNameMap = new Map<string, string>();
    const playerPhotoMap = new Map<string, string>();
    if (uniquePlayerIds.length > 0) {
      const players = await fantasySql`
        SELECT real_player_id, player_name FROM fantasy_players
        WHERE league_id = ${league_id} AND real_player_id = ANY(${uniquePlayerIds})
      `;
      for (const p of players) playerNameMap.set(p.real_player_id, p.player_name);
      // Fetch profile_image from Neon main DB realplayers table
      try {
        const { getMainDb } = await import('@/lib/neon/main-config');
        const mainSql = getMainDb();
        const realPlayers = await mainSql`
          SELECT player_id, profile_image FROM realplayers
          WHERE player_id = ANY(${uniquePlayerIds})
        `;
        for (const rp of realPlayers) {
          if (rp.profile_image) playerPhotoMap.set(rp.player_id, rp.profile_image);
        }
      } catch {}
    }

    // Also fetch team names for real_team bids
    const allTeamIds = allBids.filter((b: any) => b.bid_type === 'real_team').map((b: any) => b.target_id);
    const uniqueTeamIds = [...new Set(allTeamIds)];
    const realTeamNameMap = new Map<string, string>();
    if (uniqueTeamIds.length > 0) {
      try {
        const { adminDb } = await import('@/lib/neon/admin-db-wrapper');
        for (const tid of uniqueTeamIds) {
          const doc = await adminDb.collection('team_seasons').doc(tid).get();
          if (doc.exists) realTeamNameMap.set(tid, doc.data()?.team_name || tid);
        }
      } catch {}
    }

    const resolveTargetName = (targetId: string, bidType: string) => {
      if (bidType === 'player') return playerNameMap.get(targetId) || targetId;
      return realTeamNameMap.get(targetId) || targetId;
    };

    // Build per-slot detailed data
    const slotResults = slots.map((slot: any) => {
      const slotIdx = slot.slot_index;
      const bids = slotBids.get(slotIdx) || [];
      const round = roundMap.get(slotIdx) || null;
      const preview = previewMap.get(slotIdx) || null;

      // Group bids by target
      const bidsByTarget = new Map<string, any[]>();
      bids.forEach((b: any) => {
        if (!bidsByTarget.has(b.target_id)) bidsByTarget.set(b.target_id, []);
        bidsByTarget.get(b.target_id)!.push(b);
      });

      // Build targets with their bids
      const targets = Array.from(bidsByTarget.entries()).map(([targetId, targetBids]) => ({
        target_id: targetId,
        target_name: resolveTargetName(targetId, targetBids[0]?.bid_type || 'player'),
        bid_type: targetBids[0]?.bid_type || 'player',
        total_bids: targetBids.length,
        bids: targetBids.map((b: any) => ({
          bid_id: b.bid_id,
          team_id: b.team_id,
          team_name: teamMap.get(b.team_id)?.team_name || b.team_id,
          owner_name: teamMap.get(b.team_id)?.owner_name || '',
          priority: b.priority,
          bid_amount: Number(b.bid_amount),
          status: b.status,
          submitted_at: b.submitted_at,
        })).sort((a: any, b: any) => b.bid_amount - a.bid_amount),
      }));

      // Winning bids from preview — resolve target names and photos
      const rawWinningBids = preview?.results_by_slot?.[0]?.winning_bids || [];
      const winningBids = rawWinningBids.map((w: any) => ({
        ...w,
        target_name: resolveTargetName(w.target_id, w.bid_type),
        player_photo: w.bid_type === 'player' ? (playerPhotoMap.get(w.target_id) || null) : null,
      }));

      // Build all targets with win/loss status for preview
      const allTargetResults = targets.map((t: any) => {
        const isWinner = winningBids.some((w: any) => w.target_id === t.target_id);
        const winnerBid = winningBids.find((w: any) => w.target_id === t.target_id);
        return {
          target_id: t.target_id,
          target_name: t.target_name,
          bid_type: t.bid_type,
          total_bids: t.total_bids,
          status: isWinner ? 'won' : (t.bids.some((b: any) => b.status === 'lost') ? 'lost' : 'pending'),
          winning_bid: winnerBid || null,
          bids: t.bids,
        };
      });

      // Final awarded for this slot
      const finalAwarded = finalSquad
        .filter((s: any) => playerToSlot.get(s.real_player_id) === slotIdx)
        .map((s: any) => ({
          team_id: s.team_id,
          team_name: teamMap.get(s.team_id)?.team_name || s.team_id,
          team_logo: teamLogos.get(s.team_id) || null,
          player_name: s.player_name,
          player_id: s.real_player_id,
          player_image: playerPhotoMap.get(s.real_player_id) || `/images/players/${s.real_player_id}.webp`,
          position: s.position,
          real_team_name: s.real_team_name,
          purchase_price: Number(s.purchase_price),
        }));

      // Real team for slot 6 (special slot for supported teams)
      const finalTeamAwarded = slotIdx === 6
        ? Array.from(supportedTeamMap.values()).map((st: any) => ({
            team_id: st.team_id,
            team_name: teamMap.get(st.team_id)?.team_name || st.team_id,
            supported_team_id: st.supported_team_id,
            supported_team_name: st.supported_team_name,
          }))
        : [];

      return {
        slot_index: slotIdx,
        slot_name: slot.name,
        base_price: slot.base_price,
        list_id: slot.list_id,
        round: round ? {
          status: round.status,
          opens_at: round.opens_at,
          closes_at: round.closes_at,
          finalization_mode: round.finalization_mode,
        } : null,
        total_bids: bids.length,
        unique_targets: bidsByTarget.size,
        targets,
        preview: preview ? {
          winning_bids: winningBids,
          all_targets: allTargetResults,
          total_players_drafted: preview.total_players_drafted || 0,
          total_teams_drafted: preview.total_teams_drafted || 0,
          total_budget_spent: preview.total_budget_spent || 0,
          created_at: preview.created_at,
        } : null,
        final_awarded: finalAwarded,
        final_team_awarded: finalTeamAwarded,
      };
    });

    // Build per-team summary with budget checker
    // Find non-finalized slots (active/closed with preview, not yet applied)
    const nonFinalizedSlots = slotResults.filter((s: any) =>
      s.round && s.round.status !== 'completed' && s.preview
    );

    const teamSummaries = teams.map((t: any) => {
      const bids = teamBids.get(t.team_id) || [];
      const squad = squadByTeam.get(t.team_id) || [];
      const supportedTeam = supportedTeamMap.get(t.team_id);

      // Budget checker: sum winning bids from non-finalized slot previews
      const pendingCommitments: Array<{
        slot_index: number;
        slot_name: string;
        target_name: string;
        bid_type: string;
        bid_amount: number;
      }> = [];

      for (const ns of nonFinalizedSlots) {
        const winBid = ns.preview?.winning_bids?.find((w: any) => w.team_id === t.team_id);
        if (winBid) {
          pendingCommitments.push({
            slot_index: ns.slot_index,
            slot_name: ns.slot_name,
            target_name: winBid.target_name || winBid.target_id,
            bid_type: winBid.bid_type || 'player',
            bid_amount: Number(winBid.bid_amount),
          });
        }
      }

      const totalPendingSpend = pendingCommitments.reduce((sum, c) => sum + c.bid_amount, 0);
      const budgetRemaining = Number(t.budget_remaining);
      const projectedRemaining = budgetRemaining - totalPendingSpend;

      return {
        team_id: t.team_id,
        team_name: t.team_name,
        owner_name: t.owner_name,
        budget_remaining: budgetRemaining,
        draft_submitted: !!t.draft_submitted,
        total_bids: bids.length,
        won_bids: bids.filter((b: any) => b.status === 'won').length,
        lost_bids: bids.filter((b: any) => b.status === 'lost').length,
        squad_size: squad.length,
        budget_spent: Number(league.budget_per_team) - budgetRemaining,
        budget_check: {
          total_pending_spend: totalPendingSpend,
          projected_remaining: projectedRemaining,
          is_overdrawn: projectedRemaining < 0,
          commitments: pendingCommitments,
        },
        supported_team: supportedTeam ? {
          id: supportedTeam.supported_team_id,
          name: supportedTeam.supported_team_name,
        } : null,
        bids: bids.map((b: any) => ({
          slot_index: b.slot_index,
          priority: b.priority,
          target_id: b.target_id,
          bid_type: b.bid_type,
          bid_amount: Number(b.bid_amount),
          status: b.status,
          submitted_at: b.submitted_at,
        })).sort((a: any, b: any) => a.slot_index - b.slot_index || a.priority - b.priority),
      };
    });

    return NextResponse.json({
      success: true,
      league: {
        league_id: league.league_id,
        budget_per_team: Number(league.budget_per_team),
        draft_status: league.draft_status,
      },
      slots: slotResults,
      teams: teamSummaries,
      totals: {
        total_bids: allBids.length,
        total_teams: teams.length,
        total_players_awarded: finalSquad.length,
        total_budget_spent: finalSquad.reduce((sum: number, s: any) => sum + Number(s.purchase_price), 0),
      },
    });
  } catch (error) {
    console.error('Error fetching all bids:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bids', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
