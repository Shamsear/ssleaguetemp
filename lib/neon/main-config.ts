/**
 * Neon Database Configuration - Main Database
 * 
 * Used for: seasons, teams, team_seasons, categories
 * These are the high-read Firebase collections being migrated to Neon.
 * 
 * Firebase remains the source of truth for WRITES during transition.
 * Neon handles READS to eliminate Firebase read costs.
 */

import { neon } from '@neondatabase/serverless';

const connectionString = process.env.NEON_MAIN_DB_URL;

if (!connectionString) {
  console.error(
    '❌ NEON_MAIN_DB_URL environment variable is not set. ' +
    'Please add it to your .env.local file.'
  );
}

// SQL query function for the main database
export const mainSql = connectionString ? neon(connectionString, {
  connectionTimeout: 30000,
} as any) as any : null;

// Type-safe check
export function isMainDbAvailable(): boolean {
  return mainSql !== null;
}

// Get SQL function or throw
export function getMainDb(): any {
  if (!mainSql) {
    throw new Error('Main database not configured. Check NEON_MAIN_DB_URL.');
  }
  return mainSql;
}

// Test connection
export async function testMainDbConnection(): Promise<boolean> {
  try {
    if (!mainSql) return false;
    const result = await mainSql`SELECT NOW() as time`;
    console.log('✅ Main DB connection successful:', result[0]?.time);
    return true;
  } catch (error) {
    console.error('❌ Main DB connection failed:', error);
    return false;
  }
}
