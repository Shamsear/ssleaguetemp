import { fantasySql } from './neon/fantasy-config';

async function main() {
  const leagueId = 'SSPSLFLS18';

  const wonPostBids = await fantasySql`
    SELECT b.*, ft.team_name
    FROM fantasy_post_release_bids b
    JOIN fantasy_teams ft ON b.team_id = ft.team_id
    WHERE b.league_id = ${leagueId} AND b.status = 'won'
    ORDER BY b.submitted_at ASC
  `;

  console.log('=== ALL WON POST-RELEASE BIDS IN FANTASY_POST_RELEASE_BIDS ===\n');
  console.table(wonPostBids.map((b: any) => ({
    team_name: b.team_name,
    target_id: b.target_id,
    target_name: b.target_name,
    is_passive_team: b.is_passive_team,
    bid_amount: b.bid_amount,
    submitted_at: b.submitted_at
  })));
}

main().catch(console.error);
