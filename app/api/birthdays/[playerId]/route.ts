import { NextRequest, NextResponse } from 'next/server';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';
import { getTournamentDb, isTournamentDbAvailable } from '@/lib/neon/tournament-config';
import { generateFallbackBirthdayStory, PlayerBirthdayContext } from '@/lib/birthdays/story';

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

    // 2. Fetch stats and seasons from tournament DB
    let seasons: any[] = [];
    let awards: any[] = [];
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

        const [statsRows, awardRows] = await Promise.all([
          tSql`
            SELECT * FROM realplayerstats
            WHERE player_id = ${pid}
            ORDER BY season_id ASC
          `,
          tSql`
            SELECT id, award_type, season_id, round_number, week_number, team_name, performance_stats, created_at
            FROM awards
            WHERE player_id = ${pid}
            ORDER BY created_at DESC
          `
        ]);

        seasons = statsRows.map((s: any) => ({
          season_id: s.season_id,
          team: s.team || 'Unknown',
          category: s.category || 'PLAYER',
          matches: Number(s.matches_played || 0),
          goals: Number(s.goals_scored || 0),
          goals_conceded: Number(s.goals_conceded || 0),
          wins: Number(s.wins || s.matches_won || 0),
          draws: Number(s.draws || s.matches_drawn || 0),
          losses: Number(s.losses || s.matches_lost || 0),
          clean_sheets: Number(s.clean_sheets || 0),
          motm_awards: Number(s.motm_awards || 0),
          points: Number(s.points || 0),
        }));

        awards = awardRows;

        // Aggregate career stats
        for (const s of seasons) {
          aggregatedStats.matches += s.matches;
          aggregatedStats.goals += s.goals;
          aggregatedStats.goals_conceded += s.goals_conceded;
          aggregatedStats.wins += s.wins;
          aggregatedStats.draws += s.draws;
          aggregatedStats.losses += s.losses;
          aggregatedStats.clean_sheets += s.clean_sheets;
          aggregatedStats.motm_awards += s.motm_awards;
          aggregatedStats.points += s.points;
        }
      } catch (err) {
        console.warn('Failed to load player stats or awards:', err);
      }
    }

    const birthdayContext: PlayerBirthdayContext = {
      id: pid,
      name: player.name || player.display_name || raw.name || 'SS League Player',
      dob,
      age,
      team: player.team || raw.team || raw.team_name || 'Free Agent',
      category: player.category_id || raw.category || raw.category_name || 'RED',
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
        team: player.team || raw.team || raw.team_name || 'Free Agent',
        category: player.category_id || raw.category || raw.category_name || 'PLAYER',
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
