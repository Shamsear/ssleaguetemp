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
  realplayerstats: 'player_season_stats',
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
  private _data: any;
  
  constructor(id: string, data: any) {
    this.id = id;
    this.exists = data !== null && data !== undefined;
    this._data = data;
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
    football_budget: row.football_budget,
    football_spent: row.football_spent,
    real_player_budget: row.real_player_budget,
    real_player_spent: row.real_player_spent,
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
    joined_at: row.joined_at,
    ...(typeof row.raw_data === 'object' && row.raw_data !== null ? row.raw_data : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapRealPlayerRow(row: any): Record<string, any> {
  const stats = typeof row.stats === 'string' ? JSON.parse(row.stats) : (row.stats || {});
  return {
    player_id: row.player_id || row.id,
    name: row.name,
    display_name: row.display_name,
    email: row.email,
    phone: row.phone,
    team: row.team,
    team_id: row.team_id,
    season_id: row.season_id,
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
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
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

const ROW_MAPPER: Record<string, (row: any) => Record<string, any>> = {
  seasons: mapSeasonRow,
  teams: mapTeamRow,
  team_seasons: mapTeamSeasonRow,
  realplayers: mapRealPlayerRow,
  realplayer: mapRealPlayerRow,
  categories: mapCategoryRow,
  transactions: mapTransactionRow,
  realplayerstats: mapPlayerSeasonStatsRow,
};

// =====================================================
// NEON QUERY EXECUTOR
// =====================================================

async function neonDocGet(collection: string, docId: string): Promise<NeonDocSnapshot> {
  const sql = getMainDb();
  const table = neonTable(collection);
  // Use sql.query() for parameterized queries (neon() tagged template can't use $1 placeholders)
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
  if (!rows.length) return new NeonDocSnapshot(docId, undefined);
  const mapper = ROW_MAPPER[collection];
  return new NeonDocSnapshot(docId, mapper ? mapper(rows[0]) : rows[0]);
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
  const docs = rows.map((row: any) => new NeonDocSnapshot(row.id, mapper ? mapper(row) : row));
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
  const docs = rows.map((row: any) => new NeonDocSnapshot(row.id, mapper ? mapper(row) : row));
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
      reference_id: 'reference_id', reference_type: 'reference_type',
      player_id: 'player_id', player_name: 'player_name',
    };
    return map[field] || field;
  }
  return field;
}

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
    
    // Generic upsert: store all fields + raw_data, use COALESCE on conflict
    // Collect non-null columns from data + id + raw_data + timestamps
    const columns: string[] = ['id'];
    const placeholders: string[] = ['$1'];
    const values: any[] = [docId];
    let idx = 2;
    
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      // Skip functions and complex objects that aren't JSON-serializable
      if (typeof value === 'function') continue;
      const col = mapFieldName(collection, key);
      // Skip if column already added
      if (columns.includes(col)) continue;
      columns.push(col);
      placeholders.push(`$${idx}`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      idx++;
    }
    
    // Always include raw_data and updated_at
    if (!columns.includes('raw_data')) {
      columns.push('raw_data');
      placeholders.push(`$${idx}`);
      values.push(JSON.stringify(data));
      idx++;
    }
    columns.push('updated_at');
      placeholders.push('NOW()');
    
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
            try {
              return await neonDocGet(collection, target.id);
            } catch (e: any) {
              console.warn(`⚠️ Neon doc.get(${collection}/${target.id}) failed, falling back to Firebase:`, e.message);
              return await originalGet();
            }
          }
          return await originalGet();
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
            try {
              return await neonWhereGet(collection, filters);
            } catch (e: any) {
              console.warn(`⚠️ Neon query.get(${collection}) failed, falling back to Firebase:`, e.message);
              return await originalGet();
            }
          }
          if (isMainDbAvailable() && filters.length === 0) {
            try {
              return await neonCollectionGet(collection);
            } catch (e: any) {
              console.warn(`⚠️ Neon collection.get(${collection}) failed, falling back to Firebase:`, e.message);
              return await originalGet();
            }
          }
          return await originalGet();
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
          const docRef = target.doc(id);
          return wrapDocRef(docRef, collection);
        };
      }
      if (prop === 'get') {
        return async () => {
          if (isMainDbAvailable()) {
            try {
              return await neonCollectionGet(collection);
            } catch (e: any) {
              console.warn(`⚠️ Neon collection.get(${collection}) failed, falling back to Firebase:`, e.message);
              return await target.get();
            }
          }
          return await target.get();
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
    // Pass through all other properties (auth, etc.)
    return (target as any)[prop];
  }
});
