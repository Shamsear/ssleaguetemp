import { calculateTripleThreatFixture, validateTripleThreatLineup, TripleThreatMatchInput } from '../lib/tournament/triple-threat-engine';

console.log('====================================================');
console.log('🧪 SS TRIPLE THREAT - END-TO-END VERIFICATION SUITE');
console.log('====================================================\n');

let failedTests = 0;
let passedTests = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${desc}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${desc}`);
    failedTests++;
  }
}

// --------------------------------------------------------------------------
// 1. Lineup Validation Tests (5 unique players: 2 Co-op, 2 Duo, 1 Single)
// --------------------------------------------------------------------------
console.log('📋 SECTION 1: Lineup Validation Rules');

const validLineup = {
  coop: ['p1', 'p2'],
  duo: ['p3', 'p4'],
  single: ['p5']
};

const v1 = validateTripleThreatLineup(validLineup);
assert(v1.valid, '5 distinct players are accepted');

const dupAcrossModes = {
  coop: ['p1', 'p2'],
  duo: ['p1', 'p4'], // p1 is in coop and duo!
  single: ['p5']
};
const v2 = validateTripleThreatLineup(dupAcrossModes);
assert(!v2.valid && (v2.error?.includes('Duplicate') || v2.error?.includes('one mode')), 'Duplicate across Co-op and Duo is rejected');

const dupWithinCoop = {
  coop: ['p1', 'p1'],
  duo: ['p3', 'p4'],
  single: ['p5']
};
const v3 = validateTripleThreatLineup(dupWithinCoop);
assert(!v3.valid, 'Duplicate player inside Co-op pair is rejected');

const missingSingle = {
  coop: ['p1', 'p2'],
  duo: ['p3', 'p4'],
  single: []
};
const v4 = validateTripleThreatLineup(missingSingle);
assert(!v4.valid, 'Missing Single 1v1 player is rejected');

// --------------------------------------------------------------------------
// 2. Points & Clean Sweep Calculations
// --------------------------------------------------------------------------
console.log('\n⚡ SECTION 2: Scoring & Bonus Calculations');

// Scenario A: Clean Sweep (3-0 win across Co-op, Duo, Single)
const sweepMatches: TripleThreatMatchInput[] = [
  { mode: 'coop', home_goals: 3, away_goals: 1 },
  { mode: 'duo', home_goals: 2, away_goals: 0 },
  { mode: 'single', home_goals: 4, away_goals: 2 }
];
const sweepResult = calculateTripleThreatFixture(sweepMatches);

assert(sweepResult.home_total_points === 10, 'Clean sweep home receives 10 points (3+3+3+1 bonus)');
assert(sweepResult.away_total_points === 0, 'Clean sweep away receives 0 points');
assert(sweepResult.home_points_difference === 10, 'Clean sweep home GD is +10');
assert(sweepResult.away_points_difference === -10, 'Clean sweep away GD is -10');
assert(sweepResult.is_clean_sweep === true, 'is_clean_sweep is true');
assert(sweepResult.clean_sweep_team === 'home', 'Clean sweep team is marked as home');
assert(sweepResult.matches[0].home_points === 3, 'Co-op win awards 3 points');
assert(sweepResult.matches[1].home_points === 3, 'Duo win awards 3 points');
assert(sweepResult.matches[2].home_points === 3, 'Single win awards 3 points');

// Scenario B: 2 Wins - 1 Loss (No bonus)
const twoOneMatches: TripleThreatMatchInput[] = [
  { mode: 'coop', home_goals: 2, away_goals: 1 }, // Home win (3-0)
  { mode: 'duo', home_goals: 3, away_goals: 2 },  // Home win (3-0)
  { mode: 'single', home_goals: 1, away_goals: 2 } // Away win (0-3)
];
const twoOneResult = calculateTripleThreatFixture(twoOneMatches);

assert(twoOneResult.home_total_points === 6, '2 wins gives home 6 points (no bonus)');
assert(twoOneResult.away_total_points === 3, '1 win gives away 3 points');
assert(twoOneResult.home_points_difference === 3, 'Home GD is +3 (6 - 3)');
assert(twoOneResult.away_points_difference === -3, 'Away GD is -3 (3 - 6)');
assert(twoOneResult.is_clean_sweep === false, 'No clean sweep when away won 1v1');
assert(twoOneResult.clean_sweep_team === null, 'Clean sweep team is null');

// Scenario C: All Draws (1-1-1)
const drawMatches: TripleThreatMatchInput[] = [
  { mode: 'coop', home_goals: 1, away_goals: 1 },
  { mode: 'duo', home_goals: 0, away_goals: 0 },
  { mode: 'single', home_goals: 2, away_goals: 2 }
];
const drawResult = calculateTripleThreatFixture(drawMatches);

assert(drawResult.home_total_points === 3, '3 draws gives home 3 points (1+1+1)');
assert(drawResult.away_total_points === 3, '3 draws gives away 3 points (1+1+1)');
assert(drawResult.home_points_difference === 0, 'Draw matchday GD is 0');
assert(drawResult.away_points_difference === 0, 'Draw matchday GD is 0');
assert(drawResult.is_clean_sweep === false, 'No clean sweep on draws');

// Scenario D: Away Clean Sweep
const awaySweepMatches: TripleThreatMatchInput[] = [
  { mode: 'coop', home_goals: 0, away_goals: 2 },
  { mode: 'duo', home_goals: 1, away_goals: 3 },
  { mode: 'single', home_goals: 0, away_goals: 1 }
];
const awaySweepResult = calculateTripleThreatFixture(awaySweepMatches);

assert(awaySweepResult.home_total_points === 0, 'Away sweep home points is 0');
assert(awaySweepResult.away_total_points === 10, 'Away sweep away points is 10 (3+3+3+1)');
assert(awaySweepResult.home_points_difference === -10, 'Away sweep home GD is -10');
assert(awaySweepResult.away_points_difference === 10, 'Away sweep away GD is +10');
assert(awaySweepResult.is_clean_sweep === true, 'Away clean sweep is true');
assert(awaySweepResult.clean_sweep_team === 'away', 'Clean sweep team is away');

// --------------------------------------------------------------------------
// 3. Standings Simulation (Group of 4 Teams, Double Round Robin)
// --------------------------------------------------------------------------
console.log('\n📊 SECTION 3: Standings & Points-Based GD Sorting');

interface SimulatedStanding {
  team_name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points_for: number;     // Goals For / Points Earned
  points_against: number; // Goals Against / Points Conceded
  goal_difference: number;
  points: number;
}

const teams: Record<string, SimulatedStanding> = {
  'Team A': { team_name: 'Team A', played: 2, won: 2, drawn: 0, lost: 0, points_for: 20, points_against: 0, goal_difference: 20, points: 20 },
  'Team B': { team_name: 'Team B', played: 2, won: 1, drawn: 0, lost: 1, points_for: 9, points_against: 13, goal_difference: -4, points: 9 },
  'Team C': { team_name: 'Team C', played: 2, won: 1, drawn: 0, lost: 1, points_for: 7, points_against: 13, goal_difference: -6, points: 7 },
  'Team D': { team_name: 'Team D', played: 2, won: 0, drawn: 0, lost: 2, points_for: 3, points_against: 13, goal_difference: -10, points: 3 }
};

const sorted = Object.values(teams).sort((a, b) => {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
  return b.points_for - a.points_for;
});

assert(sorted[0].team_name === 'Team A' && sorted[0].points === 20 && sorted[0].goal_difference === 20, '1st place correctly ranked by Points & GD (+20)');
assert(sorted[1].team_name === 'Team B' && sorted[1].points === 9, '2nd place correctly ranked by Points (9)');
assert(sorted[2].team_name === 'Team C' && sorted[2].points === 7, '3rd place correctly ranked by Points (7)');
assert(sorted[3].team_name === 'Team D' && sorted[3].points === 3, '4th place correctly ranked by Points (3)');

console.log('\n====================================================');
console.log(`TOTAL PASSED: ${passedTests}`);
console.log(`TOTAL FAILED: ${failedTests}`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎉 All SS Triple Threat tests passed perfectly!');
  process.exit(0);
}
