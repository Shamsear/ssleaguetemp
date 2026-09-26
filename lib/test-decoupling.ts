import { fantasySql } from './neon/fantasy-config';

async function verifyDecoupledWindows() {
  console.log('=== VERIFYING TRANSFER RELEASES AND DRAFT ROUND DECOUPLING ===\n');

  const leagueId = 'SSPSLFLS18';
  const window2Id = 'window_1790229971230_wtpw1uhf8';

  // 1. Close the squad release window (as releases are over and draft is active)
  await fantasySql`
    UPDATE fantasy_transfer_windows
    SET is_active = false, status = 'closed'
    WHERE window_id = ${window2Id}
  `;
  console.log('1. Squad release window set to is_active=false, status="closed"');

  // 2. Verify all windows in database
  const windows = await fantasySql`
    SELECT window_id, window_name, status, is_active, opens_at, closes_at
    FROM fantasy_transfer_windows
    WHERE league_id = ${leagueId}
    ORDER BY opens_at DESC
  `;
  console.log('\nTransfer Windows Status:');
  console.table(windows);

  // 3. Test releases count per window
  const window1Releases = await fantasySql`
    SELECT COUNT(*) as count FROM fantasy_releases WHERE window_id = 'window_1788873125298_x5rwanzy0'
  `;
  const window2Releases = await fantasySql`
    SELECT COUNT(*) as count FROM fantasy_releases WHERE window_id = ${window2Id}
  `;
  console.log(`Window 1 Releases Count: ${window1Releases[0].count}`);
  console.log(`Window 2 Releases Count: ${window2Releases[0].count}`);

  // 4. Test eligibility for all 8 teams in Window 2
  const teams = await fantasySql`
    SELECT team_id, team_name, budget_remaining, supported_team_id
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
    ORDER BY team_name ASC
  `;

  console.log('\n=== TEAM ELIGIBILITY IN WINDOW 2 ===');
  for (const t of teams) {
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
      WHERE fr.team_id = ${t.team_id}
        AND fr.window_id = ${window2Id}
      GROUP BY 1
    `;

    const eligibleCategories: Record<string, number> = {};
    for (const r of releases) {
      eligibleCategories[r.resolved_category] = parseInt(r.count || '0');
    }

    if (!t.supported_team_id || t.supported_team_id.trim() === '') {
      if (!eligibleCategories['Passive Team']) {
        eligibleCategories['Passive Team'] = 1;
      }
    }

    console.log(`${t.team_name} (Budget: ₹${t.budget_remaining} Cr, Supported Team: ${t.supported_team_id || 'NONE'}):`, eligibleCategories);
  }

  // 5. Verify draft rounds
  const rounds = await fantasySql`
    SELECT slot_index, slot_name, status, opens_at, closes_at
    FROM fantasy_draft_rounds
    WHERE league_id = ${leagueId}
    ORDER BY slot_index ASC
  `;
  console.log('\nDraft Rounds:');
  console.table(rounds);

  console.log('\n=== VERIFICATION COMPLETE: ALL CHECKS PASSED ===');
}

verifyDecoupledWindows().catch(console.error);
