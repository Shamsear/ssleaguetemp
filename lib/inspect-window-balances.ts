import { fantasySql } from './neon/fantasy-config';

async function main() {
  const windowId = 'window_1790229971230_wtpw1uhf8';
  const leagueId = 'SSPSLFLS18';

  console.log('=== 1. FANTASY TEAMS CURRENT BUDGETS ===');
  const teams = await fantasySql`
    SELECT team_id, team_name, budget_remaining, supported_team_id, supported_team_name, supported_team_price
    FROM fantasy_teams
    WHERE league_id = ${leagueId}
    ORDER BY team_name
  `;
  console.table(teams);

  console.log('\n=== 2. WON POST-RELEASE BIDS IN WINDOW 2 ===');
  const wonBids = await fantasySql`
    SELECT bid_id, draft_round_id, team_id, category, is_passive_team, target_id, target_name, bid_amount, status, submitted_at
    FROM fantasy_post_release_bids
    WHERE league_id = ${leagueId}
      AND (draft_round_id = ${windowId} OR bid_id LIKE ${'%' + windowId + '%'})
      AND status = 'won'
    ORDER BY category, submitted_at
  `;
  console.table(wonBids);

  console.log('\n=== 3. ALL POST-RELEASE BIDS IN WINDOW 2 (BY CATEGORY & STATUS) ===');
  const allWindowBids = await fantasySql`
    SELECT category, status, count(*) as count, sum(cast(bid_amount as numeric)) as total_amount
    FROM fantasy_post_release_bids
    WHERE league_id = ${leagueId}
      AND (draft_round_id = ${windowId} OR bid_id LIKE ${'%' + windowId + '%'})
    GROUP BY category, status
    ORDER BY category, status
  `;
  console.table(allWindowBids);

  console.log('\n=== 4. SQUAD PLAYERS ACQUIRED IN WINDOW 2 ===');
  const squadWindow = await fantasySql`
    SELECT squad_id, team_id, real_player_id, player_name, purchase_price, acquisition_type, acquired_at
    FROM fantasy_squad
    WHERE league_id = ${leagueId}
      AND (acquisition_type = 'window_draft' OR acquired_at >= '2026-09-20')
    ORDER BY acquired_at DESC
  `;
  console.table(squadWindow);
}

main().catch(console.error);
