/**
 * Seasons — Neon is the ONLY source for reads AND writes.
 * Firebase is completely removed for this collection.
 * Auth stays on Firebase (separate concern).
 */

import { Season, CreateSeasonData, SeasonStatus, SeasonType } from '@/types/season';
import { getMainDb } from '../neon/main-config';

// ============================
// READ FUNCTIONS — Neon only
// ============================

// Get active season
export const getActiveSeason = async (): Promise<Season | null> => {
  try {
    const sql = getMainDb();
    const result = await sql`SELECT * FROM seasons WHERE is_active = true LIMIT 1`;
    if (result.length === 0) return null;
    return mapRowToSeason(result[0]);
  } catch (error: any) {
    console.error('Error getting active season from Neon:', error);
    throw new Error(error.message || 'Failed to get active season');
  }
};

// Get season by ID
export const getSeasonById = async (seasonId: string): Promise<Season | null> => {
  try {
    const sql = getMainDb();
    const result = await sql`SELECT * FROM seasons WHERE id = ${seasonId} LIMIT 1`;
    if (result.length === 0) return null;
    return mapRowToSeason(result[0]);
  } catch (error: any) {
    console.error('Error getting season from Neon:', error);
    throw new Error(error.message || 'Failed to get season');
  }
};

// Get all seasons
export const getAllSeasons = async (): Promise<Season[]> => {
  try {
    const sql = getMainDb();
    const result = await sql`SELECT * FROM seasons ORDER BY created_at DESC`;
    return result.map(mapRowToSeason);
  } catch (error: any) {
    console.error('Error getting all seasons from Neon:', error);
    throw new Error(error.message || 'Failed to get all seasons');
  }
};

// ============================
// WRITE FUNCTIONS — Neon only
// ============================

// Create new season
export const createSeason = async (seasonData: CreateSeasonData): Promise<Season> => {
  try {
    let seasonNumber: number | undefined = seasonData.season_number;
    if (!seasonNumber) {
      const match = seasonData.name?.match(/\d+/);
      if (match) seasonNumber = parseInt(match[0]);
    }
    if (seasonNumber !== undefined) {
      if (seasonNumber <= 0) throw new Error('Season number must be positive');
      if (seasonNumber > 99) throw new Error('Season number must be 99 or less');
    }

    const seasonId = seasonNumber
      ? `SSPSLS${seasonNumber.toString().padStart(2, '0')}`
      : `SSPSLS${Date.now().toString(36)}`;

    // Check if season already exists
    const sql = getMainDb();
    const existing = await sql`SELECT id FROM seasons WHERE id = ${seasonId} LIMIT 1`;
    if (existing.length > 0) {
      throw new Error(`Season ${seasonNumber} already exists with ID: ${seasonId}`);
    }

    const seasonType: SeasonType = seasonData.type || 'single';
    const now = new Date().toISOString();

    const newSeason: any = {
      name: seasonData.name,
      year: seasonData.year,
      season_number: seasonNumber,
      type: seasonType,
      is_active: false,
      status: 'draft',
      registration_open: false,
      start_date: seasonData.startDate || null,
      end_date: seasonData.endDate || null,
      total_teams: 0,
      total_rounds: seasonData.totalRounds || 0,
      purse_amount: seasonData.purseAmount || 0,
      max_players_per_team: seasonData.maxPlayersPerTeam || 11,
      created_at: now,
      updated_at: now,
    };

    if (seasonType === 'multi') {
      newSeason.dollar_budget = seasonData.dollar_budget || 1000;
      newSeason.euro_budget = seasonData.euro_budget || 10000;
      newSeason.required_real_players = seasonData.required_real_players || 5;
      newSeason.max_football_players = seasonData.max_football_players || 25;
      newSeason.category_fine_amount = seasonData.category_fine_amount || 20;
    }

    await sql`
      INSERT INTO seasons (
        id, name, year, season_number, type, is_active, status,
        registration_open, start_date, end_date, total_teams, total_rounds,
        purse_amount, max_players_per_team, dollar_budget, euro_budget,
        required_real_players, max_football_players, category_fine_amount,
        raw_data, created_at, updated_at
      ) VALUES (
        ${seasonId}, ${newSeason.name}, ${newSeason.year}, ${newSeason.season_number},
        ${newSeason.type}, ${newSeason.is_active}, ${newSeason.status},
        ${newSeason.registration_open}, ${newSeason.start_date}, ${newSeason.end_date},
        ${newSeason.total_teams}, ${newSeason.total_rounds}, ${newSeason.purse_amount},
        ${newSeason.max_players_per_team}, ${newSeason.dollar_budget || null},
        ${newSeason.euro_budget || null}, ${newSeason.required_real_players || null},
        ${newSeason.max_football_players || null}, ${newSeason.category_fine_amount || null},
        ${JSON.stringify(newSeason)}, ${newSeason.created_at}, ${newSeason.updated_at}
      )
    `;

    const createdSeason = await getSeasonById(seasonId);
    if (!createdSeason) throw new Error('Failed to fetch created season');
    return createdSeason;
  } catch (error: any) {
    console.error('Error creating season:', error);
    throw new Error(error.message || 'Failed to create season');
  }
};

// Update season
export const updateSeason = async (seasonId: string, updates: Partial<Season>): Promise<void> => {
  try {
    const sql = getMainDb();
    const now = new Date().toISOString();

    // Map camelCase to snake_case for Neon columns
    const neonUpdates: Record<string, any> = { updated_at: now };
    if (updates.name !== undefined) neonUpdates.name = updates.name;
    if (updates.year !== undefined) neonUpdates.year = updates.year;
    if (updates.season_number !== undefined) neonUpdates.season_number = updates.season_number;
    if (updates.type !== undefined) neonUpdates.type = updates.type;
    if (updates.isActive !== undefined) neonUpdates.is_active = updates.isActive;
    if (updates.status !== undefined) neonUpdates.status = updates.status;
    if (updates.registrationOpen !== undefined) neonUpdates.registration_open = updates.registrationOpen;
    if (updates.startDate !== undefined) neonUpdates.start_date = updates.startDate;
    if (updates.endDate !== undefined) neonUpdates.end_date = updates.endDate;
    if (updates.totalTeams !== undefined) neonUpdates.total_teams = updates.totalTeams;
    if (updates.totalRounds !== undefined) neonUpdates.total_rounds = updates.totalRounds;
    if (updates.purseAmount !== undefined) neonUpdates.purse_amount = updates.purseAmount;
    if (updates.maxPlayersPerTeam !== undefined) neonUpdates.max_players_per_team = updates.maxPlayersPerTeam;

    // Build dynamic SET clause
    const setClauses: string[] = [];
    const values: any[] = [];
    let i = 1;
    for (const [key, value] of Object.entries(neonUpdates)) {
      setClauses.push(`${key} = $${i}`);
      values.push(value);
      i++;
    }

    if (setClauses.length > 0) {
      await sql.query(
        `UPDATE seasons SET ${setClauses.join(', ')} WHERE id = $${i}`,
        [...values, seasonId]
      );
    }
  } catch (error: any) {
    console.error('Error updating season:', error);
    throw new Error(error.message || 'Failed to update season');
  }
};

// Activate season (deactivates all other seasons)
export const activateSeason = async (seasonId: string): Promise<void> => {
  try {
    const sql = getMainDb();
    const now = new Date().toISOString();

    // Deactivate all seasons
    await sql`UPDATE seasons SET is_active = false, status = 'draft', updated_at = ${now} WHERE is_active = true OR status = 'active'`;

    // Activate selected season
    await sql`UPDATE seasons SET is_active = true, status = 'active', updated_at = ${now} WHERE id = ${seasonId}`;
  } catch (error: any) {
    console.error('Error activating season:', error);
    throw new Error(error.message || 'Failed to activate season');
  }
};

// Complete season
export const completeSeason = async (seasonId: string): Promise<void> => {
  try {
    const sql = getMainDb();
    const now = new Date().toISOString();
    await sql`UPDATE seasons SET status = 'completed', is_active = false, registration_open = false, updated_at = ${now} WHERE id = ${seasonId}`;

    // Auto-award trophies (async, non-blocking)
    try {
      const { awardSeasonTrophies } = await import('../award-season-trophies');
      awardSeasonTrophies(seasonId, 2).then((result) => {
        if (result.success) console.log(`✅ Auto-awarded ${result.trophiesAwarded} trophies`);
      }).catch((err) => console.error('❌ Trophy auto-award failed:', err));
    } catch {}
  } catch (error: any) {
    console.error('Error completing season:', error);
    throw new Error(error.message || 'Failed to complete season');
  }
};

// Delete season
export const deleteSeason = async (seasonId: string): Promise<void> => {
  try {
    const sql = getMainDb();
    await sql`DELETE FROM seasons WHERE id = ${seasonId}`;
  } catch (error: any) {
    console.error('Error deleting season:', error);
    throw new Error(error.message || 'Failed to delete season');
  }
};

// Toggle registration
export const toggleRegistration = async (seasonId: string, registrationOpen: boolean): Promise<void> => {
  try {
    const sql = getMainDb();
    const now = new Date().toISOString();
    await sql`UPDATE seasons SET registration_open = ${registrationOpen}, updated_at = ${now} WHERE id = ${seasonId}`;
  } catch (error: any) {
    console.error('Error toggling registration:', error);
    throw new Error(error.message || 'Failed to toggle registration');
  }
};

// Update season status
export const updateSeasonStatus = async (seasonId: string, status: SeasonStatus): Promise<void> => {
  try {
    const sql = getMainDb();
    const now = new Date().toISOString();
    await sql`UPDATE seasons SET status = ${status}, updated_at = ${now} WHERE id = ${seasonId}`;
  } catch (error: any) {
    console.error('Error updating season status:', error);
    throw new Error(error.message || 'Failed to update season status');
  }
};

// ============================
// Mapping
// ============================

function mapRowToSeason(row: any): Season {
  const sn = row.season_number;
  return {
    id: row.id,
    name: row.name || (sn ? `Season ${sn}` : row.year || 'Unnamed Season'),
    year: row.year || (sn ? `${sn}` : 'N/A'),
    season_number: sn,
    type: row.type,
    isActive: row.is_active,
    status: row.status,
    registrationOpen: row.registration_open,
    startDate: row.start_date ? new Date(row.start_date) : undefined,
    endDate: row.end_date ? new Date(row.end_date) : undefined,
    totalTeams: row.total_teams,
    totalRounds: row.total_rounds,
    purseAmount: row.purse_amount,
    maxPlayersPerTeam: row.max_players_per_team,
    dollar_budget: row.dollar_budget,
    euro_budget: row.euro_budget,
    required_real_players: row.required_real_players,
    max_football_players: row.max_football_players,
    category_fine_amount: row.category_fine_amount,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
  } as Season;
}
