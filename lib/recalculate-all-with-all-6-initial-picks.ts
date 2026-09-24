import { fantasySql } from './neon/fantasy-config';

async function main() {
  const leagueId = 'SSPSLFLS18';

  const teams = await fantasySql`
    SELECT team_id, team_name, owner_name, supported_team_id, supported_team_name, supported_team_price, budget_remaining
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
    ORDER BY team_name ASC
  `;

  // 1. Initial Draft Bids (August 25-26)
  const allInitialBids = await fantasySql`
    SELECT b.*, ft.team_name, fp.player_name as catalog_player_name
    FROM fantasy_draft_bids b
    JOIN fantasy_teams ft ON ft.team_id = b.team_id
    LEFT JOIN fantasy_players fp ON fp.real_player_id = b.target_id
    WHERE b.league_id = ${leagueId} AND b.status = 'won'
    ORDER BY b.submitted_at ASC
  `;

  // 2. All Releases Logged
  const releases = await fantasySql`
    SELECT r.*, ft.team_name as releasing_team_name
    FROM fantasy_releases r
    LEFT JOIN fantasy_teams ft ON ft.team_id = r.team_id
    WHERE r.league_id = ${leagueId}
    ORDER BY r.released_at ASC
  `;

  // 3. All Post-Release Draft Won Bids (Both Players and Passive Teams)
  const postReleaseBids = await fantasySql`
    SELECT b.*, ft.team_name
    FROM fantasy_post_release_bids b
    JOIN fantasy_teams ft ON ft.team_id = b.team_id
    WHERE b.league_id = ${leagueId} AND b.status = 'won'
    ORDER BY b.submitted_at ASC
  `;

  console.log('========================================================================');
  console.log('=== COMPLETE 100% AUDIT FOR ALL 8 TEAMS (INCL PASSIVE TEAM AUCTIONS) ===');
  console.log('========================================================================\n');

  for (const t of teams) {
    console.log(`========================================================================`);
    console.log(`TEAM: ${t.team_name.toUpperCase()} (Owner: ${t.owner_name} | ID: ${t.team_id})`);
    console.log(`========================================================================`);
    console.log(`[START] Initial Starting Budget: 500.00 pts\n`);

    let runningBalance = 500.00;

    // STEP 1: ALL 6 INITIAL DRAFT PICKS (Submitted Aug 25-26)
    const initialBids = allInitialBids.filter((b: any) => 
      b.team_id === t.team_id && 
      new Date(b.submitted_at).getTime() < new Date('2026-09-01').getTime()
    );

    console.log(`--- STEP 1: INITIAL DRAFT PICKS (ALL 6 SLOTS) ---`);
    let initialSpend = 0;
    initialBids.forEach((b: any) => {
      const price = Number(b.bid_amount || 0);
      initialSpend += price;
      const name = b.catalog_player_name || b.target_id;
      const type = b.bid_type === 'real_team' || b.slot_index === 6 ? '[SUPPORTED REAL TEAM]' : '[SQUAD PLAYER]';
      console.log(`  - Slot ${b.slot_index}: ${type} ${name} (${b.target_id}) @ -${price} pts`);
    });

    runningBalance -= initialSpend;
    console.log(`  > Total Initial Draft Spend (6 Slots): -${initialSpend}.00 pts`);
    console.log(`  > Balance after Initial Draft: ${runningBalance}.00 pts\n`);

    // STEP 2: RELEASES, REFUNDS & POST-RELEASE ACQUISITIONS (CHRONOLOGICAL)
    console.log(`--- STEP 2: CHRONOLOGICAL RELEASES, REFUNDS & POST-RELEASE ACQUISITIONS ---`);
    
    // Combine releases & post-release bids by timestamp
    const teamReleases = releases.filter((r: any) => r.team_id === t.team_id).map((r: any) => ({
      type: 'RELEASE',
      timestamp: new Date(r.released_at).getTime(),
      dateStr: r.released_at,
      name: r.player_name,
      id: r.real_player_id,
      amount: Number(r.refund_amount || 0),
      isPassive: r.is_passive_team
    }));

    const teamPostBids = postReleaseBids.filter((b: any) => b.team_id === t.team_id).map((b: any) => ({
      type: 'ACQUISITION',
      timestamp: new Date(b.submitted_at).getTime(),
      dateStr: b.submitted_at,
      name: b.target_name,
      id: b.target_id,
      amount: Number(b.bid_amount || 0),
      isPassive: b.is_passive_team
    }));

    const timeline = [...teamReleases, ...teamPostBids].sort((a, b) => a.timestamp - b.timestamp);

    let totalRefunds = 0;
    let totalSpend = 0;

    if (timeline.length === 0) {
      console.log(`  (No releases or post-release acquisitions recorded)`);
    } else {
      timeline.forEach((item) => {
        if (item.type === 'RELEASE') {
          totalRefunds += item.amount;
          runningBalance += item.amount;
          const tag = item.isPassive ? '[PASSIVE REAL TEAM]' : '[PLAYER]';
          console.log(`  - RELEASED ${tag} ${item.name} (${item.id}): +${item.amount} pts refund [At: ${new Date(item.dateStr).toISOString()}] -> Running Balance: ${runningBalance}.00 pts`);
        } else {
          totalSpend += item.amount;
          runningBalance -= item.amount;
          const tag = item.isPassive ? '[PASSIVE REAL TEAM]' : '[PLAYER]';
          console.log(`  - ACQUIRED ${tag} ${item.name} (${item.id}) via Auction: -${item.amount} pts spend [At: ${new Date(item.dateStr).toISOString()}] -> Running Balance: ${runningBalance}.00 pts`);
        }
      });
    }

    console.log(`\n  > Total Refunds Received: +${totalRefunds}.00 pts`);
    console.log(`  > Total Post-Release Spend: -${totalSpend}.00 pts`);
    console.log(`  > Final Calculated Balance: ${runningBalance}.00 pts\n`);

    // STEP 3: AUDIT COMPARISON
    const currentDbBudget = Number(t.budget_remaining || 0);
    const diff = currentDbBudget - runningBalance;

    console.log(`--- STEP 3: AUDIT COMPARISON ---`);
    console.log(`  Calculated Correct Balance:  ${runningBalance}.00 pts`);
    console.log(`  Current Database Balance:    ${currentDbBudget}.00 pts`);
    if (Math.abs(diff) < 0.01) {
      console.log(`  Status: ✅ PERFECT MATCH! DB balance is 100% correct.`);
    } else {
      console.log(`  Status: ❌ MISMATCH DETECTED! DB is off by ${diff > 0 ? '+' : ''}${diff}.00 pts`);
    }
    console.log(`\n`);
  }
}

main().catch(console.error);
