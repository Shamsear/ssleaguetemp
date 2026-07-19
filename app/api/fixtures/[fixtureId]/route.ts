import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/firebase/admin';

// GET - Fetch a single fixture by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { fixtureId } = await params;

    if (!fixtureId) {
      return NextResponse.json(
        { error: 'fixtureId is required' },
        { status: 400 }
      );
    }

    // Fetch the fixture from Neon with tournament scoring type
    const fixtures = await sql`
      SELECT 
        f.*,
        ts.scoring_type
      FROM fixtures f
      LEFT JOIN tournaments t ON f.tournament_id = t.id
      LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
      WHERE f.id = ${fixtureId}
      LIMIT 1
    `;

    if (fixtures.length === 0) {
      return NextResponse.json(
        { error: 'Fixture not found' },
        { status: 404 }
      );
    }

    const fixture = fixtures[0];

    // Fetch team logos
    let home_team_logo = null;
    let away_team_logo = null;
    
    const homePromise = (fixture.home_team_id && fixture.home_team_id !== 'TBD' && fixture.home_team_id !== 'bye')
      ? adminDb.collection('teams').doc(fixture.home_team_id).get().then(doc => doc.exists ? doc.data()?.logo_url || null : null).catch(() => null)
      : Promise.resolve(null);

    const awayPromise = (fixture.away_team_id && fixture.away_team_id !== 'TBD' && fixture.away_team_id !== 'bye')
      ? adminDb.collection('teams').doc(fixture.away_team_id).get().then(doc => doc.exists ? doc.data()?.logo_url || null : null).catch(() => null)
      : Promise.resolve(null);

    const [home_logo_result, away_logo_result] = await Promise.all([homePromise, awayPromise]);
    home_team_logo = home_logo_result;
    away_team_logo = away_logo_result;

    const fixtureWithLogos = {
      ...fixture,
      home_team_logo,
      away_team_logo
    };

    return NextResponse.json({ fixture: fixtureWithLogos });
  } catch (error) {
    console.error('Error fetching fixture:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fixture' },
      { status: 500 }
    );
  }
}

// PATCH - Update fixture MOTM and penalty goals
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { fixtureId } = await params;
    const body = await request.json();
    const { motm_player_id, motm_player_name, home_penalty_goals, away_penalty_goals } = body;

    // Check result entry deadline
    const fixtures = await sql`
      SELECT season_id, round_number, leg
      FROM fixtures
      WHERE id = ${fixtureId}
      LIMIT 1
    `;

    if (fixtures.length === 0) {
      return NextResponse.json(
        { error: 'Fixture not found' },
        { status: 404 }
      );
    }

    const { season_id, round_number, leg } = fixtures[0];

    // Get round deadlines
    const deadlines = await sql`
      SELECT scheduled_date, result_entry_deadline_time, result_entry_deadline_day_offset
      FROM round_deadlines
      WHERE season_id = ${season_id}
      AND round_number = ${round_number}
      AND leg = ${leg}
      LIMIT 1
    `;

    // Deadline check disabled - phase logic on frontend controls access
    // The frontend already checks if we're in result_entry phase before allowing MOTM/penalty updates
    if (deadlines.length > 0 && deadlines[0].scheduled_date) {
      const deadline = deadlines[0];

      // Calculate result entry deadline for logging
      const resultDate = new Date(deadline.scheduled_date);
      resultDate.setDate(resultDate.getDate() + (deadline.result_entry_deadline_day_offset || 2));
      const resultDateStr = resultDate.toISOString().split('T')[0];

      // Parse deadline time (HH:MM format)
      const [hours, minutes] = deadline.result_entry_deadline_time.split(':').map(Number);

      // Create deadline in IST (UTC+5:30)
      const resultDeadline = new Date(resultDateStr);
      resultDeadline.setUTCHours(hours - 5, minutes - 30, 0, 0); // Convert IST to UTC

      const now = new Date();

      console.log('MOTM/Penalty update - Deadline info:', {
        now: now.toISOString(),
        deadline: resultDeadline.toISOString(),
        isPassed: now >= resultDeadline,
        note: 'Deadline check disabled - controlled by frontend phase logic'
      });

      // Deadline check commented out - frontend phase logic controls access
      // if (now >= resultDeadline) {
      //   return NextResponse.json(
      //     { 
      //       error: 'Result entry deadline has passed',
      //       deadline: resultDeadline.toISOString()
      //     },
      //     { status: 403 }
      //   );
      // }
    }

    // Update MOTM and penalty goals for fixture
    await sql`
      UPDATE fixtures
      SET 
        motm_player_id = ${motm_player_id || null},
        motm_player_name = ${motm_player_name || null},
        home_penalty_goals = ${home_penalty_goals || 0},
        away_penalty_goals = ${away_penalty_goals || 0},
        updated_at = NOW()
      WHERE id = ${fixtureId}
    `;

    return NextResponse.json({
      success: true,
      message: 'Match details updated successfully'
    });
  } catch (error) {
    console.error('Error updating MOTM:', error);
    return NextResponse.json(
      { error: 'Failed to update match details' },
      { status: 500 }
    );
  }
}
