/**
 * Draft Processing Engine
 * 
 * Processes tiered draft bids tier-by-tier:
 * 1. Process each tier sequentially (tier 1, then tier 2, etc.)
 * 2. For each tier, sort bids by amount (highest first)
 * 3. Assign players to the highest bidders
 * 4. Handle ties using timestamp as tiebreaker
 * 5. Deduct winning bid amounts from team budgets
 * 6. Mark players as unavailable after assignment
 * 7. Update all bid statuses (won/lost/skipped)
 */

import { fantasySql } from '@/lib/neon/fantasy-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

async function getTeamNameFromFirestore(teamUid: string): Promise<string> {
  try {
    const doc = await adminDb.collection('team_seasons').doc(teamUid).get();
    return doc.exists ? (doc.data()?.team_name || teamUid) : teamUid;
  } catch (error) {
    console.error(`Error fetching team name for ${teamUid} from Firestore:`, error);
    return teamUid;
  }
}

export interface TierBid {
  bid_id: string;
  tier_id: string;
  tier_number: number;
  league_id: string;
  team_id: string;
  team_name: string;
  player_id: string;
  player_name: string;
  bid_amount: number;
  is_skip: boolean;
  submitted_at: Date;
  current_budget: number;
}

export interface TierProcessingResult {
  tier_number: number;
  tier_name: string;
  total_bids: number;
  valid_bids: number;
  winners: number;
  skipped: number;
  failed: number;
  winning_bids: Array<{
    team_id: string;
    team_name: string;
    player_id: string;
    player_name: string;
    bid_amount: number;
  }>;
}

export interface DraftProcessingResult {
  success: boolean;
  league_id: string;
  results_by_tier: TierProcessingResult[];
  total_players_drafted: number;
  total_budget_spent: number;
  average_squad_size: number;
  processing_time_ms: number;
  errors?: string[];
}

/**
 * Main function to process tier bids for a league
 * @param leagueId - The league ID
 * @param tierNumber - Optional specific tier to process. If not provided, processes all tiers
 */
export async function processDraftTiers(leagueId: string, tierNumber?: number): Promise<DraftProcessingResult> {
  const startTime = Date.now();
  console.log(`🎯 Starting tier-by-tier draft processing for league: ${leagueId}`);
  if (tierNumber) {
    console.log(`   Processing only Tier ${tierNumber}`);
  }
  
  const errors: string[] = [];
  const resultsByTier: TierProcessingResult[] = [];
  let totalPlayersDrafted = 0;
  let totalBudgetSpent = 0;

  try {
    // 1. Get tiers for this league (all or specific tier)
    let tiers;
    if (tierNumber) {
      tiers = await fantasySql<Array<{
        tier_id: string;
        tier_number: number;
        tier_name: string;
      }>>`
        SELECT tier_id, tier_number, tier_name
        FROM fantasy_draft_tiers
        WHERE league_id = ${leagueId}
          AND draft_type = 'initial'
          AND tier_number = ${tierNumber}
        ORDER BY tier_number ASC
      `;
    } else {
      tiers = await fantasySql<Array<{
        tier_id: string;
        tier_number: number;
        tier_name: string;
      }>>`
        SELECT tier_id, tier_number, tier_name
        FROM fantasy_draft_tiers
        WHERE league_id = ${leagueId}
          AND draft_type = 'initial'
        ORDER BY tier_number ASC
      `;
    }

    if (tiers.length === 0) {
      throw new Error(tierNumber 
        ? `Tier ${tierNumber} not found for this league`
        : 'No tiers found for this league'
      );
    }

    console.log(`📊 Found ${tiers.length} tier(s) to process`);

    // 2. Track team budgets throughout processing
    const teamBudgets = await initializeTeamBudgets(leagueId);
    const teamSquads = new Map<string, Set<string>>();
    const awardedPlayers = new Set<string>();

    // Initialize empty squads
    for (const teamId of teamBudgets.keys()) {
      teamSquads.set(teamId, new Set());
    }

    // 3. Process each tier sequentially
    for (const tier of tiers) {
      console.log(`\n🔄 Processing Tier ${tier.tier_number}: ${tier.tier_name}`);
      
      const tierResult = await processSingleTier(
        tier.tier_id,
        tier.tier_number,
        tier.tier_name,
        leagueId,
        teamBudgets,
        teamSquads,
        awardedPlayers
      );

      resultsByTier.push(tierResult);
      totalPlayersDrafted += tierResult.winners;
      
      // Calculate budget spent in this tier
      const tierBudgetSpent = tierResult.winning_bids.reduce(
        (sum, bid) => sum + bid.bid_amount,
        0
      );
      totalBudgetSpent += tierBudgetSpent;

      console.log(`✅ Tier ${tier.tier_number} complete: ${tierResult.winners} players awarded`);
    }

    // 4. Save final results to database
    await saveFinalResults(leagueId, teamBudgets, teamSquads);

    // 5. Calculate statistics
    const averageSquadSize = calculateAverageSquadSize(teamSquads);
    const processingTime = Date.now() - startTime;

    console.log(`\n🎉 Draft processing complete!`);
    console.log(`   Total players drafted: ${totalPlayersDrafted}`);
    console.log(`   Total budget spent: €${totalBudgetSpent}M`);
    console.log(`   Average squad size: ${averageSquadSize.toFixed(1)}`);
    console.log(`   Processing time: ${processingTime}ms`);

    return {
      success: true,
      league_id: leagueId,
      results_by_tier: resultsByTier,
      total_players_drafted: totalPlayersDrafted,
      total_budget_spent: totalBudgetSpent,
      average_squad_size: averageSquadSize,
      processing_time_ms: processingTime,
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (error) {
    console.error('❌ Error processing draft:', error);
    const processingTime = Date.now() - startTime;
    
    return {
      success: false,
      league_id: leagueId,
      results_by_tier: resultsByTier,
      total_players_drafted: totalPlayersDrafted,
      total_budget_spent: totalBudgetSpent,
      average_squad_size: 0,
      processing_time_ms: processingTime,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

/**
 * Process a single tier
 */
async function processSingleTier(
  tierId: string,
  tierNumber: number,
  tierName: string,
  leagueId: string,
  teamBudgets: Map<string, number>,
  teamSquads: Map<string, Set<string>>,
  awardedPlayers: Set<string>
): Promise<TierProcessingResult> {
  // 1. Get all bids for this tier
  const allBids = await fantasySql<TierBid[]>`
    SELECT 
      tb.bid_id,
      tb.tier_id,
      dt.tier_number,
      tb.league_id,
      tb.team_id,
      ft.team_name,
      tb.player_id,
      fp.player_name,
      tb.bid_amount,
      tb.is_skip,
      tb.submitted_at,
      ft.budget_remaining as current_budget
    FROM fantasy_tier_bids tb
    JOIN fantasy_teams ft ON tb.team_id = ft.team_id
    JOIN fantasy_players fp ON tb.player_id = fp.real_player_id AND fp.league_id = tb.league_id
    JOIN fantasy_draft_tiers dt ON tb.tier_id = dt.tier_id
    WHERE tb.tier_id = ${tierId}
      AND tb.status = 'pending'
    ORDER BY tb.bid_amount DESC, tb.submitted_at ASC
  `;

  const result: TierProcessingResult = {
    tier_number: tierNumber,
    tier_name: tierName,
    total_bids: allBids.length,
    valid_bids: 0,
    winners: 0,
    skipped: 0,
    failed: 0,
    winning_bids: []
  };

  if (allBids.length === 0) {
    console.log(`  ⚠️  No bids found for this tier`);
    return result;
  }

  // 2. Separate skipped bids
  const skippedBids = allBids.filter((bid: any) => bid.is_skip);
  const activeBids = allBids.filter((bid: any) => !bid.is_skip);

  result.skipped = skippedBids.length;
  console.log(`  📊 Total bids: ${allBids.length} (${activeBids.length} active, ${skippedBids.length} skipped)`);

  // 3. Mark skipped bids
  for (const bid of skippedBids) {
    await updateBidStatus((bid as any).bid_id, 'skipped');
  }

  // 4. Filter valid bids (can afford + player not already awarded)
  const validBids = activeBids.filter((bid: any) => {
    const budget = teamBudgets.get(bid.team_id) || 0;
    const canAfford = budget >= bid.bid_amount;
    const playerAvailable = !awardedPlayers.has(bid.player_id);
    
    return canAfford && playerAvailable;
  });

  result.valid_bids = validBids.length;
  result.failed = activeBids.length - validBids.length;

  if (validBids.length === 0) {
    console.log(`  ❌ No valid bids (all teams can't afford or players already taken)`);
    
    // Mark all active bids as lost
    for (const bid of activeBids) {
      await updateBidStatus(bid.bid_id, 'lost');
    }
    
    return result;
  }

  // 5. Sort bids by amount (highest first), then by timestamp (earliest first) for ties
  const sortedBids = sortBidsByAmountAndTime(validBids);

  // 6. Assign players to highest bidders
  const processedPlayers = new Set<string>();

  for (const bid of sortedBids) {
    // Skip if player already assigned in this tier
    if (processedPlayers.has(bid.player_id)) {
      await updateBidStatus(bid.bid_id, 'lost');
      continue;
    }

    // Skip if player already awarded in previous tier
    if (awardedPlayers.has(bid.player_id)) {
      await updateBidStatus(bid.bid_id, 'lost');
      continue;
    }

    // Check budget again (might have changed from previous wins in this tier)
    const currentBudget = teamBudgets.get(bid.team_id) || 0;
    if (currentBudget < bid.bid_amount) {
      await updateBidStatus(bid.bid_id, 'lost');
      result.failed++;
      continue;
    }

    // Award player to this team
    await awardPlayerToTeam(
      leagueId,
      bid.team_id,
      bid.player_id,
      bid.bid_amount,
      tierNumber
    );

    // Update tracking
    awardedPlayers.add(bid.player_id);
    processedPlayers.add(bid.player_id);
    teamSquads.get(bid.team_id)?.add(bid.player_id);
    
    // Deduct budget
    const newBudget = currentBudget - bid.bid_amount;
    teamBudgets.set(bid.team_id, newBudget);

    // Mark bid as won
    await updateBidStatus(bid.bid_id, 'won');

    // Add to results
    result.winning_bids.push({
      team_id: bid.team_id,
      team_name: bid.team_name,
      player_id: bid.player_id,
      player_name: bid.player_name,
      bid_amount: bid.bid_amount
    });

    result.winners++;

    console.log(`  ✅ ${bid.player_name} → ${bid.team_name} (€${bid.bid_amount}M, budget remaining: €${newBudget}M)`);
  }

  // 7. Mark remaining bids as lost
  for (const bid of sortedBids) {
    if (!processedPlayers.has(bid.player_id)) {
      await updateBidStatus(bid.bid_id, 'lost');
    }
  }

  return result;
}

/**
 * Sort bids by amount (highest first), then by timestamp (earliest first)
 */
function sortBidsByAmountAndTime(bids: TierBid[]): TierBid[] {
  return [...bids].sort((a, b) => {
    // Primary: bid amount (highest first)
    if (b.bid_amount !== a.bid_amount) {
      return b.bid_amount - a.bid_amount;
    }
    
    // Secondary: timestamp (earliest first) - tiebreaker
    const timeA = new Date(a.submitted_at).getTime();
    const timeB = new Date(b.submitted_at).getTime();
    return timeA - timeB;
  });
}

/**
 * Initialize team budgets from database
 */
async function initializeTeamBudgets(leagueId: string): Promise<Map<string, number>> {
  const teams = await fantasySql<Array<{
    team_id: string;
    budget_remaining: number;
  }>>`
    SELECT team_id, budget_remaining
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
  `;

  const budgets = new Map<string, number>();
  teams.forEach((team: any) => {
    budgets.set(team.team_id, team.budget_remaining);
  });

  console.log(`💰 Initialized budgets for ${teams.length} teams`);
  return budgets;
}

/**
 * Award player to team
 */
async function awardPlayerToTeam(
  leagueId: string,
  teamId: string,
  playerId: string,
  bidAmount: number,
  tierNumber: number
): Promise<void> {
  // 1. Get player details
  const players = await fantasySql<Array<{
    player_name: string;
    position: string;
    real_team_name: string;
  }>>`
    SELECT player_name, position, real_team_name
    FROM fantasy_players
    WHERE league_id = ${leagueId} AND real_player_id = ${playerId}
    LIMIT 1
  `;

  if (players.length === 0) {
    throw new Error(`Player ${playerId} not found`);
  }

  const player = players[0];

  // 2. Add to fantasy_squad
  const squadId = `squad_${teamId}_${playerId}_${Date.now()}`;
  
  await fantasySql`
    INSERT INTO fantasy_squad (
      squad_id, team_id, league_id, real_player_id,
      player_name, position, real_team_name,
      purchase_price, current_value, acquisition_method, acquisition_tier
    ) VALUES (
      ${squadId}, ${teamId}, ${leagueId}, ${playerId},
      ${player.player_name}, ${player.position}, ${player.real_team_name},
      ${bidAmount}, ${bidAmount}, 'tier_draft', ${tierNumber}
    )
    ON CONFLICT (team_id, real_player_id) DO NOTHING
  `;

  // 3. Mark player as unavailable
  await fantasySql`
    UPDATE fantasy_players
    SET 
      owned_by_team_id = ${teamId},
      is_available = FALSE
    WHERE league_id = ${leagueId} AND real_player_id = ${playerId}
  `;
}

/**
 * Update bid status
 */
async function updateBidStatus(
  bidId: string,
  status: 'won' | 'lost' | 'skipped'
): Promise<void> {
  await fantasySql`
    UPDATE fantasy_tier_bids
    SET 
      status = ${status},
      processed_at = NOW()
    WHERE bid_id = ${bidId}
  `;
}

/**
 * Save final results to database
 */
async function saveFinalResults(
  leagueId: string,
  teamBudgets: Map<string, number>,
  teamSquads: Map<string, Set<string>>
): Promise<void> {
  console.log('\n💾 Saving final results...');

  for (const [teamId, budget] of teamBudgets.entries()) {
    const squadSize = teamSquads.get(teamId)?.size || 0;
    
    // Get initial budget to calculate spent
    const initialBudgetResult = await fantasySql<Array<{ initial_budget: number }>>`
      SELECT initial_budget FROM fantasy_teams WHERE team_id = ${teamId}
    `;
    
    const initialBudget = initialBudgetResult[0]?.initial_budget || 100;
    const budgetSpent = initialBudget - budget;

    await fantasySql`
      UPDATE fantasy_teams
      SET 
        budget_remaining = ${budget},
        budget_spent = ${budgetSpent},
        squad_size = ${squadSize},
        draft_completed = TRUE,
        updated_at = NOW()
      WHERE team_id = ${teamId}
    `;
  }

  console.log('✅ Final results saved');
}

/**
 * Calculate average squad size
 */
function calculateAverageSquadSize(teamSquads: Map<string, Set<string>>): number {
  if (teamSquads.size === 0) return 0;
  
  const totalPlayers = Array.from(teamSquads.values()).reduce(
    (sum, squad) => sum + squad.size,
    0
  );
  
  return totalPlayers / teamSquads.size;
}

/**
 * Generate draft results report
 */
export async function generateDraftReport(leagueId: string): Promise<{
  league_id: string;
  total_teams: number;
  total_players_drafted: number;
  total_budget_spent: number;
  average_squad_size: number;
  average_budget_spent: number;
  teams: Array<{
    team_id: string;
    team_name: string;
    squad_size: number;
    budget_spent: number;
    budget_remaining: number;
    players: Array<{
      player_name: string;
      position: string;
      purchase_price: number;
      tier: number;
    }>;
  }>;
}> {
  console.log(`📊 Generating draft report for league: ${leagueId}`);

  // Get all teams
  const teams = await fantasySql<Array<{
    team_id: string;
    team_name: string;
    squad_size: number;
    budget_spent: number;
    budget_remaining: number;
  }>>`
    SELECT 
      team_id, team_name, squad_size,
      budget_spent, budget_remaining
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
    ORDER BY squad_size DESC, budget_spent DESC
  `;

  const report = {
    league_id: leagueId,
    total_teams: teams.length,
    total_players_drafted: 0,
    total_budget_spent: 0,
    average_squad_size: 0,
    average_budget_spent: 0,
    teams: [] as any[]
  };

  // Get squad details for each team
  for (const team of teams) {
    const squad = await fantasySql<Array<{
      player_name: string;
      position: string;
      purchase_price: number;
      acquisition_tier: number;
    }>>`
      SELECT 
        player_name, position, purchase_price,
        acquisition_tier
      FROM fantasy_squad
      WHERE team_id = ${team.team_id}
        AND league_id = ${leagueId}
      ORDER BY acquisition_tier ASC, purchase_price DESC
    `;

    report.teams.push({
      team_id: team.team_id,
      team_name: team.team_name,
      squad_size: team.squad_size,
      budget_spent: team.budget_spent,
      budget_remaining: team.budget_remaining,
      players: squad.map((p: any) => ({
        player_name: p.player_name,
        position: p.position,
        purchase_price: p.purchase_price,
        tier: p.acquisition_tier
      }))
    });

    report.total_players_drafted += team.squad_size;
    report.total_budget_spent += team.budget_spent;
  }

  report.average_squad_size = report.total_players_drafted / teams.length;
  report.average_budget_spent = report.total_budget_spent / teams.length;

  return report;
}

// ====================================================
// NEW SLOT BIDDING DRAFT PROCESSOR
// ====================================================

export interface SlotProcessingResult {
  slot_index: number;
  slot_name: string;
  total_bids: number;
  winners: number;
  skipped: number;
  failed: number;
  winning_bids: Array<{
    team_id: string;
    team_name: string;
    target_id: string;
    target_name: string;
    bid_type: string;
    bid_amount: number;
  }>;
}

export interface SlotDraftProcessingResult {
  success: boolean;
  league_id: string;
  results_by_slot: SlotProcessingResult[];
  total_players_drafted: number;
  total_teams_drafted: number;
  total_budget_spent: number;
  average_squad_size: number;
  processing_time_ms: number;
  errors?: string[];
}

export async function processSlotBids(leagueId: string): Promise<SlotDraftProcessingResult> {
  const startTime = Date.now();
  console.log(`🎯 Starting slot-based blind bid draft processing for league: ${leagueId}`);
  
  const errors: string[] = [];
  const resultsBySlot: SlotProcessingResult[] = [];
  let totalPlayersDrafted = 0;
  let totalTeamsDrafted = 0;
  let totalBudgetSpent = 0;

  try {
    // 1. Get league settings
    const leagues = await fantasySql`
      SELECT category_settings, budget_per_team 
      FROM fantasy_leagues 
      WHERE league_id = ${leagueId}
      LIMIT 1
    `;

    if (leagues.length === 0) {
      throw new Error(`Fantasy league ${leagueId} not found`);
    }

    const league = leagues[0];
    const budgetPerTeam = Number(league.budget_per_team || 500);
    const categorySettings = typeof league.category_settings === 'string'
      ? JSON.parse(league.category_settings)
      : league.category_settings;

    if (!categorySettings || !Array.isArray(categorySettings.slots)) {
      throw new Error(`No slot configurations found in league settings`);
    }

    const activeSlotIdx = Number(categorySettings.active_slot_index) || null;
    const slots = categorySettings.slots.sort((a: any, b: any) => a.slot_index - b.slot_index);
    const slotsToProcess = activeSlotIdx ? slots.filter((s: any) => s.slot_index === activeSlotIdx) : slots;
    
    console.log(`📊 Found ${slots.length} configured slots. Active slot: ${activeSlotIdx || 'ALL'}. Slots to process: ${slotsToProcess.length}`);

    // 2. Fetch participating teams
    const teams = await fantasySql`
      SELECT team_id, team_name, budget_remaining
      FROM fantasy_teams
      WHERE league_id = ${leagueId} AND is_enabled = true
    `;

    if (teams.length === 0) {
      throw new Error('No active teams in this fantasy league');
    }

    // 3. Fetch existing squad entries
    const existingSquad = await fantasySql`
      SELECT team_id, real_player_id, purchase_price
      FROM fantasy_squad
      WHERE league_id = ${leagueId} AND acquisition_type = 'draft'
    `;

    // Map players to slot index
    const playerToSlotMap = new Map<string, number>();
    const slotLists = categorySettings.lists || {};
    slots.forEach((s: any) => {
      const list = slotLists[s.list_id] || [];
      list.forEach((pId: string) => {
        playerToSlotMap.set(pId, s.slot_index);
      });
    });

    const teamBudgets = new Map<string, number>();
    const teamNames = new Map<string, string>();
    const teamFilledSlots = new Map<string, Set<number>>();
    const refundedBudgets = new Map<string, number>();

    for (const t of teams) {
      // If we are doing slot-by-slot, use their current budget; otherwise use budgetPerTeam
      teamBudgets.set(t.team_id, activeSlotIdx ? Number(t.budget_remaining) : budgetPerTeam);
      teamNames.set(t.team_id, t.team_name);
      teamFilledSlots.set(t.team_id, new Set<number>());
      refundedBudgets.set(t.team_id, 0);
    }

    const playersToDelete: string[] = [];
    
    // Process existing squad entries to build teamFilledSlots and calculate refunds
    for (const item of existingSquad) {
      const pId = item.real_player_id;
      const tId = item.team_id;
      const price = Number(item.purchase_price) || 0;
      const slotIndex = playerToSlotMap.get(pId);

      if (slotIndex) {
        if (activeSlotIdx && slotIndex === activeSlotIdx) {
          // Refund budget for the re-drafted slot
          teamBudgets.set(tId, teamBudgets.get(tId)! + price);
          refundedBudgets.set(tId, refundedBudgets.get(tId)! + price);
          playersToDelete.push(pId);
        } else {
          teamFilledSlots.get(tId)!.add(slotIndex);
        }
      }
    }

    // Process previous real team bids for Slot 6 refunds
    const previousTeamBids = await fantasySql`
      SELECT team_id, target_id, bid_amount
      FROM fantasy_draft_bids
      WHERE league_id = ${leagueId} AND bid_type = 'real_team' AND status = 'won'
    `;
    for (const item of previousTeamBids) {
      const tId = item.team_id;
      const price = Number(item.bid_amount) || 0;
      if (activeSlotIdx && activeSlotIdx === 6) {
        teamBudgets.set(tId, teamBudgets.get(tId)! + price);
        refundedBudgets.set(tId, refundedBudgets.get(tId)! + price);
      } else {
        teamFilledSlots.get(tId)!.add(6);
      }
    }

    // 4. Perform database resets for active slot inside transaction
    const resetQueries: any[] = [];
    if (activeSlotIdx) {
      // Delete squad players for this active slot
      if (playersToDelete.length > 0) {
        resetQueries.push(fantasySql`
          DELETE FROM fantasy_squad 
          WHERE league_id = ${leagueId} AND real_player_id = ANY(${playersToDelete})
        `);
        resetQueries.push(fantasySql`
          UPDATE fantasy_players 
          SET drafted_by_team_id = NULL, current_price = NULL, is_available = true 
          WHERE league_id = ${leagueId} AND real_player_id = ANY(${playersToDelete})
        `);
      }

      // If active slot is real team (Slot 6), clear links
      if (activeSlotIdx === 6) {
        resetQueries.push(fantasySql`
          UPDATE fantasy_teams
          SET supported_team_id = NULL, supported_team_name = NULL
          WHERE league_id = ${leagueId}
        `);
      }

      // Refund budgets in DB
      for (const [tId, refund] of refundedBudgets.entries()) {
        if (refund > 0) {
          resetQueries.push(fantasySql`
            UPDATE fantasy_teams
            SET budget_remaining = budget_remaining + ${refund}
            WHERE team_id = ${tId} AND league_id = ${leagueId}
          `);
        }
      }
    } else {
      // legacy batch clear: delete everything
      resetQueries.push(fantasySql`
        DELETE FROM fantasy_squad 
        WHERE league_id = ${leagueId} AND acquisition_type = 'draft'
      `);
      resetQueries.push(fantasySql`
        UPDATE fantasy_players 
        SET drafted_by_team_id = NULL, current_price = NULL, is_available = true 
        WHERE league_id = ${leagueId}
      `);
      resetQueries.push(fantasySql`
        UPDATE fantasy_teams 
        SET budget_remaining = ${budgetPerTeam}, 
            supported_team_id = NULL, 
            supported_team_name = NULL,
            draft_submitted = true
        WHERE league_id = ${leagueId}
      `);
    }

    if (resetQueries.length > 0) {
      await fantasySql.transaction(resetQueries);
    }

    // 5. Fetch all bids submitted
    const allBids = await fantasySql`
      SELECT id, bid_id, team_id, slot_index, priority, target_id, bid_type, bid_amount, submitted_at
      FROM fantasy_draft_bids
      WHERE league_id = ${leagueId}
      ORDER BY slot_index ASC, bid_amount DESC, submitted_at ASC
    `;

    console.log(`📥 Loaded ${allBids.length} total bids from database`);

    const awardedTargets = new Set<string>();
    const winningBidsList: any[] = [];
    const lostBidsList: string[] = [];

    // Populate awardedTargets for slots NOT being processed
    if (activeSlotIdx) {
      const activeSlotPlayers = slotLists[slotsToProcess[0]?.list_id] || [];
      const nonActiveAwardedPlayers = await fantasySql`
        SELECT real_player_id
        FROM fantasy_squad
        WHERE league_id = ${leagueId} AND NOT (real_player_id = ANY(${activeSlotPlayers}))
      `;
      nonActiveAwardedPlayers.forEach((p: any) => awardedTargets.add(p.real_player_id));

      if (activeSlotIdx !== 6) {
        const nonActiveAwardedTeams = await fantasySql`
          SELECT supported_team_id
          FROM fantasy_teams
          WHERE league_id = ${leagueId} AND supported_team_id IS NOT NULL
        `;
        nonActiveAwardedTeams.forEach((t: any) => awardedTargets.add(t.supported_team_id));
      }
    }

    // 6. Process slot-by-slot
    for (const slot of slotsToProcess) {
      const slotIdx = slot.slot_index;
      console.log(`\n🔄 Processing Slot ${slotIdx}: ${slot.name} (Base Price: ${slot.base_price})`);

      const slotBids = allBids.filter((b: any) => b.slot_index === slotIdx);

      // Correct algorithm: sort ALL bids highest-to-lowest, allocate greedily.
      // For each bid: if team hasn't won yet AND player isn't taken, award it.
      const allBidsSorted = [...slotBids].sort((a: any, b: any) => {
        if (Number(b.bid_amount) !== Number(a.bid_amount)) {
          return Number(b.bid_amount) - Number(a.bid_amount);
        }
        return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
      });

      const slotWinners: any[] = [];
      const teamsWithWin = new Set<string>();
      let skippedCount = 0;
      let failedCount = 0;

      for (const bid of allBidsSorted) {
        const targetId = bid.target_id;
        const teamId = bid.team_id;
        const bidAmt = Number(bid.bid_amount);

        if (awardedTargets.has(targetId)) {
          lostBidsList.push(bid.bid_id);
          continue;
        }
        if (teamsWithWin.has(teamId)) {
          lostBidsList.push(bid.bid_id);
          skippedCount++;
          continue;
        }
        if ((teamBudgets.get(teamId) || 0) < bidAmt) {
          lostBidsList.push(bid.bid_id);
          failedCount++;
          continue;
        }
        if (teamFilledSlots.get(teamId)?.has(slotIdx)) {
          lostBidsList.push(bid.bid_id);
          skippedCount++;
          continue;
        }

        // This bid wins!
        teamBudgets.set(teamId, teamBudgets.get(teamId)! - bidAmt);
        teamFilledSlots.get(teamId)!.add(slotIdx);
        awardedTargets.add(targetId);
        teamsWithWin.add(teamId);

        winningBidsList.push(bid);
        slotWinners.push({
          team_id: teamId,
          team_name: teamNames.get(teamId) || teamId,
          target_id: targetId,
          target_name: targetId,
          bid_type: bid.bid_type,
          bid_amount: bidAmt
        });

        if (bid.bid_type === 'player') {
          totalPlayersDrafted++;
        } else {
          totalTeamsDrafted++;
        }
        totalBudgetSpent += bidAmt;
      }

      resultsBySlot.push({
        slot_index: slotIdx,
        slot_name: slot.name,
        total_bids: slotBids.length,
        winners: slotWinners.length,
        skipped: skippedCount,
        failed: failedCount,
        winning_bids: slotWinners
      });
    }

    // 7. Write results to database
    const { v4: uuidv4 } = require('uuid');

    // Pre-fetch real team names for winning real_team bids
    const realTeamBids = winningBidsList.filter((b: any) => b.bid_type === 'real_team' && (!activeSlotIdx || activeSlotIdx === 6));
    const realTeamNames = new Map<string, string>();
    for (const bid of realTeamBids) {
      const teamName = await getTeamNameFromFirestore(bid.target_id);
      realTeamNames.set(bid.target_id, teamName);
    }

    // Pre-fetch player details for winning player bids
    const playerBids = winningBidsList.filter((b: any) => b.bid_type === 'player');
    const playerDetailsMap = new Map<string, any>();
    for (const bid of playerBids) {
      const players = await fantasySql`
        SELECT player_name, position, real_team_name 
        FROM fantasy_players
        WHERE real_player_id = ${bid.target_id} AND league_id = ${leagueId}
        LIMIT 1
      `;
      if (players.length > 0) {
        playerDetailsMap.set(bid.target_id, players[0]);
      }
    }

    // Build transaction queries
    const writeQueries: any[] = [];

    // 7.1 Update team budgets and real team links
    for (const [teamId, budget] of teamBudgets.entries()) {
      if (!activeSlotIdx || activeSlotIdx === 6) {
        const winningTeamBid = winningBidsList.find((b: any) => b.team_id === teamId && b.bid_type === 'real_team');
        
        let supportedTeamId = null;
        let supportedTeamName = null;

        if (winningTeamBid) {
          supportedTeamId = winningTeamBid.target_id;
          supportedTeamName = realTeamNames.get(winningTeamBid.target_id) || winningTeamBid.target_id;
        }

        writeQueries.push(fantasySql`
          UPDATE fantasy_teams
          SET budget_remaining = ${budget},
              supported_team_id = ${supportedTeamId},
              supported_team_name = ${supportedTeamName},
              updated_at = CURRENT_TIMESTAMP
          WHERE team_id = ${teamId} AND league_id = ${leagueId}
        `);
      } else {
        writeQueries.push(fantasySql`
          UPDATE fantasy_teams
          SET budget_remaining = ${budget},
              updated_at = CURRENT_TIMESTAMP
          WHERE team_id = ${teamId} AND league_id = ${leagueId}
        `);
      }
    }

    // 7.2 Write winning player roster entries to fantasy_squad and fantasy_players
    for (const bid of playerBids) {
      const p = playerDetailsMap.get(bid.target_id);
      if (p) {
        const squadId = `sq_${uuidv4().replace(/-/g, '')}`;

        // Insert into squad
        writeQueries.push(fantasySql`
          INSERT INTO fantasy_squad (
            squad_id, team_id, league_id, real_player_id, player_name, 
            position, real_team_name, purchase_price, current_value, 
            total_points, is_captain, is_vice_captain, acquisition_type, acquired_at
          ) VALUES (
            ${squadId}, ${bid.team_id}, ${leagueId}, ${bid.target_id}, ${p.player_name},
            ${p.position}, ${p.real_team_name}, ${bid.bid_amount}, ${bid.bid_amount},
            0, false, false, 'draft', CURRENT_TIMESTAMP
          )
        `);

        // Update player's owner
        writeQueries.push(fantasySql`
          UPDATE fantasy_players
          SET drafted_by_team_id = ${bid.team_id},
              current_price = ${bid.bid_amount},
              is_available = false
          WHERE real_player_id = ${bid.target_id} AND league_id = ${leagueId}
        `);
      }
    }

    // 6.3 Update bid statuses in fantasy_draft_bids
    if (winningBidsList.length > 0) {
      const winningBidIds = winningBidsList.map((b: any) => b.bid_id);
      writeQueries.push(fantasySql`
        UPDATE fantasy_draft_bids
        SET status = 'won', processed_at = CURRENT_TIMESTAMP
        WHERE bid_id = ANY(${winningBidIds})
      `);
    }

    if (lostBidsList.length > 0) {
      writeQueries.push(fantasySql`
        UPDATE fantasy_draft_bids
        SET status = 'lost', processed_at = CURRENT_TIMESTAMP
        WHERE bid_id = ANY(${lostBidsList})
      `);
    }

    // 6.4 Mark league draft status as completed
    writeQueries.push(fantasySql`
      UPDATE fantasy_leagues
      SET draft_status = 'completed',
          updated_at = CURRENT_TIMESTAMP
      WHERE league_id = ${leagueId}
    `);

    if (writeQueries.length > 0) {
      await fantasySql.transaction(writeQueries);
    }

    const averageSquadSize = totalPlayersDrafted / teams.length;
    const processingTime = Date.now() - startTime;

    console.log(`\n🎉 Draft processing completed successfully in ${processingTime}ms!`);
    
    return {
      success: true,
      league_id: leagueId,
      results_by_slot: resultsBySlot,
      total_players_drafted: totalPlayersDrafted,
      total_teams_drafted: totalTeamsDrafted,
      total_budget_spent: totalBudgetSpent,
      average_squad_size: averageSquadSize,
      processing_time_ms: processingTime
    };

  } catch (error) {
    console.error('❌ Slot draft processing error:', error);
    return {
      success: false,
      league_id: leagueId,
      results_by_slot: [],
      total_players_drafted: 0,
      total_teams_drafted: 0,
      total_budget_spent: 0,
      average_squad_size: 0,
      processing_time_ms: Date.now() - startTime,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

// ====================================================
// PREVIEW: Calculate results for a single slot without writing to DB
// ====================================================

export async function processSlotBidPreview(
  leagueId: string,
  slotIndex: number
): Promise<SlotDraftProcessingResult> {
  const startTime = Date.now();
  console.log(`🔍 [PREVIEW] Calculating slot ${slotIndex} for league: ${leagueId}`);

  try {
    const leagues = await fantasySql`
      SELECT category_settings, budget_per_team
      FROM fantasy_leagues WHERE league_id = ${leagueId} LIMIT 1
    `;
    if (leagues.length === 0) throw new Error('League not found');

    const league = leagues[0];
    const categorySettings = typeof league.category_settings === 'string'
      ? JSON.parse(league.category_settings) : league.category_settings;
    const slot = categorySettings?.slots?.find((s: any) => s.slot_index === slotIndex);
    if (!slot) throw new Error(`Slot ${slotIndex} not found`);

    const teams = await fantasySql`
      SELECT team_id, team_name, budget_remaining
      FROM fantasy_teams WHERE league_id = ${leagueId} AND is_enabled = true
    `;
    const slotLists = categorySettings?.lists || {};
    const slotPlayerIds = slotLists[slot.list_id] || [];

    const teamBudgets = new Map<string, number>();
    const teamNames = new Map<string, string>();
    const teamFilledSlots = new Map<string, Set<number>>();
    for (const t of teams) {
      teamBudgets.set(t.team_id, Number(t.budget_remaining));
      teamNames.set(t.team_id, t.team_name);
      teamFilledSlots.set(t.team_id, new Set<number>());
    }

    // Build awarded targets from OTHER slots (players/teams already won elsewhere)
    const awardedTargets = new Set<string>();
    // Find players in squad that are NOT in this slot's player list (i.e., won in other slots)
    const otherAwarded = await fantasySql`
      SELECT real_player_id FROM fantasy_squad
      WHERE league_id = ${leagueId} AND NOT (real_player_id = ANY(${slotPlayerIds}))
    `;
    otherAwarded.forEach((p: any) => awardedTargets.add(p.real_player_id));
    // For real teams in other slots
    if (slotIndex !== 6) {
      const otherTeams = await fantasySql`
        SELECT supported_team_id FROM fantasy_teams
        WHERE league_id = ${leagueId} AND supported_team_id IS NOT NULL
      `;
      otherTeams.forEach((t: any) => awardedTargets.add(t.supported_team_id));
    }

    // Mark filled slots from existing squad (except this slot)
    const existingSquad = await fantasySql`
      SELECT team_id, real_player_id, purchase_price FROM fantasy_squad
      WHERE league_id = ${leagueId} AND acquisition_type = 'draft'
    `;
    const playerToSlotMap = new Map<string, number>();
    for (const [listId, playerIds] of Object.entries(slotLists)) {
      const slotConfig = categorySettings.slots.find((s: any) => s.list_id === listId);
      if (slotConfig) (playerIds as string[]).forEach((pId: string) => playerToSlotMap.set(pId, slotConfig.slot_index));
    }
    for (const item of existingSquad) {
      const slotOfPlayer = playerToSlotMap.get(item.real_player_id);
      if (slotOfPlayer && slotOfPlayer !== slotIndex) {
        teamFilledSlots.get(item.team_id)?.add(slotOfPlayer);
      }
    }

    // Fetch bids for this slot only
    const slotBids = await fantasySql`
      SELECT id, bid_id, team_id, slot_index, priority, target_id, bid_type, bid_amount, submitted_at
      FROM fantasy_draft_bids
      WHERE league_id = ${leagueId} AND slot_index = ${slotIndex}
      ORDER BY bid_amount DESC, submitted_at ASC
    `;

    // Correct algorithm: sort ALL bids highest-to-lowest, then allocate greedily.
    // For each bid in order: if the team hasn't won in this slot yet AND the player isn't taken,
    // award it. Remove both team and player from further consideration.
    const allBidsSorted = [...slotBids].sort((a: any, b: any) => {
      if (Number(b.bid_amount) !== Number(a.bid_amount)) return Number(b.bid_amount) - Number(a.bid_amount);
      return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
    });

    const slotWinners: any[] = [];
    const losingBids: string[] = [];
    const teamsWithWin = new Set<string>(); // teams that already won in this slot
    let skippedCount = 0;
    let failedCount = 0;

    // Pre-resolve target names in batch
    const playerTargetIds = allBidsSorted.filter((b: any) => b.bid_type === 'player').map((b: any) => b.target_id);
    const teamTargetIds = allBidsSorted.filter((b: any) => b.bid_type === 'real_team').map((b: any) => b.target_id);
    const targetNameMap = new Map<string, string>();
    if (playerTargetIds.length > 0) {
      const uniquePids = [...new Set(playerTargetIds)];
      const players = await fantasySql`SELECT real_player_id, player_name FROM fantasy_players WHERE league_id = ${leagueId} AND real_player_id = ANY(${uniquePids})`;
      for (const p of players) targetNameMap.set(p.real_player_id, p.player_name);
    }
    if (teamTargetIds.length > 0) {
      const uniqueTids = [...new Set(teamTargetIds)];
      for (const tid of uniqueTids) {
        const teamName = await getTeamNameFromFirestore(tid);
        targetNameMap.set(tid, teamName);
      }
    }

    for (const bid of allBidsSorted) {
      const targetId = bid.target_id;
      const teamId = bid.team_id;
      const bidAmt = Number(bid.bid_amount);

      // Skip if this player/team is already awarded (from another slot or earlier in this slot)
      if (awardedTargets.has(targetId)) {
        losingBids.push(bid.bid_id);
        continue;
      }
      // Skip if this team already won in this slot (one win per team per slot)
      if (teamsWithWin.has(teamId)) {
        losingBids.push(bid.bid_id);
        skippedCount++;
        continue;
      }
      // Skip if team can't afford this bid
      if ((teamBudgets.get(teamId) || 0) < bidAmt) {
        losingBids.push(bid.bid_id);
        failedCount++;
        continue;
      }
      // Skip if team already filled this slot
      if (teamFilledSlots.get(teamId)?.has(slotIndex)) {
        losingBids.push(bid.bid_id);
        skippedCount++;
        continue;
      }

      // This bid wins!
      teamBudgets.set(teamId, teamBudgets.get(teamId)! - bidAmt);
      teamFilledSlots.get(teamId)!.add(slotIndex);
      awardedTargets.add(targetId);
      teamsWithWin.add(teamId);

      slotWinners.push({
        team_id: teamId, team_name: teamNames.get(teamId) || teamId,
        target_id: targetId, target_name: targetNameMap.get(targetId) || targetId,
        bid_type: bid.bid_type, bid_amount: bidAmt
      });
    }

    const teamPreviews = teams.map((t: any) => {
      const spent = Number(t.budget_remaining) - (teamBudgets.get(t.team_id) || 0);
      const playersWon = slotWinners.filter((w: any) => w.team_id === t.team_id && w.bid_type === 'player').length;
      const teamsWon = slotWinners.filter((w: any) => w.team_id === t.team_id && w.bid_type === 'real_team').length;
      return {
        team_id: t.team_id, team_name: t.team_name,
        current_budget: Number(t.budget_remaining),
        projected_budget: teamBudgets.get(t.team_id) || 0,
        budget_spent: spent, players_won: playersWon, teams_won: teamsWon
      };
    });

    const totalPlayers = slotWinners.filter((w: any) => w.bid_type === 'player').length;
    const totalTeams = slotWinners.filter((w: any) => w.bid_type === 'real_team').length;
    const totalSpent = slotWinners.reduce((s: number, w: any) => s + w.bid_amount, 0);

    const result: SlotDraftProcessingResult = {
      success: true, league_id: leagueId,
      results_by_slot: [{
        slot_index: slotIndex, slot_name: slot.name,
        total_bids: slotBids.length, winners: slotWinners.length,
        skipped: skippedCount, failed: failedCount,
        winning_bids: slotWinners
      }],
      total_players_drafted: totalPlayers, total_teams_drafted: totalTeams,
      total_budget_spent: totalSpent,
      average_squad_size: teams.length > 0 ? totalPlayers / teams.length : 0,
      processing_time_ms: Date.now() - startTime
    };

    // Attach extra data for preview storage
    (result as any).losing_bid_ids = losingBids;
    (result as any).team_previews = teamPreviews;
    (result as any).slot_index = slotIndex;
    (result as any).player_bid_ids = slotWinners.filter((w: any) => w.bid_type === 'player').map((w: any) => {
      const original = slotBids.find((b: any) => b.bid_id && b.target_id === w.target_id && b.team_id === w.team_id);
      return { bid_id: original?.bid_id, target_id: w.target_id, team_id: w.team_id };
    });
    (result as any).team_link_bid = slotWinners.find((w: any) => w.bid_type === 'real_team') || null;

    console.log(`✅ [PREVIEW] Slot ${slotIndex}: ${totalPlayers} players, ${totalTeams} teams, ${totalSpent} Cr spent`);
    return result;

  } catch (error) {
    console.error('❌ [PREVIEW] Error:', error);
    return {
      success: false, league_id: leagueId, results_by_slot: [],
      total_players_drafted: 0, total_teams_drafted: 0, total_budget_spent: 0,
      average_squad_size: 0, processing_time_ms: Date.now() - startTime,
      errors: [error instanceof Error ? error.message : 'Unknown']
    };
  }
}

// ====================================================
// APPLY: Commit a saved preview to the database
// ====================================================

export async function applySlotBidResults(
  leagueId: string,
  previewData: any
): Promise<SlotDraftProcessingResult> {
  const startTime = Date.now();
  console.log(`⚡ [APPLY] Applying slot ${previewData.slot_index} results for league: ${leagueId}`);

  try {
    const slotIndex = previewData.slot_index;
    const resultsBySlot = previewData.results_by_slot;
    const losingBidIds: string[] = previewData.losing_bid_ids || [];
    const teamPreviews: any[] = previewData.team_previews || [];
    const playerBids: any[] = previewData.player_bid_ids || [];
    const teamLinkBid = previewData.team_link_bid || null;

    const { v4: uuidv4 } = require('uuid');
    const writeQueries: any[] = [];

    // 1. Update team budgets
    for (const tp of teamPreviews) {
      writeQueries.push(fantasySql`
        UPDATE fantasy_teams SET budget_remaining = ${tp.projected_budget}, updated_at = CURRENT_TIMESTAMP
        WHERE team_id = ${tp.team_id} AND league_id = ${leagueId}
      `);
    }

    // 2. Handle real team link (slot 6)
    if (slotIndex === 6) {
      const realTeamWins = resultsBySlot[0]?.winning_bids?.filter((w: any) => w.bid_type === 'real_team') || [];
      for (const w of realTeamWins) {
        const teamName = await getTeamNameFromFirestore(w.target_id);
        writeQueries.push(fantasySql`
          UPDATE fantasy_teams SET supported_team_id = ${w.target_id},
          supported_team_name = ${teamName}
          WHERE team_id = ${w.team_id} AND league_id = ${leagueId}
        `);
      }
    }

    // 3. Add winning players to squad
    for (const pb of playerBids) {
      if (!pb.target_id || !pb.team_id) continue;
      const players = await fantasySql`
        SELECT player_name, position, real_team_name FROM fantasy_players
        WHERE real_player_id = ${pb.target_id} AND league_id = ${leagueId} LIMIT 1
      `;
      if (players.length > 0) {
        const p = players[0];
        const bid = resultsBySlot[0]?.winning_bids?.find((w: any) => w.target_id === pb.target_id);
        const squadId = `sq_${uuidv4().replace(/-/g, '')}`;
        writeQueries.push(fantasySql`
          INSERT INTO fantasy_squad (squad_id, team_id, league_id, real_player_id, player_name,
            position, real_team_name, purchase_price, current_value, total_points,
            is_captain, is_vice_captain, acquisition_type, acquired_at)
          VALUES (${squadId}, ${pb.team_id}, ${leagueId}, ${pb.target_id}, ${p.player_name},
            ${p.position}, ${p.real_team_name}, ${bid?.bid_amount || 0}, ${bid?.bid_amount || 0},
            0, false, false, 'draft', CURRENT_TIMESTAMP)
        `);
        writeQueries.push(fantasySql`
          UPDATE fantasy_players SET drafted_by_team_id = ${pb.team_id},
          current_price = ${bid?.bid_amount || 0}, is_available = false
          WHERE real_player_id = ${pb.target_id} AND league_id = ${leagueId}
        `);
      }
    }

    // 4. Mark bid statuses
    // Mark losing bids
    if (losingBidIds.length > 0) {
      writeQueries.push(fantasySql`
        UPDATE fantasy_draft_bids SET status = 'lost', processed_at = CURRENT_TIMESTAMP
        WHERE bid_id = ANY(${losingBidIds})
      `);
    }

    // Mark winning bids by target_id (highest bid per target = winner)
    const winningTargets = resultsBySlot[0]?.winning_bids?.map((w: any) => w.target_id) || [];
    if (winningTargets.length > 0) {
      writeQueries.push(fantasySql`
        UPDATE fantasy_draft_bids SET status = 'won', processed_at = CURRENT_TIMESTAMP
        WHERE league_id = ${leagueId} AND slot_index = ${slotIndex}
          AND target_id = ANY(${winningTargets}) AND status = 'pending'
      `);
    }

    if (writeQueries.length > 0) {
      await fantasySql.transaction(writeQueries);
    }

    // Delete the preview after successful apply
    await fantasySql`DELETE FROM fantasy_draft_preview WHERE league_id = ${leagueId} AND slot_index = ${slotIndex}`;

    const totalPlayers = resultsBySlot[0]?.winning_bids?.filter((w: any) => w.bid_type === 'player').length || 0;
    const totalTeams = resultsBySlot[0]?.winning_bids?.filter((w: any) => w.bid_type === 'real_team').length || 0;

    console.log(`✅ [APPLY] Slot ${slotIndex} finalized: ${totalPlayers} players, ${totalTeams} teams`);
    return {
      success: true, league_id: leagueId, results_by_slot: resultsBySlot,
      total_players_drafted: totalPlayers, total_teams_drafted: totalTeams,
      total_budget_spent: previewData.total_budget_spent || 0,
      average_squad_size: previewData.average_squad_size || 0,
      processing_time_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error('❌ [APPLY] Error:', error);
    return {
      success: false, league_id: leagueId, results_by_slot: [],
      total_players_drafted: 0, total_teams_drafted: 0, total_budget_spent: 0,
      average_squad_size: 0, processing_time_ms: Date.now() - startTime,
      errors: [error instanceof Error ? error.message : 'Unknown']
    };
  }
}
