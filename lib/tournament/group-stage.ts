export interface TournamentTeamInput {
  id: string;
  team_name: string;
  group?: string | null;
}

export interface GeneratedFixtureDraft {
  id: string;
  tournament_id: string;
  season_id: string;
  round_number: number;
  match_number: number;
  home_team_id: string;
  away_team_id: string;
  home_team_name: string;
  away_team_name: string;
  status: 'scheduled';
  leg: 'first' | 'second';
  matchup_mode: string;
  group_name?: string;
}

/**
 * Extracts normalized group identifier (e.g. "Group A" / "group a" / "a" -> "A").
 */
export function normalizeGroupCode(rawGroup: string | null | undefined): string {
  const trimmed = (rawGroup || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/^group\s+/i, '').trim().toUpperCase();
}

/**
 * Formats a display/storage label like "Group A" from either "A" or "Group A".
 */
export function formatGroupLabel(rawGroup: string | null | undefined): string {
  const code = normalizeGroupCode(rawGroup);
  if (!code) return '';
  return `Group ${code}`;
}

/**
 * Generates an alphabetic group code ("A", "B", ...) for 0-based index.
 */
export function indexToGroupCode(index: number): string {
  if (index >= 0 && index < 26) {
    return String.fromCharCode(65 + index);
  }
  return `G${index + 1}`;
}

/**
 * Distributes teams evenly (round-robin interleaved) into groups after optional shuffling.
 */
export function distributeTeamsIntoGroups<T>(
  teams: T[],
  numberOfGroups: number,
  options: { shuffle?: boolean } = {}
): Array<{ team: T; groupCode: string; groupLabel: string }> {
  const { shuffle = true } = options;
  if (teams.length === 0) return [];

  const groupCount = Math.max(1, Math.min(numberOfGroups || 1, teams.length));
  const ordered = shuffle ? [...teams].sort(() => Math.random() - 0.5) : [...teams];

  return ordered.map((team, index) => {
    const groupCode = indexToGroupCode(index % groupCount);
    return {
      team,
      groupCode,
      groupLabel: `Group ${groupCode}`,
    };
  });
}

function buildFirstLegMatchesForPool(
  teams: TournamentTeamInput[],
  tournamentId: string,
  seasonId: string,
  idPrefix: string,
  matchupMode: string,
  groupCode?: string
): { firstLeg: GeneratedFixtureDraft[]; numRounds: number } {
  const teamList: TournamentTeamInput[] = [...teams];

  if (teamList.length < 2) {
    return { firstLeg: [], numRounds: 0 };
  }

  // Add BYE placeholder for Berger circle scheduling when team count is odd
  if (teamList.length % 2 !== 0) {
    teamList.push({ id: 'bye', team_name: 'BYE' });
  }

  const numTeams = teamList.length;
  const numRounds = numTeams - 1;
  const matchesPerRound = numTeams / 2;

  const homeAwayBalance: Record<string, number> = {};
  for (const team of teamList) {
    if (team.id !== 'bye') {
      homeAwayBalance[team.id] = 0;
    }
  }

  const firstLeg: GeneratedFixtureDraft[] = [];

  for (let round = 0; round < numRounds; round++) {
    const roundNumber = round + 1;
    let matchNumber = 0;

    for (let match = 0; match < matchesPerRound; match++) {
      let homeIdx: number;
      let awayIdx: number;

      if (match === 0) {
        homeIdx = 0;
        awayIdx = round + 1;
      } else {
        homeIdx = ((round + match) % (numTeams - 1)) + 1;
        awayIdx = ((round + (numTeams - 1) - match) % (numTeams - 1)) + 1;
      }

      if (teamList[homeIdx].id === 'bye' || teamList[awayIdx].id === 'bye') {
        continue;
      }

      matchNumber++;

      let home = homeIdx;
      let away = awayIdx;
      const team1Balance = homeAwayBalance[teamList[homeIdx].id];
      const team2Balance = homeAwayBalance[teamList[awayIdx].id];

      if (team2Balance < team1Balance - 1) {
        home = awayIdx;
        away = homeIdx;
      } else if (team1Balance === team2Balance && Math.random() < 0.5) {
        home = awayIdx;
        away = homeIdx;
      }

      homeAwayBalance[teamList[home].id]++;
      homeAwayBalance[teamList[away].id]--;

      const fixture: GeneratedFixtureDraft = {
        id: `${idPrefix}_leg1_r${roundNumber}_m${matchNumber}`,
        tournament_id: tournamentId,
        season_id: seasonId,
        round_number: roundNumber,
        match_number: matchNumber,
        home_team_id: teamList[home].id,
        away_team_id: teamList[away].id,
        home_team_name: teamList[home].team_name,
        away_team_name: teamList[away].team_name,
        status: 'scheduled',
        leg: 'first',
        matchup_mode: matchupMode,
        ...(groupCode ? { group_name: groupCode } : {}),
      };

      firstLeg.push(fixture);
    }
  }

  return { firstLeg, numRounds };
}

function appendSecondLegFixtures(
  firstLeg: GeneratedFixtureDraft[],
  idPrefix: string,
  roundOffset: number
): GeneratedFixtureDraft[] {
  return firstLeg.map((first) => {
    const secondLegRound = first.round_number + roundOffset;
    return {
      ...first,
      id: `${idPrefix}_leg2_r${secondLegRound}_m${first.match_number}`,
      round_number: secondLegRound,
      home_team_id: first.away_team_id,
      away_team_id: first.home_team_id,
      home_team_name: first.away_team_name,
      away_team_name: first.home_team_name,
      leg: 'second',
    };
  });
}

/**
 * Generates round-robin league fixtures across all teams.
 */
export function buildLeagueFixtures(
  tournamentId: string,
  seasonId: string,
  teams: TournamentTeamInput[],
  isTwoLegged: boolean,
  matchupMode: string = 'manual'
): GeneratedFixtureDraft[] {
  const { firstLeg, numRounds } = buildFirstLegMatchesForPool(
    teams,
    tournamentId,
    seasonId,
    tournamentId,
    matchupMode
  );

  if (!isTwoLegged) {
    return firstLeg;
  }

  return [...firstLeg, ...appendSecondLegFixtures(firstLeg, tournamentId, numRounds)];
}

/**
 * Generates group-stage round-robin fixtures using each team's assigned `group` (preserving real group codes)
 * or falling back to balanced distribution across `numberOfGroups` when `useAssignedGroups` is false.
 */
export function buildGroupStageFixtures(
  tournamentId: string,
  seasonId: string,
  teams: TournamentTeamInput[],
  numberOfGroups: number,
  isTwoLegged: boolean,
  options: {
    useAssignedGroups?: boolean;
    matchupMode?: string;
    shuffleAuto?: boolean;
  } = {}
): GeneratedFixtureDraft[] {
  const { useAssignedGroups = false, matchupMode = 'manual', shuffleAuto = false } = options;
  const groupMap = new Map<string, TournamentTeamInput[]>();

  if (useAssignedGroups) {
    for (const team of teams) {
      const code = normalizeGroupCode(team.group);
      if (!code) continue;
      if (!groupMap.has(code)) {
        groupMap.set(code, []);
      }
      groupMap.get(code)!.push(team);
    }
  } else {
    const distributed = distributeTeamsIntoGroups(teams, numberOfGroups, { shuffle: shuffleAuto });
    for (const entry of distributed) {
      if (!groupMap.has(entry.groupCode)) {
        groupMap.set(entry.groupCode, []);
      }
      groupMap.get(entry.groupCode)!.push(entry.team);
    }
  }

  const sortedGroupCodes = Array.from(groupMap.keys()).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  const perGroupFirstLeg = sortedGroupCodes.map((groupCode) => {
    const groupSlug = groupCode.replace(/[^A-Za-z0-9]/g, '') || 'GRP';
    const idPrefix = `${tournamentId}_grp${groupSlug}`;
    const groupTeams = groupMap.get(groupCode) || [];
    const { firstLeg, numRounds } = buildFirstLegMatchesForPool(
      groupTeams,
      tournamentId,
      seasonId,
      idPrefix,
      matchupMode,
      groupCode
    );
    return { groupCode, idPrefix, firstLeg, numRounds };
  });

  const maxFirstLegRounds = perGroupFirstLeg.reduce(
    (max, g) => Math.max(max, g.numRounds),
    0
  );

  const fixtures: GeneratedFixtureDraft[] = [];
  for (const groupResult of perGroupFirstLeg) {
    fixtures.push(...groupResult.firstLeg);
    if (isTwoLegged && groupResult.firstLeg.length > 0) {
      fixtures.push(
        ...appendSecondLegFixtures(groupResult.firstLeg, groupResult.idPrefix, maxFirstLegRounds)
      );
    }
  }

  return fixtures;
}
