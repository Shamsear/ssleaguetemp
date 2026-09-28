import fs from 'fs';
import path from 'path';

function loadEnvFile(envPath: string) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
      }
    }
  }
}

loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), '.env.local'));

const FIXTURE_ID   = 'SSPSLS18L_leg2_r17_m1';
const TEAM_ID      = 'SSPSLT0002'; // Manchester United (home)
const PLAYER_OUT   = 'sspslpsl0032'; // HYDER NIHAL
const PLAYER_IN    = 'sspslpsl0026'; // HIJAZ
const PENALTY      = 0;

async function main() {
  const { getTournamentDb } = await import('../lib/neon/tournament-config');
  const { generateLineupId }  = await import('../lib/lineup-validation');
  const sql = getTournamentDb();

  // 1. Update the matchup: HIJAZ replaces HYDER NIHAL in the slot vs PRAJITH
  console.log('📝 Updating matchup...');
  const matchupResult = await sql`
    UPDATE matchups
    SET
      home_player_id            = ${PLAYER_IN},
      home_player_name          = 'HIJAZ',
      home_original_player_id   = ${PLAYER_OUT},
      home_original_player_name = 'HYDER NIHAL',
      home_substituted          = true,
      home_sub_penalty          = ${PENALTY},
      updated_at                = NOW()
    WHERE fixture_id = ${FIXTURE_ID}
      AND home_player_id = ${PLAYER_OUT}
    RETURNING position
  `;
  console.log('✅ Matchup updated, position(s):', matchupResult.map((r: any) => r.position));

  // 2. Update the lineup: swap HYDER NIHAL → HIJAZ in starting_xi / substitutes
  const lineupId = generateLineupId(FIXTURE_ID, TEAM_ID);
  console.log('\n📝 Fetching lineup', lineupId);
  const lineups = await sql`
    SELECT starting_xi, substitutes FROM lineups WHERE id = ${lineupId} LIMIT 1
  `;
  if (lineups.length === 0) {
    console.log('⚠️  Lineup not found – skipping lineup array update');
  } else {
    const lineup = lineups[0];
    let startingXI: string[] = lineup.starting_xi as string[];
    let subs: string[]        = lineup.substitutes as string[];

    const outIdx = startingXI.indexOf(PLAYER_OUT);
    const inIdx  = subs.indexOf(PLAYER_IN);

    console.log(`  starting_xi: ${JSON.stringify(startingXI)}`);
    console.log(`  substitutes: ${JSON.stringify(subs)}`);
    console.log(`  PLAYER_OUT index in starting_xi: ${outIdx}`);
    console.log(`  PLAYER_IN  index in substitutes: ${inIdx}`);

    if (outIdx !== -1 && inIdx !== -1) {
      startingXI[outIdx] = PLAYER_IN;
      subs[inIdx]         = PLAYER_OUT;
      await sql`
        UPDATE lineups
        SET starting_xi = ${JSON.stringify(startingXI)},
            substitutes = ${JSON.stringify(subs)},
            updated_at  = NOW()
        WHERE id = ${lineupId}
      `;
      console.log('✅ Lineup arrays swapped');
    } else if (outIdx === -1 && startingXI.includes(PLAYER_IN)) {
      // HIJAZ is already in starting_xi (playing another matchup) — lineup already correct
      console.log('ℹ️  HIJAZ already in starting_xi (dual matchup scenario). No array swap needed.');
    } else {
      console.log('⚠️  Could not find expected players to swap in lineup arrays. Manual check may be needed.');
      console.log(`    outIdx=${outIdx}, inIdx=${inIdx}`);
    }
  }

  // 3. Record substitution history
  console.log('\n📝 Inserting substitution record...');
  await sql`
    INSERT INTO lineup_substitutions (
      lineup_id, fixture_id, team_id,
      player_out, player_out_name,
      player_in,  player_in_name,
      made_at, made_by, made_by_name, notes
    ) VALUES (
      ${generateLineupId(FIXTURE_ID, TEAM_ID)},
      ${FIXTURE_ID},
      ${TEAM_ID},
      ${PLAYER_OUT}, 'HYDER NIHAL',
      ${PLAYER_IN},  'HIJAZ',
      NOW(),
      'committee_admin', 'Committee Admin',
      'Manual entry: HIJAZ played instead of HYDER NIHAL vs PRAJITH. Penalty: 0.'
    )
  `;
  console.log('✅ Substitution record inserted');

  console.log('\n🎉 Done! Substitution applied: HIJAZ in for HYDER NIHAL (penalty 0).');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
