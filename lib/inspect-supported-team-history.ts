import { fantasySql } from './neon/fantasy-config';

async function checkSupportedTeamHistory() {
  const leagueId = 'SSPSLFLS18';

  console.log('=== SUPPORTED TEAM HISTORY ACROSS WINDOWS ===');

  // Initial Draft Slot 6
  const initialSlot6 = await fantasySql`
    SELECT team_id, target_id, bid_amount 
    FROM fantasy_draft_bids 
    WHERE league_id = ${leagueId} AND slot_index = 6 AND status = 'won'
  `;
  console.log('\n1. Initial Draft (R1-R6) Supported Teams:');
  console.table(initialSlot6);

  // Releases of supported teams
  const passiveReleases = await fantasySql`
    SELECT r.team_id, t.team_name, r.real_player_id, r.player_name, r.window_id, tw.window_name, tw.start_round, tw.end_round, r.released_at
    FROM fantasy_releases r
    LEFT JOIN fantasy_teams t ON r.team_id = t.team_id
    LEFT JOIN fantasy_transfer_windows tw ON r.window_id = tw.window_id
    WHERE r.league_id = ${leagueId} AND r.is_passive_team = true
    ORDER BY tw.start_round ASC, r.released_at ASC
  `;
  console.log('\n2. Passive Team Releases:');
  console.table(passiveReleases);

  // Post release bids won for passive teams
  const passiveWonBids = await fantasySql`
    SELECT b.team_id, t.team_name, b.target_id, b.target_name, b.draft_round_id, tw.window_name, tw.start_round, tw.end_round, b.bid_amount
    FROM fantasy_post_release_bids b
    LEFT JOIN fantasy_teams t ON b.team_id = t.team_id
    LEFT JOIN fantasy_transfer_windows tw ON b.draft_round_id = tw.window_id
    WHERE b.league_id = ${leagueId} AND b.is_passive_team = true AND b.status = 'won'
    ORDER BY tw.start_round ASC
  `;
  console.log('\n3. Won Post-Release Bids for Supported Teams:');
  console.table(passiveWonBids);

  // Current fantasy_teams
  const currentTeams = await fantasySql`
    SELECT team_id, team_name, supported_team_id
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
  `;
  console.log('\n4. Current fantasy_teams supported_team_id:');
  console.table(currentTeams);
}

checkSupportedTeamHistory().catch(console.error);
