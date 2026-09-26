import { fantasySql } from './neon/fantasy-config';

async function main() {
  const teamId = 'SSPSLT0003';
  const leagueId = 'SSPSLFLS18';

  // 1. Fetch active window
  const [activeWin] = await fantasySql`
    SELECT window_id, is_active FROM fantasy_transfer_windows
    WHERE league_id = ${leagueId}
    ORDER BY opens_at DESC LIMIT 1
  `;
  console.log('Active Window in DB:', activeWin);

  const targetWindowId = activeWin?.window_id || 'window_1790229971230_wtpw1uhf8';

  // 2. Run query from eligible-categories/route.ts
  const releases = await fantasySql`
    SELECT 
      CASE
        WHEN fr.is_passive_team = true THEN 'Passive Team'
        WHEN (fl.category_settings->'lists'->'red_list_2')::jsonb @> jsonb_build_array(fr.real_player_id) THEN 'RED 2'
        WHEN (fl.category_settings->'lists'->'red_list_1')::jsonb @> jsonb_build_array(fr.real_player_id) THEN 'RED 1'
        WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' AND (fdb.slot_index = 2 OR fdr.slot_name ILIKE '%Slot 2%') THEN 'RED 2'
        WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' AND (fdb.slot_index = 1 OR fdr.slot_name ILIKE '%Slot 1%') THEN 'RED 1'
        WHEN UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, '')) = 'RED' THEN 'RED 1'
        ELSE UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, 'Red'))
      END as resolved_category,
      COUNT(*) as count
    FROM fantasy_releases fr
    LEFT JOIN fantasy_leagues fl ON fr.league_id = fl.league_id
    LEFT JOIN fantasy_players fp ON (fr.real_player_id = fp.real_player_id OR fr.real_player_id = fp.id::text)
    LEFT JOIN fantasy_draft_bids fdb ON (
      (fdb.target_id::text = fp.id::text OR fdb.target_id::text = fp.real_player_id::text OR fdb.target_id::text = fr.real_player_id::text)
      AND fdb.status = 'won'
    )
    LEFT JOIN fantasy_draft_rounds fdr ON fdb.round_id = fdr.id
    WHERE fr.team_id = ${teamId}
      AND (fr.window_id = ${targetWindowId} OR fr.league_id = ${leagueId})
    GROUP BY 1
  `;
  console.log('Eligible Categories query result:', releases);

  const [teamRow] = await fantasySql`
    SELECT supported_team_id FROM fantasy_teams WHERE team_id = ${teamId}
  `;
  console.log('teamRow supported_team_id:', teamRow);
}

main().catch(console.error);
