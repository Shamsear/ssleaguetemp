import { fantasySql } from './neon/fantasy-config';

async function main() {
  const leagueId = 'SSPSLFLS18';
  const teamId = 'SSPSLT0041'; // ANDIMUKK FC

  console.log('=== FANTASY TEAM RECORD ===');
  const team = await fantasySql`
    SELECT * FROM fantasy_teams WHERE team_id = ${teamId} AND league_id = ${leagueId}
  `;
  console.table(team);

  console.log('\n=== DRAFT BIDS (WON) ===');
  const bids = await fantasySql`
    SELECT * FROM fantasy_draft_bids WHERE team_id = ${teamId} AND league_id = ${leagueId}
  `;
  console.table(bids);

  console.log('\n=== POST RELEASE BIDS ===');
  const postBids = await fantasySql`
    SELECT * FROM fantasy_post_release_bids WHERE team_id = ${teamId} AND league_id = ${leagueId}
  `;
  console.table(postBids);

  console.log('\n=== RELEASES ===');
  const releases = await fantasySql`
    SELECT * FROM fantasy_releases WHERE team_id = ${teamId} AND league_id = ${leagueId}
  `;
  console.table(releases);

  console.log('\n=== SQUAD ===');
  const squad = await fantasySql`
    SELECT * FROM fantasy_squad WHERE team_id = ${teamId} AND league_id = ${leagueId}
  `;
  console.table(squad);
}

main().catch(console.error);
