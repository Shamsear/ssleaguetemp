/**
 * Team Season Utilities
 * 
 * Backward-compatible utilities for handling team_seasons data.
 * Supports both legacy formats and new formats without breaking existing data.
 * 
 * Strategy: Read from old OR new fields, always write to new fields
 */

export interface TeamBudgets {
  football: number;
  footballSpent: number;
  real: number;
  realSpent: number;
  system: 'dual' | 'single';
}

export interface TeamSlots {
  base: number;
  purchased: number;
  total: number;
}

/**
 * Get team budgets (backward compatible)
 * 
 * Handles:
 * - New dual currency (football_budget, real_player_budget)
 * - Old single currency (balance)
 * - Missing data (returns defaults)
 * 
 * @example
 * const budgets = getTeamBudgets(teamSeason);
 * console.log(budgets.football); // Works regardless of data format
 */
export function getTeamBudgets(teamSeason: any): TeamBudgets {
  // Prefer new dual currency fields (check for either football_budget OR real_player_budget)
  if (teamSeason.football_budget !== undefined || teamSeason.real_player_budget !== undefined) {
    return {
      football: teamSeason.football_budget || 0,
      footballSpent: teamSeason.football_spent || 0,
      real: teamSeason.real_player_budget || 0,
      realSpent: teamSeason.real_player_spent || 0,
      system: 'dual'
    };
  }
  
  // Fallback to old single currency (for legacy data)
  if (teamSeason.balance !== undefined) {
    return {
      football: teamSeason.balance,
      footballSpent: teamSeason.total_spent || 0,
      real: 0, // No real player budget in old system
      realSpent: 0,
      system: 'single'
    };
  }
  
  // Default values if nothing exists
  return {
    football: 10000,
    footballSpent: 0,
    real: 1000,
    realSpent: 0,
    system: 'dual'
  };
}

/**
 * Get team slot information (backward compatible)
 * 
 * @example
 * const slots = getTeamSlots(teamSeason);
 * console.log(`${slots.total} slots available`);
 */
export function getTeamSlots(teamSeason: any): TeamSlots {
  const base = teamSeason.football_base_slots || 25;
  const purchased = teamSeason.football_purchased_slots || 0;
  const total = teamSeason.football_total_slots || base;
  
  return { base, purchased, total };
}

/**
 * Check if team is registered for a season (ignores legacy contract logic)
 * 
 * Old system checked: is_auto_registered, contract fields
 * New system: Simple status check only
 * 
 * @example
 * if (isTeamRegisteredForSeason(teamSeason, 'SSPSLS16')) {
 *   // Team is registered
 * }
 */
export function isTeamRegisteredForSeason(teamSeason: any, seasonId: string): boolean {
  return teamSeason.season_id === seasonId && 
         teamSeason.status === 'registered';
  // Note: We ignore is_auto_registered and contract fields
  // They may exist in old data but don't affect registration status
}

/**
 * Get starting budget for new season registration (ignores penalties)
 * 
 * Old system: Applied penalties from skipped seasons
 * New system: Always use default budgets
 * 
 * @example
 * const budget = getStartingBudget(season);
 * // { football: 10000, real: 1000 }
 */
export function getStartingBudget(seasonConfig: any): {
  football: number;
  real: number;
} {
  return {
    football: seasonConfig.default_football_budget || seasonConfig.purseAmount || 10000,
    real: seasonConfig.default_real_player_budget || 1000
  };
  // Note: Old code would check skipped_seasons and subtract penalty_amount
  // We don't do that anymore - every team starts with full budget
}

/**
 * Calculate available budget for purchases
 * 
 * @example
 * const available = getAvailableBudget(teamSeason);
 * // { football: 8500, real: 800 }
 */
export function getAvailableBudget(teamSeason: any): {
  football: number;
  real: number;
} {
  const budgets = getTeamBudgets(teamSeason);
  
  return {
    football: Math.max(0, budgets.football - budgets.footballSpent),
    real: Math.max(0, budgets.real - budgets.realSpent)
  };
}

/**
 * Check if team can afford a purchase
 * 
 * @example
 * if (canAfford(teamSeason, 500, 'football')) {
 *   // Place bid
 * }
 */
export function canAfford(
  teamSeason: any, 
  amount: number, 
  currency: 'football' | 'real'
): boolean {
  const available = getAvailableBudget(teamSeason);
  return currency === 'football' 
    ? available.football >= amount
    : available.real >= amount;
}

/**
 * Check if team has slots available
 * 
 * @example
 * if (hasSlotAvailable(teamSeason, currentPlayerCount)) {
 *   // Can add player
 * }
 */
export function hasSlotAvailable(teamSeason: any, currentPlayerCount: number): boolean {
  const slots = getTeamSlots(teamSeason);
  return currentPlayerCount < slots.total;
}

/**
 * Format budget for display
 * 
 * @example
 * formatBudget(10000, 'football') // "€10,000"
 * formatBudget(1000, 'real')      // "$1,000"
 */
export function formatBudget(amount: number, currency: 'football' | 'real'): string {
  const symbol = currency === 'football' ? '€' : '$';
  return `${symbol}${amount.toLocaleString()}`;
}

/**
 * Get budget display info for UI
 * 
 * @example
 * const display = getBudgetDisplay(teamSeason);
 * // {
 * //   football: { total: 10000, spent: 1500, available: 8500, formatted: "€8,500" },
 * //   real: { total: 1000, spent: 200, available: 800, formatted: "$800" }
 * // }
 */
export function getBudgetDisplay(teamSeason: any) {
  const budgets = getTeamBudgets(teamSeason);
  const available = getAvailableBudget(teamSeason);
  
  return {
    football: {
      total: budgets.football,
      spent: budgets.footballSpent,
      available: available.football,
      formatted: formatBudget(available.football, 'football')
    },
    real: {
      total: budgets.real,
      spent: budgets.realSpent,
      available: available.real,
      formatted: formatBudget(available.real, 'real')
    }
  };
}

/**
 * Prepare data for creating new team_seasons document
 * (Always uses new format, never writes legacy fields)
 * 
 * @example
 * const data = prepareTeamSeasonData({
 *   teamId: 'SSPSLT0001',
 *   seasonId: 'SSPSLS16',
 *   footballBudget: 10000,
 *   realPlayerBudget: 1000
 * });
 */
export function prepareTeamSeasonData(params: {
  teamId: string;
  teamName: string;
  seasonId: string;
  seasonName: string;
  userId: string;
  username: string;
  footballBudget: number;
  realPlayerBudget: number;
  baseSlots?: number;
}) {
  const {
    teamId,
    teamName,
    seasonId,
    seasonName,
    userId,
    username,
    footballBudget,
    realPlayerBudget,
    baseSlots = 25
  } = params;
  
  return {
    // IDs
    team_id: teamId,
    team_name: teamName,
    season_id: seasonId,
    season_name: seasonName,
    user_id: userId,
    username,
    
    // Status
    status: 'registered',
    registered_at: new Date(),
    
    // Dual currency (new format only)
    currency_system: 'dual',
    football_budget: footballBudget,
    football_spent: 0,
    real_player_budget: realPlayerBudget,
    real_player_spent: 0,
    
    // Slots
    football_base_slots: baseSlots,
    football_purchased_slots: 0,
    football_total_slots: baseSlots,
    
    // Player counts
    players_count: 0,
    
    // Transfers
    transfer_count: 0,
    
    // Timestamps
    created_at: new Date(),
    updated_at: new Date(),
    
    // NOTE: We don't write these legacy fields:
    // - balance, total_spent (old single currency)
    // - contract_id, contract_start_season, contract_end_season (multi-season)
    // - is_auto_registered (auto registration)
    // - skipped_seasons, penalty_amount, last_played_season (penalties)
  };
}

/**
 * Prepare update data for team_seasons (only new fields)
 * 
 * @example
 * const updates = prepareTeamSeasonUpdate({
 *   footballBudget: 8500,
 *   footballSpent: 1500
 * });
 */
export function prepareTeamSeasonUpdate(params: {
  footballBudget?: number;
  footballSpent?: number;
  realPlayerBudget?: number;
  realPlayerSpent?: number;
  playersCount?: number;
  transferCount?: number;
  purchasedSlots?: number;
  baseSlots?: number;
}) {
  const updates: any = {
    updated_at: new Date()
  };
  
  if (params.footballBudget !== undefined) {
    updates.football_budget = params.footballBudget;
  }
  if (params.footballSpent !== undefined) {
    updates.football_spent = params.footballSpent;
  }
  if (params.realPlayerBudget !== undefined) {
    updates.real_player_budget = params.realPlayerBudget;
  }
  if (params.realPlayerSpent !== undefined) {
    updates.real_player_spent = params.realPlayerSpent;
  }
  if (params.playersCount !== undefined) {
    updates.players_count = params.playersCount;
  }
  if (params.transferCount !== undefined) {
    updates.transfer_count = params.transferCount;
  }
  if (params.purchasedSlots !== undefined) {
    updates.football_purchased_slots = params.purchasedSlots;
    const base = params.baseSlots !== undefined ? params.baseSlots : 25;
    updates.football_total_slots = base + params.purchasedSlots;
  }
  
  return updates;
}
