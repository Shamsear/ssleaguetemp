/**
 * Migration API: Firebase → Neon
 * 
 * POST /api/migrate/firebase-to-neon
 * 
 * Migrates seasons and teams from Firebase Firestore to Neon PostgreSQL.
 * Run this once to seed Neon, then keep them in sync via dual-write.
 * 
 * Body: { collections: ['seasons', 'teams'] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';

export async function POST(request: NextRequest) {
  try {
    if (!isMainDbAvailable()) {
      return NextResponse.json(
        { success: false, error: 'Neon database not configured. Check NEON_MAIN_DB_URL.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { collections } = body;

    if (!collections || !Array.isArray(collections)) {
      return NextResponse.json(
        { success: false, error: 'Provide collections array, e.g. ["seasons", "teams"]' },
        { status: 400 }
      );
    }

    const results: Record<string, any> = {};
    const sql = getMainDb();

    // Check which tables exist
    console.log('📋 Checking Neon tables...');
    try {
      const tablesCheck = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
      const existingTables = tablesCheck.map((r: any) => r.table_name);
      console.log('📋 Existing Neon tables:', existingTables.join(', '));
      results.existing_tables = existingTables;
    } catch (e: any) {
      console.warn('⚠️ Could not check tables:', e.message);
      results.existing_tables = 'check failed: ' + e.message;
    }

    // ---- Migrate Seasons ----
    if (collections.includes('seasons')) {
      console.log('🔄 Migrating seasons from Firebase to Neon...');
      const seasonsSnapshot = await adminDb.collection('seasons').get();
      console.log(`📋 Found ${seasonsSnapshot.size} seasons in Firebase`);
      
      let migrated = 0;
      let errors = 0;

      for (const doc of seasonsSnapshot.docs) {
        try {
          const data = doc.data();
          const seasonId = doc.id;

          await sql`
            INSERT INTO seasons (
              id, name, year, season_number, type, is_active, status,
              registration_open, start_date, end_date, total_teams, total_rounds,
              purse_amount, max_players_per_team, dollar_budget, euro_budget,
              required_real_players, max_football_players, category_fine_amount,
              raw_data, created_at, updated_at
            ) VALUES (
              ${seasonId},
              ${data.name || null},
              ${data.year || null},
              ${data.season_number || null},
              ${data.type || 'single'},
              ${data.isActive || false},
              ${data.status || 'draft'},
              ${data.registrationOpen || false},
              ${data.startDate?.toDate?.() ? data.startDate.toDate().toISOString() : (data.startDate || null)},
              ${data.endDate?.toDate?.() ? data.endDate.toDate().toISOString() : (data.endDate || null)},
              ${data.totalTeams || 0},
              ${data.totalRounds || 0},
              ${data.purseAmount || 0},
              ${data.maxPlayersPerTeam || 11},
              ${data.dollar_budget || null},
              ${data.euro_budget || null},
              ${data.required_real_players || null},
              ${data.max_football_players || null},
              ${data.category_fine_amount || null},
              ${JSON.stringify(data)},
              ${data.created_at?.toDate?.() ? data.created_at.toDate().toISOString() : new Date().toISOString()},
              ${data.updated_at?.toDate?.() ? data.updated_at.toDate().toISOString() : new Date().toISOString()}
            )
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              year = EXCLUDED.year,
              season_number = EXCLUDED.season_number,
              type = EXCLUDED.type,
              is_active = EXCLUDED.is_active,
              status = EXCLUDED.status,
              registration_open = EXCLUDED.registration_open,
              start_date = EXCLUDED.start_date,
              end_date = EXCLUDED.end_date,
              total_teams = EXCLUDED.total_teams,
              total_rounds = EXCLUDED.total_rounds,
              purse_amount = EXCLUDED.purse_amount,
              max_players_per_team = EXCLUDED.max_players_per_team,
              dollar_budget = EXCLUDED.dollar_budget,
              euro_budget = EXCLUDED.euro_budget,
              required_real_players = EXCLUDED.required_real_players,
              max_football_players = EXCLUDED.max_football_players,
              category_fine_amount = EXCLUDED.category_fine_amount,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW()
          `;
          migrated++;
        } catch (error: any) {
          console.error(`❌ Error migrating season ${doc.id}:`, error.message);
          errors++;
        }
      }

      results.seasons = {
        total_in_firebase: seasonsSnapshot.size,
        migrated,
        errors,
      };
      console.log(`✅ Seasons: ${migrated} migrated, ${errors} errors`);
    }

    // ---- Migrate Teams ----
    if (collections.includes('teams')) {
      console.log('🔄 Migrating teams from Firebase to Neon...');
      const teamsSnapshot = await adminDb.collection('teams').get();
      console.log(`📋 Found ${teamsSnapshot.size} teams in Firebase`);
      
      let migrated = 0;
      let errors = 0;

      for (const doc of teamsSnapshot.docs) {
        try {
          const data = doc.data();
          const teamId = doc.id;
          const logoUrl = data.logo_url || data.team_logo || data.logo || null;

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
              ${logoUrl},
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
              ${data.created_at?.toDate?.() ? data.created_at.toDate().toISOString() : new Date().toISOString()},
              ${data.updated_at?.toDate?.() ? data.updated_at.toDate().toISOString() : new Date().toISOString()}
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
              is_active = EXCLUDED.is_active,
              logo_url = EXCLUDED.logo_url,
              team_color = EXCLUDED.team_color,
              players_count = EXCLUDED.players_count,
              stats = EXCLUDED.stats,
              real_players = EXCLUDED.real_players,
              football_players = EXCLUDED.football_players,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW()
          `;
          migrated++;
        } catch (error: any) {
          console.error(`❌ Error migrating team ${doc.id}:`, error.message);
          errors++;
        }
      }

      results.teams = {
        total_in_firebase: teamsSnapshot.size,
        migrated,
        errors,
      };
      console.log(`✅ Teams: ${migrated} migrated, ${errors} errors`);
    }

    // ---- Migrate Team Seasons ----
    if (collections.includes('team_seasons')) {
      console.log('🔄 Migrating team_seasons from Firebase to Neon...');
      const teamSeasonsSnapshot = await adminDb.collection('team_seasons').get();
      console.log(`📋 Found ${teamSeasonsSnapshot.size} team_seasons in Firebase`);
      
      let migrated = 0;
      let errors = 0;

      for (const doc of teamSeasonsSnapshot.docs) {
        try {
          const data = doc.data();
          const docId = doc.id;
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
              ${data.joined_at?.toDate?.() ? data.joined_at.toDate().toISOString() : new Date().toISOString()},
              ${data.created_at?.toDate?.() ? data.created_at.toDate().toISOString() : new Date().toISOString()},
              ${data.updated_at?.toDate?.() ? data.updated_at.toDate().toISOString() : new Date().toISOString()}
            )
            ON CONFLICT (id) DO UPDATE SET
              team_name = EXCLUDED.team_name,
              status = EXCLUDED.status,
              budget = EXCLUDED.budget,
              initial_budget = EXCLUDED.initial_budget,
              players_count = EXCLUDED.players_count,
              stats = EXCLUDED.stats,
              real_players = EXCLUDED.real_players,
              football_players = EXCLUDED.football_players,
              logo_url = EXCLUDED.logo_url,
              updated_at = NOW()
          `;
          migrated++;
        } catch (error: any) {
          console.error(`❌ Error migrating team_season ${doc.id}:`, error.message);
          errors++;
        }
      }

      results.team_seasons = {
        total_in_firebase: teamSeasonsSnapshot.size,
        migrated,
        errors,
      };
      console.log(`✅ Team Seasons: ${migrated} migrated, ${errors} errors`);
    }

    // ---- Migrate Real Players ----
    if (collections.includes('realplayers')) {
      console.log('🔄 Migrating realplayers from Firebase to Neon...');
      const snapshot = await adminDb.collection('realplayers').get();
      console.log(`📋 Found ${snapshot.size} realplayers in Firebase`);
      let migrated = 0;
      let errors = 0;
      for (const doc of snapshot.docs) {
        try {
          const data = doc.data();
          const pid = doc.id;
          await sql`
            INSERT INTO realplayers (
              id, player_id, name, display_name, email, phone, team, team_id,
              season_id, category_id, role, is_registered, is_active, is_available,
              registered_at, joined_date, assigned_by, notes, psn_id, xbox_id, steam_id,
              profile_image, stats, raw_data, created_at, updated_at
            ) VALUES (
              ${pid}, ${data.player_id || pid}, ${data.name || ''}, ${data.display_name || null},
              ${data.email || null}, ${data.phone || null}, ${data.team || null}, ${data.team_id || null},
              ${data.season_id || null}, ${data.category_id || null}, ${data.role || 'player'},
              ${data.is_registered || false}, ${data.is_active !== false}, ${data.is_available !== false},
              ${data.registered_at?.toDate?.() ? data.registered_at.toDate().toISOString() : (data.registered_at || null)},
              ${data.joined_date?.toDate?.() ? data.joined_date.toDate().toISOString() : (data.joined_date || null)},
              ${data.assigned_by || null}, ${data.notes || null},
              ${data.psn_id || null}, ${data.xbox_id || null}, ${data.steam_id || null},
              ${data.profile_image || null}, ${JSON.stringify(data.stats || {})},
              ${JSON.stringify(data)},
              ${data.created_at?.toDate?.() ? data.created_at.toDate().toISOString() : new Date().toISOString()},
              ${data.updated_at?.toDate?.() ? data.updated_at.toDate().toISOString() : new Date().toISOString()}
            )
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name, display_name = EXCLUDED.display_name,
              team_id = EXCLUDED.team_id, season_id = EXCLUDED.season_id,
              category_id = EXCLUDED.category_id, is_registered = EXCLUDED.is_registered,
              is_active = EXCLUDED.is_active, stats = EXCLUDED.stats,
              raw_data = EXCLUDED.raw_data, updated_at = NOW()
          `;
          migrated++;
        } catch (error: any) {
          console.error(`❌ Error migrating realplayer ${doc.id}:`, error.message);
          errors++;
        }
      }
      results.realplayers = { total_in_firebase: snapshot.size, migrated, errors };
      console.log(`✅ Realplayers: ${migrated} migrated, ${errors} errors`);
    }

    // ---- Migrate Categories ----
    if (collections.includes('categories')) {
      console.log('🔄 Migrating categories from Firebase to Neon...');
      const snapshot = await adminDb.collection('categories').get();
      console.log(`📋 Found ${snapshot.size} categories in Firebase`);
      let migrated = 0;
      let errors = 0;
      for (const doc of snapshot.docs) {
        try {
          const data = doc.data();
          const cid = doc.id;
          await sql`
            INSERT INTO categories (
              id, name, description, color, icon, min_players, max_players,
              min_salary, max_salary, fine_amount, season_id, is_active, sort_order,
              raw_data, created_at, updated_at
            ) VALUES (
              ${cid}, ${data.name || ''}, ${data.description || null}, ${data.color || null},
              ${data.icon || null}, ${data.min_players || 0}, ${data.max_players || 0},
              ${data.min_salary || 0}, ${data.max_salary || 0}, ${data.fine_amount || 0},
              ${data.season_id || null}, ${data.is_active !== false}, ${data.sort_order || 0},
              ${JSON.stringify(data)},
              ${data.created_at?.toDate?.() ? data.created_at.toDate().toISOString() : new Date().toISOString()},
              ${data.updated_at?.toDate?.() ? data.updated_at.toDate().toISOString() : new Date().toISOString()}
            )
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name, description = EXCLUDED.description,
              color = EXCLUDED.color, is_active = EXCLUDED.is_active,
              raw_data = EXCLUDED.raw_data, updated_at = NOW()
          `;
          migrated++;
        } catch (error: any) {
          console.error(`❌ Error migrating category ${doc.id}:`, error.message);
          errors++;
        }
      }
      results.categories = { total_in_firebase: snapshot.size, migrated, errors };
      console.log(`✅ Categories: ${migrated} migrated, ${errors} errors`);
    }

    // ---- Migrate Transactions ----
    if (collections.includes('transactions')) {
      console.log('🔄 Migrating transactions from Firebase to Neon...');
      const snapshot = await adminDb.collection('transactions').get();
      console.log(`📋 Found ${snapshot.size} transactions in Firebase`);
      let migrated = 0;
      let errors = 0;
      for (const doc of snapshot.docs) {
        try {
          const data = doc.data();
          const tid = doc.id;
          await sql`
            INSERT INTO transactions (
              id, team_id, season_id, type, amount, balance_after, description,
              category, reference_id, reference_type, player_id, player_name,
              status, currency, processed_by, notes, raw_data, created_at, updated_at
            ) VALUES (
              ${tid}, ${data.team_id || null}, ${data.season_id || null}, ${data.transaction_type || data.type || null},
              ${data.amount || 0}, ${data.balance_after || 0}, ${data.description || null},
              ${data.category || null}, ${data.reference_id || null}, ${data.reference_type || null},
              ${data.player_id || null}, ${data.player_name || null},
              ${data.status || 'completed'}, ${data.currency || 'single'}, ${data.processed_by || null},
              ${data.notes || null}, ${JSON.stringify(data)},
              ${data.created_at?.toDate?.() ? data.created_at.toDate().toISOString() : new Date().toISOString()},
              ${data.updated_at?.toDate?.() ? data.updated_at.toDate().toISOString() : new Date().toISOString()}
            )
            ON CONFLICT (id) DO UPDATE SET
              team_id = EXCLUDED.team_id, type = EXCLUDED.type,
              amount = EXCLUDED.amount, status = EXCLUDED.status,
              raw_data = EXCLUDED.raw_data, updated_at = NOW()
          `;
          migrated++;
        } catch (error: any) {
          console.error(`❌ Error migrating transaction ${doc.id}:`, error.message);
          errors++;
        }
      }
      results.transactions = { total_in_firebase: snapshot.size, migrated, errors };
      console.log(`✅ Transactions: ${migrated} migrated, ${errors} errors`);
    }

    // ---- Migrate Player Transactions ----
    if (collections.includes('player_transactions')) {
      console.log('🔄 Migrating player_transactions from Firebase to Neon...');
      const snapshot = await adminDb.collection('player_transactions').get();
      console.log(`📋 Found ${snapshot.size} player_transactions in Firebase`);
      let migrated = 0;
      let errors = 0;
      for (const doc of snapshot.docs) {
        try {
          const data = doc.data();
          const pid = doc.id;
          await sql`
            INSERT INTO player_transactions (
              id, player_id, team_id, season_id, type, amount, description,
              status, processed_by, from_team_id, to_team_id, raw_data, created_at, updated_at
            ) VALUES (
              ${pid}, ${data.player_id || null}, ${data.team_id || null}, ${data.season_id || null},
              ${data.transaction_type || data.type || null}, ${data.amount || 0}, ${data.description || null},
              ${data.status || 'completed'}, ${data.processed_by || null},
              ${data.from_team_id || null}, ${data.to_team_id || null},
              ${JSON.stringify(data)},
              ${data.created_at?.toDate?.() ? data.created_at.toDate().toISOString() : new Date().toISOString()},
              ${data.updated_at?.toDate?.() ? data.updated_at.toDate().toISOString() : new Date().toISOString()}
            )
            ON CONFLICT (id) DO UPDATE SET
              type = EXCLUDED.type, amount = EXCLUDED.amount,
              status = EXCLUDED.status, raw_data = EXCLUDED.raw_data, updated_at = NOW()
          `;
          migrated++;
        } catch (error: any) {
          console.error(`❌ Error migrating player_transaction ${doc.id}:`, error.message);
          errors++;
        }
      }
      results.player_transactions = { total_in_firebase: snapshot.size, migrated, errors };
      console.log(`✅ Player Transactions: ${migrated} migrated, ${errors} errors`);
    }

    // ---- Migrate Team Cash Balances ----
    if (collections.includes('team_cash_balances')) {
      console.log('🔄 Migrating team_cash_balances from Firebase to Neon...');
      const snapshot = await adminDb.collection('team_cash_balances').get();
      console.log(`📋 Found ${snapshot.size} team_cash_balances in Firebase`);
      let migrated = 0;
      let errors = 0;
      for (const doc of snapshot.docs) {
        try {
          const data = doc.data();
          const tid = doc.id;
          await sql`
            INSERT INTO team_cash_balances (
              id, team_id, season_id, balance, initial_balance,
              total_income, total_expense, currency, raw_data, created_at, updated_at
            ) VALUES (
              ${tid}, ${data.team_id || null}, ${data.season_id || null},
              ${data.balance || 0}, ${data.initial_balance || 0},
              ${data.total_income || 0}, ${data.total_expense || 0},
              ${data.currency || 'single'}, ${JSON.stringify(data)},
              ${data.created_at?.toDate?.() ? data.created_at.toDate().toISOString() : new Date().toISOString()},
              ${data.updated_at?.toDate?.() ? data.updated_at.toDate().toISOString() : new Date().toISOString()}
            )
            ON CONFLICT (id) DO UPDATE SET
              balance = EXCLUDED.balance, raw_data = EXCLUDED.raw_data, updated_at = NOW()
          `;
          migrated++;
        } catch (error: any) {
          console.error(`❌ Error migrating team_cash_balance ${doc.id}:`, error.message);
          errors++;
        }
      }
      results.team_cash_balances = { total_in_firebase: snapshot.size, migrated, errors };
      console.log(`✅ Team Cash Balances: ${migrated} migrated, ${errors} errors`);
    }

    return NextResponse.json({
      success: true,
      message: 'Migration completed',
      results,
    });

  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
