const { neon } = require('@neondatabase/serverless');
const sql = neon('postgresql://neondb_owner:npg_nrIQRAS1F4Be@ep-patient-tooth-aoxamv38-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require');

async function main() {
  // season_id = 'SSPSLS18' for S18
  // team column (not team_name)
  const rows = await sql`
    SELECT player_id, player_name, team, team_id, category,
           points, goals_scored, goals_conceded, clean_sheets,
           wins, draws, losses, matches_played
    FROM realplayerstats
    WHERE season_id = 'SSPSLS18'
      AND LOWER(team) LIKE '%manchester united%'
    ORDER BY points DESC, player_name ASC
  `;

  console.log('Total players found:', rows.length);

  if (rows.length === 0) {
    console.log('\nNo players found. Checking all teams in SSPSLS18...');
    const teams = await sql`
      SELECT DISTINCT team, team_id, COUNT(*) as player_count
      FROM realplayerstats
      WHERE season_id = 'SSPSLS18'
      GROUP BY team, team_id
      ORDER BY team ASC
    `;
    console.log('All S18 teams:');
    teams.forEach(t => console.log(`  "${t.team}" (id: ${t.team_id}) — ${t.player_count} players`));
    return;
  }

  // WhatsApp format
  let msg = `🔴⚫ *Manchester United — S18 Player List* ⚫🔴\n`;
  msg += `------------------------------\n`;
  msg += `👥 Total Players: ${rows.length}\n`;
  msg += `------------------------------\n`;

  rows.forEach((r, i) => {
    const num = i + 1;
    const cat = r.category ? ` (${r.category.toUpperCase()})` : '';
    const id = r.player_id || 'N/A';
    const gd = (r.goals_scored || 0) - (r.goals_conceded || 0);
    const gdStr = gd >= 0 ? `+${gd}` : `${gd}`;
    msg += `\n${num}. *${r.player_name}${cat}*\n`;
    msg += `   🆔 ${id}\n`;
    msg += `   📊 ${r.points ?? 0} pts | ${r.wins ?? 0}W ${r.draws ?? 0}D ${r.losses ?? 0}L\n`;
    msg += `   ⚽ ${r.goals_scored ?? 0} G | 🛡️ ${r.goals_conceded ?? 0} GA | GD ${gdStr} | 🧤 ${r.clean_sheets ?? 0} CS | 🎮 ${r.matches_played ?? 0} matches\n`;
  });

  msg += `\n------------------------------\n`;
  msg += `🎮 *SS League — Season 18*`;

  console.log('\n=== WHATSAPP MESSAGE ===\n');
  console.log(msg);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
