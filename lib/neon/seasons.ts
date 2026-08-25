/**
 * Neon Database Operations - Seasons
 * 
 * Drop-in replacements for Firebase season reads.
 * These functions query Neon instead of Firestore.
 */

import { getMainDb } from './main-config';

export interface NeonSeason {
  id: string;
  name: string | null;
  year: string | null;
  season_number: number | null;
  type: string | null;
  is_active: boolean;
  status: string | null;
  registration_open: boolean;
  start_date: string | null;
  end_date: string | null;
  total_teams: number;
  total_rounds: number;
  purse_amount: number;
  max_players_per_team: number;
  dollar_budget: number | null;
  euro_budget: number | null;
  required_real_players: number | null;
  max_football_players: number | null;
  category_fine_amount: number | null;
  raw_data: any;
  created_at: string;
  updated_at: string;
}

/**
 * Get active season from Neon
 * Replaces: getActiveSeason() from lib/firebase/seasons.ts
 */
export async function neonGetActiveSeason(): Promise<NeonSeason | null> {
  const sql = getMainDb();
  const result = await sql`
    SELECT * FROM seasons 
    WHERE is_active = true 
    LIMIT 1
  `;
  
  if (result.length === 0) return null;
  return mapSeasonRow(result[0]);
}

/**
 * Get season by ID from Neon
 * Replaces: getSeasonById() from lib/firebase/seasons.ts
 */
export async function neonGetSeasonById(seasonId: string): Promise<NeonSeason | null> {
  const sql = getMainDb();
  const result = await sql`
    SELECT * FROM seasons 
    WHERE id = ${seasonId} 
    LIMIT 1
  `;
  
  if (result.length === 0) return null;
  return mapSeasonRow(result[0]);
}

/**
 * Get all seasons from Neon
 * Replaces: getAllSeasons() from lib/firebase/seasons.ts
 */
export async function neonGetAllSeasons(): Promise<NeonSeason[]> {
  const sql = getMainDb();
  const result = await sql`
    SELECT * FROM seasons 
    ORDER BY created_at DESC
  `;
  
  return result.map(mapSeasonRow);
}

/**
 * Upsert season to Neon (for write sync)
 * Called after Firebase writes to keep Neon in sync
 */
export async function neonUpsertSeason(seasonId: string, data: any): Promise<void> {
  const sql = getMainDb();
  
  await sql`
    INSERT INTO seasons (
      id, name, year, season_number, type, is_active, status,
      registration_open, start_date, end_date, total_teams, total_rounds,
      purse_amount, max_players_per_team, dollar_budget, euro_budget,
      required_real_players, max_football_players, category_fine_amount,
      raw_data, created_at, updated_at
    ) VALUES (
      ${seasonId},
      ${data.name || null},
      ${data.year || null},
      ${data.season_number || null},
      ${data.type || 'single'},
      ${data.isActive || false},
      ${data.status || 'draft'},
      ${data.registrationOpen || false},
      ${data.startDate || null},
      ${data.endDate || null},
      ${data.totalTeams || 0},
      ${data.totalRounds || 0},
      ${data.purseAmount || 0},
      ${data.maxPlayersPerTeam || 11},
      ${data.dollar_budget || null},
      ${data.euro_budget || null},
      ${data.required_real_players || null},
      ${data.max_football_players || null},
      ${data.category_fine_amount || null},
      ${JSON.stringify(data)},
      ${data.created_at || data.createdAt || new Date().toISOString()},
      ${data.updated_at || data.updatedAt || new Date().toISOString()}
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      year = EXCLUDED.year,
      season_number = EXCLUDED.season_number,
      type = EXCLUDED.type,
      is_active = EXCLUDED.is_active,
      status = EXCLUDED.status,
      registration_open = EXCLUDED.registration_open,
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      total_teams = EXCLUDED.total_teams,
      total_rounds = EXCLUDED.total_rounds,
      purse_amount = EXCLUDED.purse_amount,
      max_players_per_team = EXCLUDED.max_players_per_team,
      dollar_budget = EXCLUDED.dollar_budget,
      euro_budget = EXCLUDED.euro_budget,
      required_real_players = EXCLUDED.required_real_players,
      max_football_players = EXCLUDED.max_football_players,
      category_fine_amount = EXCLUDED.category_fine_amount,
      raw_data = EXCLUDED.raw_data,
      updated_at = NOW()
  `;
}

/**
 * Map a raw database row to NeonSeason format
 */
function mapSeasonRow(row: any): NeonSeason {
  // The name fallback logic matches lib/firebase/seasons.ts
  const seasonNumber = row.season_number;
  const generatedName = row.name || (seasonNumber ? `Season ${seasonNumber}` : row.year || 'Unnamed Season');
  const generatedYear = row.year || (seasonNumber ? `${seasonNumber}` : 'N/A');
  
  return {
    id: row.id,
    name: generatedName,
    year: generatedYear,
    season_number: seasonNumber,
    type: row.type,
    is_active: row.is_active,
    status: row.status,
    registration_open: row.registration_open,
    start_date: row.start_date,
    end_date: row.end_date,
    total_teams: row.total_teams,
    total_rounds: row.total_rounds,
    purse_amount: row.purse_amount,
    max_players_per_team: row.max_players_per_team,
    dollar_budget: row.dollar_budget,
    euro_budget: row.euro_budget,
    required_real_players: row.required_real_players,
    max_football_players: row.max_football_players,
    category_fine_amount: row.category_fine_amount,
    raw_data: row.raw_data,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
