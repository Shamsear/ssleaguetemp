/**
 * Awards AI Performance Evaluator
 * 
 * Automatically evaluates award nominees purely based on individual matchup metrics:
 * 1. Goals Scored in Matchup (Offensive impact)
 * 2. Goals Conceded / Clean Sheet in Matchup (Defensive record)
 * 3. Category Tier Hierarchy & Upset Multipliers (Matchup difficulty & opposition quality)
 */

export interface CandidateEvaluation {
  score: number;            // 0 - 100
  rating: number;           // 0.0 - 10.0
  goalScore: number;        // 0 - 45
  defenseScore: number;     // 0 - 25
  categoryScore: number;    // 0 - 30
  categoryLabel: string;
  isUpset: boolean;
  isTopTierClash: boolean;
  reasoning: string;
  tierDiff: number;
}

export const CATEGORY_PRIORITY_MAP: Record<string, number> = {
  // Tier 1 — Strongest
  red: 1,
  legend: 1,
  iconic: 1,
  // Tier 2
  black: 2,
  gold: 2,
  star: 2,
  // Tier 3
  blue: 3,
  silver: 3,
  classic: 3,
  // Tier 4 — Weakest
  white: 4,
  bronze: 4,
  rising: 4,
};

export function getCategoryPriority(cat?: string): number {
  if (!cat) return 3;
  const normalized = cat.trim().toLowerCase();
  return CATEGORY_PRIORITY_MAP[normalized] ?? 3;
}

/**
 * Evaluate an individual nominee candidate's matchup performance
 */
export function evaluateCandidate(
  candidate: any,
  awardType: string = 'POTD',
  nomineeCategory?: string,
  opponentCategory?: string
): CandidateEvaluation {
  const stats = candidate.performance_stats || {};
  const goalsScored = Number(stats.goals ?? stats.goals_for ?? stats.total_goals ?? 0);
  const goalsConceded = Number(stats.opponent_goals ?? stats.goals_conceded ?? stats.goals_against ?? 0);
  const isCleanSheet = stats.clean_sheet === true || (stats.clean_sheets && stats.clean_sheets > 0) || (goalsConceded === 0 && goalsScored > 0);
  const goalDiff = stats.goal_difference ?? (goalsScored - goalsConceded);

  const wins = Number(stats.wins ?? 0);
  const draws = Number(stats.draws ?? 0);
  const losses = Number(stats.losses ?? 0);
  const points = Number(stats.points ?? (wins * 3 + draws));
  const matchesPlayed = Number(stats.matches_played ?? (wins + draws + losses > 0 ? wins + draws + losses : 1));
  const cleanSheets = Number(stats.clean_sheets ?? (isCleanSheet ? 1 : 0));

  const nomCat = nomineeCategory || candidate.category || '';
  const oppCat = opponentCategory || candidate.opponent_category || '';

  const nomPriority = getCategoryPriority(nomCat);
  const oppPriority = getCategoryPriority(oppCat);

  const isMultiMatch = ['POTW', 'TOW', 'POTS', 'TOTS'].includes(awardType) || matchesPlayed > 1;

  let totalScore = 0;
  let goalScore = 0;
  let defenseScore = 0;
  let categoryScore = 10;
  let categoryLabel = 'Standard Matchup';
  let isUpset = false;
  let isTopTierClash = false;
  let tierDiff = 0;

  if (isMultiMatch) {
    if (awardType === 'TOW' || awardType === 'TOTS') {
      // ────────── TEAM OF THE WEEK ──────────
      // Scoring: Points (40%) + GD (35%) + GF (15%) + GA penalty (10%)
      // Scale: 0-100 total

      // 1. Points Component (0 - 40): Win-record (3pts/win, 1pt/draw)
      const pointsScore = Math.min(40, Math.max(0, Math.round(points * 2.0)));

      // 2. Goal Difference Component (0 - 35): GD is the clearest indicator of dominance
      const gdScore = Math.min(35, Math.max(0, Math.round(goalDiff * 0.9)));

      // 3. Goals For Component (0 - 15): Offensive output
      goalScore = Math.min(15, Math.max(0, Math.round(goalsScored * 0.18)));

      // 4. Goals Against penalty (0 - 10): Lower GA is better; max deduction if conceding a lot
      const gaDeduction = Math.min(10, Math.max(0, Math.round(goalsConceded * 0.08)));
      defenseScore = 10 - gaDeduction;

      categoryScore = 0; // Teams don't have player categories
      categoryLabel = 'Team';

      totalScore = Math.min(100, Math.max(0, Math.round(pointsScore + gdScore + goalScore + defenseScore)));
    } else {
      // ────────── PLAYER OF THE WEEK / SEASON ──────────
      // Scoring: Points (45%) + Goals (25%) + Defense/CS/GD (20%) + Category (10%)

      // 1. Points Component (0 - 45)
      const winPointsScore = Math.min(45, Math.max(0, Math.round(points * 1.35)));

      // 2. Goals Component (0 - 25): Raw goals scored across all matches
      goalScore = Math.min(25, Math.max(0, Math.round(goalsScored * 0.95)));

      // 3. Defense Component (0 - 20): Clean sheets + positive GD
      defenseScore = Math.min(20, Math.round((cleanSheets * 4) + Math.max(0, goalDiff * 0.5)));

      // 4. Category Component (0 - 10): Player tier
      if (nomCat) {
        if (nomPriority === 1) {
          categoryScore = 10;
          categoryLabel = `Top Category (${nomCat.toUpperCase()})`;
        } else if (nomPriority === 2) {
          categoryScore = 7;
          categoryLabel = `Category ${nomCat.toUpperCase()}`;
        } else {
          categoryScore = 4;
          categoryLabel = `Category ${nomCat.toUpperCase()}`;
        }
      } else {
        categoryScore = 5;
        categoryLabel = 'Unrated';
      }

      totalScore = Math.min(100, Math.round(winPointsScore + goalScore + defenseScore + categoryScore));
    }
  } else {
    // ────────── PLAYER / TEAM OF THE DAY ──────────
    // Scoring: Goals (60%) + Defense (20%) + Category/Upset (20%)
    // This ensures goal output is always the primary deciding factor.

    // 1. Goals Component (0 - 60): Primary metric — most goals = highest score
    goalScore = Math.min(60, Math.max(0, Math.round(goalsScored * 7)));

    // 2. Defense Component (0 - 20): Clean sheet + goals conceded + goal diff
    if (isCleanSheet) {
      defenseScore = 15;
    } else if (goalsConceded === 1) {
      defenseScore = 10;
    } else if (goalsConceded === 2) {
      defenseScore = 6;
    } else if (goalsConceded === 3) {
      defenseScore = 3;
    } else {
      defenseScore = 0;
    }
    // Goal difference bonus (up to +5)
    if (goalDiff > 0) {
      defenseScore += Math.min(5, goalDiff);
    }
    defenseScore = Math.min(20, defenseScore);

    // 3. Category Component (0 - 20): Upset difficulty — capped so goals always dominate
    if (nomCat && oppCat) {
      if (nomPriority > oppPriority) {
        tierDiff = nomPriority - oppPriority;
        isUpset = true;
        if (tierDiff === 1) {
          categoryScore = 10;
          categoryLabel = `⚡ +1 Tier Upset (${nomCat.toUpperCase()} beat ${oppCat.toUpperCase()})`;
        } else if (tierDiff === 2) {
          categoryScore = 15;
          categoryLabel = `🔥 +2 Tier Upset (${nomCat.toUpperCase()} beat ${oppCat.toUpperCase()})`;
        } else {
          categoryScore = 20;
          categoryLabel = `🌟 +3 Tier Massive Upset (${nomCat.toUpperCase()} beat ${oppCat.toUpperCase()})`;
        }
      } else if (nomPriority === oppPriority) {
        if (nomPriority === 1) {
          isTopTierClash = true;
          categoryScore = 12;
          categoryLabel = `👑 Top Tier Clash (${nomCat.toUpperCase()} vs ${oppCat.toUpperCase()})`;
        } else if (nomPriority === 2) {
          categoryScore = 9;
          categoryLabel = `⚔️ Tier 2 Clash (${nomCat.toUpperCase()} vs ${oppCat.toUpperCase()})`;
        } else if (nomPriority === 3) {
          categoryScore = 6;
          categoryLabel = `⚔️ Tier 3 Clash (${nomCat.toUpperCase()} vs ${oppCat.toUpperCase()})`;
        } else {
          categoryScore = 4;
          categoryLabel = `⚔️ Same Tier (${nomCat.toUpperCase()} vs ${oppCat.toUpperCase()})`;
        }
      } else {
        // Favourite beating a lower tier
        tierDiff = oppPriority - nomPriority;
        if (tierDiff === 1) {
          categoryScore = 4;
          categoryLabel = `Favored vs ${oppCat.toUpperCase()}`;
        } else if (tierDiff === 2) {
          categoryScore = 2;
          categoryLabel = `Favored vs -2 Tier (${oppCat.toUpperCase()})`;
        } else {
          categoryScore = 1;
          categoryLabel = `Heavy Favorite vs ${oppCat.toUpperCase()}`;
        }
      }
    } else if (nomCat) {
      if (nomPriority === 1) {
        categoryScore = 10;
        categoryLabel = `Top Category (${nomCat.toUpperCase()})`;
      } else if (nomPriority === 2) {
        categoryScore = 7;
        categoryLabel = `Category ${nomCat.toUpperCase()}`;
      } else {
        categoryScore = 4;
        categoryLabel = `Category ${nomCat.toUpperCase()}`;
      }
    }

    totalScore = Math.min(100, Math.round(goalScore + defenseScore + categoryScore));
  }

  const rating = Math.min(10.0, Math.max(1.0, parseFloat((totalScore / 10).toFixed(1))));

  // Generate clear, readable AI reasoning
  let reasoning = '';
  const playerName = candidate.player_name || candidate.team_name || 'Nominee';
  const oppName = candidate.opponent_player_name || candidate.opponent_team_name;

  if (isMultiMatch) {
    const isPlayer = ['POTD', 'POTW', 'POTS'].includes(awardType);
    if (isPlayer) {
      const catText = nomCat ? ` (${nomCat.toUpperCase()})` : '';
      const csText = cleanSheets > 0 ? `, ${cleanSheets} clean sheet${cleanSheets === 1 ? '' : 's'}` : '';
      reasoning = `Outstanding ${awardType === 'POTW' ? 'Weekly' : 'Season'} record by ${playerName}${catText}: ${wins}W-${draws}D-${losses}L (${points} pts), ${goalsScored} goals scored, ${goalsConceded} conceded${csText} across ${matchesPlayed} matches.`;
    } else {
      const gdText = goalDiff >= 0 ? `+${goalDiff}` : `${goalDiff}`;
      reasoning = `Dominant ${awardType === 'TOW' ? 'Weekly' : 'Season'} performance by ${playerName}: ${wins}W-${draws}D-${losses}L (${points} pts), ${goalsScored} GF, ${goalsConceded} GA (${gdText} GD) across ${matchesPlayed} matches.`;
    }
  } else if (isUpset && oppName) {
    reasoning = `${playerName} (${nomCat.toUpperCase()}) scored ${goalsScored} goals (conceded only ${goalsConceded}), defeating higher-category opponent ${oppName} (${oppCat.toUpperCase()}) in a major upset.`;
  } else if (isTopTierClash && oppName) {
    reasoning = `Masterclass by ${playerName} netting ${goalsScored} goals in a high-intensity Top-Category (RED vs RED) clash against ${oppName}.`;
  } else if (isCleanSheet) {
    reasoning = `Clean sheet victory: ${goalsScored} goals scored and 0 conceded by ${playerName}.`;
  } else if (goalsScored >= 4) {
    reasoning = `Dominant attacking display with ${goalsScored} goals scored and a +${goalDiff} goal difference by ${playerName}.`;
  } else if (oppName && nomCat && oppCat) {
    reasoning = `Quality performance by ${playerName} (${nomCat.toUpperCase()}) scoring ${goalsScored} goals vs ${oppName} (${oppCat.toUpperCase()}).`;
  } else {
    reasoning = `Solid performance with ${goalsScored} goals scored and ${goalsConceded} conceded.`;
  }

  return {
    score: totalScore,
    rating,
    goalScore: Math.round(goalScore),
    defenseScore: Math.round(defenseScore),
    categoryScore: Math.round(categoryScore),
    categoryLabel,
    isUpset,
    isTopTierClash,
    reasoning,
    tierDiff,
  };
}
