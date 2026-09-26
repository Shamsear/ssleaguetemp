import { fantasySql } from './neon/fantasy-config';

async function inspectWindowIssues() {
  const leagueId = 'SSPSLFLS18';
  const windowId = 'window_1790229971230_wtpw1uhf8'; // Round 18-22

  console.log('=== 1. BIDS IN FANTASY_POST_RELEASE_BIDS FOR PASSIVE TEAM ===');
  const bids = await fantasySql`
    SELECT b.*, ft.team_name
    FROM fantasy_post_release_bids b
    JOIN fantasy_teams ft ON b.team_id = ft.team_id
    WHERE b.league_id = ${leagueId}
      AND (b.draft_round_id = ${windowId} OR b.bid_id LIKE ${'%' + windowId + '%'})
      AND (b.category ILIKE 'Passive Team' OR b.is_passive_team = true)
  `;
  console.table(bids);

  console.log('\n=== 2. ALL RELEASES IN FANTASY_RELEASES BY WINDOW_ID ===');
  const releases = await fantasySql`
    SELECT r.release_id, r.team_id, ft.team_name, r.player_name, r.category, r.is_passive_team, r.window_id, r.released_at
    FROM fantasy_releases r
    JOIN fantasy_teams ft ON r.team_id = ft.team_id
    WHERE r.league_id = ${leagueId}
    ORDER BY r.released_at DESC
  `;
  console.table(releases);

  console.log('\n=== 3. CURRENT FANTASY_TEAMS BUDGETS ===');
  const teams = await fantasySql`
    SELECT team_id, team_name, budget_remaining, supported_team_id, supported_team_name
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
    ORDER BY team_name ASC
  `;
  console.table(teams);
}

inspectWindowIssues().catch(console.error);
