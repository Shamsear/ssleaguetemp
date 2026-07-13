import { neon } from '@neondatabase/serverless';

// Fallback to active DB if no separate temp DB is specified yet
const tempConnectionString = process.env.TEMP_DATABASE_URL || process.env.NEON_DATABASE_URL || '';

if (!tempConnectionString) {
  console.error('❌ Neither TEMP_DATABASE_URL nor NEON_DATABASE_URL is configured in environment.');
}

export const tempSql = neon(tempConnectionString) as any;

/**
 * Initialize temp table in the temp database if it does not exist
 */
export async function initializeTempTable() {
  try {
    await tempSql.query(`
      CREATE TABLE IF NOT EXISTS temp_players_import (
        player_id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        position VARCHAR(50),
        team_name VARCHAR(255),
        nationality VARCHAR(100),
        age INTEGER,
        playing_style VARCHAR(50),
        overall_rating INTEGER,
        
        -- Abilities
        offensive_awareness INTEGER DEFAULT 0,
        ball_control INTEGER DEFAULT 0,
        dribbling INTEGER DEFAULT 0,
        tight_possession INTEGER DEFAULT 0,
        low_pass INTEGER DEFAULT 0,
        lofted_pass INTEGER DEFAULT 0,
        finishing INTEGER DEFAULT 0,
        heading INTEGER DEFAULT 0,
        set_piece_taking INTEGER DEFAULT 0,
        curl INTEGER DEFAULT 0,
        speed INTEGER DEFAULT 0,
        acceleration INTEGER DEFAULT 0,
        kicking_power INTEGER DEFAULT 0,
        jumping INTEGER DEFAULT 0,
        physical_contact INTEGER DEFAULT 0,
        balance INTEGER DEFAULT 0,
        stamina INTEGER DEFAULT 0,
        defensive_awareness INTEGER DEFAULT 0,
        tackling INTEGER DEFAULT 0,
        aggression INTEGER DEFAULT 0,
        defensive_engagement INTEGER DEFAULT 0,
        gk_awareness INTEGER DEFAULT 0,
        gk_catching INTEGER DEFAULT 0,
        gk_parrying INTEGER DEFAULT 0,
        gk_reflexes INTEGER DEFAULT 0,
        gk_reach INTEGER DEFAULT 0,
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      )
    `);
    console.log('✅ Temporary players import table is ready.');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize temporary table:', error);
    return false;
  }
}
