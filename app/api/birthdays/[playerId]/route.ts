import { NextRequest, NextResponse } from 'next/server';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';
import { getTournamentDb, isTournamentDbAvailable } from '@/lib/neon/tournament-config';
import { generateFallbackBirthdayStory, PlayerBirthdayContext } from '@/lib/birthdays/story';
import { getPlayerTournamentHistory } from '@/lib/birthdays/stats-helper';

function formatPhotoUrl(url: string | null | undefined): string {
  if (!url) return '/placeholder-player.png';
  if (url.includes('ik.imagekit.io') && !url.includes('tr=')) {
    return url.includes('?') ? `${url}&tr=f-auto` : `${url}?tr=f-auto`;
  }
  return url;
}

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

export async function GET(
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
      return NextResponse.json({ success: false, error: 'Neon Main DB not available' }, { status: 500 });
    }

    const mainSql = getMainDb();

    // 1. Fetch player from realplayers
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
    const photo = player.profile_image || raw.photo_url || raw.photoURL || raw.profile_image || raw.image;

    // 2. Fetch stats and seasons from tournament DB (S16 & S17 from player_seasons with base points decreased)
    const { seasons, aggregatedStats } = await getPlayerTournamentHistory(pid);

    let awards: any[] = [];
    if (isTournamentDbAvailable()) {
      try {
        const tSql = getTournamentDb();
        awards = await tSql`
          SELECT id, award_type, season_id, round_number, week_number, team_name, performance_stats, created_at
          FROM awards
          WHERE player_id = ${pid}
          ORDER BY created_at DESC
        `;
      } catch (err) {
        console.warn('Failed to load awards:', err);
      }
    }

    const resolvedTeam = player.team || raw.team || raw.team_name || (seasons.length > 0 ? seasons[seasons.length - 1].team : 'Free Agent');
    const resolvedCategory = player.category_id || raw.category || raw.category_name || (seasons.length > 0 ? seasons[seasons.length - 1].category : 'PLAYER');

    const birthdayContext: PlayerBirthdayContext = {
      id: pid,
      name: player.name || player.display_name || raw.name || 'SS League Player',
      dob,
      age,
      team: resolvedTeam,
      category: resolvedCategory,
      stats: aggregatedStats,
      awards,
      seasonsCount: seasons.length,
    };

    // Fast initial story generator
    const story = generateFallbackBirthdayStory(birthdayContext);

    return NextResponse.json({
      success: true,
      player: {
        id: player.id,
        player_id: pid,
        name: player.name || player.display_name,
        display_name: player.display_name || player.name,
        dob,
        age,
        photo_url: formatPhotoUrl(photo),
        team: resolvedTeam,
        category: resolvedCategory,
        place: raw.place || '',
      },
      stats: aggregatedStats,
      seasons,
      awards,
      story,
    });
  } catch (error: any) {
    console.error('Error fetching player birthday details:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch player details' },
      { status: 500 }
    );
  }
}
