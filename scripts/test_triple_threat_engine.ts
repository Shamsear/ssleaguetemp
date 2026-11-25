import {
  calculateTripleThreatFixture,
  validateTripleThreatLineup,
  TripleThreatMatchInput
} from '../lib/tournament/triple-threat-engine';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('--- TESTING TRIPLE THREAT ENGINE ---\n');

// 1. Clean Sweep: Team A wins all 3 modes
console.log('Test 1: Clean Sweep (Home 3-0)');
const sweepMatches: TripleThreatMatchInput[] = [
  { mode: 'coop', home_goals: 2, away_goals: 1 },
  { mode: 'duo', home_goals: 3, away_goals: 0 },
  { mode: 'single', home_goals: 1, away_goals: 0 },
];
const sweepRes = calculateTripleThreatFixture(sweepMatches);
assert(sweepRes.home_total_points === 10, 'Home should get 10 points (9 base + 1 bonus)');
assert(sweepRes.away_total_points === 0, 'Away should get 0 points');
assert(sweepRes.home_points_difference === 10, 'Home GD should be +10');
assert(sweepRes.away_points_difference === -10, 'Away GD should be -10');
assert(sweepRes.is_clean_sweep === true, 'Clean sweep should be true');
assert(sweepRes.clean_sweep_team === 'home', 'Clean sweep team should be home');

// 2. 2 wins, 1 draw
console.log('\nTest 2: 2 Wins + 1 Draw (Home 7-1)');
const twoWinsOneDraw: TripleThreatMatchInput[] = [
  { mode: 'coop', home_goals: 2, away_goals: 1 }, // Home win (3-0)
  { mode: 'duo', home_goals: 1, away_goals: 0 },   // Home win (3-0)
  { mode: 'single', home_goals: 1, away_goals: 1 },// Draw (1-1)
];
const res2 = calculateTripleThreatFixture(twoWinsOneDraw);
assert(res2.home_total_points === 7, 'Home points should be 7 (3+3+1, no bonus)');
assert(res2.away_total_points === 1, 'Away points should be 1 (0+0+1)');
assert(res2.home_points_difference === 6, 'Home GD should be +6 (7 - 1)');
assert(res2.away_points_difference === -6, 'Away GD should be -6 (1 - 7)');

// 3. 2 wins, 1 loss
console.log('\nTest 3: 2 Wins + 1 Loss (Home 6-3)');
const twoWinsOneLoss: TripleThreatMatchInput[] = [
  { mode: 'coop', home_goals: 2, away_goals: 0 }, // Home win (3-0)
  { mode: 'duo', home_goals: 2, away_goals: 1 },   // Home win (3-0)
  { mode: 'single', home_goals: 0, away_goals: 2 },// Away win (0-3)
];
const res3 = calculateTripleThreatFixture(twoWinsOneLoss);
assert(res3.home_total_points === 6, 'Home points should be 6 (3+3+0)');
assert(res3.away_total_points === 3, 'Away points should be 3 (0+0+3)');
assert(res3.home_points_difference === 3, 'Home GD should be +3 (6 - 3)');
assert(res3.away_points_difference === -3, 'Away GD should be -3 (3 - 6)');

// 4. 1 win, 2 draws
console.log('\nTest 4: 1 Win + 2 Draws (Home 5-2)');
const oneWinTwoDraws: TripleThreatMatchInput[] = [
  { mode: 'coop', home_goals: 2, away_goals: 1 }, // Home win (3-0)
  { mode: 'duo', home_goals: 0, away_goals: 0 },   // Draw (1-1)
  { mode: 'single', home_goals: 2, away_goals: 2 },// Draw (1-1)
];
const res4 = calculateTripleThreatFixture(oneWinTwoDraws);
assert(res4.home_total_points === 5, 'Home points should be 5 (3+1+1)');
assert(res4.away_total_points === 2, 'Away points should be 2 (0+1+1)');
assert(res4.home_points_difference === 3, 'Home GD should be +3 (5 - 2)');
assert(res4.away_points_difference === -3, 'Away GD should be -3 (2 - 5)');

// 5. 1 win, 1 draw, 1 loss
console.log('\nTest 5: 1 Win + 1 Draw + 1 Loss (4-4)');
const oneEach: TripleThreatMatchInput[] = [
  { mode: 'coop', home_goals: 3, away_goals: 1 }, // Home win (3-0)
  { mode: 'duo', home_goals: 1, away_goals: 1 },   // Draw (1-1)
  { mode: 'single', home_goals: 0, away_goals: 1 },// Away win (0-3)
];
const res5 = calculateTripleThreatFixture(oneEach);
assert(res5.home_total_points === 4, 'Home points should be 4 (3+1+0)');
assert(res5.away_total_points === 4, 'Away points should be 4 (0+1+3)');
assert(res5.home_points_difference === 0, 'Home GD should be 0 (4 - 4)');
assert(res5.away_points_difference === 0, 'Away GD should be 0 (4 - 4)');

// 6. 3 draws
console.log('\nTest 6: 3 Draws (3-3)');
const threeDraws: TripleThreatMatchInput[] = [
  { mode: 'coop', home_goals: 0, away_goals: 0 },
  { mode: 'duo', home_goals: 1, away_goals: 1 },
  { mode: 'single', home_goals: 2, away_goals: 2 },
];
const res6 = calculateTripleThreatFixture(threeDraws);
assert(res6.home_total_points === 3, 'Home points should be 3 (1+1+1)');
assert(res6.away_total_points === 3, 'Away points should be 3 (1+1+1)');
assert(res6.home_points_difference === 0, 'Home GD should be 0');
assert(res6.away_points_difference === 0, 'Away GD should be 0');

// 7. Away Clean Sweep
console.log('\nTest 7: Away Clean Sweep (Away 0-10)');
const awaySweep: TripleThreatMatchInput[] = [
  { mode: 'coop', home_goals: 0, away_goals: 2 },
  { mode: 'duo', home_goals: 1, away_goals: 3 },
  { mode: 'single', home_goals: 0, away_goals: 1 },
];
const res7 = calculateTripleThreatFixture(awaySweep);
assert(res7.home_total_points === 0, 'Home points should be 0');
assert(res7.away_total_points === 10, 'Away points should be 10 (9 base + 1 bonus)');
assert(res7.home_points_difference === -10, 'Home GD should be -10');
assert(res7.away_points_difference === 10, 'Away GD should be +10');
assert(res7.clean_sweep_team === 'away', 'Clean sweep team should be away');

// 8. Lineup Validation Tests
console.log('\nTest 8: Lineup Validations');
const validLineup = {
  coop: ['p1', 'p2'],
  duo: ['p3', 'p4'],
  single: ['p5'],
};
assert(validateTripleThreatLineup(validLineup).valid === true, 'Valid 5-player lineup passes');

const duplicatePlayerLineup = {
  coop: ['p1', 'p2'],
  duo: ['p2', 'p4'], // p2 repeated!
  single: ['p5'],
};
const dupRes = validateTripleThreatLineup(duplicatePlayerLineup, { p2: 'Lionel Messi' });
assert(dupRes.valid === false, 'Duplicate player is rejected');
console.log(`Expected rejection message: "${dupRes.error}"`);
assert(dupRes.error?.includes('Lionel Messi') || dupRes.error?.includes('p2'), 'Error mentions duplicate player');

const wrongCountLineup = {
  coop: ['p1', 'p2', 'p3'], // 3 in coop!
  duo: ['p4', 'p5'],
  single: ['p6'],
};
assert(validateTripleThreatLineup(wrongCountLineup).valid === false, 'Wrong player count in Co-op is rejected');

console.log('\n🎉 ALL TRIPLE THREAT ENGINE TESTS PASSED PERFECTLY!');
