import { fantasySql } from './neon/fantasy-config';

async function main() {
  const windowId = 'window_1790229971230_wtpw1uhf8';
  const leagueId = 'SSPSLFLS18';

  const releases = await fantasySql`
    SELECT release_id, team_id, real_player_id, player_name, category, is_passive_team
    FROM fantasy_releases
    WHERE league_id = ${leagueId} AND window_id = ${windowId}
  `;

  console.log('Window 2 Releases:');
  console.table(releases);

  const bids = await fantasySql`
    SELECT bid_id, team_id, category, is_passive_team, target_id, target_name, bid_amount, status
    FROM fantasy_post_release_bids
    WHERE league_id = ${leagueId}
      AND (draft_round_id = ${windowId} OR bid_id LIKE ${'%' + windowId + '%'})
  `;

  console.log('Window 2 Bids:');
  console.table(bids);

  const selfReleaseBids = bids.filter((b: any) => {
    return releases.some((r: any) => {
      if (String(r.team_id) !== String(b.team_id)) return false;
      const rId = String(r.real_player_id || '').replace(/_.*$/, '').toUpperCase();
      const rName = (r.player_name || '').toUpperCase().trim();
      const bId = String(b.target_id || '').replace(/_.*$/, '').toUpperCase();
      const bName = (b.target_name || '').toUpperCase().trim();
      return rId === bId || rName === bName;
    });
  });

  console.log('Self-release bids found in DB:', selfReleaseBids.length);
  if (selfReleaseBids.length > 0) {
    console.table(selfReleaseBids);
    const deleted = await fantasySql`
      DELETE FROM fantasy_post_release_bids
      WHERE bid_id = ANY(${selfReleaseBids.map((b: any) => b.bid_id)})
      RETURNING bid_id, team_id, target_name
    `;
    console.log('Deleted self-release bids:', deleted);
  }
}

main().catch(console.error);
