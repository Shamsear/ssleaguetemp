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

const redPlayers = [
  "FAYAZ", "PRANAV", "ATHUL KRISHNA", "GAUTHAM KRISHNA", "FAJAS", "PRAJITH",
  "ROHITH", "UMAR", "VIMAL", "NIHAL MK", "AASHIQ", "NIDHUL", "RIZWAN", "AFSAL",
  "ADIL", "GOKUL KRISHNA", "MIDHUN MARTIN", "JINTO", "ANUANSHIN", "SAFVAN",
  "FAZI", "ANAS LEO", "AMEEN K", "AKHINESH", "AMJAD", "SANJU K", "MUNEER UMMER",
  "GOKU", "SIRAJ", "HYDER NIHAL", "RIZWAN KP", "AL AMEEN"
];

const blackPlayers = [
  "SALI", "RENIL", "SHUHAIB", "ANSAF", "ATHIF", "MUFARIS", "NABEEL", "ALIM",
  "MELWIN", "IRSHAD", "ANVAR", "RASHIL", "FIROZ", "SAFAR", "JITHIN SABRI", "SOURAV"
];

const bluePlayers = [
  "MUBASHIR", "FASAL", "SUNU", "FREDDY", "ALBIN", "SHAMIL", "ARIF", "RAEES",
  "SHAMSEAR", "ARJUN", "SHARON", "AJMAL", "SHAAN", "FARSAN", "ANOOP P", "HIJAZ"
];

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

  console.log(`Found ${dbPlayers.length} players in realplayerstats for SSPSLS19`);

  const categoryMap = new Map<string, string>();
  redPlayers.forEach(p => categoryMap.set(p, 'RED'));
  blackPlayers.forEach(p => categoryMap.set(p, 'BLACK'));
  bluePlayers.forEach(p => categoryMap.set(p, 'BLUE'));
  whitePlayers.forEach(p => categoryMap.set(p, 'WHITE'));

  const allTargetPlayers = [
    ...redPlayers.map(p => ({ name: p, cat: 'RED' })),
    ...blackPlayers.map(p => ({ name: p, cat: 'BLACK' })),
    ...bluePlayers.map(p => ({ name: p, cat: 'BLUE' })),
    ...whitePlayers.map(p => ({ name: p, cat: 'WHITE' }))
  ];

  console.log(`Total target players: ${allTargetPlayers.length}`);

  const matched = [];
  const unmatchedTargets = [];
  const unmatchedDb = [...dbPlayers];

  for (const target of allTargetPlayers) {
    const tNorm = normalize(target.name);
    
    // Try exact normalized match first
    let dbMatchIdx = unmatchedDb.findIndex(dbp => normalize(dbp.player_name) === tNorm);

    // Try substring/contains match if exact not found
    if (dbMatchIdx === -1) {
      dbMatchIdx = unmatchedDb.findIndex(dbp => {
        const dbNorm = normalize(dbp.player_name);
        return dbNorm.includes(tNorm) || tNorm.includes(dbNorm);
      });
    }

    if (dbMatchIdx !== -1) {
      const match = unmatchedDb[dbMatchIdx];
      matched.push({
        targetName: target.name,
        category: target.cat,
        dbId: match.id,
        dbPlayerId: match.player_id,
        dbPlayerName: match.player_name
      });
      unmatchedDb.splice(dbMatchIdx, 1);
    } else {
      unmatchedTargets.push(target);
    }
  }

  console.log(`\nMatched: ${matched.length} / ${allTargetPlayers.length}`);
  if (unmatchedTargets.length > 0) {
    console.log('\nUnmatched targets:', unmatchedTargets);
    console.log('\nRemaining DB players:', unmatchedDb.map(p => `${p.player_id}: ${p.player_name}`));
  } else {
    console.log('✅ ALL 80 TARGET PLAYERS MATCHED PERFECTLY TO DB PLAYERS!');
    matched.forEach(m => {
      console.log(`[${m.category}] Target "${m.targetName}" -> DB ${m.dbPlayerId}: "${m.dbPlayerName}" (id: ${m.dbId})`);
    });
  }

  process.exit(0);
}

main().catch(console.error);
