const fs = require('fs');
const path = require('path');

const postgresMatches = JSON.parse(fs.readFileSync(path.join(__dirname, 'postgres_all_matches.json'), 'utf8'));

console.log('=== AUCTION_DB round_players ===');
const rp = postgresMatches.find(m => m.database === 'AUCTION_DB' && m.table === 'round_players');
if (rp) {
  rp.rows.slice(0, 10).forEach(r => {
    console.log(r.id, r.player_name || r.name, r.team_name, r.round_id || r.round_number);
  });
}

console.log('\n=== TOURNAMENT_DB awards count check ===');
const aw = postgresMatches.find(m => m.database === 'TOURNAMENT_DB' && m.table === 'awards');
if (aw) {
  console.log('Awards sample matches:');
  aw.rows.slice(0, 5).forEach(r => {
    console.log(r.id, r.title, r.recipient_name, r.description || r.category);
  });
}

console.log('\n=== TOURNAMENT_DB fixtures matches ===');
const fx = postgresMatches.find(m => m.database === 'TOURNAMENT_DB' && m.table === 'fixtures');
if (fx) {
  fx.rows.forEach(r => {
    console.log(r.id, r.season_id, r.round_number, r.home_team_name, 'vs', r.away_team_name);
  });
}
