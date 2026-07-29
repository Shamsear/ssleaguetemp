import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { validateSubstitution } from '@/lib/lineup-validation';

/**
 * POST - Make a substitution (swap starting player with substitute)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lineupId: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { lineupId } = await params;
    const body = await request.json();
    const {
      player_out,
      player_out_name,
      player_in,
      player_in_name,
      made_by,
      made_by_name,
      notes,
    } = body;

    if (!player_out || !player_in || !made_by) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate substitution
    const validation = await validateSubstitution(lineupId, player_out, player_in);
    
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Get current lineup
    const lineups = await sql`
      SELECT 
        starting_xi,
        substitutes,
        fixture_id,
        team_id,
        is_locked
      FROM lineups
      WHERE id = ${lineupId}
      LIMIT 1
    `;

    if (lineups.length === 0) {
      return NextResponse.json(
        { error: 'Lineup not found' },
        { status: 404 }
      );
    }

    const lineup = lineups[0];

    // Parse arrays
    let startingXI = lineup.starting_xi as string[];
    let subs = lineup.substitutes as string[];

    // Perform swap
    const outIndex = startingXI.indexOf(player_out);
    const inIndex = subs.indexOf(player_in);

    if (outIndex === -1 || inIndex === -1) {
      return NextResponse.json(
        { error: 'Invalid player IDs' },
        { status: 400 }
      );
    }

    // Swap players
    startingXI[outIndex] = player_in;
    subs[inIndex] = player_out;

    // Fetch player categories to compute auto penalty
    const seasonNum = parseInt(lineup.season_id.replace(/\D/g, '')) || 0;
    const isModern = seasonNum === 16 || seasonNum === 17;
    const tableName = isModern ? 'player_seasons' : 'realplayerstats';

    let outCategory = 'classic';
    let inCategory = 'classic';
    try {
      const playersData = await sql`
        SELECT player_id, category
        FROM ${sql(tableName)}
        WHERE player_id IN (${player_out}, ${player_in}) AND season_id = ${lineup.season_id}
      `;
      const outPlayer = playersData.find((p: any) => p.player_id === player_out);
      const inPlayer = playersData.find((p: any) => p.player_id === player_in);
      if (outPlayer) outCategory = outPlayer.category;
      if (inPlayer) inCategory = inPlayer.category;
    } catch (e) {
      console.warn('Failed to fetch player categories for penalty calculation, defaulting to classic:', e);
    }

    // Compute substitution penalty
    const priorities: { [key: string]: number } = {
      '1st': 1,
      '2nd': 2,
      '3rd': 3,
      '4th': 4
    };

    const pOut = priorities[outCategory] || 0;
    const pIn = priorities[inCategory] || 0;
    let penalty = 2; // Default starting penalty

    if (pOut && pIn && pIn < pOut) {
      penalty = 2 + (pOut - pIn);
    }

    const autoNotes = `Auto Penalty: +${penalty} goals. [Category: ${outCategory} -> ${inCategory}].${notes ? ' Notes: ' + notes : ''}`;

    // Update lineup with new arrays
    await sql`
      UPDATE lineups SET
        starting_xi = ${JSON.stringify(startingXI)},
        substitutes = ${JSON.stringify(subs)},
        updated_at = NOW()
      WHERE id = ${lineupId}
    `;

    // Update matchups table if the matchups already exist for this fixture
    try {
      const fixtures = await sql`
        SELECT home_team_id, away_team_id
        FROM fixtures
        WHERE id = ${lineup.fixture_id}
        LIMIT 1
      `;
      if (fixtures.length > 0) {
        const fixture = fixtures[0];
        const isHomeTeam = fixture.home_team_id === lineup.team_id;

        if (isHomeTeam) {
          await sql`
            UPDATE matchups
            SET 
              home_player_id = ${player_in},
              home_player_name = ${player_in_name || null},
              home_original_player_id = ${player_out},
              home_original_player_name = ${player_out_name || null},
              home_substituted = true,
              home_sub_penalty = ${penalty},
              updated_at = NOW()
            WHERE fixture_id = ${lineup.fixture_id}
            AND home_player_id = ${player_out}
          `;
        } else {
          await sql`
            UPDATE matchups
            SET 
              away_player_id = ${player_in},
              away_player_name = ${player_in_name || null},
              away_original_player_id = ${player_out},
              away_original_player_name = ${player_out_name || null},
              away_substituted = true,
              away_sub_penalty = ${penalty},
              updated_at = NOW()
            WHERE fixture_id = ${lineup.fixture_id}
            AND away_player_id = ${player_out}
          `;
        }
      }
    } catch (matchupError) {
      console.error('Failed to update matchups during substitution:', matchupError);
    }

    // Record substitution in history
    await sql`
      INSERT INTO lineup_substitutions (
        lineup_id,
        fixture_id,
        team_id,
        player_out,
        player_out_name,
        player_in,
        player_in_name,
        made_at,
        made_by,
        made_by_name,
        notes
      ) VALUES (
        ${lineupId},
        ${lineup.fixture_id},
        ${lineup.team_id},
        ${player_out},
        ${player_out_name || null},
        ${player_in},
        ${player_in_name || null},
        NOW(),
        ${made_by},
        ${made_by_name || null},
        ${autoNotes}
      )
    `;

    return NextResponse.json({
      success: true,
      message: 'Substitution completed successfully',
      lineup: {
        starting_xi: startingXI,
        substitutes: subs,
      },
    });
  } catch (error: any) {
    console.error('Error making substitution:', error);
    return NextResponse.json(
      { error: 'Failed to make substitution', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET - Get substitution history for a lineup
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lineupId: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { lineupId } = await params;

    const substitutions = await sql`
      SELECT *
      FROM lineup_substitutions
      WHERE lineup_id = ${lineupId}
      ORDER BY made_at ASC
    `;

    return NextResponse.json({
      success: true,
      substitutions,
    });
  } catch (error: any) {
    console.error('Error fetching substitutions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch substitutions' },
      { status: 500 }
    );
  }
}
