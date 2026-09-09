import { fantasySql } from './lib/neon/fantasy-config';

async function main() {
  const rels = await fantasySql`
    SELECT fr.release_id, fr.team_id, fr.real_player_id, fr.player_name, fr.category, fr.is_passive_team, fp.category as fp_cat
    FROM fantasy_releases fr
    LEFT JOIN fantasy_players fp ON (fr.real_player_id = fp.real_player_id OR fr.real_player_id = fp.id::text)
    WHERE fr.team_id = 'SSPSLT0005'
  `;
  console.log('TM Asgardians releases:', JSON.stringify(rels, null, 2));

  const wonBids = await fantasySql`
    SELECT * FROM fantasy_post_release_bids WHERE team_id = 'SSPSLT0005'
  `;
  console.log('TM Asgardians post-release bids:', JSON.stringify(wonBids, null, 2));

  const draftBids = await fantasySql`
    SELECT * FROM fantasy_draft_bids WHERE team_id = 'SSPSLT0005' AND status = 'won'
  `;
  console.log('TM Asgardians won draft bids:', JSON.stringify(draftBids, null, 2));

  const rounds = await fantasySql`
    SELECT slot_index, slot_name, status FROM fantasy_draft_rounds WHERE league_id = 'SSPSLFLS18'
  `;
  console.log('Rounds:', JSON.stringify(rounds, null, 2));
}
main().catch(console.error);
