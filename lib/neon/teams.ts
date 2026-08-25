/**
 * Neon Database Operations - Teams
 * 
 * Drop-in replacements for Firebase team reads.
 * These functions query Neon instead of Firestore.
 */

import { getMainDb } from './main-config';

export interface NeonTeam {
  id: string;
  team_id: string;
  team_name: string;
  team_code: string | null;
  owner_uid: string | null;
  owner_name: string | null;
  owner_email: string | null;
  username: string | null;
  balance: number;
  initial_balance: number;
  total_spent: number;
  currency_system: string;
  season_id: string | null;
  is_active: boolean;
  logo_url: string | null;
  team_color: string | null;
  players_count: number;
  stats: any;
  real_players: any[];
  football_players: any[];
  football_budget: number | null;
  football_spent: number;
  real_player_budget: number | null;
  real_player_spent: number;
  raw_data: any;
  created_at: string;
  updated_at: string;
}

/**
 * Get team by ID from Neon
 * Replaces: getTeamById() from lib/firebase/teams.ts
 */
export async function neonGetTeamById(teamId: string): Promise<NeonTeam | null> {
  const sql = getMainDb();
  const result = await sql`
    SELECT * FROM teams WHERE id = ${teamId} LIMIT 1
  `;
  
  if (result.length === 0) return null;
  return mapTeamRow(result[0]);
}

/**
 * Get all teams from Neon
 * Replaces: getAllTeams() from lib/firebase/teams.ts
 * Note: This returns base team data. The Firebase version merges teams + team_seasons.
 * For the merged view, use neonGetAllTeamsWithSeasons().
 */
export async function neonGetAllTeams(): Promise<NeonTeam[]> {
  const sql = getMainDb();
  const result = await sql`
    SELECT * FROM teams ORDER BY team_name ASC
  `;
  
  return result.map(mapTeamRow);
}

/**
 * Get all teams merged with their team_seasons data
 * This replaces the complex getAllTeams() in lib/firebase/teams.ts
 * that queries both 'teams' and 'team_seasons' collections
 */
export async function neonGetAllTeamsWithSeasons(seasonId?: string): Promise<NeonTeam[]> {
  const sql = getMainDb();
  
  let result;
  if (seasonId) {
    result = await sql`
      SELECT 
        t.*,
        ts.id as ts_id,
        ts.budget as ts_budget,
        ts.initial_budget as ts_initial_budget,
        ts.players_count as ts_players_count,
        ts.football_players_count as ts_football_players_count,
        ts.real_players as ts_real_players,
        ts.football_players as ts_football_players,
        ts.stats as ts_stats,
        ts.status as ts_status,
        ts.logo_url as ts_logo_url,
        ts.season_id as ts_season_id,
        ts.joined_at as ts_joined_at,
        ts.username as ts_username,
        ts.team_email as ts_team_email,
        ts.currency_system as ts_currency_system,
        ts.football_budget as ts_football_budget,
        ts.football_spent as ts_football_spent,
        ts.real_player_budget as ts_real_player_budget,
        ts.real_player_spent as ts_real_player_spent,
        ts.dollar_balance as ts_dollar_balance,
        ts.euro_balance as ts_euro_balance
      FROM teams t
      LEFT JOIN team_seasons ts ON t.id = ts.team_id AND ts.season_id = ${seasonId}
      ORDER BY t.team_name ASC
    `;
  } else {
    // Get latest team_season for each team
    result = await sql`
      SELECT 
        t.*,
        ts.id as ts_id,
        ts.budget as ts_budget,
        ts.initial_budget as ts_initial_budget,
        ts.players_count as ts_players_count,
        ts.football_players_count as ts_football_players_count,
        ts.real_players as ts_real_players,
        ts.football_players as ts_football_players,
        ts.stats as ts_stats,
        ts.status as ts_status,
        ts.logo_url as ts_logo_url,
        ts.season_id as ts_season_id,
        ts.joined_at as ts_joined_at,
        ts.username as ts_username,
        ts.team_email as ts_team_email,
        ts.currency_system as ts_currency_system,
        ts.football_budget as ts_football_budget,
        ts.football_spent as ts_football_spent,
        ts.real_player_budget as ts_real_player_budget,
        ts.real_player_spent as ts_real_player_spent,
        ts.dollar_balance as ts_dollar_balance,
        ts.euro_balance as ts_euro_balance
      FROM teams t
      LEFT JOIN team_seasons ts ON t.id = ts.team_id
        AND ts.joined_at = (
          SELECT MAX(ts2.joined_at) 
          FROM team_seasons ts2 
          WHERE ts2.team_id = t.id
        )
      ORDER BY t.team_name ASC
    `;
  }
  
  return result.map((row: any) => mapTeamWithSeasonRow(row));
}

/**
 * Get teams by season from Neon
 * Replaces: getTeamsBySeason() from lib/firebase/teams.ts
 */
export async function neonGetTeamsBySeason(seasonId: string): Promise<NeonTeam[]> {
  const sql = getMainDb();
  const result = await sql`
    SELECT 
      ts.*,
      t.team_name as base_team_name,
      t.team_code as base_team_code,
      t.owner_uid as base_owner_uid,
      t.owner_name as base_owner_name,
      t.owner_email as base_owner_email,
      t.logo_url as base_logo_url,
      t.team_color as base_team_color,
      t.is_active as base_is_active
    FROM team_seasons ts
    LEFT JOIN teams t ON ts.team_id = t.id
    WHERE ts.season_id = ${seasonId}
    ORDER BY ts.joined_at DESC
  `;
  
  return result.map((row: any) => mapTeamSeasonAsTeamRow(row));
}

/**
 * Upsert team to Neon (for write sync)
 */
export async function neonUpsertTeam(teamId: string, data: any): Promise<void> {
  const sql = getMainDb();
  
  await sql`
    INSERT INTO teams (
      id, team_id, team_name, team_code, owner_uid, owner_name,
      owner_email, username, balance, initial_balance, total_spent,
      currency_system, season_id, is_active, logo_url, team_color,
      players_count, stats, real_players, football_players,
      football_budget, football_spent, real_player_budget, real_player_spent,
      raw_data, created_at, updated_at
    ) VALUES (
      ${teamId},
      ${data.team_id || teamId},
      ${data.team_name || 'Unknown Team'},
      ${data.team_code || null},
      ${data.owner_uid || null},
      ${data.owner_name || null},
      ${data.owner_email || null},
      ${data.username || null},
      ${data.balance || 0},
      ${data.initial_balance || 0},
      ${data.total_spent || 0},
      ${data.currency_system || 'single'},
      ${data.season_id || null},
      ${data.is_active !== false},
      ${data.logo_url || data.logo || null},
      ${data.team_color || null},
      ${data.players_count || 0},
      ${JSON.stringify(data.stats || {})},
      ${JSON.stringify(data.real_players || [])},
      ${JSON.stringify(data.football_players || [])},
      ${data.football_budget || null},
      ${data.football_spent || 0},
      ${data.real_player_budget || null},
      ${data.real_player_spent || 0},
      ${JSON.stringify(data)},
      ${data.created_at || new Date().toISOString()},
      ${data.updated_at || new Date().toISOString()}
    )
    ON CONFLICT (id) DO UPDATE SET
      team_name = EXCLUDED.team_name,
      team_code = EXCLUDED.team_code,
      owner_uid = EXCLUDED.owner_uid,
      owner_name = EXCLUDED.owner_name,
      owner_email = EXCLUDED.owner_email,
      username = EXCLUDED.username,
      balance = EXCLUDED.balance,
      initial_balance = EXCLUDED.initial_balance,
      total_spent = EXCLUDED.total_spent,
      currency_system = EXCLUDED.currency_system,
      is_active = EXCLUDED.is_active,
      logo_url = EXCLUDED.logo_url,
      team_color = EXCLUDED.team_color,
      players_count = EXCLUDED.players_count,
      stats = EXCLUDED.stats,
      real_players = EXCLUDED.real_players,
      football_players = EXCLUDED.football_players,
      football_budget = EXCLUDED.football_budget,
      football_spent = EXCLUDED.football_spent,
      real_player_budget = EXCLUDED.real_player_budget,
      real_player_spent = EXCLUDED.real_player_spent,
      raw_data = EXCLUDED.raw_data,
      updated_at = NOW()
  `;
}

/**
 * Upsert team_season to Neon (for write sync)
 */
export async function neonUpsertTeamSeason(docId: string, data: any): Promise<void> {
  const sql = getMainDb();
  
  // Parse team_id and season_id from the document ID (format: teamId_seasonId)
  const parts = docId.split('_');
  const teamId = data.team_id || parts[0];
  const seasonId = data.season_id || parts.slice(1).join('_');
  
  await sql`
    INSERT INTO team_seasons (
      id, team_id, team_name, team_code, season_id, user_id, username,
      team_email, status, budget, initial_budget, football_budget,
      football_spent, real_player_budget, real_player_spent, currency_system,
      players_count, football_players_count, stats, real_players,
      football_players, logo_url, team_color, dollar_balance, euro_balance,
      raw_data, joined_at, created_at, updated_at
    ) VALUES (
      ${docId},
      ${teamId},
      ${data.team_name || null},
      ${data.team_code || null},
      ${seasonId},
      ${data.user_id || null},
      ${data.username || null},
      ${data.team_email || null},
      ${data.status || 'registered'},
      ${data.budget || 0},
      ${data.initial_budget || 0},
      ${data.football_budget || null},
      ${data.football_spent || 0},
      ${data.real_player_budget || null},
      ${data.real_player_spent || 0},
      ${data.currency_system || 'single'},
      ${data.players_count || 0},
      ${data.football_players_count || 0},
      ${JSON.stringify(data.stats || {})},
      ${JSON.stringify(data.real_players || [])},
      ${JSON.stringify(data.football_players || [])},
      ${data.logo_url || null},
      ${data.team_color || null},
      ${data.dollarBalance || null},
      ${data.euroBalance || null},
      ${JSON.stringify(data)},
      ${data.joined_at || new Date().toISOString()},
      ${data.created_at || new Date().toISOString()},
      ${data.updated_at || new Date().toISOString()}
    )
    ON CONFLICT (id) DO UPDATE SET
      team_name = EXCLUDED.team_name,
      team_code = EXCLUDED.team_code,
      status = EXCLUDED.status,
      budget = EXCLUDED.budget,
      initial_budget = EXCLUDED.initial_budget,
      football_budget = EXCLUDED.football_budget,
      football_spent = EXCLUDED.football_spent,
      real_player_budget = EXCLUDED.real_player_budget,
      real_player_spent = EXCLUDED.real_player_spent,
      currency_system = EXCLUDED.currency_system,
      players_count = EXCLUDED.players_count,
      football_players_count = EXCLUDED.football_players_count,
      stats = EXCLUDED.stats,
      real_players = EXCLUDED.real_players,
      football_players = EXCLUDED.football_players,
      logo_url = EXCLUDED.logo_url,
      team_color = EXCLUDED.team_color,
      dollar_balance = EXCLUDED.dollar_balance,
      euro_balance = EXCLUDED.euro_balance,
      raw_data = EXCLUDED.raw_data,
      updated_at = NOW()
  `;
}

// ---- Mapping functions ----

function mapTeamRow(row: any): NeonTeam {
  return {
    id: row.id,
    team_id: row.team_id || row.id,
    team_name: row.team_name || 'Unknown Team',
    team_code: row.team_code,
    owner_uid: row.owner_uid,
    owner_name: row.owner_name,
    owner_email: row.owner_email,
    username: row.username,
    balance: row.balance || 0,
    initial_balance: row.initial_balance || 0,
    total_spent: row.total_spent || 0,
    currency_system: row.currency_system || 'single',
    season_id: row.season_id,
    is_active: row.is_active !== false,
    logo_url: row.logo_url,
    team_color: row.team_color,
    players_count: row.players_count || 0,
    stats: typeof row.stats === 'string' ? JSON.parse(row.stats) : (row.stats || {}),
    real_players: typeof row.real_players === 'string' ? JSON.parse(row.real_players) : (row.real_players || []),
    football_players: typeof row.football_players === 'string' ? JSON.parse(row.football_players) : (row.football_players || []),
    football_budget: row.football_budget,
    football_spent: row.football_spent || 0,
    real_player_budget: row.real_player_budget,
    real_player_spent: row.real_player_spent || 0,
    raw_data: row.raw_data,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapTeamWithSeasonRow(row: any): NeonTeam {
  const team = mapTeamRow(row);
  
  // Merge team_season data if available
  if (row.ts_id) {
    team.balance = row.ts_budget || team.balance;
    team.initial_balance = row.ts_initial_balance || team.initial_balance;
    team.total_spent = team.initial_balance - team.balance;
    team.players_count = row.ts_players_count || team.players_count;
    team.real_players = typeof row.ts_real_players === 'string' ? JSON.parse(row.ts_real_players) : (row.ts_real_players || team.real_players);
    team.football_players = typeof row.ts_football_players === 'string' ? JSON.parse(row.ts_football_players) : (row.ts_football_players || team.football_players);
    team.stats = typeof row.ts_stats === 'string' ? JSON.parse(row.ts_stats) : (row.ts_stats || team.stats);
    team.is_active = row.ts_status === 'registered' || team.is_active;
    if (row.ts_logo_url) team.logo_url = row.ts_logo_url;
    team.season_id = row.ts_season_id || team.season_id;
    team.currency_system = row.ts_currency_system || team.currency_system;
    team.football_budget = row.ts_football_budget || team.football_budget;
    team.football_spent = row.ts_football_spent || team.football_spent;
    team.real_player_budget = row.ts_real_player_budget || team.real_player_budget;
    team.real_player_spent = row.ts_real_player_spent || team.real_player_spent;
  }
  
  return team;
}

function mapTeamSeasonAsTeamRow(row: any): NeonTeam {
  const initialBudget = row.initial_budget || 15000;
  const currentBudget = row.budget || 0;
  
  return {
    id: row.id,
    team_id: row.id,
    team_name: row.team_name || row.base_team_name || 'Unknown Team',
    team_code: row.team_code || row.base_team_code,
    owner_uid: row.base_owner_uid,
    owner_name: row.username || row.owner_name || row.base_owner_name,
    owner_email: row.team_email || row.owner_email || row.base_owner_email,
    username: row.username,
    balance: currentBudget,
    initial_balance: initialBudget,
    total_spent: initialBudget - currentBudget,
    currency_system: row.currency_system || 'single',
    season_id: row.season_id,
    is_active: row.status === 'registered',
    logo_url: row.logo_url || row.base_logo_url,
    team_color: row.team_color || row.base_team_color,
    players_count: row.players_count || 0,
    stats: typeof row.stats === 'string' ? JSON.parse(row.stats) : (row.stats || {}),
    real_players: typeof row.real_players === 'string' ? JSON.parse(row.real_players) : (row.real_players || []),
    football_players: typeof row.football_players === 'string' ? JSON.parse(row.football_players) : (row.football_players || []),
    football_budget: row.football_budget,
    football_spent: row.football_spent || 0,
    real_player_budget: row.real_player_budget,
    real_player_spent: row.real_player_spent || 0,
    raw_data: row.raw_data,
    created_at: row.joined_at || row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || row.joined_at || new Date().toISOString(),
  };
}
