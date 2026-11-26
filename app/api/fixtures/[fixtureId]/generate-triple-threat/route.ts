import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { buildTripleThreatMatchups } from '@/lib/tournament/triple-threat-engine';

// POST - Generate the 4 Triple Threat matchups (1 Co-op 2v2, 2 Duo 1v1s, 1 Single 1v1) from submitted lineups
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { fixtureId } = await params;

    const fixtures = await sql`
      SELECT id, season_id, round_number, tournament_id, home_team_id, away_team_id, home_team_name, away_team_name, scoring_system, knockout_format
      FROM fixtures
      WHERE id = ${fixtureId}
      LIMIT 1
    `;

    if (fixtures.length === 0) {
      return NextResponse.json({ error: 'Fixture not found' }, { status: 404 });
    }

    const fixture = fixtures[0];
    const { home_team_id, away_team_id } = fixture;

    // Fetch both lineups
    const lineups = await sql`
      SELECT team_id, triple_threat_lineup, starting_xi
      FROM lineups
      WHERE fixture_id = ${fixtureId} AND team_id IN (${home_team_id}, ${away_team_id})
    `;

    const homeL = lineups.find((l: any) => l.team_id === home_team_id);
    const awayL = lineups.find((l: any) => l.team_id === away_team_id);

    if (!homeL?.triple_threat_lineup && !awayL?.triple_threat_lineup) {
      return NextResponse.json(
        { error: 'Neither team has submitted a Triple Threat lineup yet.' },
        { status: 400 }
      );
    }

    if (!homeL?.triple_threat_lineup) {
      return NextResponse.json(
        { error: `${fixture.home_team_name} has not submitted their Triple Threat lineup yet.` },
        { status: 400 }
      );
    }

    if (!awayL?.triple_threat_lineup) {
      return NextResponse.json(
        { error: `${fixture.away_team_name} has not submitted their Triple Threat lineup yet.` },
        { status: 400 }
      );
    }

    const homeTT = homeL.triple_threat_lineup;
    const awayTT = awayL.triple_threat_lineup;

    const extractId = (item: any): string => {
      if (!item) return '';
      if (typeof item === 'string') return item.trim();
      return String(item.player_id || item.id || '').trim();
    };

    const homeCoopIds = (homeTT.coop || []).map(extractId).filter(Boolean);
    const homeDuoIds = (homeTT.duo || []).map(extractId).filter(Boolean);
    const homeSingleIds = (homeTT.single || []).map(extractId).filter(Boolean);

    const awayCoopIds = (awayTT.coop || []).map(extractId).filter(Boolean);
    const awayDuoIds = (awayTT.duo || []).map(extractId).filter(Boolean);
    const awaySingleIds = (awayTT.single || []).map(extractId).filter(Boolean);

    const allPlayerIds = [
      ...homeCoopIds, ...homeDuoIds, ...homeSingleIds,
      ...awayCoopIds, ...awayDuoIds, ...awaySingleIds
    ];

    const nameMap = new Map<string, string>();

    const gatherObjNames = (arr: any[]) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((item: any) => {
        if (item && typeof item === 'object') {
          const id = extractId(item);
          const name = item.player_name || item.name;
          if (id && name) nameMap.set(id, name);
        }
      });
    };

    gatherObjNames(homeTT.coop);
    gatherObjNames(homeTT.duo);
    gatherObjNames(homeTT.single);
    gatherObjNames(awayTT.coop);
    gatherObjNames(awayTT.duo);
    gatherObjNames(awayTT.single);

    if (allPlayerIds.length > 0) {
      try {
        const playerRows = await sql`
          SELECT player_id::text, player_name FROM player_seasons WHERE player_id::text = ANY(${allPlayerIds})
          UNION
          SELECT id::text as player_id, name as player_name FROM realplayers WHERE id::text = ANY(${allPlayerIds})
          UNION
          SELECT id::text as player_id, name as player_name FROM players WHERE id::text = ANY(${allPlayerIds})
        `;
        playerRows.forEach((r: any) => {
          if (r.player_id && r.player_name) {
            nameMap.set(String(r.player_id), r.player_name);
          }
        });
      } catch (pErr) {
        console.warn('Could not query player names for Triple Threat matchups:', pErr);
      }
    }

    const getNames = (ids: string[]) => ids.map(id => nameMap.get(id) || `Player ${id}`);
    const builtMatchups = buildTripleThreatMatchups(homeTT, awayTT, getNames);

    // Delete any old matchups for this fixture
    await sql`DELETE FROM matchups WHERE fixture_id = ${fixtureId}`;

    // Insert 4 Triple Threat matchups (Pos 1: Co-op 2v2, Pos 2: Duo 1v1 #1, Pos 3: Duo 1v1 #2, Pos 4: Single 1v1)
    for (const m of builtMatchups) {
      await sql`
        INSERT INTO matchups (
          fixture_id, season_id, tournament_id, round_number, position, match_mode,
          home_player_id, home_player_name, away_player_id, away_player_name,
          home_player_ids, home_player_names, away_player_ids, away_player_names,
          match_duration, created_at, updated_at
        ) VALUES (
          ${fixtureId}, ${fixture.season_id}, ${fixture.tournament_id}, ${fixture.round_number}, ${m.position}, ${m.match_mode},
          ${m.home_player_id}, ${m.home_player_name},
          ${m.away_player_id}, ${m.away_player_name},
          ${m.home_player_ids}, ${m.home_player_names},
          ${m.away_player_ids}, ${m.away_player_names},
          ${m.match_duration}, NOW(), NOW()
        )
      `;
    }

    // Update fixture flags
    await sql`
      UPDATE fixtures
      SET 
        home_lineup_submitted = true,
        away_lineup_submitted = true,
        matchups_created_at = NOW(),
        updated_at = NOW()
      WHERE id = ${fixtureId}
    `;

    return NextResponse.json({
      success: true,
      message: 'Successfully generated 4 Triple Threat matchups across 3 modes!',
      matchups_count: builtMatchups.length
    });
  } catch (error: any) {
    console.error('Error generating Triple Threat matchups:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate Triple Threat matchups' },
      { status: 500 }
    );
  }
}
