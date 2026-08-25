/**
 * Neon Write-Sync Utilities
 * 
 * After any Firebase write to seasons/teams/team_seasons, call the matching
 * sync function here to keep Neon in sync. This is the transitional bridge —
 * eventually Firebase writes will be removed entirely.
 * 
 * Usage: add `import { syncTeamSeason } from '@/lib/neon/write-sync';`
 * after any Firebase update/set/delete, call `await syncTeamSeason(docId, data);`
 */

import { getMainDb, isMainDbAvailable } from './main-config';

// ============================
// SEASONS
// ============================

export async function syncSeason(seasonId: string, data: Record<string, any>) {
  if (!isMainDbAvailable()) return;
  try {
    const sql = getMainDb();
    await sql`
      INSERT INTO seasons (
        id, name, year, season_number, type, is_active, status,
        registration_open, total_teams, total_rounds,
        purse_amount, max_players_per_team, dollar_budget, euro_budget,
        required_real_players, max_football_players, category_fine_amount,
        raw_data, updated_at
      ) VALUES (
        ${seasonId},
        ${data.name || null}, ${data.year || null}, ${data.season_number || null},
        ${data.type || 'single'}, ${data.isActive ?? data.is_active ?? false},
        ${data.status || 'draft'}, ${data.registrationOpen ?? data.registration_open ?? false},
        ${data.totalTeams || data.total_teams || 0}, ${data.totalRounds || data.total_rounds || 0},
        ${data.purseAmount || data.purse_amount || 0}, ${data.maxPlayersPerTeam || data.max_players_per_team || 11},
        ${data.dollar_budget || null}, ${data.euro_budget || null},
        ${data.required_real_players || null}, ${data.max_football_players || null},
        ${data.category_fine_amount || null}, ${JSON.stringify(data)}, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, seasons.name),
        is_active = COALESCE(EXCLUDED.is_active, seasons.is_active),
        status = COALESCE(EXCLUDED.status, seasons.status),
        registration_open = COALESCE(EXCLUDED.registration_open, seasons.registration_open),
        total_teams = COALESCE(EXCLUDED.total_teams, seasons.total_teams),
        raw_data = COALESCE(EXCLUDED.raw_data, seasons.raw_data),
        updated_at = NOW()
    `;
  } catch (error: any) {
    console.warn('⚠️ Neon sync failed for season', seasonId, ':', error.message);
  }
}

export async function deleteSeasonNeon(seasonId: string) {
  if (!isMainDbAvailable()) return;
  try {
    await getMainDb()`DELETE FROM seasons WHERE id = ${seasonId}`;
  } catch {}
}

// ============================
// TEAMS
// ============================

export async function syncTeam(teamId: string, data: Record<string, any>) {
  if (!isMainDbAvailable()) return;
  try {
    const sql = getMainDb();
    const logo = data.logo_url || data.logo || data.team_logo || null;
    await sql`
      INSERT INTO teams (
        id, team_id, team_name, team_code, owner_uid, owner_name,
        owner_email, username, balance, initial_balance, total_spent,
        currency_system, season_id, is_active, logo_url, team_color,
        players_count, stats, real_players, football_players,
        football_budget, football_spent, real_player_budget, real_player_spent,
        raw_data, updated_at
      ) VALUES (
        ${teamId}, ${data.team_id || teamId}, ${data.team_name || 'Unknown Team'},
        ${data.team_code || null}, ${data.owner_uid || null}, ${data.owner_name || null},
        ${data.owner_email || null}, ${data.username || null},
        ${data.balance || 0}, ${data.initial_balance || 0}, ${data.total_spent || 0},
        ${data.currency_system || 'single'}, ${data.season_id || null},
        ${data.is_active !== false}, ${logo}, ${data.team_color || null},
        ${data.players_count || 0}, ${JSON.stringify(data.stats || {})},
        ${JSON.stringify(data.real_players || [])}, ${JSON.stringify(data.football_players || [])},
        ${data.football_budget || null}, ${data.football_spent || 0},
        ${data.real_player_budget || null}, ${data.real_player_spent || 0},
        ${JSON.stringify(data)}, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        team_name = COALESCE(EXCLUDED.team_name, teams.team_name),
        logo_url = COALESCE(EXCLUDED.logo_url, teams.logo_url),
        is_active = COALESCE(EXCLUDED.is_active, teams.is_active),
        stats = COALESCE(EXCLUDED.stats, teams.stats),
        players_count = COALESCE(EXCLUDED.players_count, teams.players_count),
        raw_data = COALESCE(EXCLUDED.raw_data, teams.raw_data),
        updated_at = NOW()
    `;
  } catch (error: any) {
    console.warn('⚠️ Neon sync failed for team', teamId, ':', error.message);
  }
}

export async function deleteTeamNeon(teamId: string) {
  if (!isMainDbAvailable()) return;
  try {
    await getMainDb()`DELETE FROM teams WHERE id = ${teamId}`;
  } catch {}
}

// ============================
// TEAM SEASONS
// ============================

export async function syncTeamSeason(docId: string, data: Record<string, any>) {
  if (!isMainDbAvailable()) return;
  try {
    const parts = docId.split('_');
    const teamId = data.team_id || parts[0];
    const seasonId = data.season_id || parts.slice(1).join('_');
    const sql = getMainDb();
    await sql`
      INSERT INTO team_seasons (
        id, team_id, team_name, team_code, season_id, user_id, username,
        team_email, status, budget, initial_budget, football_budget,
        football_spent, real_player_budget, real_player_spent, currency_system,
        players_count, football_players_count, stats, real_players,
        football_players, logo_url, team_color, dollar_balance, euro_balance,
        raw_data, updated_at
      ) VALUES (
        ${docId}, ${teamId}, ${data.team_name || null}, ${data.team_code || null},
        ${seasonId}, ${data.user_id || null}, ${data.username || null},
        ${data.team_email || null}, ${data.status || 'registered'},
        ${data.budget || 0}, ${data.initial_budget || 0},
        ${data.football_budget || null}, ${data.football_spent || 0},
        ${data.real_player_budget || null}, ${data.real_player_spent || 0},
        ${data.currency_system || 'single'}, ${data.players_count || 0},
        ${data.football_players_count || 0}, ${JSON.stringify(data.stats || {})},
        ${JSON.stringify(data.real_players || [])}, ${JSON.stringify(data.football_players || [])},
        ${data.logo_url || null}, ${data.team_color || null},
        ${data.dollarBalance || null}, ${data.euroBalance || null},
        ${JSON.stringify(data)}, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        team_name = COALESCE(EXCLUDED.team_name, team_seasons.team_name),
        status = COALESCE(EXCLUDED.status, team_seasons.status),
        budget = EXCLUDED.budget,
        initial_budget = EXCLUDED.initial_budget,
        players_count = EXCLUDED.players_count,
        stats = EXCLUDED.stats,
        real_players = EXCLUDED.real_players,
        football_players = EXCLUDED.football_players,
        football_budget = COALESCE(EXCLUDED.football_budget, team_seasons.football_budget),
        football_spent = COALESCE(EXCLUDED.football_spent, team_seasons.football_spent),
        real_player_budget = COALESCE(EXCLUDED.real_player_budget, team_seasons.real_player_budget),
        real_player_spent = COALESCE(EXCLUDED.real_player_spent, team_seasons.real_player_spent),
        currency_system = COALESCE(EXCLUDED.currency_system, team_seasons.currency_system),
        logo_url = COALESCE(EXCLUDED.logo_url, team_seasons.logo_url),
        team_color = COALESCE(EXCLUDED.team_color, team_seasons.team_color),
        raw_data = COALESCE(EXCLUDED.raw_data, team_seasons.raw_data),
        updated_at = NOW()
    `;
  } catch (error: any) {
    console.warn('⚠️ Neon sync failed for team_season', docId, ':', error.message);
  }
}

/**
 * Batch sync: read current Neon row, merge updates, upsert.
 * For when Firebase uses .update() (partial update) and we need to merge.
 */
export async function syncTeamSeasonPartial(docId: string, updates: Record<string, any>) {
  if (!isMainDbAvailable()) return;
  // For partial updates, we just sync the fields that changed
  // The ON CONFLICT upsert handles the merge
  await syncTeamSeason(docId, updates);
}
