import { NextRequest, NextResponse } from 'next/server';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';
import { generateGeminiBirthdayStory, PlayerBirthdayContext } from '@/lib/birthdays/story';
import { getPlayerTournamentHistory, getPlayerActiveSeasonInfo } from '@/lib/birthdays/stats-helper';

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

    const { seasons, aggregatedStats } = await getPlayerTournamentHistory(pid);
    const seasonsCount = seasons.length;

    // Resolve active season team & category (if unassigned in active season, leave null)
    const activeInfo = await getPlayerActiveSeasonInfo(pid);
    const resolvedTeam = activeInfo.team || '';
    const resolvedCategory = activeInfo.category || '';

    const context: PlayerBirthdayContext = {
      id: pid,
      name: player.name || player.display_name || raw.name || 'SS League Player',
      dob,
      age,
      team: resolvedTeam,
      category: resolvedCategory,
      stats: aggregatedStats,
      seasonsCount,
    };

    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const lang = (body.lang || searchParams.get('lang') || 'en') === 'ml' ? 'ml' : 'en';

    const story = await generateGeminiBirthdayStory(context, lang);

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
