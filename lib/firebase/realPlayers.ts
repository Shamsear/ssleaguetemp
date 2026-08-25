/**
 * Real Players — Neon is the ONLY source for reads AND writes.
 * Firebase removed for this collection.
 */

import {
  RealPlayerData,
  RealPlayerStats,
  CreateRealPlayerData,
  UpdateRealPlayerData,
  UpdateRealPlayerStatsData,
} from '@/types/realPlayer';
import { getMainDb } from '../neon/main-config';

// Initialize empty stats
const initializeStats = (): RealPlayerStats => ({
  matches_played: 0, matches_won: 0, matches_lost: 0, matches_drawn: 0,
  goals_scored: 0, assists: 0, clean_sheets: 0,
  win_rate: 0, average_rating: 0,
  current_season_matches: 0, current_season_wins: 0,
});

// ============================
// READ FUNCTIONS — Neon only
// ============================

export const getAllRealPlayers = async (): Promise<RealPlayerData[]> => {
  try {
    const sql = getMainDb();
    const result = await sql`
      SELECT rp.*,
        s.name as season_name,
        c.name as category_name,
        ts.team_name, ts.team_code
      FROM realplayers rp
      LEFT JOIN seasons s ON rp.season_id = s.id
      LEFT JOIN categories c ON rp.category_id = c.id
      LEFT JOIN team_seasons ts ON rp.team_id = ts.team_id AND rp.season_id = ts.season_id
      ORDER BY rp.created_at DESC
    `;
    return result.map(mapRealPlayerRow);
  } catch (error) {
    console.error('Error getting all real players:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to get all real players');
  }
};

export const getRealPlayersByTeam = async (teamId: string): Promise<RealPlayerData[]> => {
  try {
    const sql = getMainDb();
    const result = await sql`
      SELECT rp.*,
        s.name as season_name,
        c.name as category_name,
        ts.team_name, ts.team_code
      FROM realplayers rp
      LEFT JOIN seasons s ON rp.season_id = s.id
      LEFT JOIN categories c ON rp.category_id = c.id
      LEFT JOIN team_seasons ts ON rp.team_id = ts.team_id AND rp.season_id = ts.season_id
      WHERE rp.team_id = ${teamId}
      ORDER BY rp.name ASC
    `;
    return result.map(mapRealPlayerRow);
  } catch (error) {
    console.error('Error getting real players by team:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to get real players by team');
  }
};

export const getRealPlayersBySeason = async (seasonId: string): Promise<RealPlayerData[]> => {
  try {
    const sql = getMainDb();
    const result = await sql`
      SELECT rp.*,
        c.name as category_name,
        ts.team_name, ts.team_code
      FROM realplayers rp
      LEFT JOIN categories c ON rp.category_id = c.id
      LEFT JOIN team_seasons ts ON rp.team_id = ts.team_id AND rp.season_id = ts.season_id
      WHERE rp.season_id = ${seasonId}
      ORDER BY rp.name ASC
    `;
    return result.map(mapRealPlayerRow);
  } catch (error) {
    console.error('Error getting real players by season:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to get real players by season');
  }
};

export const getRealPlayerById = async (playerId: string): Promise<RealPlayerData | null> => {
  try {
    const sql = getMainDb();
    // Try by id first, then by player_id
    let result = await sql`
      SELECT rp.*,
        s.name as season_name,
        c.name as category_name,
        ts.team_name, ts.team_code
      FROM realplayers rp
      LEFT JOIN seasons s ON rp.season_id = s.id
      LEFT JOIN categories c ON rp.category_id = c.id
      LEFT JOIN team_seasons ts ON rp.team_id = ts.team_id AND rp.season_id = ts.season_id
      WHERE rp.id = ${playerId} OR rp.player_id = ${playerId}
      LIMIT 1
    `;
    if (result.length === 0) return null;
    return mapRealPlayerRow(result[0]);
  } catch (error) {
    console.error('Error getting real player:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to get real player');
  }
};

export const getRealPlayerStatistics = async (): Promise<{
  totalPlayers: number; activePlayers: number; inactivePlayers: number;
  assignedPlayers: number; unassignedPlayers: number;
}> => {
  const players = await getAllRealPlayers();
  return {
    totalPlayers: players.length,
    activePlayers: players.filter(p => p.is_active).length,
    inactivePlayers: players.filter(p => !p.is_active).length,
    assignedPlayers: players.filter(p => p.team_id).length,
    unassignedPlayers: players.filter(p => !p.team_id).length,
  };
};

// ============================
// WRITE FUNCTIONS — Neon only
// ============================

const generatePlayerId = async (): Promise<string> => {
  const prefix = 'sspslpsl';
  try {
    const sql = getMainDb();
    const result = await sql`SELECT player_id FROM realplayers WHERE player_id LIKE ${prefix + '%'} ORDER BY player_id DESC LIMIT 1`;
    if (result.length === 0) return `${prefix}0001`;
    const lastNum = parseInt(result[0].player_id?.substring(prefix.length) || '0');
    return `${prefix}${(lastNum + 1).toString().padStart(4, '0')}`;
  } catch {
    return `${prefix}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  }
};

export const createRealPlayer = async (
  playerData: CreateRealPlayerData,
  assignedBy?: string
): Promise<RealPlayerData> => {
  try {
    const sql = getMainDb();
    const now = new Date().toISOString();

    // Check if player with same name exists
    const existing = await sql`SELECT id, player_id FROM realplayers WHERE name = ${playerData.name} LIMIT 1`;
    if (existing.length > 0) {
      // Update existing player
      const pid = existing[0].player_id || existing[0].id;
      await sql`
        UPDATE realplayers SET
          season_id = COALESCE(${playerData.season_id || null}, season_id),
          category_id = COALESCE(${playerData.category_id || null}, category_id),
          team_id = COALESCE(${playerData.team_id || null}, team_id),
          team = COALESCE(${playerData.team || null}, team),
          display_name = COALESCE(${playerData.display_name || null}, display_name),
          email = COALESCE(${playerData.email || null}, email),
          phone = COALESCE(${playerData.phone || null}, phone),
          is_registered = COALESCE(${playerData.is_registered}, is_registered),
          updated_at = ${now}
        WHERE id = ${existing[0].id}
      `;
      return (await getRealPlayerById(pid))!;
    }

    // Create new player
    const playerId = await generatePlayerId();
    const stats = initializeStats();
    await sql`
      INSERT INTO realplayers (
        id, player_id, name, team, season_id, category_id, team_id,
        is_registered, display_name, email, phone, role, is_active, is_available,
        stats, psn_id, xbox_id, steam_id, assigned_by, notes,
        created_at, updated_at
      ) VALUES (
        ${playerId}, ${playerId}, ${playerData.name}, ${playerData.team || null},
        ${playerData.season_id || null}, ${playerData.category_id || null}, ${playerData.team_id || null},
        ${playerData.is_registered || false}, ${playerData.display_name || null},
        ${playerData.email || null}, ${playerData.phone || null}, ${playerData.role || 'player'},
        true, true, ${JSON.stringify(stats)},
        ${playerData.psn_id || null}, ${playerData.xbox_id || null}, ${playerData.steam_id || null},
        ${assignedBy || null}, ${playerData.notes || null},
        ${now}, ${now}
      )
    `;
    const created = await getRealPlayerById(playerId);
    if (!created) throw new Error('Failed to fetch created player');
    return created;
  } catch (error) {
    console.error('Error creating real player:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to create real player');
  }
};

export const updateRealPlayer = async (playerId: string, updates: UpdateRealPlayerData): Promise<void> => {
  try {
    const sql = getMainDb();
    const now = new Date().toISOString();

    const setClauses: string[] = ['updated_at = $1'];
    const values: any[] = [now];
    let idx = 2;

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || key === 'updated_at') continue;
      setClauses.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }

    if (setClauses.length > 1) {
      await sql.query(
        `UPDATE realplayers SET ${setClauses.join(', ')} WHERE player_id = $${idx} OR id = $${idx}`,
        [...values, playerId]
      );
    }
  } catch (error) {
    console.error('Error updating real player:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to update real player');
  }
};

export const updateRealPlayerStats = async (playerId: string, statsUpdates: UpdateRealPlayerStatsData): Promise<void> => {
  try {
    const player = await getRealPlayerById(playerId);
    if (!player) throw new Error('Player not found');

    const currentStats = player.stats || initializeStats();
    const updatedStats = { ...currentStats, ...statsUpdates };
    if (updatedStats.matches_played > 0 && updatedStats.matches_won !== undefined) {
      updatedStats.win_rate = (updatedStats.matches_won / updatedStats.matches_played) * 100;
    }

    const sql = getMainDb();
    const now = new Date().toISOString();
    await sql`UPDATE realplayers SET stats = ${JSON.stringify(updatedStats)}, updated_at = ${now} WHERE player_id = ${playerId} OR id = ${playerId}`;
  } catch (error) {
    console.error('Error updating real player stats:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to update real player stats');
  }
};

export const deleteRealPlayer = async (playerId: string): Promise<void> => {
  try {
    const sql = getMainDb();
    await sql`DELETE FROM realplayers WHERE player_id = ${playerId} OR id = ${playerId}`;
  } catch (error) {
    console.error('Error deleting real player:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to delete real player');
  }
};

// ============================
// Mapping
// ============================

function mapRealPlayerRow(row: any): RealPlayerData {
  const stats = typeof row.stats === 'string' ? JSON.parse(row.stats) : (row.stats || {});
  return {
    id: row.player_id || row.id,
    player_id: row.player_id || row.id,
    name: row.name || '',
    display_name: row.display_name,
    email: row.email,
    phone: row.phone,
    team: row.team,
    team_id: row.team_id,
    season_id: row.season_id || '',
    season_name: row.season_name || '',
    category_id: row.category_id,
    category_name: row.category_name || '',
    team_name: row.team_name || '',
    team_code: row.team_code || '',
    is_registered: row.is_registered,
    registered_at: row.registered_at ? new Date(row.registered_at) : null,
    created_at: row.created_at ? new Date(row.created_at) : new Date(),
    updated_at: row.updated_at ? new Date(row.updated_at) : undefined,
    role: row.role || 'player',
    is_active: row.is_active !== false,
    is_available: row.is_available !== false,
    stats,
    psn_id: row.psn_id,
    xbox_id: row.xbox_id,
    steam_id: row.steam_id,
    profile_image: row.profile_image,
    joined_date: row.joined_date ? new Date(row.joined_date) : undefined,
    assigned_by: row.assigned_by,
    notes: row.notes,
  } as RealPlayerData;
}
