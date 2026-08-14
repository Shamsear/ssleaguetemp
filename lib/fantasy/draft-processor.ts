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
  const skippedBids = allBids.filter(bid => bid.is_skip);
  const activeBids = allBids.filter(bid => !bid.is_skip);

  result.skipped = skippedBids.length;
  console.log(`  📊 Total bids: ${allBids.length} (${activeBids.length} active, ${skippedBids.length} skipped)`);

  // 3. Mark skipped bids
  for (const bid of skippedBids) {
    await updateBidStatus(bid.bid_id, 'skipped');
  }

  // 4. Filter valid bids (can afford + player not already awarded)
  const validBids = activeBids.filter(bid => {
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
  teams.forEach(team => {
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
      players: squad.map(p => ({
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

    const slots = categorySettings.slots.sort((a: any, b: any) => a.slot_index - b.slot_index);
    console.log(`📊 Found ${slots.length} configured slots to process`);

    // 2. Fetch participating teams and initialize balances/rosters
    const teams = await fantasySql`
      SELECT team_id, team_name, budget_remaining
      FROM fantasy_teams
      WHERE league_id = ${leagueId} AND is_enabled = true
    `;

    if (teams.length === 0) {
      throw new Error('No active teams in this fantasy league');
    }

    const teamBudgets = new Map<string, number>();
    const teamNames = new Map<string, string>();
    const teamFilledSlots = new Map<string, Set<number>>(); // team_id -> set of slot_indices filled

    // Reset teams to clean slate (budget, draft status)
    for (const t of teams) {
      teamBudgets.set(t.team_id, budgetPerTeam);
      teamNames.set(t.team_id, t.team_name);
      teamFilledSlots.set(t.team_id, new Set<number>());
    }

    // 3. Reset existing draft state in database for clean finalization
    await fantasySql.begin(async sql => {
      // Clear squad draft entries
      await sql`
        DELETE FROM fantasy_squad 
        WHERE league_id = ${leagueId} AND acquisition_type = 'draft'
      `;
      // Reset players to undrafted/available
      await sql`
        UPDATE fantasy_players 
        SET drafted_by_team_id = NULL, current_price = NULL, is_available = true 
        WHERE league_id = ${leagueId}
      `;
      // Reset team budgets and supported team links
      await sql`
        UPDATE fantasy_teams 
        SET budget_remaining = ${budgetPerTeam}, 
            supported_team_id = NULL, 
            supported_team_name = NULL,
            draft_submitted = true
        WHERE league_id = ${leagueId}
      `;
    });

    // 4. Fetch all bids submitted
    const allBids = await fantasySql`
      SELECT id, bid_id, team_id, slot_index, priority, target_id, bid_type, bid_amount, submitted_at
      FROM fantasy_draft_bids
      WHERE league_id = ${leagueId}
      ORDER BY slot_index ASC, bid_amount DESC, submitted_at ASC
    `;

    console.log(`📥 Loaded ${allBids.length} total bids from database`);

    // Keep track of which players and real teams are already won (exclusive ownership)
    const awardedTargets = new Set<string>(); // target_id (player_id or real_team_id)

    // Store the winning bids to write to database
    const winningBidsList: any[] = [];
    const lostBidsList: string[] = []; // bid_ids that lost

    // 5. Process slot-by-slot
    for (const slot of slots) {
      const slotIdx = slot.slot_index;
      console.log(`\n🔄 Processing Slot ${slotIdx}: ${slot.name} (Base Price: ${slot.base_price})`);

      // Filter bids for this specific slot
      const slotBids = allBids.filter((b: any) => b.slot_index === slotIdx);

      // Group bids by target_id
      const bidsByTarget = new Map<string, any[]>();
      slotBids.forEach((bid: any) => {
        if (!bidsByTarget.has(bid.target_id)) {
          bidsByTarget.set(bid.target_id, []);
        }
        bidsByTarget.get(bid.target_id)!.push(bid);
      });

      const slotWinners: any[] = [];
      let skippedCount = 0;
      let failedCount = 0;

      // Evaluate bids for each target_id (player or real team) in this slot
      for (const [targetId, targetBids] of bidsByTarget.entries()) {
        // Skip if this player/team has already been won in a previous slot (exclusive ownership)
        if (awardedTargets.has(targetId)) {
          targetBids.forEach((b: any) => lostBidsList.push(b.bid_id));
          continue;
        }

        // Sort bids for this target by bid_amount DESC, then submitted_at ASC (timestamp tiebreaker)
        const sortedBids = [...targetBids].sort((a: any, b: any) => {
          if (Number(b.bid_amount) !== Number(a.bid_amount)) {
            return Number(b.bid_amount) - Number(a.bid_amount);
          }
          return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
        });

        // Find the highest valid bid
        let wonBid = null;
        for (const bid of sortedBids) {
          const teamId = bid.team_id;
          const bidAmt = Number(bid.bid_amount);

          // Check if team has already filled this slot
          if (teamFilledSlots.get(teamId)!.has(slotIdx)) {
            skippedCount++;
            continue;
          }

          // Check budget
          const currentBudget = teamBudgets.get(teamId)!;
          if (currentBudget < bidAmt) {
            failedCount++;
            continue;
          }

          // Winner found!
          wonBid = bid;
          break;
        }

        if (wonBid) {
          const teamId = wonBid.team_id;
          const bidAmt = Number(wonBid.bid_amount);

          // Deduct from budget
          const currentBudget = teamBudgets.get(teamId)!;
          teamBudgets.set(teamId, currentBudget - bidAmt);

          // Mark slot filled
          teamFilledSlots.get(teamId)!.add(slotIdx);

          // Exclude target from future assignments
          awardedTargets.add(targetId);

          // Add to winning list
          winningBidsList.push(wonBid);
          slotWinners.push({
            team_id: teamId,
            team_name: teamNames.get(teamId) || teamId,
            target_id: targetId,
            bid_type: wonBid.bid_type,
            bid_amount: bidAmt
          });

          if (wonBid.bid_type === 'player') {
            totalPlayersDrafted++;
          } else {
            totalTeamsDrafted++;
          }
          totalBudgetSpent += bidAmt;

          // All other bids for this target in this slot are lost
          sortedBids.forEach((b: any) => {
            if (b.bid_id !== wonBid.bid_id) {
              lostBidsList.push(b.bid_id);
            }
          });
        } else {
          // If no bid won this target, all bids on it lost
          sortedBids.forEach((b: any) => lostBidsList.push(b.bid_id));
        }
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

      console.log(`✅ Slot ${slotIdx} complete: ${slotWinners.length} winners, ${skippedCount} skipped, ${failedCount} failed`);
    }

    // 6. Write final assignments to the database inside a transaction
    const { v4: uuidv4 } = require('uuid');
    
    await fantasySql.begin(async sql => {
      // 6.1 Update team budgets and support teams in PostgreSQL
      for (const [teamId, budget] of teamBudgets.entries()) {
        const winningTeamBid = winningBidsList.find(b => b.team_id === teamId && b.bid_type === 'real_team');
        
        let supportedTeamId = null;
        let supportedTeamName = null;

        if (winningTeamBid) {
          // Fetch real team name
          const realTeams = await sql`
            SELECT team_name FROM teams WHERE team_uid = ${winningTeamBid.target_id} LIMIT 1
          `;
          supportedTeamId = winningTeamBid.target_id;
          supportedTeamName = realTeams[0]?.team_name || winningTeamBid.target_id;
        }

        await sql`
          UPDATE fantasy_teams
          SET budget_remaining = ${budget},
              supported_team_id = ${supportedTeamId},
              supported_team_name = ${supportedTeamName},
              updated_at = CURRENT_TIMESTAMP
          WHERE team_id = ${teamId} AND league_id = ${leagueId}
        `;
      }

      // 6.2 Write winning player roster entries to fantasy_squad and fantasy_players
      for (const bid of winningBidsList) {
        if (bid.bid_type === 'player') {
          // Get player details
          const players = await sql`
            SELECT player_name, position, real_team_name 
            FROM fantasy_players
            WHERE real_player_id = ${bid.target_id} AND league_id = ${leagueId}
            LIMIT 1
          `;
          
          if (players.length > 0) {
            const p = players[0];
            const squadId = `sq_${uuidv4().replace(/-/g, '')}`;

            // Insert into squad
            await sql`
              INSERT INTO fantasy_squad (
                squad_id, team_id, league_id, real_player_id, player_name, 
                position, real_team_name, purchase_price, current_value, 
                total_points, is_captain, is_vice_captain, acquisition_type, acquired_at
              ) VALUES (
                ${squadId}, ${bid.team_id}, ${leagueId}, ${bid.target_id}, ${p.player_name},
                ${p.position}, ${p.real_team_name}, ${bid.bid_amount}, ${bid.bid_amount},
                0, false, false, 'draft', CURRENT_TIMESTAMP
              )
            `;

            // Update player's owner
            await sql`
              UPDATE fantasy_players
              SET drafted_by_team_id = ${bid.team_id},
                  current_price = ${bid.bid_amount},
                  is_available = false
              WHERE real_player_id = ${bid.target_id} AND league_id = ${leagueId}
            `;
          }
        }
      }

      // 6.3 Update bid statuses in fantasy_draft_bids
      if (winningBidsList.length > 0) {
        const winningBidIds = winningBidsList.map(b => b.bid_id);
        await sql`
          UPDATE fantasy_draft_bids
          SET status = 'won', processed_at = CURRENT_TIMESTAMP
          WHERE bid_id = ANY(${winningBidIds})
        `;
      }

      if (lostBidsList.length > 0) {
        await sql`
          UPDATE fantasy_draft_bids
          SET status = 'lost', processed_at = CURRENT_TIMESTAMP
          WHERE bid_id = ANY(${lostBidsList})
        `;
      }

      // 6.4 Mark league draft status as completed
      await sql`
        UPDATE fantasy_leagues
        SET draft_status = 'completed',
            updated_at = CURRENT_TIMESTAMP
        WHERE league_id = ${leagueId}
      `;
    });

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
