import { NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // Cache for 5 minutes

export async function GET() {
  try {
    const sql = getTournamentDb();
    
    // Get all league/shield champions — both historical (trophy_name='League') and modern (trophy_position = 'Shield Winner' for S17+)
    const champions = await sql`
      SELECT 
        tt.team_id,
        tt.team_name,
        COUNT(*) as championship_count,
        ARRAY_AGG(tt.season_id ORDER BY COALESCE(NULLIF(REGEXP_REPLACE(tt.season_id, '[^0-9]', '', 'g'), ''), '0')::integer) as seasons_won,
        MAX(ts.points) as best_points,
        SUM(ts.wins) as total_wins,
        SUM(ts.goals_for) as total_goals
      FROM team_trophies tt
      LEFT JOIN (
        SELECT team_id, season_id, MAX(points) as points, SUM(wins) as wins, SUM(goals_for) as goals_for
        FROM teamstats
        GROUP BY team_id, season_id
      ) ts ON tt.team_id = ts.team_id AND tt.season_id = ts.season_id
      WHERE (
        -- S1-S16 historical: exact type+name match
        (
          COALESCE(NULLIF(REGEXP_REPLACE(tt.season_id, '[^0-9]', '', 'g'), ''), '0')::integer < 17
          AND (
            ((tt.trophy_type ILIKE 'league' AND tt.trophy_name ILIKE 'league')
             OR 
             (tt.trophy_name ~* '^SS Super League S[0-9]+ League$' AND tt.notes ILIKE '%Auto-awarded based on tournament standings%'))
            AND (tt.trophy_position ILIKE 'winner%' OR tt.trophy_position ILIKE 'champion%' OR tt.position = 1)
          )
        )
        OR
        -- S17+ modern: trophy_position contains 'Shield Winner'
        (
          COALESCE(NULLIF(REGEXP_REPLACE(tt.season_id, '[^0-9]', '', 'g'), ''), '0')::integer >= 17
          AND tt.trophy_position ILIKE 'Shield Winner'
        )
      )
      GROUP BY tt.team_id, tt.team_name
      ORDER BY championship_count DESC, tt.team_name ASC
    `;

    // Get cup/tournament winners — both historical (trophy_name='Cup') and modern (trophy_position = 'Knockout Winner' for S17+)
    const cupWinners = await sql`
      SELECT 
        team_id,
        team_name,
        COUNT(*) as cup_count,
        ARRAY_AGG(season_id ORDER BY COALESCE(NULLIF(REGEXP_REPLACE(season_id, '[^0-9]', '', 'g'), ''), '0')::integer) as seasons
      FROM team_trophies
      WHERE (
        -- S1-S16 historical: exact type+name match
        (
          COALESCE(NULLIF(REGEXP_REPLACE(season_id, '[^0-9]', '', 'g'), ''), '0')::integer < 17
          AND (
            ((trophy_type ILIKE 'cup' AND trophy_name ILIKE 'cup')
             OR 
             (trophy_name ~* '^SS Super League S[0-9]+ League$' AND notes ILIKE '%Auto-awarded based on knockout final%'))
            AND (trophy_position ILIKE 'winner%' OR trophy_position ILIKE 'champion%' OR position = 1)
          )
        )
        OR
        -- S17+ modern: trophy_position contains 'Knockout Winner'
        (
          COALESCE(NULLIF(REGEXP_REPLACE(season_id, '[^0-9]', '', 'g'), ''), '0')::integer >= 17
          AND trophy_position ILIKE 'Knockout Winner'
        )
      )
      GROUP BY team_id, team_name
      ORDER BY cup_count DESC, team_name ASC
    `;

    // Count total unique champions
    const totalChampionsCount = champions.length;

    return NextResponse.json({
      success: true,
      data: {
        champions,
        cupWinners,
        totalChampions: totalChampionsCount
      }
    });
  } catch (error: any) {
    console.error('Error fetching champions:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
