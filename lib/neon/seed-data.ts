/**
 * Seed Neon with Firebase data - Seasons & Teams
 * 
 * Usage: NEON_MAIN_DB_URL=your_url npx tsx lib/neon/seed-data.ts
 * 
 * Uses the project's Firebase admin config (reads .env.local).
 */

import { Pool } from '@neondatabase/serverless';
import { adminDb } from '../firebase/admin';

const NEON_URL = process.env.NEON_MAIN_DB_URL;

async function seedData() {
  if (!NEON_URL) {
    console.error('❌ NEON_MAIN_DB_URL not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: NEON_URL });

  try {
    console.log('🔌 Testing Neon connection...');
    await pool.query('SELECT NOW()');
    console.log('✅ Neon connected');

    // ---- SEASONS ----
    console.log('\n🔄 Migrating SEASONS from Firebase...');
    const seasonsSnapshot = await adminDb.collection('seasons').get();
    console.log(`📖 Found ${seasonsSnapshot.size} seasons`);

    let sMigrated = 0;
    let sErrors = 0;

    for (const doc of seasonsSnapshot.docs) {
      const d = doc.data();
      try {
        const sd = d.startDate?.toDate?.() ? d.startDate.toDate().toISOString() : null;
        const ed = d.endDate?.toDate?.() ? d.endDate.toDate().toISOString() : null;
        const ca = d.created_at?.toDate?.() ? d.created_at.toDate().toISOString() : new Date().toISOString();
        const ua = d.updated_at?.toDate?.() ? d.updated_at.toDate().toISOString() : new Date().toISOString();

        await pool.query(`
          INSERT INTO seasons (id, name, year, season_number, type, is_active, status,
            registration_open, start_date, end_date, total_teams, total_rounds,
            purse_amount, max_players_per_team, dollar_budget, euro_budget,
            required_real_players, max_football_players, category_fine_amount,
            raw_data, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
          ON CONFLICT (id) DO UPDATE SET
            name=EXCLUDED.name, year=EXCLUDED.year, season_number=EXCLUDED.season_number,
            type=EXCLUDED.type, is_active=EXCLUDED.is_active, status=EXCLUDED.status,
            registration_open=EXCLUDED.registration_open, start_date=EXCLUDED.start_date,
            end_date=EXCLUDED.end_date, total_teams=EXCLUDED.total_teams,
            total_rounds=EXCLUDED.total_rounds, purse_amount=EXCLUDED.purse_amount,
            max_players_per_team=EXCLUDED.max_players_per_team, dollar_budget=EXCLUDED.dollar_budget,
            euro_budget=EXCLUDED.euro_budget, required_real_players=EXCLUDED.required_real_players,
            max_football_players=EXCLUDED.max_football_players, category_fine_amount=EXCLUDED.category_fine_amount,
            raw_data=EXCLUDED.raw_data, updated_at=NOW()
        `, [doc.id, d.name||null, d.year||null, d.season_number||null, d.type||'single',
            d.isActive||false, d.status||'draft', d.registrationOpen||false, sd, ed,
            d.totalTeams||0, d.totalRounds||0, d.purseAmount||0, d.maxPlayersPerTeam||11,
            d.dollar_budget||null, d.euro_budget||null, d.required_real_players||null,
            d.max_football_players||null, d.category_fine_amount||null, JSON.stringify(d),
            ca, ua]);
        sMigrated++;
        console.log(`  ✅ ${doc.id}: ${d.name||'Unnamed'} (${d.isActive ? '🟢 ACTIVE' : d.status})`);
      } catch (e: any) {
        sErrors++;
        console.error(`  ❌ ${doc.id}: ${e.message}`);
      }
    }
    console.log(`📊 Seasons: ${sMigrated}/${seasonsSnapshot.size} migrated (${sErrors} errors)`);

    // ---- TEAMS ----
    console.log('\n🔄 Migrating TEAMS from Firebase...');
    const teamsSnapshot = await adminDb.collection('teams').get();
    console.log(`📖 Found ${teamsSnapshot.size} teams`);

    let tMigrated = 0;
    let tErrors = 0;

    for (const doc of teamsSnapshot.docs) {
      const d = doc.data();
      try {
        const logo = d.logo_url || d.team_logo || d.logo || null;
        const ca = d.created_at?.toDate?.() ? d.created_at.toDate().toISOString() : new Date().toISOString();
        const ua = d.updated_at?.toDate?.() ? d.updated_at.toDate().toISOString() : new Date().toISOString();

        await pool.query(`
          INSERT INTO teams (id, team_id, team_name, team_code, owner_uid, owner_name,
            owner_email, username, balance, initial_balance, total_spent,
            currency_system, season_id, is_active, logo_url, team_color,
            players_count, stats, real_players, football_players,
            football_budget, football_spent, real_player_budget, real_player_spent,
            raw_data, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
          ON CONFLICT (id) DO UPDATE SET
            team_name=EXCLUDED.team_name, team_code=EXCLUDED.team_code,
            owner_uid=EXCLUDED.owner_uid, owner_name=EXCLUDED.owner_name,
            owner_email=EXCLUDED.owner_email, logo_url=EXCLUDED.logo_url,
            is_active=EXCLUDED.is_active, raw_data=EXCLUDED.raw_data, updated_at=NOW()
        `, [doc.id, d.team_id||doc.id, d.team_name||'Unknown Team', d.team_code||null,
            d.owner_uid||null, d.owner_name||null, d.owner_email||null, d.username||null,
            d.balance||0, d.initial_balance||0, d.total_spent||0, d.currency_system||'single',
            d.season_id||null, d.is_active!==false, logo, d.team_color||null,
            d.players_count||0, JSON.stringify(d.stats||{}), JSON.stringify(d.real_players||[]),
            JSON.stringify(d.football_players||[]), d.football_budget||null, d.football_spent||0,
            d.real_player_budget||null, d.real_player_spent||0, JSON.stringify(d), ca, ua]);
        tMigrated++;
        console.log(`  ✅ ${doc.id}: ${d.team_name||'Unknown'}`);
      } catch (e: any) {
        tErrors++;
        console.error(`  ❌ ${doc.id}: ${e.message}`);
      }
    }
    console.log(`📊 Teams: ${tMigrated}/${teamsSnapshot.size} migrated (${tErrors} errors)`);

    // ---- TEAM SEASONS ----
    console.log('\n🔄 Migrating TEAM_SEASONS from Firebase...');
    const tsSnapshot = await adminDb.collection('team_seasons').get();
    console.log(`📖 Found ${tsSnapshot.size} team_seasons`);

    let tsMigrated = 0;
    let tsErrors = 0;

    for (const doc of tsSnapshot.docs) {
      const d = doc.data();
      try {
        const id = doc.id;
        const parts = id.split('_');
        const teamId = d.team_id || parts[0];
        const seasonId = d.season_id || parts.slice(1).join('_');
        const ja = d.joined_at?.toDate?.() ? d.joined_at.toDate().toISOString() : new Date().toISOString();
        const ca = d.created_at?.toDate?.() ? d.created_at.toDate().toISOString() : ja;
        const ua = d.updated_at?.toDate?.() ? d.updated_at.toDate().toISOString() : ja;

        await pool.query(`
          INSERT INTO team_seasons (id, team_id, team_name, team_code, season_id, user_id,
            username, team_email, status, budget, initial_budget, football_budget,
            football_spent, real_player_budget, real_player_spent, currency_system,
            players_count, football_players_count, stats, real_players,
            football_players, logo_url, team_color, dollar_balance, euro_balance,
            raw_data, joined_at, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
          ON CONFLICT (id) DO UPDATE SET
            team_name=EXCLUDED.team_name, status=EXCLUDED.status, budget=EXCLUDED.budget,
            initial_budget=EXCLUDED.initial_budget, players_count=EXCLUDED.players_count,
            stats=EXCLUDED.stats, real_players=EXCLUDED.real_players, updated_at=NOW()
        `, [id, teamId, d.team_name||null, d.team_code||null, seasonId,
            d.user_id||null, d.username||null, d.team_email||null, d.status||'registered',
            d.budget||0, d.initial_budget||0, d.football_budget||null, d.football_spent||0,
            d.real_player_budget||null, d.real_player_spent||0, d.currency_system||'single',
            d.players_count||0, d.football_players_count||0, JSON.stringify(d.stats||{}),
            JSON.stringify(d.real_players||[]), JSON.stringify(d.football_players||[]),
            d.logo_url||null, d.team_color||null, d.dollarBalance||null, d.euroBalance||null,
            JSON.stringify(d), ja, ca, ua]);
        tsMigrated++;
      } catch (e: any) {
        tsErrors++;
        console.error(`  ❌ ${doc.id}: ${e.message}`);
      }
    }
    console.log(`📊 Team Seasons: ${tsMigrated}/${tsSnapshot.size} migrated (${tsErrors} errors)`);

    // ---- Verify ----
    console.log('\n📊 Final counts in Neon:');
    const seasons = await pool.query('SELECT COUNT(*) as c FROM seasons');
    const teams = await pool.query('SELECT COUNT(*) as c FROM teams');
    const teamSeasons = await pool.query('SELECT COUNT(*) as c FROM team_seasons');
    console.log(`  seasons: ${seasons.rows[0].c}`);
    console.log(`  teams: ${teams.rows[0].c}`);
    console.log(`  team_seasons: ${teamSeasons.rows[0].c}`);

    // Show active season
    const active = await pool.query('SELECT id, name, status FROM seasons WHERE is_active = true');
    if (active.rows.length > 0) {
      console.log(`\n🟢 Active season in Neon: ${active.rows[0].id} - ${active.rows[0].name}`);
    }

    console.log('\n✅ Migration complete!');
    console.log('Reads from getActiveSeason(), getSeasonById(), getAllSeasons() will now use Neon.');

  } finally {
    await pool.end();
  }
}

seedData().catch(console.error);
