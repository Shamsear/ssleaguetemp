import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { calculateTripleThreatFixture, resolveTripleThreatMode } from '@/lib/tournament/triple-threat-engine';

/**
 * PUT /api/fixtures/[fixtureId]/draft-results
 * Save fixture results as draft (no calculations, no status changes)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { fixtureId } = await params;
    const body = await request.json();
    const { results, entered_by, motm_player_id, motm_player_name, home_penalty_goals, away_penalty_goals } = body;

    // Validate
    if (!results || !Array.isArray(results) || results.length === 0) {
      return NextResponse.json(
        { error: 'Invalid results data' },
        { status: 400 }
      );
    }

    console.log(`💾 Saving draft results for fixture ${fixtureId}`);

    // Update match results in matchups (goals only, no status changes)
    for (const result of results) {
      await sql`
        UPDATE matchups
        SET 
          home_goals = ${result.home_goals},
          away_goals = ${result.away_goals},
          result_entered_by = ${entered_by},
          result_entered_at = NOW(),
          updated_at = NOW()
        WHERE fixture_id = ${fixtureId}
        AND position = ${result.position}
      `;
    }

    // Calculate total scores for display purposes (but don't update fixture status)
    const fixtureMeta = await sql`
      SELECT f.tournament_id, t.tournament_type, ts.matchday_format
      FROM fixtures f
      LEFT JOIN tournaments t ON f.tournament_id = t.id
      LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
      WHERE f.id = ${fixtureId}
      LIMIT 1
    `;
    const isTripleThreat =
      fixtureMeta.length > 0 &&
      (fixtureMeta[0].tournament_type === 'triple_threat' ||
        fixtureMeta[0].matchday_format === 'triple_threat' ||
        String(fixtureMeta[0].tournament_id || '').toLowerCase().includes('triple_threat'));

    let totalHomeScore = 0;
    let totalAwayScore = 0;

    if (isTripleThreat) {
      const dbMatchups = await sql`
        SELECT position, match_mode FROM matchups WHERE fixture_id = ${fixtureId}
      `;
      const modeByPos = new Map<number, string>();
      dbMatchups.forEach((m: any) => {
        if (m.match_mode) modeByPos.set(m.position, m.match_mode);
      });
      const ttResult = calculateTripleThreatFixture(
        results.map((r: any) => ({
          position: r.position,
          mode: resolveTripleThreatMode({
            mode: r.match_mode || modeByPos.get(r.position),
            position: r.position,
          }),
          home_goals: r.home_goals ?? 0,
          away_goals: r.away_goals ?? 0,
        }))
      );
      totalHomeScore = ttResult.home_total_points;
      totalAwayScore = ttResult.away_total_points;
    } else {
      for (const result of results) {
        totalHomeScore += result.home_goals;
        totalAwayScore += result.away_goals;
      }
    }

    // Update fixture with draft results and MOTM (but keep status as is, don't mark as completed)
    await sql`
      UPDATE fixtures
      SET 
        home_score = ${totalHomeScore},
        away_score = ${totalAwayScore},
        motm_player_id = ${motm_player_id || null},
        motm_player_name = ${motm_player_name || null},
        home_penalty_goals = ${home_penalty_goals || 0},
        away_penalty_goals = ${away_penalty_goals || 0},
        updated_at = NOW()
      WHERE id = ${fixtureId}
    `;

    console.log(`✅ Draft saved: ${totalHomeScore}-${totalAwayScore}`);

    return NextResponse.json({ 
      success: true, 
      message: 'Draft saved successfully',
      home_score: totalHomeScore,
      away_score: totalAwayScore,
      is_draft: true
    });
  } catch (error: any) {
    console.error('Error saving draft results:', error);
    return NextResponse.json(
      { error: 'Failed to save draft results' },
      { status: 500 }
    );
  }
}
