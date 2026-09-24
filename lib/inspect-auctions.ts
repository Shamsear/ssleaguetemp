import { fantasySql } from './neon/fantasy-config';

async function main() {
  const leagueId = 'SSPSLFLS18';

  console.log('=== 1. ALL BIDS IN FANTASY_DRAFT_BIDS ===');
  const allBids = await fantasySql`
    SELECT b.*, ft.team_name
    FROM fantasy_draft_bids b
    LEFT JOIN fantasy_teams ft ON ft.team_id = b.team_id
    WHERE b.league_id = ${leagueId}
  `;
  console.log(JSON.stringify(allBids, null, 2));

  console.log('\n=== 2. ALL POST RELEASE ACQUISITIONS IN SQUAD ===');
  const postReleaseSquad = await fantasySql`
    SELECT s.*, ft.team_name
    FROM fantasy_squad s
    JOIN fantasy_teams ft ON ft.team_id = s.team_id
    WHERE s.league_id = ${leagueId} AND s.acquisition_type != 'draft'
    ORDER BY s.acquired_at ASC
  `;
  console.log(JSON.stringify(postReleaseSquad, null, 2));
}

main().catch(console.error);
