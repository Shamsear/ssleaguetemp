import { formatTripleThreatFixtureCopy } from './triple-threat-engine';

/**
 * Determine whether a fixture belongs to a Triple Threat tournament/format.
 */
export function isTripleThreatFixture(
  fixture: any,
  matchups: any[] = [],
  scoringSystem?: string | null,
  tournamentSystem?: string | null
): boolean {
  if (!fixture) return false;
  const activeScoring = scoringSystem || tournamentSystem || fixture.scoring_system || fixture.scoring_type;
  return Boolean(
    activeScoring === 'triple_threat' ||
      fixture.tournament_type === 'triple_threat' ||
      fixture.matchday_format === 'triple_threat' ||
      fixture.knockout_format === 'triple_threat' ||
      String(fixture.tournament_id || '').toLowerCase().includes('triple_threat') ||
      (Array.isArray(matchups) && matchups.some((m: any) => Boolean(m?.match_mode)))
  );
}

/**
 * Format fixture details + matchups into clean shareable WhatsApp/clipboard text
 * for both Triple Threat and standard (goals / wins) fixtures.
 */
export function formatFixtureShareText(params: {
  fixture: any;
  matchups: any[];
  scoringSystem?: string | null;
  tournamentSystem?: string | null;
  homeStartingXI?: any[];
  awayStartingXI?: any[];
  homePenaltyGoals?: number | null;
  awayPenaltyGoals?: number | null;
}): string {
  const {
    fixture,
    matchups = [],
    scoringSystem,
    tournamentSystem,
    homeStartingXI = [],
    awayStartingXI = [],
    homePenaltyGoals,
    awayPenaltyGoals,
  } = params;

  if (!fixture) return '';

  if (isTripleThreatFixture(fixture, matchups, scoringSystem, tournamentSystem)) {
    return formatTripleThreatFixtureCopy({ fixture, matchups });
  }

  if (matchups.length === 0) return '';

  const activeScoring =
    scoringSystem ||
    tournamentSystem ||
    fixture.scoring_system ||
    fixture.scoring_type ||
    'goals';

  const homePlayerGoals = matchups.reduce((sum, m) => sum + (m.home_goals ?? 0), 0);
  const awayPlayerGoals = matchups.reduce((sum, m) => sum + (m.away_goals ?? 0), 0);

  // Calculate substitution penalties (awarded TO opponent)
  const homeSubPenalties = matchups.reduce((sum, m) => sum + (m.home_sub_penalty ?? 0), 0);
  const awaySubPenalties = matchups.reduce((sum, m) => sum + (m.away_sub_penalty ?? 0), 0);

  const effectiveHomePenaltyGoals = Number(fixture.home_penalty_goals ?? homePenaltyGoals ?? 0);
  const effectiveAwayPenaltyGoals = Number(fixture.away_penalty_goals ?? awayPenaltyGoals ?? 0);

  let homeTotalScore: number;
  let awayTotalScore: number;

  if (activeScoring === 'wins') {
    let homePoints = 0;
    let awayPoints = 0;

    matchups.forEach((m) => {
      if (m.home_goals !== null && m.away_goals !== null) {
        const homeMatchupScore = (m.home_goals ?? 0) + (m.away_sub_penalty ?? 0);
        const awayMatchupScore = (m.away_goals ?? 0) + (m.home_sub_penalty ?? 0);

        if (homeMatchupScore > awayMatchupScore) {
          homePoints += 3;
        } else if (awayMatchupScore > homeMatchupScore) {
          awayPoints += 3;
        } else {
          homePoints += 1;
          awayPoints += 1;
        }
      }
    });

    homeTotalScore = homePoints + effectiveHomePenaltyGoals;
    awayTotalScore = awayPoints + effectiveAwayPenaltyGoals;
  } else {
    homeTotalScore = homePlayerGoals + awaySubPenalties + effectiveHomePenaltyGoals;
    awayTotalScore = awayPlayerGoals + homeSubPenalties + effectiveAwayPenaltyGoals;
  }

  const hasResults = matchups.some((m) => m.home_goals !== null);
  const winner = hasResults
    ? homeTotalScore > awayTotalScore
      ? fixture.home_team_name
      : awayTotalScore > homeTotalScore
        ? fixture.away_team_name
        : 'DRAW'
    : '';

  let homeDetails = '';
  if (hasResults) {
    if (activeScoring === 'wins') {
      if (effectiveHomePenaltyGoals > 0) {
        homeDetails = `\n   - Fine/Violation Goals: +${effectiveHomePenaltyGoals}`;
      }
    } else {
      const details: string[] = [];
      if (awaySubPenalties > 0) details.push(`   - Opponent Sub Penalties: +${awaySubPenalties}`);
      if (effectiveHomePenaltyGoals > 0) details.push(`   - Fine/Violation Goals: +${effectiveHomePenaltyGoals}`);
      if (details.length > 0) homeDetails = '\n' + details.join('\n');
    }
  }

  let awayDetails = '';
  if (hasResults) {
    if (activeScoring === 'wins') {
      if (effectiveAwayPenaltyGoals > 0) {
        awayDetails = `\n   - Fine/Violation Goals: +${effectiveAwayPenaltyGoals}`;
      }
    } else {
      const details: string[] = [];
      if (homeSubPenalties > 0) details.push(`   - Opponent Sub Penalties: +${homeSubPenalties}`);
      if (effectiveAwayPenaltyGoals > 0) details.push(`   - Fine/Violation Goals: +${effectiveAwayPenaltyGoals}`);
      if (details.length > 0) awayDetails = '\n' + details.join('\n');
    }
  }

  const motmName = fixture.motm_player_name ? String(fixture.motm_player_name).toUpperCase() : 'Not selected';

  const seasonMatch = String(fixture.season_id || '').match(/\d+$/);
  const seasonNumber = seasonMatch ? seasonMatch[0] : '15';

  const knockoutRoundName = fixture.knockout_round
    ? fixture.knockout_round === 'quarter_finals'
      ? 'QUARTER FINALS'
      : fixture.knockout_round === 'semi_finals'
        ? 'SEMI FINALS'
        : fixture.knockout_round === 'finals'
          ? 'FINALS'
          : fixture.knockout_round === 'third_place'
            ? 'THIRD PLACE PLAYOFF'
            : ''
    : '';

  const substitutions = matchups.filter((m) => m.home_substituted || m.away_substituted);
  const hasSubstitutions = substitutions.length > 0;

  const homeSubstitutes = homeStartingXI.length > 5 ? homeStartingXI.slice(5) : [];
  const awaySubstitutes = awayStartingXI.length > 5 ? awayStartingXI.slice(5) : [];
  const hasAnySubstitutes = homeSubstitutes.length > 0 || awaySubstitutes.length > 0;

  return `*SS PES SUPER LEAGUE - S${seasonNumber}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${knockoutRoundName ? `*${knockoutRoundName}* 🏆\n` : `*MATCHDAY ${fixture.round_number}* - ${fixture.leg === 'first' ? '1st' : '2nd'} Leg\n`}*${fixture.home_team_name}*  vs  *${fixture.away_team_name}*
${scoringSystem && tournamentSystem && scoringSystem !== tournamentSystem ? `⚡ *${scoringSystem === 'wins' ? 'WIN-BASED' : 'GOAL-BASED'} SCORING*\n` : ''}━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*MATCHUPS:*
${matchups
  .map((m) => {
    const homePlayerDisplay = (m.home_player_name || '').toUpperCase();
    const awayPlayerDisplay = (m.away_player_name || '').toUpperCase();

    let line = '';
    if (hasResults && m.home_goals !== null && m.away_goals !== null) {
      const hBreakdown =
        Array.isArray(m.home_player_goals) && m.home_player_goals.length > 1
          ? ` (${(m.home_player_names || []).map((n: string, i: number) => `${n}: ${m.home_player_goals?.[i] ?? 0}G`).join(', ')})`
          : '';
      const aBreakdown =
        Array.isArray(m.away_player_goals) && m.away_player_goals.length > 1
          ? ` (${(m.away_player_names || []).map((n: string, i: number) => `${n}: ${m.away_player_goals?.[i] ?? 0}G`).join(', ')})`
          : '';
      line = `${homePlayerDisplay}${hBreakdown} *${m.home_goals}-${m.away_goals}* ${awayPlayerDisplay}${aBreakdown}`;
    } else {
      line = `${homePlayerDisplay} vs ${awayPlayerDisplay}`;
    }
    line += ` (${m.match_duration || 6}min)`;

    return line;
  })
  .join('\n')}
${
  hasAnySubstitutes
    ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*SUBSTITUTES:*
${homeSubstitutes.length > 0 ? `*${fixture.home_team_name}:*\n${homeSubstitutes.map((sub: any, idx: number) => `   ${idx + 1}. ${(sub.player_name || '').toUpperCase()}`).join('\n')}` : ''}${homeSubstitutes.length > 0 && awaySubstitutes.length > 0 ? '\n\n' : ''}${awaySubstitutes.length > 0 ? `*${fixture.away_team_name}:*\n${awaySubstitutes.map((sub: any, idx: number) => `   ${idx + 1}. ${(sub.player_name || '').toUpperCase()}`).join('\n')}` : ''}
`
    : ''
}${
  hasSubstitutions
    ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*SUBSTITUTIONS MADE:*
${substitutions
  .map((m) => {
    const subText: string[] = [];
    if (m.home_substituted) {
      subText.push(`⚠️ ${fixture.home_team_name}: ${(m.home_original_player_name || '').toUpperCase()} -> ${(m.home_player_name || '').toUpperCase()} (+${m.home_sub_penalty || 0} penalty to opponent)`);
    }
    if (m.away_substituted) {
      subText.push(`⚠️ ${fixture.away_team_name}: ${(m.away_original_player_name || '').toUpperCase()} -> ${(m.away_player_name || '').toUpperCase()} (+${m.away_sub_penalty || 0} penalty to opponent)`);
    }
    return subText.join('\n');
  })
  .join('\n')}
`
    : ''
}━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*SCORE BREAKDOWN:*

*${fixture.home_team_name}*
Total: *${hasResults ? homeTotalScore : 0}* ${activeScoring === 'wins' ? 'points' : 'goals'}${homeDetails}

*${fixture.away_team_name}*
Total: *${hasResults ? awayTotalScore : 0}* ${activeScoring === 'wins' ? 'points' : 'goals'}${awayDetails}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*MAN OF THE MATCH*
${hasResults ? `${motmName}` : 'To be announced'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${
  hasResults
    ? `*RESULT*
${winner === 'DRAW' ? '*MATCH DRAWN*' : `*${String(winner).toUpperCase()} WON!*`}`
    : `*Match yet to be played*`
}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Powered by SS Super League S${seasonNumber} Committee_`;
}
