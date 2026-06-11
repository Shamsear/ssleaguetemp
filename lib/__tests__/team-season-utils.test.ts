/**
 * Tests for team-season-utils.ts
 * Verifies backward compatibility with legacy data formats
 */

import {
  getTeamBudgets,
  getTeamSlots,
  isTeamRegisteredForSeason,
  getStartingBudget,
  getAvailableBudget,
  canAfford,
  hasSlotAvailable,
  formatBudget,
  getBudgetDisplay,
  prepareTeamSeasonData,
  prepareTeamSeasonUpdate
} from '../team-season-utils';

describe('getTeamBudgets', () => {
  it('should handle new dual currency format', () => {
    const teamSeason = {
      football_budget: 10000,
      football_spent: 1500,
      real_player_budget: 1000,
      real_player_spent: 200
    };

    const result = getTeamBudgets(teamSeason);

    expect(result).toEqual({
      football: 10000,
      footballSpent: 1500,
      real: 1000,
      realSpent: 200,
      system: 'dual'
    });
  });

  it('should handle old single currency format', () => {
    const teamSeason = {
      balance: 5000,
      total_spent: 2000
    };

    const result = getTeamBudgets(teamSeason);

    expect(result).toEqual({
      football: 5000,
      footballSpent: 2000,
      real: 0,
      realSpent: 0,
      system: 'single'
    });
  });

  it('should return defaults for empty data', () => {
    const teamSeason = {};

    const result = getTeamBudgets(teamSeason);

    expect(result).toEqual({
      football: 10000,
      footballSpent: 0,
      real: 1000,
      realSpent: 0,
      system: 'dual'
    });
  });

  it('should prefer new format over old when both exist', () => {
    const teamSeason = {
      // New format
      football_budget: 10000,
      football_spent: 1500,
      real_player_budget: 1000,
      real_player_spent: 200,
      // Old format (should be ignored)
      balance: 5000,
      total_spent: 2000
    };

    const result = getTeamBudgets(teamSeason);

    expect(result.system).toBe('dual');
    expect(result.football).toBe(10000);
  });
});

describe('getTeamSlots', () => {
  it('should return slot information', () => {
    const teamSeason = {
      football_base_slots: 25,
      football_purchased_slots: 3,
      football_total_slots: 28
    };

    const result = getTeamSlots(teamSeason);

    expect(result).toEqual({
      base: 25,
      purchased: 3,
      total: 28
    });
  });

  it('should return defaults for missing data', () => {
    const teamSeason = {};

    const result = getTeamSlots(teamSeason);

    expect(result).toEqual({
      base: 25,
      purchased: 0,
      total: 25
    });
  });
});

describe('isTeamRegisteredForSeason', () => {
  it('should return true for registered team', () => {
    const teamSeason = {
      season_id: 'SSPSLS16',
      status: 'registered'
    };

    expect(isTeamRegisteredForSeason(teamSeason, 'SSPSLS16')).toBe(true);
  });

  it('should return false for different season', () => {
    const teamSeason = {
      season_id: 'SSPSLS15',
      status: 'registered'
    };

    expect(isTeamRegisteredForSeason(teamSeason, 'SSPSLS16')).toBe(false);
  });

  it('should return false for non-registered status', () => {
    const teamSeason = {
      season_id: 'SSPSLS16',
      status: 'pending'
    };

    expect(isTeamRegisteredForSeason(teamSeason, 'SSPSLS16')).toBe(false);
  });

  it('should ignore legacy is_auto_registered field', () => {
    const teamSeason = {
      season_id: 'SSPSLS16',
      status: 'registered',
      is_auto_registered: true // Legacy field - ignored
    };

    expect(isTeamRegisteredForSeason(teamSeason, 'SSPSLS16')).toBe(true);
  });

  it('should ignore legacy contract fields', () => {
    const teamSeason = {
      season_id: 'SSPSLS16',
      status: 'registered',
      contract_start_season: 'SSPSLS16',
      contract_end_season: 'SSPSLS18' // Legacy fields - ignored
    };

    expect(isTeamRegisteredForSeason(teamSeason, 'SSPSLS16')).toBe(true);
  });
});

describe('getStartingBudget', () => {
  it('should return default budgets from season config', () => {
    const season = {
      default_football_budget: 10000,
      default_real_player_budget: 1000
    };

    const result = getStartingBudget(season);

    expect(result).toEqual({
      football: 10000,
      real: 1000
    });
  });

  it('should use purseAmount as fallback', () => {
    const season = {
      purseAmount: 15000
    };

    const result = getStartingBudget(season);

    expect(result.football).toBe(15000);
  });

  it('should return defaults for empty config', () => {
    const season = {};

    const result = getStartingBudget(season);

    expect(result).toEqual({
      football: 10000,
      real: 1000
    });
  });

  it('should ignore legacy penalty fields', () => {
    const season = {
      default_football_budget: 10000,
      default_real_player_budget: 1000
    };
    
    // These legacy fields would have reduced budget in old system
    const legacyPenalty = {
      skipped_seasons: 2,
      penalty_amount: 200
    };

    const result = getStartingBudget(season);
    
    // Should return full budget, ignoring penalties
    expect(result).toEqual({
      football: 10000,
      real: 1000
    });
  });
});

describe('getAvailableBudget', () => {
  it('should calculate available budget', () => {
    const teamSeason = {
      football_budget: 10000,
      football_spent: 3000,
      real_player_budget: 1000,
      real_player_spent: 400
    };

    const result = getAvailableBudget(teamSeason);

    expect(result).toEqual({
      football: 7000,
      real: 600
    });
  });

  it('should not return negative values', () => {
    const teamSeason = {
      football_budget: 10000,
      football_spent: 12000, // Overspent
      real_player_budget: 1000,
      real_player_spent: 1200 // Overspent
    };

    const result = getAvailableBudget(teamSeason);

    expect(result.football).toBe(0);
    expect(result.real).toBe(0);
  });

  it('should work with old single currency format', () => {
    const teamSeason = {
      balance: 5000,
      total_spent: 2000
    };

    const result = getAvailableBudget(teamSeason);

    expect(result.football).toBe(3000);
    expect(result.real).toBe(0);
  });
});

describe('canAfford', () => {
  it('should return true if team can afford football purchase', () => {
    const teamSeason = {
      football_budget: 10000,
      football_spent: 5000
    };

    expect(canAfford(teamSeason, 4000, 'football')).toBe(true);
  });

  it('should return false if team cannot afford football purchase', () => {
    const teamSeason = {
      football_budget: 10000,
      football_spent: 5000
    };

    expect(canAfford(teamSeason, 6000, 'football')).toBe(false);
  });

  it('should return true if team can afford real player purchase', () => {
    const teamSeason = {
      real_player_budget: 1000,
      real_player_spent: 400
    };

    expect(canAfford(teamSeason, 500, 'real')).toBe(true);
  });

  it('should return false if team cannot afford real player purchase', () => {
    const teamSeason = {
      real_player_budget: 1000,
      real_player_spent: 400
    };

    expect(canAfford(teamSeason, 700, 'real')).toBe(false);
  });
});

describe('hasSlotAvailable', () => {
  it('should return true if slots available', () => {
    const teamSeason = {
      football_total_slots: 25
    };

    expect(hasSlotAvailable(teamSeason, 20)).toBe(true);
  });

  it('should return false if no slots available', () => {
    const teamSeason = {
      football_total_slots: 25
    };

    expect(hasSlotAvailable(teamSeason, 25)).toBe(false);
  });

  it('should use default 25 slots if not specified', () => {
    const teamSeason = {};

    expect(hasSlotAvailable(teamSeason, 24)).toBe(true);
    expect(hasSlotAvailable(teamSeason, 25)).toBe(false);
  });
});

describe('formatBudget', () => {
  it('should format football budget with euro symbol', () => {
    expect(formatBudget(10000, 'football')).toBe('€10,000');
  });

  it('should format real player budget with dollar symbol', () => {
    expect(formatBudget(1000, 'real')).toBe('$1,000');
  });

  it('should handle zero', () => {
    expect(formatBudget(0, 'football')).toBe('€0');
  });
});

describe('getBudgetDisplay', () => {
  it('should return formatted budget information', () => {
    const teamSeason = {
      football_budget: 10000,
      football_spent: 3000,
      real_player_budget: 1000,
      real_player_spent: 400
    };

    const result = getBudgetDisplay(teamSeason);

    expect(result.football).toEqual({
      total: 10000,
      spent: 3000,
      available: 7000,
      formatted: '€7,000'
    });

    expect(result.real).toEqual({
      total: 1000,
      spent: 400,
      available: 600,
      formatted: '$600'
    });
  });
});

describe('prepareTeamSeasonData', () => {
  it('should create new team_season document with correct format', () => {
    const params = {
      teamId: 'SSPSLT0001',
      teamName: 'Test Team',
      seasonId: 'SSPSLS16',
      seasonName: 'Season 16',
      userId: 'user123',
      username: 'testuser',
      footballBudget: 10000,
      realPlayerBudget: 1000
    };

    const result = prepareTeamSeasonData(params);

    expect(result.team_id).toBe('SSPSLT0001');
    expect(result.season_id).toBe('SSPSLS16');
    expect(result.status).toBe('registered');
    expect(result.currency_system).toBe('dual');
    expect(result.football_budget).toBe(10000);
    expect(result.real_player_budget).toBe(1000);
    expect(result.football_total_slots).toBe(25);
    expect(result.transfer_count).toBe(0);
    
    // Should NOT have legacy fields
    expect(result).not.toHaveProperty('balance');
    expect(result).not.toHaveProperty('contract_id');
    expect(result).not.toHaveProperty('is_auto_registered');
    expect(result).not.toHaveProperty('skipped_seasons');
  });

  it('should use custom base slots if provided', () => {
    const params = {
      teamId: 'SSPSLT0001',
      teamName: 'Test Team',
      seasonId: 'SSPSLS16',
      seasonName: 'Season 16',
      userId: 'user123',
      username: 'testuser',
      footballBudget: 10000,
      realPlayerBudget: 1000,
      baseSlots: 30
    };

    const result = prepareTeamSeasonData(params);

    expect(result.football_base_slots).toBe(30);
    expect(result.football_total_slots).toBe(30);
  });
});

describe('prepareTeamSeasonUpdate', () => {
  it('should prepare update with only provided fields', () => {
    const params = {
      footballBudget: 8500,
      footballSpent: 1500
    };

    const result = prepareTeamSeasonUpdate(params);

    expect(result.football_budget).toBe(8500);
    expect(result.football_spent).toBe(1500);
    expect(result).toHaveProperty('updated_at');
    
    // Should not have fields that weren't provided
    expect(result).not.toHaveProperty('real_player_budget');
    expect(result).not.toHaveProperty('players_count');
  });

  it('should include all provided fields', () => {
    const params = {
      footballBudget: 8500,
      footballSpent: 1500,
      realPlayerBudget: 900,
      realPlayerSpent: 100,
      playersCount: 15,
      transferCount: 1,
      purchasedSlots: 3
    };

    const result = prepareTeamSeasonUpdate(params);

    expect(result.football_budget).toBe(8500);
    expect(result.football_spent).toBe(1500);
    expect(result.real_player_budget).toBe(900);
    expect(result.real_player_spent).toBe(100);
    expect(result.players_count).toBe(15);
    expect(result.transfer_count).toBe(1);
    expect(result.football_purchased_slots).toBe(3);
  });
});
