/**
 * POST /api/migrate/setup-phase2
 * Creates the Phase 2 Neon tables (realplayers, categories, transactions, etc.)
 * Run this once from your browser console.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';

export async function POST(request: NextRequest) {
  try {
    if (!isMainDbAvailable()) {
      return NextResponse.json({ success: false, error: 'Neon not configured' }, { status: 500 });
    }

    const sql = getMainDb();
    const results: string[] = [];
    console.log('🔧 Phase 2: Creating Neon tables...');

    // Create tables one by one
    const statements = [
      `CREATE TABLE IF NOT EXISTS categories (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        color VARCHAR(50),
        icon VARCHAR(100),
        min_players INTEGER DEFAULT 0,
        max_players INTEGER DEFAULT 0,
        min_salary INTEGER DEFAULT 0,
        max_salary INTEGER DEFAULT 0,
        fine_amount NUMERIC DEFAULT 0,
        season_id VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS realplayers (
        id VARCHAR(255) PRIMARY KEY,
        player_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        team VARCHAR(255),
        team_id VARCHAR(255),
        season_id VARCHAR(255),
        category_id VARCHAR(255),
        role VARCHAR(50) DEFAULT 'player',
        is_registered BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        is_available BOOLEAN DEFAULT true,
        registered_at TIMESTAMP,
        joined_date TIMESTAMP,
        assigned_by VARCHAR(255),
        notes TEXT,
        psn_id VARCHAR(255),
        xbox_id VARCHAR(255),
        steam_id VARCHAR(255),
        profile_image TEXT,
        stats JSONB DEFAULT '{}',
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS player_season_stats (
        id VARCHAR(255) PRIMARY KEY,
        player_id VARCHAR(255) NOT NULL,
        season_id VARCHAR(255) NOT NULL,
        team_id VARCHAR(255),
        matches_played INTEGER DEFAULT 0,
        matches_won INTEGER DEFAULT 0,
        matches_lost INTEGER DEFAULT 0,
        matches_drawn INTEGER DEFAULT 0,
        goals_scored INTEGER DEFAULT 0,
        assists INTEGER DEFAULT 0,
        clean_sheets INTEGER DEFAULT 0,
        man_of_the_match INTEGER DEFAULT 0,
        yellow_cards INTEGER DEFAULT 0,
        red_cards INTEGER DEFAULT 0,
        points INTEGER DEFAULT 0,
        win_rate NUMERIC DEFAULT 0,
        total_salary NUMERIC DEFAULT 0,
        stats JSONB DEFAULT '{}',
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(255) PRIMARY KEY,
        team_id VARCHAR(255),
        season_id VARCHAR(255),
        type VARCHAR(100),
        amount NUMERIC DEFAULT 0,
        balance_after NUMERIC DEFAULT 0,
        description TEXT,
        category VARCHAR(100),
        reference_id VARCHAR(255),
        reference_type VARCHAR(100),
        player_id VARCHAR(255),
        player_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'completed',
        currency VARCHAR(10) DEFAULT 'single',
        processed_by VARCHAR(255),
        notes TEXT,
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS player_transactions (
        id VARCHAR(255) PRIMARY KEY,
        player_id VARCHAR(255),
        team_id VARCHAR(255),
        season_id VARCHAR(255),
        type VARCHAR(100),
        amount NUMERIC DEFAULT 0,
        description TEXT,
        status VARCHAR(50) DEFAULT 'completed',
        processed_by VARCHAR(255),
        from_team_id VARCHAR(255),
        to_team_id VARCHAR(255),
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS team_cash_balances (
        id VARCHAR(255) PRIMARY KEY,
        team_id VARCHAR(255),
        season_id VARCHAR(255),
        balance NUMERIC DEFAULT 0,
        initial_balance NUMERIC DEFAULT 0,
        total_income NUMERIC DEFAULT 0,
        total_expense NUMERIC DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'single',
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      // Indexes
      `CREATE INDEX IF NOT EXISTS idx_realplayers_team_id ON realplayers(team_id)`,
      `CREATE INDEX IF NOT EXISTS idx_realplayers_season_id ON realplayers(season_id)`,
      `CREATE INDEX IF NOT EXISTS idx_realplayers_category_id ON realplayers(category_id)`,
      `CREATE INDEX IF NOT EXISTS idx_realplayers_is_registered ON realplayers(is_registered)`,
      `CREATE INDEX IF NOT EXISTS idx_realplayers_player_id ON realplayers(player_id)`,
      `CREATE INDEX IF NOT EXISTS idx_categories_season_id ON categories(season_id)`,
      `CREATE INDEX IF NOT EXISTS idx_pss_player_id ON player_season_stats(player_id)`,
      `CREATE INDEX IF NOT EXISTS idx_pss_season_id ON player_season_stats(season_id)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_team_id ON transactions(team_id)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_season_id ON transactions(season_id)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_player_id ON transactions(player_id)`,
      `CREATE INDEX IF NOT EXISTS idx_player_tx_player_id ON player_transactions(player_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tcb_team_id ON team_cash_balances(team_id)`,
      // Triggers
      `CREATE OR REPLACE FUNCTION update_updated_at_column()
       RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ language 'plpgsql'`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_realplayers_updated_at') THEN
         CREATE TRIGGER update_realplayers_updated_at BEFORE UPDATE ON realplayers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_categories_updated_at') THEN
         CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_player_season_stats_updated_at') THEN
         CREATE TRIGGER update_player_season_stats_updated_at BEFORE UPDATE ON player_season_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_transactions_updated_at') THEN
         CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_player_transactions_updated_at') THEN
         CREATE TRIGGER update_player_transactions_updated_at BEFORE UPDATE ON player_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); END IF; END $$`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_team_cash_balances_updated_at') THEN
         CREATE TRIGGER update_team_cash_balances_updated_at BEFORE UPDATE ON team_cash_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); END IF; END $$`,
    ];

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const stmtPreview = stmt.substring(0, 80).replace(/\s+/g, ' ');
      try {
        await sql.query(stmt);
        console.log(`✅ [${i+1}/${statements.length}] ${stmtPreview}...`);
        results.push(`✅ OK: ${stmtPreview}`);
      } catch (e: any) {
        if (e.message?.includes('already exists')) {
          results.push(`✅ Already exists: ${stmtPreview}`);
        } else {
          console.error(`❌ [${i+1}/${statements.length}] ${stmtPreview}: ${e.message}`);
          results.push(`❌ ${e.message?.substring(0, 100)}: ${stmtPreview}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Phase 2 schema setup completed',
      results,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
