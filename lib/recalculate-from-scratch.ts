import { fantasySql } from './neon/fantasy-config';

async function main() {
  const leagueId = 'SSPSLFLS18';

  const teams = await fantasySql`
    SELECT team_id, team_name, owner_name, supported_team_id, supported_team_name, supported_team_price, budget_remaining
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
    ORDER BY team_name ASC
  `;

  const squad = await fantasySql`
    SELECT s.*, ft.team_name
    FROM fantasy_squad s
    JOIN fantasy_teams ft ON ft.team_id = s.team_id
    WHERE s.league_id = ${leagueId}
    ORDER BY s.acquired_at ASC
  `;

  const releases = await fantasySql`
    SELECT r.*, ft.team_name as releasing_team_name
    FROM fantasy_releases r
    LEFT JOIN fantasy_teams ft ON ft.team_id = r.team_id
    WHERE r.league_id = ${leagueId}
    ORDER BY r.released_at ASC
  `;

  const wonBids = await fantasySql`
    SELECT b.*, ft.team_name
    FROM fantasy_draft_bids b
    JOIN fantasy_teams ft ON ft.team_id = b.team_id
    WHERE b.league_id = ${leagueId} AND b.status = 'won'
    ORDER BY b.submitted_at ASC
  `;

  console.log('========================================================================');
  console.log('=== FROM-SCRATCH STEP-BY-STEP FANTASY BUDGET AUDIT (NO DB BALANCE USED) ===');
  console.log('========================================================================\n');

  for (const t of teams) {
    console.log(`========================================================================`);
    console.log(`TEAM: ${t.team_name.toUpperCase()} (Owner: ${t.owner_name} | ID: ${t.team_id})`);
    console.log(`========================================================================`);
    console.log(`[START] Initial Starting Budget: 500.00 pts\n`);

    let runningBalance = 500.00;

    // STEP 1: INITIAL DRAFT PICKS (Slot 1 to 5 players + Slot 6 real team)
    console.log(`--- STEP 1: INITIAL DRAFT ACQUISITIONS ---`);
    
    // Initial Squad Players (acquisition_type = 'draft')
    const initialSquad = squad.filter((s: any) => s.team_id === t.team_id && s.acquisition_type === 'draft');
    let initialSquadSpend = 0;
    initialSquad.forEach((s: any) => {
      const price = Number(s.purchase_price || 0);
      initialSquadSpend += price;
      console.log(`  - Drafted Player: ${s.player_name} (${s.real_player_id}) @ -${price} pts`);
    });

    // Initial Passive Real Team (From won bids for slot 6 or initial draft)
    // Find initial slot 6 won bid or release record purchase price
    const slot6Bid = wonBids.find((b: any) => b.team_id === t.team_id && (b.slot_index === 6 || b.bid_type === 'real_team'));
    let initialPassivePrice = 0;
    let initialPassiveName = '';

    if (slot6Bid) {
      initialPassivePrice = Number(slot6Bid.bid_amount || 0);
      initialPassiveName = slot6Bid.target_id;
      console.log(`  - Drafted Supported Real Team: ${initialPassiveName} @ -${initialPassivePrice} pts`);
    } else if (t.supported_team_name) {
      initialPassivePrice = Number(t.supported_team_price || 0);
      initialPassiveName = t.supported_team_name;
      console.log(`  - Drafted Supported Real Team: ${initialPassiveName} @ -${initialPassivePrice} pts`);
    }

    const totalInitialSpend = initialSquadSpend + initialPassivePrice;
    runningBalance -= totalInitialSpend;

    console.log(`  > Total Initial Draft Spend: -${totalInitialSpend}.00 pts`);
    console.log(`  > Balance after Initial Draft: ${runningBalance}.00 pts\n`);

    // STEP 2: RELEASES & REFUNDS (CHRONOLOGICAL ORDER)
    console.log(`--- STEP 2: RELEASES & REFUNDS LOGGED ---`);
    const teamReleases = releases.filter((r: any) => r.team_id === t.team_id);
    let totalRefundsReceived = 0;

    if (teamReleases.length === 0) {
      console.log(`  (No releases recorded)`);
    } else {
      teamReleases.forEach((r: any) => {
        const refund = Number(r.refund_amount || 0);
        totalRefundsReceived += refund;
        runningBalance += refund;
        const tag = r.is_passive_team ? '[PASSIVE REAL TEAM]' : '[PLAYER]';
        console.log(`  - Released ${tag} ${r.player_name} (${r.real_player_id}): +${refund} pts refund [At: ${new Date(r.released_at).toISOString()}] -> Running Balance: ${runningBalance}.00 pts`);
      });
    }

    console.log(`  > Total Refunds Received: +${totalRefundsReceived}.00 pts`);
    console.log(`  > Balance after Releases: ${runningBalance}.00 pts\n`);

    // STEP 3: POST-RELEASE DRAFT ACQUISITIONS (AFTER-WEEK AUCTIONS)
    console.log(`--- STEP 3: POST-RELEASE DRAFT ACQUISITIONS (AUCTION WINNERS) ---`);
    const postReleaseSquad = squad.filter((s: any) => s.team_id === t.team_id && s.acquisition_type === 'post_release_draft');
    let totalPostReleaseSpend = 0;

    if (postReleaseSquad.length === 0) {
      console.log(`  (No post-release acquisitions recorded)`);
    } else {
      postReleaseSquad.forEach((s: any) => {
        const price = Number(s.purchase_price || 0);
        totalPostReleaseSpend += price;
        runningBalance -= price;
        console.log(`  - Acquired via Post-Release Auction: ${s.player_name} (${s.real_player_id}) @ -${price} pts [At: ${new Date(s.acquired_at).toISOString()}] -> Running Balance: ${runningBalance}.00 pts`);
      });
    }

    console.log(`  > Total Post-Release Draft Spend: -${totalPostReleaseSpend}.00 pts`);
    console.log(`  > Final Calculated Balance: ${runningBalance}.00 pts\n`);

    // STEP 4: COMPARISON WITH CURRENT DB BALANCE
    const currentDbBudget = Number(t.budget_remaining || 0);
    const diff = currentDbBudget - runningBalance;

    console.log(`--- STEP 4: AUDIT COMPARISON ---`);
    console.log(`  Calculated Correct Balance:  ${runningBalance}.00 pts`);
    console.log(`  Current Database Balance:    ${currentDbBudget}.00 pts`);
    if (Math.abs(diff) < 0.01) {
      console.log(`  Status: ✅ PERFECT MATCH! No budget discrepancy.`);
    } else {
      console.log(`  Status: ❌ MISMATCH DETECTED! DB is off by ${diff > 0 ? '+' : ''}${diff}.00 pts`);
      console.log(`  Reason: Database budget_remaining omitted +${totalRefundsReceived}.00 pts in release refunds.`);
    }
    console.log(`\n`);
  }
}

main().catch(console.error);
