const fs = require('fs');
const path = require('path');

const targetFiles = [
  'app/api/admin/export/teams-excel/route.ts',
  'app/api/admin/players/bulk-delete/route.ts',
  'app/api/admin/release-team/route.ts',
  'app/api/awards/eligible/route.ts',
  'app/api/committee/player-eligibility/route.ts',
  'app/api/committee/player-matchday-stats/route.ts',
  'app/api/committee/player-stats/route.ts',
  'app/api/fantasy/players/populate/route.ts',
  'app/api/fantasy/players/[playerId]/breakdown/route.ts',
  'app/api/fantasy/players/[playerId]/stats/route.ts',
  'app/api/fantasy/players-performance/route.ts',
  'app/api/fantasy/transfers/execute/route.ts',
  'app/api/fixtures/[fixtureId]/admin-set-lineup/route.ts',
  'app/api/fixtures/[fixtureId]/generate-round-robin/route.ts',
  'app/api/fixtures/[fixtureId]/lineup/route.ts',
  'app/api/fixtures/[fixtureId]/submit-opponent-lineup/route.ts',
  'app/api/lineups/auto-lock/route.ts',
  'app/api/player-seasons/all/route.ts',
  'app/api/player-seasons/route.ts',
  'app/api/players/contracted/route.ts',
  'app/api/players/release/route.ts',
  'app/api/players/search/route.ts',
  'app/api/players/swap/route.ts',
  'app/api/players/swap-v2/route.ts',
  'app/api/players/transfer/route.ts',
  'app/api/players/with-stats/route.ts',
  'app/api/public/award-winners/route.ts',
  'app/api/public/hall-of-fame/route.ts',
  'app/api/requests/release/[id]/route.ts',
  'app/api/requests/swap/[id]/route.ts',
  'app/api/team/dashboard/route.ts',
  'app/api/team/player-counts/route.ts',
  'app/api/team/player-matchday-stats/route.ts',
  'app/api/team/player-stats/route.ts',
  'app/api/team/tournament-players/route.ts',
  'app/api/team/[teamId]/players/route.ts',
  'app/api/team/[teamId]/roster/route.ts',
  'app/api/teams/[id]/details/route.ts',
  'app/api/tournaments/[id]/lineup-status/route.ts'
];

const rootDir = path.join(__dirname, '..');

targetFiles.forEach(relPath => {
  const filePath = path.join(rootDir, relPath);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${relPath}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  console.log(`\n--- ${relPath} ---`);
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('16') || line.includes('isModern') || line.includes('seasonNum') || line.includes('season_id') || line.includes('player_seasons') || line.includes('realplayerstats')) {
      console.log(`  Line ${idx + 1}: ${line.trim()}`);
    }
  });
});
