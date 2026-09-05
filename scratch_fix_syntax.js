const fs = require('fs');

const filesToFix = [
  'app/api/auction/rounds/route.ts',
  'app/api/auth/request-password-reset/route.ts',
  'app/api/committee/player-eligibility/route.ts',
  'app/api/committee/player-stats-by-round/route.ts',
  'app/api/fantasy/admin/supported-team-window/route.ts',
  'app/api/fantasy/calculate-points/route.ts',
  'app/api/fantasy/challenges/route.ts',
  'app/api/fantasy/draft/all-bids/route.ts',
  'app/api/fantasy/draft/bids/my-bids/route.ts',
  'app/api/fantasy/draft/my-results/route.ts',
  'app/api/fantasy/draft/player/route.ts',
  'app/api/fantasy/draft/submissions/route.ts',
  'app/api/fantasy/draft/submit-tier-bids/route.ts',
  'app/api/fantasy/draft/tier-results/route.ts',
  'app/api/fantasy/leaderboard/[leagueId]/route.ts',
  'app/api/fantasy/leagues/[leagueId]/route.ts',
  'app/api/fantasy/leagues/route.ts',
  'app/api/fantasy/lineups/auto-lock/route.ts',
  'app/api/fantasy/lineups/calculate-points/route.ts',
  'app/api/fantasy/players-performance/route.ts',
  'app/api/fantasy/players/[playerId]/matches/route.ts',
  'app/api/fantasy/players/[playerId]/stats/route.ts',
  'app/api/fantasy/recalculate-passive-points/route.ts',
  'app/api/fantasy/round-complete/route.ts',
  'app/api/fantasy/squad/route.ts',
  'app/api/fantasy/squad/set-lineup/route.ts',
  'app/api/fantasy/teams/[teamId]/breakdown/route.ts',
  'app/api/fantasy/teams/[teamId]/passive-breakdown/route.ts',
  'app/api/fantasy/teams/enable-all/route.ts',
  'app/api/fantasy/teams/fix-uids/route.ts',
  'app/api/fantasy/trades/propose/route.test.ts',
  'app/api/fantasy/trades/respond/route.test.ts',
  'app/api/fantasy/transfers/all/route.ts',
  'app/api/fantasy/transfers/history/route.ts',
  'app/api/fixtures/[fixtureId]/audit-log/route.ts',
  'app/api/fixtures/[fixtureId]/auto-create-matchups/route.ts',
  'app/api/fixtures/[fixtureId]/lineup/route.ts',
  'app/api/fixtures/[fixtureId]/submit-lineup/route.ts',
  'app/api/fixtures/fix-ids/route.ts',
  'app/api/knockout/generate/route.ts',
  'app/api/lineups/auto-lock/route.ts',
  'app/api/lineups/route.ts',
  'app/api/news/[newsId]/react/route.ts',
  'app/api/news/route.ts',
  'app/api/players/database/apply/route.ts',
  'app/api/players/database/scrape-single/route.ts',
  'app/api/players/database/scrape/route.ts',
  'app/api/players/search/route.ts',
  'app/api/players/simple-swap/route.ts',
  'app/api/players/swap-v2/route.ts',
  'app/api/players/swap/route.ts',
  'app/api/players/transfer/route.ts',
  'app/api/players/with-stats/route.ts',
  'app/api/polls/[pollId]/voters/route.ts',
  'app/api/polls/close/route.ts',
  'app/api/public/hall-of-fame/route.ts',
  'app/api/realplayers/recalculate-categories/route.ts',
  'app/api/realplayers/revert-fixture-points/route.ts',
  'app/api/realplayers/update-points/route.ts',
  'app/api/register/player/delete/route.ts',
  'app/api/reports/cash-balances/route.ts',
  'app/api/round-deadlines/[id]/control/route.ts',
  'app/api/rounds/[id]/route.ts',
  'app/api/seasons/[id]/auction-data/route.ts',
  'app/api/seasons/[id]/stats/route.ts',
  'app/api/seasons/historical/[id]/export/route.ts',
  'app/api/seasons/historical/[id]/import/route.ts',
  'app/api/seasons/historical/[id]/route.ts',
  'app/api/seasons/historical/import/route.ts',
  'app/api/seasons/list/route.ts',
  'app/api/stats/players/route.ts',
  'app/api/superadmin/player-stats-bulk-update/export/route.ts',
  'app/api/superadmin/player-stats-bulk-update/import/route.ts',
  'app/api/superadmin/player-stats-bulk-update/preview/route.ts',
  'app/api/team/[teamId]/players/route.ts',
  'app/api/team/auction-results/route.ts',
  'app/api/team/dashboard/route.ts',
  'app/api/team/players/route.ts',
  'app/api/team/purchase-football-slots/route.ts',
  'app/api/team/tournament-players/route.ts',
  'app/api/teams/[id]/details/route.ts',
  'app/api/teams/[id]/statistics/route.ts',
  'app/api/teams/generate-id/route.ts',
  'app/api/teams/route.ts',
  'app/api/telegram/email-requests/[id]/route.ts',
  'app/api/tiebreakers/[id]/submit/route.ts',
  'app/api/tournaments/[id]/fixtures/route.ts',
  'app/api/tournaments/[id]/groups/route.ts',
  'app/api/tournaments/[id]/rounds/route.ts',
  'app/api/tournaments/[id]/standings/route.ts',
  'app/api/upload-award-image/route.ts'
];

let fixedCount = 0;

filesToFix.forEach(relPath => {
  if (!fs.existsSync(relPath)) return;
  let code = fs.readFileSync(relPath, 'utf8');
  let orig = code;

  // Replace method(p: any) => with method((p: any) =>
  code = code.replace(/(\.map|\.filter|\.find|\.forEach|\.findIndex|\.some|\.every|\.reduce)\s*\(\s*([a-zA-Z0-9_]+)\s*:\s*any\s*\)\s*=>/g, '$1(($2: any) =>');

  if (code !== orig) {
    fs.writeFileSync(relPath, code, 'utf8');
    fixedCount++;
  }
});

console.log('Fixed syntax error count:', fixedCount);
