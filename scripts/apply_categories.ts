import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
      }
    }
  });
}

// 1. RED (32)
const redPlayers = [
  "FAYAZ", "PRANAV", "ATHUL KRISHNA", "GAUTHAM KRISHNA", "FAJAS", "PRAJITH",
  "ROHITH", "UMAR", "VIMAL", "NIHAL MK", "AASHIQ", "NIDHUL", "RIZWAN", "AFSAL",
  "ADIL", "GOKUL KRISHNA", "MIDHUN MARTIN", "JINTO", "ANUANSHIN", "SAFVAN",
  "FAZI", "ANAS LEO", "AMEEN K", "AKHINESH", "AMJAD", "SANJU K", "MUNEER UMMER",
  "GOKU", "SIRAJ", "HYDER NIHAL", "RIZWAN KP", "AL AMEEN"
];

// 2. BLACK (16)
const blackPlayers = [
  "SALI", "RENIL", "SHUHAIB", "ANSAF", "ATHIF", "MUFARIS", "NABEEL", "ALIM",
  "MELWIN", "IRSHAD", "ANVAR", "RASHIL", "FIROZ", "SAFAR", "JITHIN SABRI", "SOURAV"
];

// 3. BLUE (16)
const bluePlayers = [
  "MUBASHIR", "FASAL", "SUNU", "FREDDY", "ALBIN", "SHAMIL", "ARIF", "RAEES",
  "SHAMSEAR", "ARJUN", "SHARON", "AJMAL", "SHAAN", "FARSAN", "ANOOP P", "HIJAZ"
];

// 4. WHITE (16)
const whitePlayers = [
  "NISHAL", "AKSHAY MS", "ABDUL ROUF", "ASHRAF", "SHAMEEM", "ANSHADUL HAQUE",
  "THOMAS", "KIRAN", "JOMON", "JASEEL", "ZANEER", "RAHUL KK", "SHINTO",
  "ANAS MOHD", "ROSHAN", "DHANUS"
];

function normalize(s: string) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function main() {
  const { getTournamentDb } = await import('../lib/neon/tournament-config');
  const { getMainDb } = await import('../lib/neon/main-config');
  const { adminDb } = await import('../lib/neon/admin-db-wrapper');
  const { FieldValue } = await import('firebase-admin/firestore');
  
  const tourSql = getTournamentDb();
  const mainSql = getMainDb();

  console.log('--- STARTING CATEGORY ASSIGNMENT FOR SEASON 19 PLAYERS ---');

  const dbPlayers = await tourSql`
    SELECT id, player_id, player_name, category, season_id 
    FROM realplayerstats 
    WHERE season_id = 'SSPSLS19'
    ORDER BY player_name ASC
  `;

  const targetList = [
    ...redPlayers.map((name, i) => ({ name, category: 'RED', category_id: 'cat_red', base_price: 25, slot: i + 1 })),
    ...blackPlayers.map((name, i) => ({ name, category: 'BLACK', category_id: 'cat_black', base_price: 20, slot: i + 1 })),
    ...bluePlayers.map((name, i) => ({ name, category: 'BLUE', category_id: 'cat_blue', base_price: 15, slot: i + 1 })),
    ...whitePlayers.map((name, i) => ({ name, category: 'WHITE', category_id: 'cat_white', base_price: 10, slot: i + 1 })),
  ];

  const aliases: Record<string, string> = {
    'ANVAR': 'ANWAR',
    'MUFARIS': 'MUFARIS',
  };

  const pool = [...dbPlayers];
  const mapped = [];

  for (const t of targetList) {
    if (t.name === 'MUFARIS') {
      mapped.push({
        ...t,
        dbId: 'sspslpsl0047_SSPSLS19',
        playerId: 'sspslpsl0047',
        matchedDbName: 'MUFARIS',
        isNewS19: true
      });
      continue;
    }

    const searchName = aliases[t.name] || t.name;
    const tNorm = normalize(searchName);

    let idx = pool.findIndex(p => normalize(p.player_name) === tNorm);
    if (idx === -1) {
      idx = pool.findIndex(p => {
        const pNorm = normalize(p.player_name);
        return pNorm.includes(tNorm) || tNorm.includes(pNorm);
      });
    }

    if (idx !== -1) {
      const p = pool[idx];
      mapped.push({
        ...t,
        dbId: p.id,
        playerId: p.player_id,
        matchedDbName: p.player_name,
        isNewS19: false
      });
      pool.splice(idx, 1);
    } else {
      throw new Error(`Failed to map player: ${t.name}`);
    }
  }

  console.log(`Mapped all ${mapped.length} target players.`);

  // 1. In Tournament DB: Replace Hashim with Mufaris in S19
  console.log('Replacing Hashim with Mufaris in Tournament realplayerstats for S19...');
  await tourSql`DELETE FROM realplayerstats WHERE id = 'sspslpsl0130_SSPSLS19'`;
  await tourSql`DELETE FROM realplayerstats WHERE id = 'sspslpsl0047_SSPSLS19'`;
  await tourSql`
    INSERT INTO realplayerstats (
      id, player_id, player_name, season_id, category, base_price,
      matches_played, matches_won, matches_lost, matches_drawn,
      goals_scored, goals_conceded, assists, clean_sheets, own_goals,
      saves, penalties_saved, wins, draws, losses, motm_awards,
      points, trophies, created_at, updated_at, match_played
    ) VALUES (
      'sspslpsl0047_SSPSLS19', 'sspslpsl0047', 'MUFARIS', 'SSPSLS19', 'BLACK', 20,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '[]'::jsonb, NOW(), NOW(), false
    )
  `;

  // 2. Update realplayerstats in Tournament DB for all 80 players
  console.log('Updating 80 realplayerstats records in Tournament DB...');
  for (const p of mapped) {
    if (p.playerId !== 'sspslpsl0047') {
      await tourSql`
        UPDATE realplayerstats
        SET category = ${p.category},
            base_price = ${p.base_price},
            updated_at = NOW()
        WHERE id = ${p.dbId}
      `;
    }
  }
  console.log('✅ Tournament DB realplayerstats updated.');

  // 3. Update realplayers in Main DB
  console.log('Updating realplayers in Main DB...');
  for (const p of mapped) {
    try {
      await mainSql`
        UPDATE realplayers
        SET category_id = ${p.category_id},
            season_id = 'SSPSLS19',
            updated_at = NOW()
        WHERE player_id = ${p.playerId} OR id = ${p.playerId}
      `;
    } catch (mErr: any) {
      console.warn(`MainSql update error for ${p.playerId}:`, mErr.message);
    }
  }
  console.log('✅ Main DB realplayers updated.');

  // 4. Update Firestore realplayers collection
  console.log('Updating Firestore realplayers documents in batches...');
  let batch = adminDb.batch();
  let countInBatch = 0;

  for (const p of mapped) {
    // Check if doc exists by playerId
    const playerRef = adminDb.collection('realplayers').doc(p.playerId);
    batch.set(playerRef, {
      category: p.category,
      categoryId: p.category_id,
      category_id: p.category_id,
      base_price: p.base_price,
      season_id: 'SSPSLS19',
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });

    countInBatch++;
    if (countInBatch >= 40) {
      await batch.commit();
      batch = adminDb.batch();
      countInBatch = 0;
    }
  }
  if (countInBatch > 0) {
    await batch.commit();
  }
  console.log('✅ Firestore realplayers updated.');

  // 5. Verification count
  const verifyStats = await tourSql`
    SELECT category, COUNT(*) as count 
    FROM realplayerstats 
    WHERE season_id = 'SSPSLS19'
    GROUP BY category
    ORDER BY count DESC
  `;
  console.log('\n--- VERIFICATION IN NEON TOURNAMENT DB (realplayerstats) ---');
  console.table(verifyStats);

  const totalS19 = await tourSql`SELECT COUNT(*) FROM realplayerstats WHERE season_id = 'SSPSLS19'`;
  console.log(`Total S19 realplayerstats: ${totalS19[0].count}`);

  console.log('\n✅ ALL 80 PLAYERS SUCCESSFULLY CATEGORIZED!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
