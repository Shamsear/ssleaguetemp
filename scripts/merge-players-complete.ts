import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const fromId = 'sspslpsl0085'; // old placeholder - merge this into 199
const toId   = 'sspslpsl0199'; // keep this - the real registered player

const tournamentUrl = 'postgresql://neondb_owner:npg_nrIQRAS1F4Be@ep-patient-tooth-aoxamv38-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const mainUrl = process.env.DATABASE_URL!;

const tournSql = neon(tournamentUrl);
const mainSql  = neon(mainUrl);

async function main() {
  console.log(`🚀 Merging ${fromId} → ${toId}\n`);

  // ============================================================
  // STEP 1: Migrate realplayerstats rows (tournament DB)
  //   - 085 has rows for seasons 10, 15, 16+
  //   - 199 has only season 18 (all zeros, registered today)
  //   No season overlap, so just update player_id and rename id
  // ============================================================
  console.log('📊 STEP 1: Migrating realplayerstats...');
  const oldStats = await tournSql`
    SELECT id, season_id FROM realplayerstats WHERE player_id = ${fromId}
  `;
  console.log(`   Found ${oldStats.length} rows to migrate from 085`);

  for (const row of oldStats) {
    const newId = `${toId}_${row.season_id}`;
    // Check if 199 already has this season (it shouldn't, but safety check)
    const conflict = await tournSql`
      SELECT id FROM realplayerstats WHERE id = ${newId}
    `;
    if (conflict.length > 0) {
      console.log(`   ⚠️  Conflict on ${newId} - will sum stats then delete 085 row`);
      await tournSql`
        UPDATE realplayerstats SET
          matches_played   = realplayerstats.matches_played   + (SELECT matches_played FROM realplayerstats WHERE id = ${row.id}),
          matches_won      = realplayerstats.matches_won      + (SELECT matches_won FROM realplayerstats WHERE id = ${row.id}),
          matches_lost     = realplayerstats.matches_lost     + (SELECT matches_lost FROM realplayerstats WHERE id = ${row.id}),
          matches_drawn    = realplayerstats.matches_drawn    + (SELECT matches_drawn FROM realplayerstats WHERE id = ${row.id}),
          goals_scored     = realplayerstats.goals_scored     + (SELECT goals_scored FROM realplayerstats WHERE id = ${row.id}),
          goals_conceded   = realplayerstats.goals_conceded   + (SELECT goals_conceded FROM realplayerstats WHERE id = ${row.id}),
          assists          = realplayerstats.assists          + (SELECT assists FROM realplayerstats WHERE id = ${row.id}),
          clean_sheets     = realplayerstats.clean_sheets     + (SELECT clean_sheets FROM realplayerstats WHERE id = ${row.id}),
          wins             = realplayerstats.wins             + (SELECT wins FROM realplayerstats WHERE id = ${row.id}),
          draws            = realplayerstats.draws            + (SELECT draws FROM realplayerstats WHERE id = ${row.id}),
          losses           = realplayerstats.losses           + (SELECT losses FROM realplayerstats WHERE id = ${row.id}),
          points           = realplayerstats.points           + (SELECT points FROM realplayerstats WHERE id = ${row.id}),
          motm_awards      = realplayerstats.motm_awards      + (SELECT motm_awards FROM realplayerstats WHERE id = ${row.id}),
          updated_at       = NOW()
        WHERE id = ${newId}
      `;
      await tournSql`DELETE FROM realplayerstats WHERE id = ${row.id}`;
      console.log(`   ✅ Merged and deleted conflict row`);
    } else {
      // Safe to rename
      await tournSql`
        UPDATE realplayerstats
        SET id = ${newId}, player_id = ${toId}, player_name = 'Midhun Martin'
        WHERE id = ${row.id}
      `;
      console.log(`   ✅ Renamed ${row.id} → ${newId}`);
    }
  }

  // ============================================================
  // STEP 2: player_seasons (tournament DB)
  //   - 085 has 0 rows, 199 has SSPSLS17 - nothing to migrate
  // ============================================================
  console.log('\n📊 STEP 2: Checking player_seasons...');
  const ps085 = await tournSql`SELECT COUNT(*) FROM player_seasons WHERE player_id = ${fromId}`;
  console.log(`   085 has ${ps085[0].count} rows in player_seasons (expected 0 - no action needed)`);

  // ============================================================
  // STEP 3: lineups JSON (tournament DB)
  //   - 085 has 0 lineup refs, 199 has 24 - nothing to do
  // ============================================================
  console.log('\n📊 STEP 3: Checking lineup JSONB references...');
  const l085 = await tournSql`
    SELECT COUNT(*) FROM lineups 
    WHERE starting_xi::text LIKE ${'%' + fromId + '%'} OR substitutes::text LIKE ${'%' + fromId + '%'}
  `;
  console.log(`   085 appears in ${l085[0].count} lineups (expected 0 - no action needed)`);

  // ============================================================
  // STEP 4: Main DB - any references to 085
  // ============================================================
  console.log('\n📊 STEP 4: Migrating main DB tables...');
  const mainTables = ['bids', 'round_bids', 'starred_players', 'round_players', 'player_history', 'footballplayers'];
  for (const tbl of mainTables) {
    try {
      const r = await mainSql(`SELECT COUNT(*) FROM "${tbl}" WHERE player_id = $1`, [fromId]);
      if (Number(r[0].count) > 0) {
        await mainSql(`UPDATE "${tbl}" SET player_id = $1 WHERE player_id = $2`, [toId, fromId]);
        console.log(`   ✅ Updated ${r[0].count} rows in ${tbl}`);
      } else {
        console.log(`   ℹ️  ${tbl}: 0 rows (no action needed)`);
      }
    } catch (err: any) {
      console.log(`   ⚠️  ${tbl}: ${err.message}`);
    }
  }

  // ============================================================
  // STEP 5: Firestore - delete the empty 085 placeholder
  // ============================================================
  console.log('\n🔥 STEP 5: Cleaning up Firestore...');
  const { adminDb } = await import('../lib/firebase/admin');

  // Delete the empty 085 document
  await adminDb.collection('realplayers').doc(fromId).delete();
  console.log(`   ✅ Deleted Firestore realplayers/${fromId}`);

  // Verify 199 still exists
  const doc199 = await adminDb.collection('realplayers').doc(toId).get();
  console.log(`   ✅ Firestore realplayers/${toId} still exists: ${doc199.exists}`);

  // ============================================================
  // STEP 6: Verification
  // ============================================================
  console.log('\n✅ FINAL VERIFICATION:');
  const remaining085 = await tournSql`SELECT COUNT(*) FROM realplayerstats WHERE player_id = ${fromId}`;
  const total199 = await tournSql`SELECT COUNT(*) FROM realplayerstats WHERE player_id = ${toId}`;
  console.log(`   realplayerstats - 085 remaining: ${remaining085[0].count} (should be 0)`);
  console.log(`   realplayerstats - 199 total: ${total199[0].count}`);

  const seasons199 = await tournSql`
    SELECT id, season_id, matches_played, goals_scored, points 
    FROM realplayerstats WHERE player_id = ${toId} 
    ORDER BY season_id
  `;
  console.log(`\n   Seasons under 199 (Midhun Martin):`);
  for (const s of seasons199) {
    console.log(`     - ${s.season_id}: ${s.matches_played} matches, ${s.goals_scored} goals, ${s.points} pts`);
  }

  console.log('\n🎉 Merge complete!');
}

main().catch(console.error);
