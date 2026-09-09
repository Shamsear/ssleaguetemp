import { fantasySql } from './lib/neon/fantasy-config';

async function test() {
  const league_id = 'SSPSLFLS18';

  const teams = await fantasySql`
    SELECT team_id, team_name, budget_remaining
    FROM fantasy_teams
    WHERE league_id = ${league_id} OR team_id IN ('SSPSLT0041', 'SSPSLT0001', 'SSPSLT0005', 'SSPSLT0021', 'SSPSLT0027', 'SSPSLT0003', 'SSPSLT0004', 'SSPSLT0015')
  `;

  const draftRounds = await fantasySql`
    SELECT slot_index, slot_name, status
    FROM fantasy_draft_rounds
    WHERE league_id = ${league_id}
    ORDER BY slot_index ASC
  `;

  const [leagueRow] = await fantasySql`
    SELECT category_settings
    FROM fantasy_leagues
    WHERE league_id = ${league_id}
  `;

  const windowReleases = await fantasySql`
    SELECT 
      fr.team_id,
      CASE
        WHEN fr.is_passive_team = true THEN 'PASSIVE TEAM'
        WHEN (fl.category_settings->'lists'->'red_list_2')::jsonb @> jsonb_build_array(fr.real_player_id) THEN 'RED 2'
        WHEN (fl.category_settings->'lists'->'red_list_1')::jsonb @> jsonb_build_array(fr.real_player_id) THEN 'RED 1'
        ELSE UPPER(COALESCE(NULLIF(fr.category, 'Unknown'), fp.category, 'RED 1'))
      END as resolved_category
    FROM fantasy_releases fr
    LEFT JOIN fantasy_leagues fl ON fr.league_id = fl.league_id
    LEFT JOIN fantasy_players fp ON (fr.real_player_id = fp.real_player_id OR fr.real_player_id = fp.id::text)
    WHERE fr.league_id = ${league_id}
  `;

  const wonBids = await fantasySql`
    SELECT team_id, category, is_passive_team
    FROM fantasy_post_release_bids
    WHERE league_id = ${league_id} AND status = 'won'
  `;

  const slots = typeof leagueRow?.category_settings === 'string'
    ? JSON.parse(leagueRow.category_settings)?.slots
    : leagueRow?.category_settings?.slots;

  const getCategoryInfo = (catName: string) => {
    const normCat = (catName || '').toUpperCase().trim();

    let foundSlotIndex = 99;
    let foundBasePrice = 10;
    let foundStatus = 'pending';

    if (slots && Array.isArray(slots)) {
      const slot = slots.find((s: any) => {
        const sName = (s.name || '').toUpperCase().trim();
        const sList = (s.list_id || '').toUpperCase().trim();
        if (normCat.includes('PASSIVE') || normCat.includes('SUPPORTED') || normCat.includes('REAL TEAM')) {
          return sName.includes('REAL TEAM') || sName.includes('PASSIVE') || sName.includes('SUPPORTED') || sList.includes('REAL_TEAM');
        }
        if (normCat === 'RED 1' || normCat === 'RED SLOT 1') return sName.includes('SLOT 1') || sName.includes('RED 1') || sList === 'RED_LIST_1';
        if (normCat === 'RED 2' || normCat === 'RED SLOT 2') return sName.includes('SLOT 2') || sName.includes('RED 2') || sList === 'RED_LIST_2';
        return sName.includes(normCat) || sList.includes(normCat.toLowerCase());
      });
      if (slot) {
        foundSlotIndex = Number(slot.slot_index);
        foundBasePrice = Number(slot.base_price) || 10;
      }
    }

    if (foundSlotIndex === 99) {
      if (normCat.includes('PASSIVE') || normCat.includes('SUPPORTED') || normCat.includes('REAL')) {
        foundSlotIndex = 6; foundBasePrice = 30;
      } else if (normCat === 'RED 1' || normCat === 'RED SLOT 1' || normCat === 'RED') {
        foundSlotIndex = 1; foundBasePrice = 25;
      } else if (normCat === 'RED 2' || normCat === 'RED SLOT 2') {
        foundSlotIndex = 2; foundBasePrice = 25;
      } else if (normCat === 'BLUE') {
        foundSlotIndex = 3; foundBasePrice = 15;
      } else if (normCat === 'BLACK') {
        foundSlotIndex = 4; foundBasePrice = 20;
      } else if (normCat === 'WHITE') {
        foundSlotIndex = 5; foundBasePrice = 10;
      }
    }

    const round = draftRounds?.find((r: any) => Number(r.slot_index) === foundSlotIndex);
    if (round) {
      foundStatus = round.status;
    }

    return {
      slotIndex: foundSlotIndex,
      basePrice: foundBasePrice,
      status: foundStatus
    };
  };

  const activeCategories = ['RED 1', 'RED 2', 'BLUE', 'BLACK', 'WHITE', 'PASSIVE TEAM'];

  for (const activeCat of activeCategories) {
    console.log(`\n================ ACTIVE CATEGORY: ${activeCat} ================`);
    const activeInfo = getCategoryInfo(activeCat);

    for (const team of teams) {
      const teamWonCats = new Set(
        wonBids
          .filter((b) => b.team_id === team.team_id)
          .map((b) => b.is_passive_team ? 'PASSIVE TEAM' : (b.category || '').toUpperCase().trim())
      );

      const teamReleases = windowReleases.filter((r) => r.team_id === team.team_id);
      const releaseCountsByCategory: Record<string, number> = {};
      for (const rel of teamReleases) {
        const catKey = (rel.resolved_category || '').toUpperCase().trim();
        releaseCountsByCategory[catKey] = (releaseCountsByCategory[catKey] || 0) + 1;
      }

      let reservedFunds = 0;
      const details: string[] = [];
      for (const [catKey, count] of Object.entries(releaseCountsByCategory)) {
        const catInfo = getCategoryInfo(catKey);
        const isFuture = catInfo.slotIndex > activeInfo.slotIndex;
        const isRoundUncompleted = catInfo.status !== 'completed' && catInfo.status !== 'finalized';
        const isTeamUncompleted = !teamWonCats.has(catKey);

        if (isFuture && isRoundUncompleted && isTeamUncompleted) {
          const resAmt = count * catInfo.basePrice;
          reservedFunds += resAmt;
          details.push(`${catKey} (slot ${catInfo.slotIndex}, status ${catInfo.status}, price ${catInfo.basePrice} x ${count} = ${resAmt})`);
        }
      }

      const currentBudget = parseFloat(team.budget_remaining || 0);
      const maxAllowedBid = Math.max(0, currentBudget - reservedFunds);
      console.log(`Team: ${team.team_name.padEnd(15)} | Budget: ${currentBudget} | Reserved: ${reservedFunds} (${details.join(', ') || 'none'}) | Max Bid: ${maxAllowedBid}`);
    }
  }
}

test().catch(console.error);
