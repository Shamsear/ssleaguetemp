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
  const tourSql = getTournamentDb();

  const dbPlayers = await tourSql`
    SELECT id, player_id, player_name, category, season_id 
    FROM realplayerstats 
    WHERE season_id = 'SSPSLS19'
    ORDER BY player_name ASC
  `;

  console.log(`Current players in realplayerstats for SSPSLS19: ${dbPlayers.length}`);

  const targetList = [
    ...redPlayers.map((name, i) => ({ name, category: 'RED', category_id: 'cat_red', base_price: 25, slot: i + 1 })),
    ...blackPlayers.map((name, i) => ({ name, category: 'BLACK', category_id: 'cat_black', base_price: 20, slot: i + 1 })),
    ...bluePlayers.map((name, i) => ({ name, category: 'BLUE', category_id: 'cat_blue', base_price: 15, slot: i + 1 })),
    ...whitePlayers.map((name, i) => ({ name, category: 'WHITE', category_id: 'cat_white', base_price: 10, slot: i + 1 })),
  ];

  // Specific alias overrides
  const aliases: Record<string, string> = {
    'ANVAR': 'ANWAR',
    'MUFARIS': 'MUFARIS', // we know Mufaris is sspslpsl0047
  };

  const pool = [...dbPlayers];
  const assignments = [];
  const unmatched = [];

  for (const t of targetList) {
    if (t.name === 'MUFARIS') {
      assignments.push({
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
      assignments.push({
        ...t,
        dbId: p.id,
        playerId: p.player_id,
        matchedDbName: p.player_name,
        isNewS19: false
      });
      pool.splice(idx, 1);
    } else {
      unmatched.push(t);
    }
  }

  console.log(`Successfully mapped: ${assignments.length} / ${targetList.length}`);
  if (unmatched.length > 0) {
    console.log('Unmatched:', unmatched);
  }
  console.log('Unused DB players:', pool.map(p => `${p.player_id}: ${p.player_name}`));

  // Print summary by category
  for (const cat of ['RED', 'BLACK', 'BLUE', 'WHITE']) {
    const catList = assignments.filter(a => a.category === cat);
    console.log(`\n=== ${cat} CATEGORY (${catList.length}) ===`);
    catList.forEach((a, i) => {
      console.log(`${(i+1).toString().padStart(2, ' ')}. ${a.name.padEnd(20, ' ')} -> ${a.playerId} (${a.matchedDbName})`);
    });
  }

  process.exit(0);
}

main().catch(console.error);
