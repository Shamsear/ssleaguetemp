const fs = require('fs');
const path = require('path');

const postgresMatches = JSON.parse(fs.readFileSync(path.join(__dirname, 'postgres_all_matches.json'), 'utf8'));

console.log('=== FOOTBALLPLAYERS in AUCTION_DB ===');
const fbPlayers = postgresMatches.find(m => m.database === 'AUCTION_DB' && m.table === 'footballplayers');
if (fbPlayers) {
  fbPlayers.rows.forEach(r => console.log(r.id, r.name, r.club, r.nationality));
}

console.log('\n=== REALPLAYERS in MAIN_DB ===');
const rp = postgresMatches.find(m => m.database === 'MAIN_DB' && m.table === 'realplayers');
if (rp) {
  rp.rows.forEach(r => console.log(r.id, r.name, r.display_name, r.email, r.phone));
}

console.log('\n=== PLAYER_SEASONS in TOURNAMENT_DB ===');
const ps = postgresMatches.find(m => m.database === 'TOURNAMENT_DB' && m.table === 'player_seasons');
if (ps) {
  ps.rows.forEach(r => console.log(r.player_id, r.season_id, r.team_id, r.category));
}

console.log('\n=== PLAYER_AWARDS in TOURNAMENT_DB ===');
const pa = postgresMatches.find(m => m.database === 'TOURNAMENT_DB' && m.table === 'player_awards');
if (pa) {
  pa.rows.forEach(r => console.log(r));
}

console.log('\n=== OWNERS in TOURNAMENT_DB ===');
const ow = postgresMatches.find(m => m.database === 'TOURNAMENT_DB' && m.table === 'owners');
if (ow) {
  ow.rows.forEach(r => console.log(r));
}

console.log('\n=== TOURNAMENT_PENALTIES in TOURNAMENT_DB ===');
const tp = postgresMatches.find(m => m.database === 'TOURNAMENT_DB' && m.table === 'tournament_penalties');
if (tp) {
  tp.rows.forEach(r => console.log(r));
}

console.log('\n=== NEWS in TOURNAMENT_DB ===');
const nw = postgresMatches.find(m => m.database === 'TOURNAMENT_DB' && m.table === 'news');
if (nw) {
  nw.rows.forEach(r => console.log(r.id, r.title, r.headline || r.content?.substring(0, 100)));
}
