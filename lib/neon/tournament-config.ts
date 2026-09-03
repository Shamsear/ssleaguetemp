/**
 * Neon Database Configuration - Tournament System
 * 
 * This database handles:
 * - Fixtures and matches
 * - Player statistics
 * - Team statistics
 * - Leaderboards
 * - Match days
 * - Tournament settings
 */

import { neon } from '@neondatabase/serverless';

const connectionString = process.env.NEON_TOURNAMENT_DB_URL || process.env.FANTASY_DATABASE_URL || 'postgresql://neondb_owner:npg_K1IGoDtlkPA3@ep-silent-sun-a1hf5mn7-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

// Create SQL query executor for tournament database with increased timeout
// Neon free tier has cold starts that can take 5-15 seconds
export const tournamentSql = neon(connectionString, {
  connectionTimeout: 30000,
  fetchOptions: {
    cache: 'no-store', // Prevent caching issues
  },
} as any) as any;

// Type-safe check for tournament database availability
export function isTournamentDbAvailable(): boolean {
  return tournamentSql !== null;
}

// Get tournament database or throw error
export function getTournamentDb(): any {
  if (!tournamentSql) {
    throw new Error('Tournament database not configured. Check NEON_TOURNAMENT_DB_URL.');
  }
  return tournamentSql;
}
