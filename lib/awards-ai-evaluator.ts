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
  red: 1,
  legend: 1,
  iconic: 1,
  blue: 2,
  gold: 2,
  classic: 2,
  black: 3,
  silver: 3,
  white: 4,
  bronze: 4,
  rising: 4,
  star: 3,
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
  const goalsScored = Number(stats.goals ?? stats.goals_for ?? 0);
  const goalsConceded = Number(stats.opponent_goals ?? stats.goals_against ?? 0);
  const isCleanSheet = stats.clean_sheet === true || (goalsConceded === 0 && goalsScored > 0);
  const goalDiff = goalsScored - goalsConceded;

  // 1. Goals Scored Component (0 - 45 pts)
  // 5+ goals gives max 45 pts (9 pts per goal)
  const goalScore = Math.min(45, Math.max(0, goalsScored * 9));

  // 2. Defense / Conceded Component (0 - 25 pts)
  let defenseScore = 0;
  if (isCleanSheet) {
    defenseScore = 20;
  } else if (goalsConceded === 1) {
    defenseScore = 15;
  } else if (goalsConceded === 2) {
    defenseScore = 10;
  } else if (goalsConceded === 3) {
    defenseScore = 5;
  } else {
    defenseScore = 0;
  }

  // Goal difference margin bonus (up to 5 pts)
  if (goalDiff > 0) {
    defenseScore += Math.min(5, goalDiff);
  }

  // 3. Category Matchup & Upset Component (0 - 30 pts)
  const nomCat = nomineeCategory || candidate.category || '';
  const oppCat = opponentCategory || candidate.opponent_category || '';

  const nomPriority = getCategoryPriority(nomCat);
  const oppPriority = getCategoryPriority(oppCat);

  let categoryScore = 10;
  let categoryLabel = 'Standard Matchup';
  let isUpset = false;
  let isTopTierClash = false;
  let tierDiff = 0;

  if (nomCat && oppCat) {
    if (nomPriority > oppPriority) {
      // Upset Win: Nominee is in a lower category than Opponent (higher priority number)
      tierDiff = nomPriority - oppPriority;
      isUpset = true;
      if (tierDiff === 1) {
        categoryScore = 24;
        categoryLabel = `⚡ +1 Tier Upset (${nomCat.toUpperCase()} beat ${oppCat.toUpperCase()})`;
      } else if (tierDiff === 2) {
        categoryScore = 28;
        categoryLabel = `🔥 +2 Tier Upset (${nomCat.toUpperCase()} beat ${oppCat.toUpperCase()})`;
      } else {
        categoryScore = 30;
        categoryLabel = `🌟 +3 Tier Massive Upset (${nomCat.toUpperCase()} beat ${oppCat.toUpperCase()})`;
      }
    } else if (nomPriority === oppPriority) {
      if (nomPriority === 1) {
        isTopTierClash = true;
        categoryScore = 20;
        categoryLabel = `👑 Top Tier Clash (${nomCat.toUpperCase()} vs ${oppCat.toUpperCase()})`;
      } else if (nomPriority === 2) {
        categoryScore = 14;
        categoryLabel = `⚔️ Tier 2 Clash (${nomCat.toUpperCase()} vs ${oppCat.toUpperCase()})`;
      } else if (nomPriority === 3) {
        categoryScore = 10;
        categoryLabel = `⚔️ Tier 3 Clash (${nomCat.toUpperCase()} vs ${oppCat.toUpperCase()})`;
      } else {
        categoryScore = 6;
        categoryLabel = `⚔️ Same Tier (${nomCat.toUpperCase()} vs ${oppCat.toUpperCase()})`;
      }
    } else {
      // Nominee is higher tier than Opponent (expected win)
      tierDiff = oppPriority - nomPriority;
      if (tierDiff === 1) {
        categoryScore = 6;
        categoryLabel = `Favored vs ${oppCat.toUpperCase()}`;
      } else if (tierDiff === 2) {
        categoryScore = 3;
        categoryLabel = `Favored vs -2 Tier (${oppCat.toUpperCase()})`;
      } else {
        categoryScore = 1;
        categoryLabel = `Heavy Favorite vs ${oppCat.toUpperCase()}`;
      }
    }
  } else if (nomCat) {
    if (nomPriority === 1) {
      categoryScore = 18;
      categoryLabel = `Top Category (${nomCat.toUpperCase()})`;
    } else if (nomPriority === 2) {
      categoryScore = 12;
      categoryLabel = `Category ${nomCat.toUpperCase()}`;
    } else {
      categoryScore = 6;
      categoryLabel = `Category ${nomCat.toUpperCase()}`;
    }
  }

  // Total score (0 - 100)
  const totalScore = Math.min(100, Math.round(goalScore + defenseScore + categoryScore));
  const rating = Math.min(10.0, Math.max(1.0, parseFloat((totalScore / 10).toFixed(1))));

  // Generate clear, readable AI reasoning
  let reasoning = '';
  const playerName = candidate.player_name || candidate.team_name || 'Nominee';
  const oppName = candidate.opponent_player_name || candidate.opponent_team_name;

  if (isUpset && oppName) {
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
    reasoning = `Solid match with ${goalsScored} goals scored and only ${goalsConceded} conceded.`;
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
