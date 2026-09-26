import { fantasySql } from './neon/fantasy-config';

async function check() {
  const leagueId = 'SSPSLFLS18';
  const windowId = 'window_1790229971230_wtpw1uhf8';

  const teams = await fantasySql`SELECT team_id, team_name, budget_remaining, supported_team_id FROM fantasy_teams WHERE league_id = ${leagueId}`;
  const releases = await fantasySql`SELECT * FROM fantasy_releases WHERE window_id = ${windowId}`;
  const wonBids = await fantasySql`SELECT * FROM fantasy_post_release_bids WHERE draft_round_id = ${windowId} AND status = 'won'`;
  const squad = await fantasySql`SELECT team_id, real_player_id, purchase_price FROM fantasy_squad WHERE league_id = ${leagueId}`;
  const rounds = await fantasySql`SELECT * FROM fantasy_draft_rounds WHERE league_id = ${leagueId} ORDER BY slot_index ASC`;

  console.log('=== DRAFT ROUNDS ===');
  console.table(rounds.map(r => ({ slot_index: r.slot_index, name: r.slot_name, status: r.status })));

  console.log('=== TEAMS ===');
  for (const t of teams) {
    const tReleases = releases.filter(r => r.team_id === t.team_id);
    const tWon = wonBids.filter(b => b.team_id === t.team_id);
    const tSquad = squad.filter(s => s.team_id === t.team_id);
    console.log({
      team_name: t.team_name,
      budget: t.budget_remaining,
      supported_team_id: t.supported_team_id,
      releases_count: tReleases.length,
      releases: tReleases.map(r => ({ name: r.player_name, cat: r.category, is_passive: r.is_passive_team })),
      won_bids: tWon.map(w => ({ target: w.target_name, cat: w.category, amount: w.bid_amount })),
      squad_count: tSquad.length
    });
  }
}
check().catch(console.error);
