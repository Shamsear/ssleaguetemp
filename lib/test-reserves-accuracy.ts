import { fantasySql } from './neon/fantasy-config';

async function testReserves() {
  console.log('=== TESTING ACCURATE RESERVED FUNDS FOR ALL 8 TEAMS ===\n');

  const leagueId = 'SSPSLFLS18';
  const windowId = 'window_1790229971230_wtpw1uhf8';

  const teams = await fantasySql`SELECT team_id, team_name, budget_remaining, supported_team_id FROM fantasy_teams WHERE league_id = ${leagueId} ORDER BY team_name ASC`;
  const releases = await fantasySql`
    SELECT 
      fr.team_id,
      fr.is_passive_team,
      fr.real_player_id,
      fr.player_name,
      CASE
        WHEN fr.is_passive_team = true THEN 'PASSIVE TEAM'
        WHEN (fl.category_settings->'lists'->'red_list_2')::jsonb @> jsonb_build_array(fr.real_player_id) THEN 'RED 2'
        WHEN (fl.category_settings->'lists'->'red_list_1')::jsonb @> jsonb_build_array(fr.real_player_id) THEN 'RED 1'
        ELSE UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), 'RED'))
      END as category
    FROM fantasy_releases fr
    LEFT JOIN fantasy_leagues fl ON fr.league_id = fl.league_id
    WHERE fr.window_id = ${windowId}
  `;

  const wonBids = await fantasySql`
    SELECT team_id, category, is_passive_team, target_name, bid_amount
    FROM fantasy_post_release_bids
    WHERE draft_round_id = ${windowId} AND status = 'won'
  `;

  const rounds = await fantasySql`SELECT slot_index, slot_name, status FROM fantasy_draft_rounds WHERE league_id = ${leagueId} ORDER BY slot_index ASC`;

  const basePrices: Record<string, number> = {
    'RED 1': 25,
    'RED 2': 25,
    'BLUE': 15,
    'BLACK': 20,
    'WHITE': 10,
    'PASSIVE TEAM': 30
  };

  const calculateReservesForTeam = (team: any, activeCat: string) => {
    const teamWon = wonBids.filter((b: any) => b.team_id === team.team_id);
    const wonCounts: Record<string, number> = {};
    teamWon.forEach((b: any) => {
      let cat = b.is_passive_team ? 'PASSIVE TEAM' : (b.category || '').toUpperCase().trim();
      if (cat.includes('PASSIVE') || cat.includes('SUPPORTED')) cat = 'PASSIVE TEAM';
      wonCounts[cat] = (wonCounts[cat] || 0) + 1;
    });

    const hasSupportedTeamFilled = !!(team.supported_team_id && String(team.supported_team_id).trim() !== '') || (wonCounts['PASSIVE TEAM'] || 0) > 0;

    const teamReleases = releases.filter((r: any) => r.team_id === team.team_id);
    const releaseCounts: Record<string, number> = {};
    teamReleases.forEach((r: any) => {
      let cat = r.is_passive_team ? 'PASSIVE TEAM' : (r.category || 'RED').toUpperCase().trim();
      releaseCounts[cat] = (releaseCounts[cat] || 0) + 1;
    });

    const activeNorm = activeCat.toUpperCase().includes('PASSIVE') || activeCat.toUpperCase().includes('SUPPORTED') ? 'PASSIVE TEAM' : activeCat.toUpperCase().trim();

    let reserved = 0;
    const breakdown: Record<string, { remainingToFill: number, price: number, reserved: number }> = {};

    Object.entries(releaseCounts).forEach(([cat, count]) => {
      const normCat = cat.includes('PASSIVE') || cat.includes('SUPPORTED') ? 'PASSIVE TEAM' : cat.toUpperCase().trim();
      const roundInfo = rounds.find((r: any) => {
        const sName = (r.slot_name || '').toUpperCase();
        if (normCat === 'PASSIVE TEAM') return sName.includes('REAL TEAM') || sName.includes('PASSIVE') || sName.includes('SUPPORTED');
        if (normCat === 'RED 1') return sName.includes('SLOT 1') || sName.includes('RED 1');
        if (normCat === 'RED 2') return sName.includes('SLOT 2') || sName.includes('RED 2');
        return sName.includes(normCat);
      });

      let remainingToFill = 0;
      if (normCat === 'PASSIVE TEAM') {
        remainingToFill = hasSupportedTeamFilled ? 0 : Math.max(0, count - (wonCounts['PASSIVE TEAM'] || 0));
      } else {
        const wonCount = wonCounts[normCat] || 0;
        remainingToFill = Math.max(0, count - wonCount);
      }

      const isOtherCat = normCat !== activeNorm;
      const isUncompleted = roundInfo?.status !== 'completed' && roundInfo?.status !== 'finalized';

      if (isOtherCat && isUncompleted && remainingToFill > 0) {
        const price = basePrices[normCat] || 10;
        const res = remainingToFill * price;
        reserved += res;
        breakdown[normCat] = { remainingToFill, price, reserved: res };
      }
    });

    return { reserved, breakdown, maxAllowed: Math.max(0, Number(team.budget_remaining) - reserved) };
  };

  console.log('--- SCENARIO A: Active Category = BLACK (Current Active Slot) ---');
  for (const t of teams) {
    const res = calculateReservesForTeam(t, 'BLACK');
    console.log(`${t.team_name} (Budget: ₹${t.budget_remaining} Cr): Reserved = ₹${res.reserved} Cr, Max Allowed Bid = ₹${res.maxAllowed} Cr`, Object.keys(res.breakdown).length > 0 ? res.breakdown : '(No future slots remaining)');
  }

  console.log('\n--- SCENARIO B: Active Category = Supported Team (Real Team Slot) ---');
  for (const t of teams) {
    const res = calculateReservesForTeam(t, 'PASSIVE TEAM');
    console.log(`${t.team_name} (Budget: ₹${t.budget_remaining} Cr): Reserved = ₹${res.reserved} Cr, Max Allowed Bid = ₹${res.maxAllowed} Cr`, Object.keys(res.breakdown).length > 0 ? res.breakdown : '(No future slots remaining)');
  }
}

testReserves().catch(console.error);
