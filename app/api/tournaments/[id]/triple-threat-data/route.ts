import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { neon } from '@neondatabase/serverless';
import { resolveTripleThreatMode } from '@/lib/tournament/triple-threat-engine';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getTournamentDb();
    const mainDbUrl = process.env.NEON_MAIN_DB_URL || process.env.DATABASE_URL;
    const mainSql = mainDbUrl ? neon(mainDbUrl) : sql;

    const { id } = await params;
    const tournamentId = id;

    // 1. Fetch Tournament
    const tournamentRows = await sql`
      SELECT t.*, ts.clean_sweep_bonus, ts.scoring_type
      FROM tournaments t
      LEFT JOIN tournament_settings ts ON ts.tournament_id = t.id
      WHERE t.id = ${tournamentId} OR LOWER(t.tournament_code) = LOWER(${tournamentId})
      LIMIT 1
    `;

    if (tournamentRows.length === 0) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const tour = tournamentRows[0];
    const seasonId = tour.season_id;

    // 2. Fetch Group assignments
    const groupRows = await sql`
      SELECT team_id, group_name
      FROM tournament_team_groups
      WHERE tournament_id = ${tour.id}
    `;
    const groupMap = new Map<string, string>();
    groupRows.forEach((r: any) => {
      const cleanGroup = (r.group_name || '').replace(/group\s*/i, '').trim().toUpperCase();
      groupMap.set(r.team_id, cleanGroup || 'TBD');
    });

    // 3. Fetch Teams and Managers
    let teamsDb: any[] = [];
    try {
      teamsDb = await mainSql`
        SELECT id, team_id, team_name, team_code, owner_name, logo_url
        FROM teams
      `;
    } catch (e) {
      console.warn('Could not fetch teams from mainSql:', e);
    }

    let managersDb: any[] = [];
    try {
      managersDb = await sql`
        SELECT team_id, name
        FROM managers
        WHERE season_id = ${seasonId}
      `;
    } catch (e) {
      console.warn('Could not fetch managers:', e);
    }

    const managerMap = new Map<string, string>();
    managersDb.forEach((m: any) => {
      if (m.team_id && m.name) managerMap.set(m.team_id, m.name.trim().toUpperCase());
    });

    // Map filename friendly slugs for fallback local logos
    const localLogoMap: Record<string, string> = {
      'andimukk fc': '/triple-threat/assets/teams/andimukk-fc.jpg',
      'black panthers': '/triple-threat/assets/teams/black-panthers.jpg',
      'blue strikers': '/triple-threat/assets/teams/blue-strikers.jpg',
      'el-bicho': '/triple-threat/assets/teams/el-bicho.jpg',
      'el-bicho 7': '/triple-threat/assets/teams/el-bicho.jpg',
      'fasal muth army': '/triple-threat/assets/teams/fasal-muth-army.jpg',
      'fc barcelona': '/triple-threat/assets/teams/fc-barcelona.png',
      'immortals': '/triple-threat/assets/teams/immortals.jpg',
      'legends fc': '/triple-threat/assets/teams/legends-fc.jpg',
      'los galacticos': '/triple-threat/assets/teams/los-galacticos.jpg',
      'manchester united': '/triple-threat/assets/teams/manchester-united.jpg',
      'psychoz': '/triple-threat/assets/teams/psychoz.jpg',
      'red hawks fc': '/triple-threat/assets/teams/red-hawks-fc.png',
      'sentinels': '/triple-threat/assets/teams/sentinels.jpg',
      'skill 555': '/triple-threat/assets/teams/skill-555.jpg',
      'titans': '/triple-threat/assets/teams/titans.jpg',
      'varsity soccers': '/triple-threat/assets/teams/varsity-soccers.jpg',
    };

    const teamsObj: Record<string, any> = {};
    const teamIdToName = new Map<string, string>();

    teamsDb.forEach((t: any) => {
      const tId = t.team_id || t.id;
      const tName = (t.team_name || '').trim().toUpperCase();
      if (!tName) return;

      teamIdToName.set(tId, tName);

      const grp = groupMap.get(tId) || 'TBD';
      const short = (t.team_code || tName.slice(0, 3)).toUpperCase();
      const manager = managerMap.get(tId) || (t.owner_name || '').trim().toUpperCase();
      const captain = (t.owner_name || '').trim().toUpperCase();

      const lowerName = tName.toLowerCase();
      const logo = t.logo_url || localLogoMap[lowerName] || null;

      teamsObj[tName] = {
        id: tId,
        group: grp,
        short,
        manager,
        captain,
        logo,
      };
    });

    // 4. Fetch Fixtures and Matchups
    const fixtures = await sql`
      SELECT *
      FROM fixtures
      WHERE tournament_id = ${tour.id}
      ORDER BY round_number ASC, match_number ASC, id ASC
    `;

    const matchups = await sql`
      SELECT *
      FROM matchups
      WHERE tournament_id = ${tour.id}
      ORDER BY position ASC, id ASC
    `;

    const matchupsByFixture = new Map<string, any[]>();
    matchups.forEach((m: any) => {
      const arr = matchupsByFixture.get(m.fixture_id) || [];
      arr.push(m);
      matchupsByFixture.set(m.fixture_id, arr);
    });

    // 5. Build Matches list
    const matchdaysSet = new Set<number>();
    const matchesList: any[] = [];

    // Tracking for group standings and team breakdown
    interface TeamStatsRecord {
      team: string;
      group: string;
      p: number;
      w: number;
      d: number;
      l: number;
      pf: number;
      pa: number;
      gd: number;
      pts: number;
      bonus: number;
      form: string[];
      mds: Record<number, { opp: string; duo: number | null; coop: number | null; single: number | null; bonus: number | null; total: number | null }>;
    }

    const teamStats = new Map<string, TeamStatsRecord>();

    // Initialize all teams in groupMap
    teamsDb.forEach((t: any) => {
      const tId = t.team_id || t.id;
      const tName = teamIdToName.get(tId);
      const grp = groupMap.get(tId);
      if (tName && grp && grp !== 'TBD') {
        teamStats.set(tName, {
          team: tName,
          group: grp,
          p: 0,
          w: 0,
          d: 0,
          l: 0,
          pf: 0,
          pa: 0,
          gd: 0,
          pts: 0,
          bonus: 0,
          form: [],
          mds: {}
        });
      }
    });

    fixtures.forEach((f: any) => {
      const md = f.round_number || 1;
      matchdaysSet.add(md);

      const homeName = (f.home_team_name || teamIdToName.get(f.home_team_id) || '').trim().toUpperCase();
      const awayName = (f.away_team_name || teamIdToName.get(f.away_team_id) || '').trim().toUpperCase();
      const grp = (f.group_name || groupMap.get(f.home_team_id) || '').replace(/group\s*/i, '').trim().toUpperCase();

      const fMatchups = matchupsByFixture.get(f.id) || [];

      // Categorize the 3 modes (Duo supports both legacy 2v2 single-row and current 2 x 1v1 goal-aggregate)
      const coopMs = fMatchups.filter((m: any) => resolveTripleThreatMode(m) === 'coop');
      const duoMs = fMatchups.filter((m: any) => resolveTripleThreatMode(m) === 'duo');
      const singleMs = fMatchups.filter((m: any) => resolveTripleThreatMode(m) === 'single');

      const calcModePoints = (ms: any[]) => {
        if (!ms || ms.length === 0 || ms.some((m) => m.home_goals === null || m.away_goals === null)) {
          return { h: null, a: null, hp: null, ap: null };
        }
        const hG = ms.reduce((sum, m) => sum + Number(m.home_goals), 0);
        const aG = ms.reduce((sum, m) => sum + Number(m.away_goals), 0);
        let hp = 0;
        let ap = 0;
        if (hG > aG) { hp = 3; ap = 0; }
        else if (hG < aG) { hp = 0; ap = 3; }
        else { hp = 1; ap = 1; }
        return { h: hG, a: aG, hp, ap };
      };

      const coopRes = calcModePoints(coopMs);
      const duoRes = calcModePoints(duoMs);
      const singleRes = calcModePoints(singleMs);

      const modesArr = [
        { key: 'coop', label: 'CO-OP', ...coopRes },
        { key: 'duo', label: 'DUO', ...duoRes },
        { key: 'single', label: 'SINGLE', ...singleRes },
      ];

      // Total tie points
      const isCompleted = f.status === 'completed';
      const isLive = f.status === 'in_progress';
      const hasAnyScore = coopRes.h !== null || duoRes.h !== null || singleRes.h !== null;

      let hp = 0;
      let ap = 0;
      let hb = 0;
      let ab = 0;

      if (hasAnyScore) {
        hp = (coopRes.hp || 0) + (duoRes.hp || 0) + (singleRes.hp || 0);
        ap = (coopRes.ap || 0) + (duoRes.ap || 0) + (singleRes.ap || 0);

        // Clean sweep check (3-0 wins across all 3 modes)
        if (coopRes.hp === 3 && duoRes.hp === 3 && singleRes.hp === 3) {
          hb = tour.clean_sweep_bonus || 1;
          hp += hb;
        } else if (coopRes.ap === 3 && duoRes.ap === 3 && singleRes.ap === 3) {
          ab = tour.clean_sweep_bonus || 1;
          ap += ab;
        }
      }

      // Check if DB had explicit home_points_earned
      if (f.home_points_earned !== null && f.away_points_earned !== null && isCompleted) {
        hp = Number(f.home_points_earned);
        ap = Number(f.away_points_earned);
      }

      const matchObj = {
        id: f.id,
        md,
        group: grp,
        home: homeName,
        away: awayName,
        hp: hasAnyScore ? hp : null,
        ap: hasAnyScore ? ap : null,
        hb,
        ab,
        status: isCompleted ? 'FT' : isLive ? 'LIVE' : 'UPCOMING',
        done: isCompleted ? 1 : 0,
        modes: modesArr,
      };

      matchesList.push(matchObj);

      // Accumulate Standings & Breakdown if completed or live
      if (hasAnyScore && homeName && awayName) {
        const homeStat = teamStats.get(homeName);
        const awayStat = teamStats.get(awayName);

        if (homeStat && isCompleted) {
          homeStat.p += 1;
          homeStat.pf += hp;
          homeStat.pa += ap;
          homeStat.gd = homeStat.pf - homeStat.pa;
          homeStat.pts += hp;
          homeStat.bonus += hb;

          if (hp > ap) {
            homeStat.w += 1;
            homeStat.form.push('W');
          } else if (hp < ap) {
            homeStat.l += 1;
            homeStat.form.push('L');
          } else {
            homeStat.d += 1;
            homeStat.form.push('D');
          }

          homeStat.mds[md] = {
            opp: awayName,
            duo: duoRes.hp,
            coop: coopRes.hp,
            single: singleRes.hp,
            bonus: hb || null,
            total: hp
          };
        }

        if (awayStat && isCompleted) {
          awayStat.p += 1;
          awayStat.pf += ap;
          awayStat.pa += hp;
          awayStat.gd = awayStat.pf - awayStat.pa;
          awayStat.pts += ap;
          awayStat.bonus += ab;

          if (ap > hp) {
            awayStat.w += 1;
            awayStat.form.push('W');
          } else if (ap < hp) {
            awayStat.l += 1;
            awayStat.form.push('L');
          } else {
            awayStat.d += 1;
            awayStat.form.push('D');
          }

          awayStat.mds[md] = {
            opp: homeName,
            duo: duoRes.ap,
            coop: coopRes.ap,
            single: singleRes.ap,
            bonus: ab || null,
            total: ap
          };
        }
      }
    });

    // 6. Format Groups & Standings
    const groupNames = ['A', 'B', 'C', 'D'];
    const groupsArray: any[] = [];

    groupNames.forEach((gName) => {
      const rowsForGroup: any[] = [];
      teamStats.forEach((st) => {
        if (st.group === gName) {
          rowsForGroup.push(st);
        }
      });

      // Sort: pts DESC, gd DESC, pf DESC, w DESC
      rowsForGroup.sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.gd !== a.gd) return b.gd - a.gd;
        if (b.pf !== a.pf) return b.pf - a.pf;
        return b.w - a.w;
      });

      const standings = rowsForGroup.map((r, idx) => ({
        pos: idx + 1,
        group: gName,
        team: r.team,
        p: r.p,
        w: r.w,
        d: r.d,
        l: r.l,
        pf: r.pf,
        pa: r.pa,
        gd: r.gd,
        pts: r.pts,
        bonus: r.bonus,
        form: r.form,
      }));

      groupsArray.push({
        name: gName,
        standings,
      });
    });

    // 7. Format Breakdown array
    const sortedMatchdays = Array.from(matchdaysSet).sort((a, b) => a - b);
    const defaultMds = sortedMatchdays.length > 0 ? sortedMatchdays : [1, 2, 3, 4, 5, 6];

    const breakdownArray: any[] = [];
    groupNames.forEach((gName) => {
      teamStats.forEach((st) => {
        if (st.group === gName) {
          const mdsList = defaultMds.map((mdNum) => {
            const entry = st.mds[mdNum] || {
              opp: '',
              duo: null,
              coop: null,
              single: null,
              bonus: null,
              total: null
            };
            return {
              md: mdNum,
              ...entry
            };
          });

          breakdownArray.push({
            team: st.team,
            group: gName,
            total: st.pts,
            mds: mdsList
          });
        }
      });
    });

    // 8. Knockout Bracket Projection or Actual Knockout Fixtures
    // Top 2 from each group advance: A1, A2, B1, B2, C1, C2, D1, D2
    const getSeedTeam = (groupLetter: string, pos: number) => {
      const g = groupsArray.find(x => x.name === groupLetter);
      return g?.standings?.[pos - 1]?.team || '';
    };

    const knockoutMatches = [
      {
        id: 'QF1',
        stage: 'QUARTER-FINAL',
        home: getSeedTeam('A', 1),
        away: getSeedTeam('B', 2),
        homeLabel: 'Group A #1',
        awayLabel: 'Group B #2',
        homeSeed: 'A1',
        awaySeed: 'B2',
        homeProjected: true,
        awayProjected: true,
        hp: null,
        ap: null,
        winner: null,
        status: 'UPCOMING',
        done: 0,
        modes: []
      },
      {
        id: 'QF2',
        stage: 'QUARTER-FINAL',
        home: getSeedTeam('C', 1),
        away: getSeedTeam('D', 2),
        homeLabel: 'Group C #1',
        awayLabel: 'Group D #2',
        homeSeed: 'C1',
        awaySeed: 'D2',
        homeProjected: true,
        awayProjected: true,
        hp: null,
        ap: null,
        winner: null,
        status: 'UPCOMING',
        done: 0,
        modes: []
      },
      {
        id: 'QF3',
        stage: 'QUARTER-FINAL',
        home: getSeedTeam('B', 1),
        away: getSeedTeam('A', 2),
        homeLabel: 'Group B #1',
        awayLabel: 'Group A #2',
        homeSeed: 'B1',
        awaySeed: 'A2',
        homeProjected: true,
        awayProjected: true,
        hp: null,
        ap: null,
        winner: null,
        status: 'UPCOMING',
        done: 0,
        modes: []
      },
      {
        id: 'QF4',
        stage: 'QUARTER-FINAL',
        home: getSeedTeam('D', 1),
        away: getSeedTeam('C', 2),
        homeLabel: 'Group D #1',
        awayLabel: 'Group C #2',
        homeSeed: 'D1',
        awaySeed: 'C2',
        homeProjected: true,
        awayProjected: true,
        hp: null,
        ap: null,
        winner: null,
        status: 'UPCOMING',
        done: 0,
        modes: []
      },
      {
        id: 'SF1',
        stage: 'SEMI-FINAL',
        home: '',
        away: '',
        homeLabel: 'Winner QF1',
        awayLabel: 'Winner QF3',
        homeSeed: 'W(QF1)',
        awaySeed: 'W(QF3)',
        homeProjected: false,
        awayProjected: false,
        hp: null,
        ap: null,
        winner: null,
        status: 'UPCOMING',
        done: 0,
        modes: []
      },
      {
        id: 'SF2',
        stage: 'SEMI-FINAL',
        home: '',
        away: '',
        homeLabel: 'Winner QF2',
        awayLabel: 'Winner QF4',
        homeSeed: 'W(QF2)',
        awaySeed: 'W(QF4)',
        homeProjected: false,
        awayProjected: false,
        hp: null,
        ap: null,
        winner: null,
        status: 'UPCOMING',
        done: 0,
        modes: []
      },
      {
        id: 'FINAL',
        stage: 'FINAL',
        home: '',
        away: '',
        homeLabel: 'Winner SF1',
        awayLabel: 'Winner SF2',
        homeSeed: 'W(SF1)',
        awaySeed: 'W(SF2)',
        homeProjected: false,
        awayProjected: false,
        hp: null,
        ap: null,
        winner: null,
        status: 'UPCOMING',
        done: 0,
        modes: []
      }
    ];

    const payload = {
      meta: {
        league: tour.season_id.replace('SSPSLS', 'SS SUPER LEAGUE S'),
        title: tour.tournament_name || 'SS TRIPLE THREAT',
        tagline: 'Three Modes. One Champion.',
        footer: 'SS SUPER LEAGUE COMMITTEE',
        stage: 'GROUP STAGE',
        logo: '/triple-threat/assets/logo.png',
        bg: '/triple-threat/assets/background.png',
        pointsMode: 'TRIPLE THREAT',
        win: 3,
        draw: 1,
        bonus: tour.clean_sweep_bonus || 1,
        legs: 2,
        qualify: 2,
        updated: new Date().toISOString()
      },
      hasGroups: true,
      teams: teamsObj,
      groups: groupsArray,
      matchdays: defaultMds,
      breakdown: breakdownArray,
      matches: matchesList,
      knockout: {
        groupDone: false,
        champion: '',
        matches: knockoutMatches
      }
    };

    return NextResponse.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Error in triple-threat-data:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch Triple Threat data' },
      { status: 500 }
    );
  }
}
