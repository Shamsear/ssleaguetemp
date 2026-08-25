/**
 * Teams — Neon is the ONLY source for reads AND writes.
 * Firebase is completely removed for this collection.
 * Auth stays on Firebase (separate concern).
 */

import { TeamData, CreateTeamData, UpdateTeamData, TeamStats, UpdateTeamStatsData } from '@/types/team';
import { getMainDb } from '../neon/main-config';

// Initialize empty team stats
const initializeTeamStats = (): TeamStats => ({
  matches_played: 0, matches_won: 0, matches_lost: 0, matches_drawn: 0,
  points: 0, goals_scored: 0, goals_conceded: 0, goal_difference: 0,
  clean_sheets: 0, win_rate: 0,
});

// ============================
// READ FUNCTIONS — Neon only
// ============================

// Get all teams (Neon: single SQL JOIN replaces 2 Firebase collections + 1 seasons query)
export const getAllTeams = async (): Promise<TeamData[]> => {
  try {
    const sql = getMainDb();
    const result = await sql`
      SELECT 
        t.id, t.team_id, t.team_name, t.team_code, t.owner_uid, t.owner_name,
        t.owner_email, t.logo_url, t.team_color, t.is_active, t.created_at, t.updated_at,
        ts.id as ts_id, ts.team_name as ts_team_name, ts.team_code as ts_team_code,
        ts.budget, ts.initial_budget, ts.season_id, ts.username, ts.team_email,
        ts.currency_system, ts.players_count, ts.football_players_count,
        ts.stats, ts.real_players, ts.football_players,
        ts.football_budget, ts.football_spent, ts.real_player_budget, ts.real_player_spent,
        ts.logo_url as ts_logo_url, ts.status, ts.joined_at,
        s.name as season_name
      FROM teams t
      LEFT JOIN team_seasons ts ON t.id = ts.team_id
      LEFT JOIN seasons s ON ts.season_id = s.id
      ORDER BY t.team_name ASC, ts.joined_at DESC
    `;
    return mergeTeamsFromNeon(result);
  } catch (error: any) {
    console.error('Error getting all teams from Neon:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to get all teams');
  }
};

function mergeTeamsFromNeon(rows: any[]): TeamData[] {
  const teamsMap = new Map<string, TeamData>();
  const defaultStats = (): TeamStats => ({
    matches_played: 0, matches_won: 0, matches_lost: 0, matches_drawn: 0,
    points: 0, goals_scored: 0, goals_conceded: 0, goal_difference: 0,
    clean_sheets: 0, win_rate: 0,
  });
  for (const row of rows) {
    const baseId = row.id;
    const logo = row.ts_logo_url || row.logo_url || null;
    if (!teamsMap.has(baseId)) {
      teamsMap.set(baseId, {
        id: baseId, team_id: row.team_id || baseId,
        team_name: row.team_name || 'Unknown Team',
        team_code: row.team_code || null,
        owner_name: row.owner_name || '', owner_email: row.owner_email || '',
        balance: 0, initial_balance: 0, total_spent: 0, currency_system: 'single',
        football_budget: 0, football_spent: 0, real_player_budget: 0, real_player_spent: 0,
        season_id: '', season_name: '', real_players: [], football_players: [],
        real_players_count: 0, football_players_count: 0, players_count: 0,
        stats: defaultStats(), is_active: row.is_active !== false,
        logo, logo_url: logo, team_color: row.team_color || null,
        created_at: row.created_at ? new Date(row.created_at) : new Date(),
        updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
      } as TeamData);
    }
    if (row.ts_id) {
      const t = teamsMap.get(baseId)!;
      const budget = row.budget || 0;
      const initBudget = row.initial_budget || 0;
      t.balance = budget; t.initial_balance = initBudget; t.total_spent = initBudget - budget;
      t.season_id = row.season_id || ''; t.season_name = row.season_name || '';
      t.real_players = typeof row.real_players === 'string' ? JSON.parse(row.real_players) : (row.real_players || []);
      t.football_players = typeof row.football_players === 'string' ? JSON.parse(row.football_players) : (row.football_players || []);
      t.players_count = row.players_count || 0; t.football_players_count = row.football_players_count || 0;
      t.real_players_count = row.players_count || 0;
      t.stats = typeof row.stats === 'string' ? JSON.parse(row.stats) : (row.stats || defaultStats());
      t.is_active = row.status === 'registered' || t.is_active;
      t.currency_system = row.currency_system || 'single';
      t.football_budget = row.football_budget || 0; t.football_spent = row.football_spent || 0;
      t.real_player_budget = row.real_player_budget || 0; t.real_player_spent = row.real_player_spent || 0;
      if (logo) { t.logo = logo; t.logo_url = logo; }
    }
  }
  return Array.from(teamsMap.values());
}

// Get teams by season
export const getTeamsBySeason = async (seasonId: string): Promise<TeamData[]> => {
  try {
    const sql = getMainDb();
    const result = await sql`
      SELECT ts.*, s.name as season_name,
        t.team_name as base_team_name, t.team_code as base_team_code,
        t.owner_uid as base_owner_uid, t.logo_url as base_logo_url
      FROM team_seasons ts
      LEFT JOIN teams t ON ts.team_id = t.id
      LEFT JOIN seasons s ON ts.season_id = s.id
      WHERE ts.season_id = ${seasonId}
      ORDER BY ts.joined_at DESC
    `;
    return result.map((row: any) => {
      const ib = row.initial_budget || 15000;
      const cb = row.budget || 0;
      const logoUrl = row.logo_url || row.base_logo_url || null;
      return {
        id: row.id, team_id: row.id,
        team_name: row.team_name || row.base_team_name || 'Unknown Team',
        team_code: row.team_code || row.base_team_code || null,
        owner_name: row.username || row.owner_name || '',
        owner_email: row.team_email || row.owner_email || '',
        balance: cb, initial_balance: ib, total_spent: ib - cb,
        currency_system: row.currency_system || 'single',
        football_budget: row.football_budget ?? cb, football_spent: row.football_spent ?? (ib - cb),
        real_player_budget: row.real_player_budget || 0, real_player_spent: row.real_player_spent || 0,
        season_id: row.season_id || '', season_name: row.season_name || '',
        real_players: typeof row.real_players === 'string' ? JSON.parse(row.real_players) : (row.real_players || []),
        football_players: typeof row.football_players === 'string' ? JSON.parse(row.football_players) : (row.football_players || []),
        real_players_count: row.players_count || 0, football_players_count: row.football_players_count || 0,
        players_count: row.players_count || 0,
        stats: typeof row.stats === 'string' ? JSON.parse(row.stats) : (row.stats || {}),
        is_active: row.status === 'registered',
        logo: logoUrl, logo_url: logoUrl, team_color: row.team_color || null,
        created_at: row.joined_at ? new Date(row.joined_at) : new Date(),
        updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
      } as TeamData;
    });
  } catch (error: any) {
    console.error('Error getting teams by season from Neon:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to get teams by season');
  }
};

// Get team by ID
export const getTeamById = async (teamId: string): Promise<TeamData | null> => {
  try {
    const sql = getMainDb();
    // Try team_seasons first (same lookup order as before)
    const tsResult = await sql`
      SELECT ts.*, s.name as season_name,
        t.team_name as base_team_name, t.team_code as base_team_code,
        t.owner_name as base_owner_name, t.logo_url as base_logo_url,
        t.is_active as base_is_active, t.performance_history
      FROM team_seasons ts
      LEFT JOIN teams t ON ts.team_id = t.id
      LEFT JOIN seasons s ON ts.season_id = s.id
      WHERE ts.id = ${teamId}
      LIMIT 1
    `;
    if (tsResult.length > 0) {
      const row = tsResult[0];
      const ib = row.initial_budget || 15000;
      const cb = row.budget || 0;
      const logoUrl = row.logo_url || row.base_logo_url || null;
      return {
        id: row.id, team_id: row.id,
        team_name: row.team_name || 'Unknown Team',
        team_code: row.team_code || null,
        owner_name: row.username || row.owner_name || '',
        owner_email: row.team_email || row.owner_email || '',
        balance: cb, initial_balance: ib, total_spent: ib - cb,
        currency_system: row.currency_system || 'single',
        football_budget: row.football_budget ?? cb, football_spent: row.football_spent ?? (ib - cb),
        real_player_budget: row.real_player_budget || 0, real_player_spent: row.real_player_spent || 0,
        season_id: row.season_id || '', season_name: row.season_name || '',
        real_players: typeof row.real_players === 'string' ? JSON.parse(row.real_players) : (row.real_players || []),
        football_players: typeof row.football_players === 'string' ? JSON.parse(row.football_players) : (row.football_players || []),
        real_players_count: row.players_count || 0, football_players_count: row.football_players_count || 0,
        players_count: row.players_count || 0,
        stats: typeof row.stats === 'string' ? JSON.parse(row.stats) : (row.stats || {}),
        is_active: row.status === 'registered',
        logo: logoUrl, logo_url: logoUrl, team_color: row.team_color || null,
        created_at: row.joined_at ? new Date(row.joined_at) : new Date(),
        updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
        performance_history: typeof row.performance_history === 'string' ? JSON.parse(row.performance_history) : (row.performance_history || {}),
      } as TeamData;
    }
    // Not in team_seasons, try teams table
    const teamResult = await sql`SELECT * FROM teams WHERE id = ${teamId} LIMIT 1`;
    if (teamResult.length === 0) return null;
    const t = teamResult[0];
    const logoUrl = t.logo_url || null;
    return {
      id: t.id, team_id: t.team_id || t.id,
      team_name: t.team_name || 'Unknown Team', team_code: t.team_code || null,
      owner_name: t.owner_name || '', owner_email: t.owner_email || '',
      balance: 0, initial_balance: 0, total_spent: 0, currency_system: 'single',
      football_budget: 0, football_spent: 0, real_player_budget: 0, real_player_spent: 0,
      season_id: '', season_name: '', real_players: [], football_players: [],
      real_players_count: 0, football_players_count: 0, players_count: 0,
      stats: initializeTeamStats(), is_active: t.is_active !== false,
      logo: logoUrl, logo_url: logoUrl, team_color: t.team_color || null,
      created_at: t.created_at ? new Date(t.created_at) : new Date(),
      updated_at: t.updated_at ? new Date(t.updated_at) : new Date(),
      performance_history: typeof t.raw_data === 'object' ? (t.raw_data?.performance_history || {}) : {},
    } as TeamData;
  } catch (error: any) {
    console.error('Error getting team from Neon:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to get team');
  }
};

// Get team statistics (delegates to getAllTeams)
export const getTeamStatistics = async (): Promise<{
  totalTeams: number; activeTeams: number; inactiveTeams: number; totalPlayers: number;
}> => {
  const teams = await getAllTeams();
  return {
    totalTeams: teams.length,
    activeTeams: teams.filter(t => t.is_active).length,
    inactiveTeams: teams.filter(t => !t.is_active).length,
    totalPlayers: teams.reduce((sum, t) => sum + (t.players_count || 0), 0),
  };
};

// ============================
// WRITE FUNCTIONS — Neon only
// ============================

// Generate custom team ID
const generateTeamId = async (): Promise<string> => {
  const prefix = 'team';
  try {
    const sql = getMainDb();
    const result = await sql`SELECT team_id FROM teams WHERE team_id LIKE ${prefix + '%'} ORDER BY team_id DESC LIMIT 1`;
    if (result.length === 0) return `${prefix}0001`;
    const lastNum = parseInt(result[0].team_id?.substring(prefix.length) || '0');
    return `${prefix}${(lastNum + 1).toString().padStart(4, '0')}`;
  } catch {
    return `${prefix}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  }
};

// Check if team code is available
export const isTeamCodeAvailable = async (teamCode: string, excludeTeamId?: string): Promise<boolean> => {
  try {
    const sql = getMainDb();
    const result = await sql`SELECT id FROM teams WHERE team_code = ${teamCode.toUpperCase()} LIMIT 5`;
    if (excludeTeamId) return result.every((r: any) => r.id === excludeTeamId);
    return result.length === 0;
  } catch (error: any) {
    console.error('Error checking team code:', error);
    return true; // Fail open for availability checks
  }
};

// Create new team
export const createTeam = async (teamData: CreateTeamData): Promise<TeamData> => {
  try {
    const codeAvailable = await isTeamCodeAvailable(teamData.team_code);
    if (!codeAvailable) throw new Error('Team code is already taken.');

    const teamId = await generateTeamId();
    const sql = getMainDb();
    const now = new Date().toISOString();
    const stats = initializeTeamStats();

    const newTeam: any = {
      team_id: teamId, team_name: teamData.team_name,
      team_code: teamData.team_code.toUpperCase(),
      owner_uid: teamData.owner_uid || null,
      owner_name: teamData.owner_name || null,
      owner_email: teamData.owner_email || null,
      username: teamData.owner_name || null,
      balance: teamData.initial_balance, initial_balance: teamData.initial_balance,
      total_spent: 0, season_id: teamData.season_id,
      real_players: [], football_players: [],
      real_players_count: 0, football_players_count: 0,
      stats, is_active: true,
      logo: teamData.logo || null, team_color: teamData.team_color || null,
      created_at: now, updated_at: now,
    };

    // Insert into teams table
    await sql`
      INSERT INTO teams (
        id, team_id, team_name, team_code, owner_uid, owner_name,
        owner_email, username, balance, initial_balance, total_spent,
        is_active, logo_url, team_color, players_count, stats,
        real_players, football_players, raw_data, created_at, updated_at
      ) VALUES (
        ${teamId}, ${newTeam.team_id}, ${newTeam.team_name}, ${newTeam.team_code},
        ${newTeam.owner_uid}, ${newTeam.owner_name}, ${newTeam.owner_email},
        ${newTeam.username}, ${newTeam.balance}, ${newTeam.initial_balance},
        ${newTeam.total_spent}, ${newTeam.is_active}, ${newTeam.logo},
        ${newTeam.team_color}, ${0}, ${JSON.stringify(stats)},
        ${'[]'}, ${'[]'}, ${JSON.stringify(newTeam)}, ${now}, ${now}
      )
      ON CONFLICT (id) DO NOTHING
    `;

    // Update season team count in Neon
    try {
      await sql`UPDATE seasons SET total_teams = total_teams + 1, updated_at = ${now} WHERE id = ${teamData.season_id}`;
    } catch {}

    const createdTeam = await getTeamById(teamId);
    if (!createdTeam) throw new Error('Failed to fetch created team');
    return createdTeam;
  } catch (error: any) {
    console.error('Error creating team:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to create team');
  }
};

// Update team
export const updateTeam = async (teamId: string, updates: UpdateTeamData): Promise<void> => {
  try {
    const sql = getMainDb();
    const now = new Date().toISOString();

    if (updates.team_code) {
      const codeAvailable = await isTeamCodeAvailable(updates.team_code, teamId);
      if (!codeAvailable) throw new Error('Team code is already taken.');
      updates.team_code = updates.team_code.toUpperCase();
    }

    // Map camelCase to snake_case for Neon columns
    const neonUpdates: Record<string, any> = { updated_at: now };
    if (updates.team_name !== undefined) neonUpdates.team_name = updates.team_name;
    if (updates.team_code !== undefined) neonUpdates.team_code = updates.team_code;
    if (updates.owner_name !== undefined) neonUpdates.owner_name = updates.owner_name;
    if (updates.owner_email !== undefined) neonUpdates.owner_email = updates.owner_email;
    if (updates.logo !== undefined) neonUpdates.logo_url = updates.logo;
    if (updates.team_color !== undefined) neonUpdates.team_color = updates.team_color;
    if (updates.is_active !== undefined) neonUpdates.is_active = updates.is_active;

    const setClauses: string[] = [];
    const values: any[] = [];
    let i = 1;
    for (const [key, value] of Object.entries(neonUpdates)) {
      setClauses.push(`${key} = $${i}`);
      values.push(value);
      i++;
    }

    if (setClauses.length > 1) { // More than just updated_at
      await sql.query(
        `UPDATE teams SET ${setClauses.join(', ')} WHERE id = $${i}`,
        [...values, teamId]
      );
    }
  } catch (error: any) {
    console.error('Error updating team:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to update team');
  }
};

// Toggle team active status
export const toggleTeamStatus = async (teamId: string, isActive: boolean): Promise<void> => {
  try {
    const sql = getMainDb();
    const now = new Date().toISOString();
    await sql`UPDATE teams SET is_active = ${isActive}, updated_at = ${now} WHERE id = ${teamId}`;
  } catch (error: any) {
    console.error('Error toggling team status:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to toggle team status');
  }
};

// Delete team
export const deleteTeam = async (teamId: string): Promise<void> => {
  try {
    const sql = getMainDb();
    // Update season team count first
    const team = await getTeamById(teamId);
    if (team?.season_id) {
      try {
        await sql`UPDATE seasons SET total_teams = GREATEST(total_teams - 1, 0), updated_at = ${new Date().toISOString()} WHERE id = ${team.season_id}`;
      } catch {}
    }
    await sql`DELETE FROM teams WHERE id = ${teamId}`;
  } catch (error: any) {
    console.error('Error deleting team:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to delete team');
  }
};

// Update team player count
export const updateTeamPlayerCount = async (teamId: string, playerCount: number): Promise<void> => {
  try {
    const sql = getMainDb();
    const now = new Date().toISOString();
    await sql`UPDATE teams SET players_count = ${playerCount}, updated_at = ${now} WHERE id = ${teamId}`;
  } catch (error: any) {
    console.error('Error updating team player count:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to update team player count');
  }
};

// Update team balance
export const updateTeamBalance = async (teamId: string, balance: number): Promise<void> => {
  try {
    const sql = getMainDb();
    const now = new Date().toISOString();
    await sql`UPDATE teams SET balance = ${balance}, updated_at = ${now} WHERE id = ${teamId}`;
  } catch (error: any) {
    console.error('Error updating team balance:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to update team balance');
  }
};

// Update team stats
export const updateTeamStats = async (teamId: string, statsUpdates: UpdateTeamStatsData): Promise<void> => {
  try {
    const team = await getTeamById(teamId);
    if (!team) throw new Error('Team not found');
    const updatedStats = { ...team.stats, ...statsUpdates };
    if (updatedStats.goals_scored !== undefined && updatedStats.goals_conceded !== undefined) {
      updatedStats.goal_difference = updatedStats.goals_scored - updatedStats.goals_conceded;
    }
    if (updatedStats.matches_played > 0) {
      updatedStats.win_rate = (updatedStats.matches_won / updatedStats.matches_played) * 100;
    }
    const sql = getMainDb();
    const now = new Date().toISOString();
    await sql`UPDATE teams SET stats = ${JSON.stringify(updatedStats)}, updated_at = ${now} WHERE id = ${teamId}`;
  } catch (error: any) {
    console.error('Error updating team stats:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to update team stats');
  }
};
