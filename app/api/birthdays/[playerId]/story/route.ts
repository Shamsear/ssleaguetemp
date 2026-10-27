import { NextRequest, NextResponse } from 'next/server';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';
import { getTournamentDb, isTournamentDbAvailable } from '@/lib/neon/tournament-config';
import { generateGeminiBirthdayStory, PlayerBirthdayContext } from '@/lib/birthdays/story';

function calculateAge(dobStr: string): number {
  if (!dobStr) return 0;
  const parts = dobStr.split('-');
  if (parts.length < 3) return 0;
  const birthYear = parseInt(parts[0], 10);
  const birthMonth = parseInt(parts[1], 10);
  const birthDay = parseInt(parts[2], 10);

  const now = new Date();
  let age = now.getFullYear() - birthYear;
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  if (currentMonth < birthMonth || (currentMonth === birthMonth && currentDay < birthDay)) {
    age--;
  }
  return Math.max(0, age);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> | { playerId: string } }
) {
  try {
    const resolvedParams = await params;
    const { playerId } = resolvedParams;

    if (!playerId) {
      return NextResponse.json({ success: false, error: 'Player ID is required' }, { status: 400 });
    }

    if (!isMainDbAvailable()) {
      return NextResponse.json({ success: false, error: 'Main DB not available' }, { status: 500 });
    }

    const mainSql = getMainDb();
    const playerRows = await mainSql`
      SELECT id, player_id, name, display_name, team, team_id, category_id, profile_image, raw_data
      FROM realplayers
      WHERE player_id = ${playerId} OR id = ${playerId}
      LIMIT 1
    `;

    if (playerRows.length === 0) {
      return NextResponse.json({ success: false, error: 'Player not found' }, { status: 404 });
    }

    const player = playerRows[0];
    const raw = player.raw_data || {};
    const pid = player.player_id || player.id;
    const dob = raw.date_of_birth || raw.dob || '';
    const age = calculateAge(dob);

    let seasonsCount = 0;
    let aggregatedStats = {
      matches: 0,
      goals: 0,
      goals_conceded: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      clean_sheets: 0,
      motm_awards: 0,
      points: 0,
    };

    if (isTournamentDbAvailable()) {
      try {
        const tSql = getTournamentDb();
        const statsRows = await tSql`
          SELECT * FROM realplayerstats
          WHERE player_id = ${pid}
        `;
        seasonsCount = statsRows.length;
        for (const s of statsRows) {
          aggregatedStats.matches += Number(s.matches_played || 0);
          aggregatedStats.goals += Number(s.goals_scored || 0);
          aggregatedStats.goals_conceded += Number(s.goals_conceded || 0);
          aggregatedStats.wins += Number(s.wins || s.matches_won || 0);
          aggregatedStats.draws += Number(s.draws || s.matches_drawn || 0);
          aggregatedStats.losses += Number(s.losses || s.matches_lost || 0);
          aggregatedStats.clean_sheets += Number(s.clean_sheets || 0);
          aggregatedStats.motm_awards += Number(s.motm_awards || 0);
          aggregatedStats.points += Number(s.points || 0);
        }
      } catch (err) {
        console.warn('Failed to aggregate stats for AI story:', err);
      }
    }

    const context: PlayerBirthdayContext = {
      id: pid,
      name: player.name || player.display_name || raw.name || 'SS League Player',
      dob,
      age,
      team: player.team || raw.team || raw.team_name || 'Free Agent',
      category: player.category_id || raw.category || raw.category_name || 'RED',
      stats: aggregatedStats,
      seasonsCount,
    };

    const story = await generateGeminiBirthdayStory(context);

    return NextResponse.json({
      success: true,
      story,
    });
  } catch (error: any) {
    console.error('Error generating AI story:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate story' },
      { status: 500 }
    );
  }
}
