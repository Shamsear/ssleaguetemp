import { fantasySql } from './neon/fantasy-config';

async function main() {
  const windowId = 'window_1790229971230_wtpw1uhf8';
  const leagueId = 'SSPSLFLS18';

  console.log('=== CLEANING UP INVALID & UNRELEASED PASSIVE TEAM BIDS ===\n');

  // Delete bids for unreleased passive targets in Window 2
  const deletedBids = await fantasySql`
    DELETE FROM fantasy_post_release_bids
    WHERE league_id = ${leagueId}
      AND (draft_round_id = ${windowId} OR bid_id LIKE ${'%' + windowId + '%'})
      AND (category ILIKE 'Passive Team' OR is_passive_team = true)
      AND target_name IN ('MANCHESTER UNITED', 'BLUE STRIKERS', 'LOS GALACTICOS')
    RETURNING bid_id, team_id, target_name, bid_amount
  `;
  console.log('Deleted unreleased passive target bids:', deletedBids);

  // Delete duplicate target_id variant bid for CLASSIC TENS (SSPSLT0001_SSPSLS18) keeping SSPSLT0001
  const deletedDup = await fantasySql`
    DELETE FROM fantasy_post_release_bids
    WHERE league_id = ${leagueId}
      AND (draft_round_id = ${windowId} OR bid_id LIKE ${'%' + windowId + '%'})
      AND (category ILIKE 'Passive Team' OR is_passive_team = true)
      AND target_id = 'SSPSLT0001_SSPSLS18'
    RETURNING bid_id, team_id, target_name, bid_amount
  `;
  console.log('Deleted duplicate variant bid for CLASSIC TENS:', deletedDup);

  console.log('\n=== REMAINING WINDOW 2 PASSIVE TEAM BIDS ===\n');
  const remainingBids = await fantasySql`
    SELECT bid_id, team_id, team_name, target_id, target_name, bid_amount, status, submitted_at
    FROM fantasy_post_release_bids
    WHERE league_id = ${leagueId}
      AND (draft_round_id = ${windowId} OR bid_id LIKE ${'%' + windowId + '%'})
      AND (category ILIKE 'Passive Team' OR is_passive_team = true)
  `;
  console.table(remainingBids);
}

main().catch(console.error);
