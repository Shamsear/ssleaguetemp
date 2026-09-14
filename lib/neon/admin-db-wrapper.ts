/**
 * Admin DB Wrapper — Intercepts reads AND writes on seasons/teams/team_seasons
 * 
 * Import this instead of adminDb in API routes that read or write to these collections.
 * 
 * READS: Redirected to Neon (eliminates Firebase read costs)
 * WRITES: Fire both Firebase AND Neon (keeps Neon in sync during transition)
 * OTHER COLLECTIONS: Passed through unchanged
 * 
 * Usage: replace ONE import line:
 * - import { adminDb } from '@/lib/firebase/admin';
 * + import { adminDb } from '@/lib/neon/admin-db-wrapper';
 */

import { adminDb as firebaseAdminDb } from '@/lib/firebase/admin';
import { getMainDb, isMainDbAvailable } from './main-config';

// Firebase is ONLY used for auth passthrough (adminAuth).
// All Firestore collection reads/writes go through Neon.

const NEON_COLLECTIONS = new Set([
  // Phase 1 (already migrated)
  'seasons', 'teams', 'team_seasons',
  // Phase 2 (new)
  'realplayers', 'realplayer', 'categories', 'transactions',
  'player_transactions', 'team_cash_balances', 'realplayerstats',
  // Phase 3
  'news', 'fixture_lineups',
]);

// Map Firebase collection names to Neon table names
const COLLECTION_TO_TABLE: Record<string, string> = {
  realplayer: 'realplayers',
  realplayerstats: 'realplayerstats',
};

function neonTable(collection: string): string {
  return COLLECTION_TO_TABLE[collection] || collection;
}

// =====================================================
// FIRESTORE INTERFACE COMPATIBLE WRAPPERS
// =====================================================

/**
 * Simulates a Firestore DocumentSnapshot
 */
class NeonDocSnapshot {
  readonly id: string;
  readonly exists: boolean;
  readonly ref: any;
  private _data: any;
  
  constructor(id: string, data: any, ref?: any) {
    this.id = id;
    this.exists = data !== null && data !== undefined;
    this._data = data;
    this.ref = ref;
  }
  
  data(): any {
    return this._data;
  }
}

/**
 * Simulates a Firestore QuerySnapshot
 */
class NeonQuerySnapshot {
  readonly size: number;
  readonly empty: boolean;
  readonly docs: NeonDocSnapshot[];
  
  constructor(docs: NeonDocSnapshot[]) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }
  
  forEach(callback: (doc: NeonDocSnapshot) => void) {
    this.docs.forEach(callback);
  }
}

// =====================================================
// MAPPING FUNCTIONS
// =====================================================

function mapSeasonRow(row: any): Record<string, any> {
  const sn = row.season_number;
  return {
    name: row.name || (sn ? `Season ${sn}` : row.year || 'Unnamed Season'),
    year: row.year || (sn ? `${sn}` : 'N/A'),
    season_number: sn,
    type: row.type,
    isActive: row.is_active,
    status: row.status,
    registrationOpen: row.registration_open,
    is_player_registration_open: row.is_player_registration_open ?? row.registration_open ?? false,
    startDate: row.start_date,
    endDate: row.end_date,
    totalTeams: row.total_teams,
    totalRounds: row.total_rounds,
    purseAmount: row.purse_amount,
    maxPlayersPerTeam: row.max_players_per_team,
    dollar_budget: row.dollar_budget,
    euro_budget: row.euro_budget,
    required_real_players: row.required_real_players,
    max_football_players: row.max_football_players,
    category_fine_amount: row.category_fine_amount,
    // Include raw_data fields for backward compatibility
    ...(typeof row.raw_data === 'object' && row.raw_data !== null ? row.raw_data : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapTeamRow(row: any): Record<string, any> {
  const stats = typeof row.stats === 'string' ? JSON.parse(row.stats) : (row.stats || {});
  const realPlayers = typeof row.real_players === 'string' ? JSON.parse(row.real_players) : (row.real_players || []);
  const footballPlayers = typeof row.football_players === 'string' ? JSON.parse(row.football_players) : (row.football_players || []);
  return {
    team_id: row.team_id || row.id,
    team_name: row.team_name || 'Unknown Team',
    team_code: row.team_code,
    owner_uid: row.owner_uid,
    owner_name: row.owner_name,
    owner_email: row.owner_email,
    username: row.username,
    is_active: row.is_active !== false,
    logo_url: row.logo_url,
    team_color: row.team_color,
    players_count: row.players_count,
    stats,
    real_players: realPlayers,
    football_players: footballPlayers,
    ...(typeof row.raw_data === 'object' && row.raw_data !== null ? row.raw_data : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapTeamSeasonRow(row: any): Record<string, any> {
  const stats = typeof row.stats === 'string' ? JSON.parse(row.stats) : (row.stats || {});
  const realPlayers = typeof row.real_players === 'string' ? JSON.parse(row.real_players) : (row.real_players || []);
  const footballPlayers = typeof row.football_players === 'string' ? JSON.parse(row.football_players) : (row.football_players || []);
  return {
    team_id: row.team_id,
    team_name: row.team_name,
    team_code: row.team_code,
    season_id: row.season_id,
    user_id: row.user_id,
    username: row.username,
    team_email: row.team_email,
    status: row.status,
    budget: row.budget,
    initial_budget: row.initial_budget,
    currency_system: row.currency_system,
    players_count: row.players_count,
    football_players_count: row.football_players_count,
    stats,
    real_players: realPlayers,
    football_players: footballPlayers,
    logo_url: row.logo_url,
    team_color: row.team_color,
    dollar_balance: row.dollar_balance,
    euro_balance: row.euro_balance,
    ...(typeof row.raw_data === 'object' && row.raw_data !== null ? row.raw_data : {}),
    football_budget: row.football_budget ?? (typeof row.raw_data === 'object' ? row.raw_data?.football_budget : undefined),
    football_spent: row.football_spent ?? (typeof row.raw_data === 'object' ? row.raw_data?.football_spent : undefined),
    real_player_budget: row.real_player_budget ?? (typeof row.raw_data === 'object' ? row.raw_data?.real_player_budget : undefined),
    real_player_spent: row.real_player_spent ?? (typeof row.raw_data === 'object' ? row.raw_data?.real_player_spent : undefined),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapRealPlayerRow(row: any): Record<string, any> {
  const stats = typeof row.stats === 'string' ? JSON.parse(row.stats) : (row.stats || {});
  return {
    ...row,
    player_id: row.player_id || row.id,
    name: row.name,
    display_name: row.display_name,
    email: row.email,
    phone: row.phone,
    team: row.team,
    team_id: row.team_id,
    season_id: row.season_id,
    category: row.category || row.category_name || row.category_id,
    category_name: row.category_name || row.category,
    category_id: row.category_id,
    role: row.role || 'player',
    is_registered: row.is_registered,
    is_active: row.is_active !== false,
    is_available: row.is_available !== false,
    registered_at: row.registered_at,
    joined_date: row.joined_date,
    assigned_by: row.assigned_by,
    notes: row.notes,
    psn_id: row.psn_id,
    xbox_id: row.xbox_id,
    steam_id: row.steam_id,
    profile_image: row.profile_image,
    stats,
    ...(typeof row.raw_data === 'object' && row.raw_data !== null ? row.raw_data : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapCategoryRow(row: any): Record<string, any> {
  return {
    ...row,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    priority: row.priority ?? 1,
    points_same_category: row.points_same_category,
    points_one_level_diff: row.points_one_level_diff,
    points_two_level_diff: row.points_two_level_diff,
    points_three_level_diff: row.points_three_level_diff,
    draw_same_category: row.draw_same_category,
    draw_one_level_diff: row.draw_one_level_diff,
    draw_two_level_diff: row.draw_two_level_diff,
    draw_three_level_diff: row.draw_three_level_diff,
    loss_same_category: row.loss_same_category,
    loss_one_level_diff: row.loss_one_level_diff,
    loss_two_level_diff: row.loss_two_level_diff,
    loss_three_level_diff: row.loss_three_level_diff,
    min_players: row.min_players,
    max_players: row.max_players,
    min_salary: row.min_salary,
    max_salary: row.max_salary,
    fine_amount: row.fine_amount,
    season_id: row.season_id,
    is_active: row.is_active !== false,
    sort_order: row.sort_order || 0,
    ...(typeof row.raw_data === 'object' && row.raw_data !== null ? row.raw_data : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapTransactionRow(row: any): Record<string, any> {
  return {
    team_id: row.team_id,
    season_id: row.season_id,
    type: row.type,
    transaction_type: row.type, // backward compat: many pages check transaction_type
    amount: row.amount,
    balance_after: row.balance_after,
    description: row.description,
    category: row.category,
    reference_id: row.reference_id,
    reference_type: row.reference_type,
    player_id: row.player_id,
    player_name: row.player_name,
    status: row.status || 'completed',
    currency: row.currency || 'single',
    processed_by: row.processed_by,
    notes: row.notes,
    ...(typeof row.raw_data === 'object' && row.raw_data !== null ? row.raw_data : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapPlayerSeasonStatsRow(row: any): Record<string, any> {
  const stats = typeof row.stats === 'string' ? JSON.parse(row.stats) : (row.stats || {});
  return {
    player_id: row.player_id,
    season_id: row.season_id,
    team_id: row.team_id,
    matches_played: row.matches_played || 0,
    matches_won: row.matches_won || 0,
    matches_lost: row.matches_lost || 0,
    matches_drawn: row.matches_drawn || 0,
    goals_scored: row.goals_scored || 0,
    assists: row.assists || 0,
    clean_sheets: row.clean_sheets || 0,
    man_of_the_match: row.man_of_the_match || 0,
    yellow_cards: row.yellow_cards || 0,
    red_cards: row.red_cards || 0,
    points: row.points || 0,
    win_rate: row.win_rate || 0,
    stats,
    ...(typeof row.raw_data === 'object' && row.raw_data !== null ? row.raw_data : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}


function mapTeamCashBalanceRow(row: any): Record<string, any> {
  const raw = typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : (row.raw_data || {});
  return {
    team_id: row.team_id,
    team_name: raw.team_name || '',
    payment_type: raw.payment_type || 'seasonal',
    remaining_balance: row.balance ?? raw.remaining_balance ?? 0,
    seasons_played: raw.seasons_played || [],
    payments: raw.payments || [],
    deductions: raw.deductions || [],
    season_plans: raw.season_plans || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
    // spread raw_data last so any extra fields are accessible
    ...raw,
  };
}

const ROW_MAPPER: Record<string, (row: any) => Record<string, any>> = {
  seasons: mapSeasonRow,
  teams: mapTeamRow,
  team_seasons: mapTeamSeasonRow,
  realplayers: mapRealPlayerRow,
  realplayer: mapRealPlayerRow,
  categories: mapCategoryRow,
  transactions: mapTransactionRow,
  realplayerstats: mapPlayerSeasonStatsRow,
  team_cash_balances: mapTeamCashBalanceRow,
};

// =====================================================
// NEON QUERY EXECUTOR
// =====================================================

function safeFirebaseDoc(collection: string, docId?: string) {
  if (docId && typeof docId === 'string' && docId.trim() !== '') {
    return firebaseAdminDb.collection(collection).doc(docId.trim());
  }
  return firebaseAdminDb.collection(collection).doc();
}

async function neonDocGet(collection: string, docId: string): Promise<NeonDocSnapshot> {
  if (!docId || typeof docId !== 'string' || docId.trim() === '') {
    return new NeonDocSnapshot(docId || '', undefined, wrapDocRef(safeFirebaseDoc(collection), collection));
  }
  const sql = getMainDb();
  const table = neonTable(collection);
  let rows: any[];
  try {
    const result = await sql.query(`SELECT * FROM ${table} WHERE id = $1 LIMIT 1`, [docId]);
    if (Array.isArray(result)) {
      rows = result;
    } else if (result && Array.isArray(result.rows)) {
      rows = result.rows;
    } else {
      rows = [];
    }
  } catch (e: any) {
    console.error(`[Neon] sql.query(docGet) failed for ${collection}:`, e.message);
    throw e;
  }
  if (!rows.length) return new NeonDocSnapshot(docId, undefined, wrapDocRef(safeFirebaseDoc(collection, docId), collection));
  const mapper = ROW_MAPPER[collection];
  return new NeonDocSnapshot(docId, mapper ? mapper(rows[0]) : rows[0], wrapDocRef(safeFirebaseDoc(collection, docId), collection));
}

async function neonCollectionGet(collection: string): Promise<NeonQuerySnapshot> {
  const sql = getMainDb();
  const table = neonTable(collection);
  let orderByClause = 'created_at DESC';
  if (collection === 'seasons') orderByClause = 'created_at DESC';
  if (collection === 'teams') orderByClause = 'team_name ASC';
  if (collection === 'team_seasons') orderByClause = 'joined_at DESC';
  if (collection === 'realplayers' || collection === 'realplayer') orderByClause = 'name ASC';
  if (collection === 'transactions') orderByClause = 'created_at DESC';
  if (collection === 'categories') orderByClause = 'sort_order ASC, name ASC';
  
  // Use sql.query() — neon() tagged template can't use dynamic table names with $params
  let rows: any[];
  try {
    const result = await sql.query(`SELECT * FROM ${table} ORDER BY ${orderByClause}`);
    if (Array.isArray(result)) {
      rows = result;
    } else if (result && Array.isArray(result.rows)) {
      rows = result.rows;
    } else {
      console.warn(`[Neon] Unexpected result type for ${collection}:`, typeof result, Object.keys(result || {}));
      rows = [];
    }
  } catch (e: any) {
    console.error(`[Neon] sql.query failed for ${collection}:`, e.message);
    throw e;
  }
  const mapper = ROW_MAPPER[collection];
  const docs = rows.map((row: any) => new NeonDocSnapshot(row.id, mapper ? mapper(row) : row, wrapDocRef(safeFirebaseDoc(collection, row.id), collection)));
  return new NeonQuerySnapshot(docs);
}

// Simple where filter: supports a single .where('field', '==', value) chain
async function neonWhereGet(
  collection: string,
  filters: Array<{ field: string; op: string; value: any }>
): Promise<NeonQuerySnapshot> {
  const sql = getMainDb();
  const table = neonTable(collection);
  
  // Build dynamic query
  let query = `SELECT * FROM ${table}`;
  const params: any[] = [];
  let paramIndex = 1;
  
  let hasWhere = false;
  for (const filter of filters) {
    if (filter.op === '==' || filter.op === '===') {
      const col = mapFieldName(collection, filter.field);
      query += hasWhere ? ` AND ${col} = $${paramIndex++}` : ` WHERE ${col} = $${paramIndex++}`;
      params.push(filter.value);
      hasWhere = true;
    }
    if (filter.op === 'in' && Array.isArray(filter.value)) {
      const col = mapFieldName(collection, filter.field);
      const placeholders = filter.value.map(() => `$${paramIndex++}`).join(', ');
      query += hasWhere ? ` AND ${col} IN (${placeholders})` : ` WHERE ${col} IN (${placeholders})`;
      params.push(...filter.value);
      hasWhere = true;
    }
    if (filter.op === 'array-contains') {
      // For array fields stored in raw_data JSONB, use the @> operator
      // e.g. raw_data->'seasons' @> '["SSPSLS18"]'
      const col = mapFieldName(collection, filter.field);
      // Try raw_data->field first (for JSONB arrays stored in raw_data)
      query += hasWhere
        ? ` AND (raw_data->>'${filter.field}' IS NOT NULL AND raw_data->'${filter.field}' @> $${paramIndex++}::jsonb)`
        : ` WHERE (raw_data->>'${filter.field}' IS NOT NULL AND raw_data->'${filter.field}' @> $${paramIndex++}::jsonb)`;
      params.push(JSON.stringify([filter.value]));
      hasWhere = true;
    }
  }
  
  // Add ordering
  if (collection === 'seasons') query += ' ORDER BY created_at DESC';
  else if (collection === 'teams') query += ' ORDER BY team_name ASC';
  else if (collection === 'team_seasons') query += ' ORDER BY joined_at DESC';
  else if (collection === 'realplayers' || collection === 'realplayer') query += ' ORDER BY name ASC';
  else if (collection === 'transactions') query += ' ORDER BY created_at DESC';
  else if (collection === 'categories') query += ' ORDER BY sort_order ASC, name ASC';
  else query += ' ORDER BY created_at DESC';
  
  let rows: any[];
  try {
    const result = await sql.query(query, params);
    if (Array.isArray(result)) {
      rows = result;
    } else if (result && Array.isArray(result.rows)) {
      rows = result.rows;
    } else {
      console.warn(`[Neon] Unexpected where result type for ${collection}:`, typeof result, Object.keys(result || {}));
      rows = [];
    }
  } catch (e: any) {
    console.error(`[Neon] sql.query(where) failed for ${collection}:`, e.message);
    throw e;
  }
  const mapper = ROW_MAPPER[collection];
  const docs = rows.map((row: any) => new NeonDocSnapshot(row.id, mapper ? mapper(row) : row, wrapDocRef(safeFirebaseDoc(collection, row.id), collection)));
  return new NeonQuerySnapshot(docs);
}

// Map Firestore field names to Neon column names
function mapFieldName(collection: string, field: string): string {
  const COMMON_MAP: Record<string, string> = {
    isActive: 'is_active', season_id: 'season_id', team_id: 'team_id',
    created_at: 'created_at', updated_at: 'updated_at',
    is_active: 'is_active', is_registered: 'is_registered',
    category_id: 'category_id', player_id: 'player_id',
  };
  
  if (collection === 'seasons') {
    const map: Record<string, string> = {
      ...COMMON_MAP,
      registrationOpen: 'registration_open',
      totalTeams: 'total_teams', totalRounds: 'total_rounds',
      purseAmount: 'purse_amount', maxPlayersPerTeam: 'max_players_per_team',
      season_number: 'season_number',
    };
    return map[field] || field;
  }
  if (collection === 'teams') {
    const map: Record<string, string> = {
      ...COMMON_MAP,
      team_name: 'team_name', team_code: 'team_code',
      owner_uid: 'owner_uid',
    };
    return map[field] || field;
  }
  if (collection === 'team_seasons') {
    const map: Record<string, string> = {
      ...COMMON_MAP,
      user_id: 'user_id', status: 'status', team_code: 'team_code',
    };
    return map[field] || field;
  }
  if (collection === 'realplayers' || collection === 'realplayer') {
    const map: Record<string, string> = {
      ...COMMON_MAP,
      display_name: 'display_name', is_available: 'is_available',
    };
    return map[field] || field;
  }
  if (collection === 'transactions') {
    const map: Record<string, string> = {
      ...COMMON_MAP,
      transaction_type: 'type',
      currency_type: 'currency',
      reference_id: 'reference_id', reference_type: 'reference_type',
      player_id: 'player_id', player_name: 'player_name',
    };
    return map[field] || field;
  }
  return field;
}

// Known columns for Neon tables to prevent inserting invalid column names
const TABLE_COLUMNS: Record<string, Set<string>> = {
  transactions: new Set([
    'id', 'amount', 'balance_after', 'raw_data', 'created_at', 'updated_at',
    'category', 'reference_id', 'player_id', 'player_name', 'status',
    'currency', 'processed_by', 'notes', 'reference_type', 'team_id', 'season_id',
    'type', 'description'
  ]),
  player_transactions: new Set([
    'id', 'amount', 'raw_data', 'created_at', 'updated_at', 'type',
    'description', 'processed_by', 'from_team_id', 'to_team_id', 'status',
    'player_id', 'team_id', 'season_id'
  ]),
  teams: new Set([
    'id', 'updated_at', 'total_spent', 'is_active', 'players_count', 'stats',
    'real_players', 'football_players', 'football_budget', 'football_spent',
    'real_player_budget', 'real_player_spent', 'raw_data', 'created_at',
    'balance', 'initial_balance', 'team_id', 'team_name', 'team_code',
    'owner_uid', 'owner_name', 'owner_email', 'username', 'logo_url',
    'team_color', 'currency_system', 'season_id'
  ]),
  team_seasons: new Set([
    'id', 'updated_at', 'real_player_budget', 'real_player_spent', 'players_count',
    'football_players_count', 'stats', 'real_players', 'football_players',
    'dollar_balance', 'euro_balance', 'raw_data', 'joined_at', 'created_at',
    'budget', 'initial_budget', 'football_budget', 'football_spent', 'team_id',
    'team_name', 'team_code', 'season_id', 'user_id', 'username', 'team_email',
    'status', 'logo_url', 'currency_system', 'team_color'
  ]),
  seasons: new Set([
    'id', 'updated_at', 'required_real_players', 'max_football_players',
    'category_fine_amount', 'raw_data', 'created_at', 'season_number',
    'is_active', 'registration_open', 'start_date', 'end_date', 'total_teams',
    'total_rounds', 'purse_amount', 'max_players_per_team', 'dollar_budget',
    'euro_budget', 'name', 'year', 'status', 'type'
  ]),
  realplayers: new Set([
    'id', 'updated_at', 'is_registered', 'is_active', 'is_available',
    'registered_at', 'joined_date', 'stats', 'raw_data', 'created_at',
    'category_id', 'role', 'psn_id', 'xbox_id', 'steam_id', 'profile_image',
    'assigned_by', 'notes', 'player_id', 'name', 'display_name', 'email',
    'phone', 'team', 'team_id', 'season_id'
  ]),
  categories: new Set([
    'id', 'updated_at', 'max_salary', 'fine_amount', 'is_active', 'sort_order',
    'raw_data', 'created_at', 'min_players', 'max_players', 'min_salary',
    'name', 'description', 'color', 'icon', 'season_id'
  ]),
  team_cash_balances: new Set([
    'id', 'updated_at', 'total_income', 'total_expense', 'raw_data',
    'created_at', 'balance', 'initial_balance', 'team_id', 'season_id', 'currency'
  ])
};

// =====================================================
// NEON WRITE SYNC
// =====================================================

async function syncToNeon(collection: string, docId: string, data: any, operation: string) {
  if (!isMainDbAvailable()) return;
  try {
    const sql = getMainDb();
    const table = neonTable(collection);
    
    if (operation === 'delete') {
      await sql.query(`DELETE FROM ${table} WHERE id = $1`, [docId]);
      return;
    }

    // Auto-promote metadata fields if top-level fields are missing in transactions
    const enrichedData = { ...data };
    if (table === 'transactions' && data?.metadata) {
      if (!enrichedData.player_id && data.metadata.player_id) enrichedData.player_id = data.metadata.player_id;
      if (!enrichedData.player_name && data.metadata.player_name) enrichedData.player_name = data.metadata.player_name;
      if (!enrichedData.processed_by && data.metadata.processed_by) enrichedData.processed_by = data.metadata.processed_by;
    }
    
    // Auto-populate team_id and season_id for team_seasons if missing
    if (table === 'team_seasons') {
      const parts = docId.split('_');
      if (parts.length >= 2) {
        if (!enrichedData.team_id) enrichedData.team_id = parts[0];
        if (!enrichedData.season_id) enrichedData.season_id = parts.slice(1).join('_');
      }
    }

    const validCols = TABLE_COLUMNS[table];

    // For update operations, execute a direct UPDATE first
    if (operation === 'update') {
      const setClauses: string[] = [];
      const updateValues: any[] = [];
      let uIdx = 1;

      for (const [key, value] of Object.entries(enrichedData)) {
        if (value === undefined) continue;
        if (typeof value === 'function') continue;
        const col = mapFieldName(collection, key);
        if (col === 'updated_at' || col === 'id') continue;
        if (validCols && !validCols.has(col)) continue;
        if (setClauses.some(s => s.startsWith(`${col} =`))) continue;

        let valToUpdate = value;
        if (value && typeof value === 'object') {
          if ((value as any)._methodName === 'serverTimestamp' || (value as any).constructor?.name === 'FieldValue') {
            valToUpdate = new Date().toISOString();
          } else if (value instanceof Date) {
            valToUpdate = value.toISOString();
          } else {
            valToUpdate = JSON.stringify(value);
          }
        }
        setClauses.push(`${col} = $${uIdx}`);
        updateValues.push(valToUpdate);
        uIdx++;
      }

      // Merge updated fields into raw_data JSON if table has raw_data
      if (!validCols || validCols.has('raw_data')) {
        setClauses.push(`raw_data = COALESCE(raw_data, '{}'::jsonb) || $${uIdx}::jsonb`);
        updateValues.push(JSON.stringify(data));
        uIdx++;
      }

      setClauses.push(`updated_at = NOW()`);
      updateValues.push(docId);

      const updateQuery = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = $${uIdx}`;
      const updateResult: any = await sql.query(updateQuery, updateValues);

      const rowsAffected = updateResult?.rowCount ?? (Array.isArray(updateResult) ? updateResult.length : 0);
      if (rowsAffected > 0) {
        return;
      }
      // If row did not exist yet, fall through to INSERT
    }

    // Generic upsert: store all fields + raw_data, use COALESCE on conflict
    // Collect non-null columns from data + id + raw_data + timestamps
    const columns: string[] = ['id'];
    const placeholders: string[] = ['$1'];
    const values: any[] = [docId];
    let idx = 2;
    
    for (const [key, value] of Object.entries(enrichedData)) {
      if (value === undefined) continue;
      // Skip functions and complex objects that aren't JSON-serializable
      if (typeof value === 'function') continue;
      const col = mapFieldName(collection, key);
      if (col === 'updated_at') continue;
      // Only include column if it exists in the table schema
      if (validCols && !validCols.has(col)) continue;
      // Skip if column already added
      if (columns.includes(col)) continue;
      columns.push(col);
      placeholders.push(`$${idx}`);
      let valToInsert = value;
      if (value && typeof value === 'object') {
        if ((value as any)._methodName === 'serverTimestamp' || (value as any).constructor?.name === 'FieldValue') {
          valToInsert = new Date().toISOString();
        } else if (value instanceof Date) {
          valToInsert = value.toISOString();
        } else {
          valToInsert = JSON.stringify(value);
        }
      }
      values.push(valToInsert);
      idx++;
    }
    
    // Always include raw_data and updated_at
    if (!columns.includes('raw_data')) {
      columns.push('raw_data');
      placeholders.push(`$${idx}`);
      values.push(JSON.stringify(data));
      idx++;
    }
    if (!columns.includes('updated_at')) {
      columns.push('updated_at');
      placeholders.push('NOW()');
    }
    
    const colList = columns.join(', ');
    const phList = placeholders.join(', ');
    
    // Build UPDATE clause for ON CONFLICT — update all non-id columns
    const updateClauses = columns
      .filter(c => c !== 'id' && c !== 'updated_at')
      .map(c => `${c} = COALESCE(EXCLUDED.${c}, ${table}.${c})`)
      .join(', ');
    
    await sql.query(
      `INSERT INTO ${table} (${colList}) VALUES (${phList})
       ON CONFLICT (id) DO UPDATE SET ${updateClauses}, updated_at = NOW()`,
      values
    );
  } catch (e: any) {
    console.warn(`⚠️ Neon syncToNeon(${collection}/${docId}) failed:`, e.message);
  }
}

// =====================================================
// PROXY WRAPPERS
// =====================================================

function wrapDocRef(ref: any, collection: string): any {
  const originalSet = ref.set.bind(ref);
  const originalUpdate = ref.update.bind(ref);
  const originalDelete = ref.delete.bind(ref);
  const originalGet = ref.get.bind(ref);

  return new Proxy(ref, {
    get(target, prop) {
      if (prop === 'id') return target.id;
      if (prop === 'path') return target.path;
      if (prop === 'parent') return target.parent;
      if (prop === 'firestore') return target.firestore;
      
      if (prop === 'get') {
        return async () => {
          if (isMainDbAvailable()) {
            return await neonDocGet(collection, target.id);
          }
          throw new Error(`Neon DB not available for doc.get(${collection}/${target.id})`);
        };
      }
      
      if (prop === 'set') {
        return async (data: any, options?: any) => {
          // Neon-only write (skip Firebase)
          await syncToNeon(collection, target.id, data, 'set');
          return { id: target.id };
        };
      }
      
      if (prop === 'update') {
        return async (data: any) => {
          // Neon-only write (skip Firebase)
          await syncToNeon(collection, target.id, data, 'update');
          return {};
        };
      }
      
      if (prop === 'delete') {
        return async () => {
          // Neon-only delete (skip Firebase)
          await syncToNeon(collection, target.id, null, 'delete');
          return {};
        };
      }
      
      return (target as any)[prop];
    }
  });
}

function wrapQuery(queryRef: any, collection: string, filters: Array<{ field: string; op: string; value: any }> = []): any {
  const originalGet = queryRef.get.bind(queryRef);
  const originalWhere = queryRef.where.bind(queryRef);
  const originalOrderBy = queryRef.orderBy?.bind(queryRef);
  const originalLimit = queryRef.limit?.bind(queryRef);

  return new Proxy(queryRef, {
    get(target, prop) {
      if (prop === 'get') {
        return async () => {
          if (isMainDbAvailable() && filters.length > 0) {
            return await neonWhereGet(collection, filters);
          }
          if (isMainDbAvailable() && filters.length === 0) {
            return await neonCollectionGet(collection);
          }
          throw new Error(`Neon DB not available for query.get(${collection})`);
        };
      }
      
      if (prop === 'where') {
        return (field: string, op: string, value: any) => {
          const newFilters = [...filters, { field, op, value }];
          const newQuery = originalWhere(field, op, value);
          return wrapQuery(newQuery, collection, newFilters);
        };
      }
      
      if (prop === 'orderBy') {
        return (field: string, direction?: string) => {
          if (originalOrderBy) {
            return wrapQuery(originalOrderBy(field, direction), collection, filters);
          }
          return target;
        };
      }
      
      if (prop === 'limit') {
        return (count: number) => {
          if (originalLimit) {
            return wrapQuery(originalLimit(count), collection, filters);
          }
          return target;
        };
      }
      
      return (target as any)[prop];
    }
  });
}

function wrapCollectionRef(ref: any, collection: string): any {
  return new Proxy(ref, {
    get(target, prop) {
      if (prop === 'doc') {
        return (id?: string) => {
          const docRef = (id && typeof id === 'string' && id.trim() !== '') ? target.doc(id) : target.doc();
          return wrapDocRef(docRef, collection);
        };
      }
      if (prop === 'add') {
        return async (data: any) => {
          const docRef = target.doc();
          const docId = docRef.id;
          await syncToNeon(collection, docId, data, 'set');
          return wrapDocRef(docRef, collection);
        };
      }
      if (prop === 'get') {
        return async () => {
          if (isMainDbAvailable()) {
            return await neonCollectionGet(collection);
          }
          throw new Error(`Neon DB not available for collection.get(${collection})`);
        };
      }
      if (prop === 'where') {
        return (field: string, op: string, value: any) => {
          const queryRef = target.where(field, op, value);
          return wrapQuery(queryRef, collection, [{ field, op, value }]);
        };
      }
      if (prop === 'orderBy') {
        return (field: string, direction?: string) => {
          return wrapQuery(target.orderBy(field, direction), collection);
        };
      }
      return (target as any)[prop];
    }
  });
}

// =====================================================
// THE WRAPPED adminDb EXPORT
// =====================================================

export const adminDb = new Proxy(firebaseAdminDb, {
  get(target, prop) {
    if (prop === 'collection') {
      return (name: string) => {
        const ref = (target as any).collection(name);
        if (NEON_COLLECTIONS.has(name)) {
          return wrapCollectionRef(ref, name);
        }
        return ref;
      };
    }
    if (prop === 'doc') {
      return (path?: string) => {
        if (!path || typeof path !== 'string' || path.trim() === '') {
          return wrapDocRef((target as any).doc(), 'unknown');
        }
        const parts = path.split('/');
        if (parts.length === 2 && NEON_COLLECTIONS.has(parts[0])) {
          const collection = parts[0];
          const docId = parts[1];
          const docRef = (docId && docId.trim() !== '') ? (target as any).doc(path) : (target as any).doc(`${collection}/temp_placeholder`);
          return wrapDocRef(docRef, collection);
        }
        return (target as any).doc(path);
      };
    }
    // Pass through all other properties (auth, etc.)
    return (target as any)[prop];
  }
});
