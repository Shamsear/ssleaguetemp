import { NextRequest, NextResponse } from 'next/server';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';
import { getTournamentDb, isTournamentDbAvailable } from '@/lib/neon/tournament-config';

function formatPhotoUrl(url: string | null | undefined): string {
  if (!url) return '/placeholder-player.png';
  if (url.includes('ik.imagekit.io') && !url.includes('tr=')) {
    return url.includes('?') ? `${url}&tr=f-auto` : `${url}?tr=f-auto`;
  }
  return url;
}

function calculateAge(dobStr: string, refDate: Date = new Date()): number {
  const parts = dobStr.split('-');
  if (parts.length < 3) return 0;
  const birthYear = parseInt(parts[0], 10);
  const birthMonth = parseInt(parts[1], 10);
  const birthDay = parseInt(parts[2], 10);

  let age = refDate.getFullYear() - birthYear;
  const currentMonth = refDate.getMonth() + 1;
  const currentDay = refDate.getDate();

  if (currentMonth < birthMonth || (currentMonth === birthMonth && currentDay < birthDay)) {
    age--;
  }
  return Math.max(0, age);
}

export async function GET(request: NextRequest) {
  try {
    if (!isMainDbAvailable()) {
      return NextResponse.json({ success: false, error: 'Neon Main DB not available' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    // Use client date if provided, otherwise compute in IST (Asia/Kolkata)
    const clientDate = searchParams.get('date');
    const nowInIst = new Date();
    const dateStr = clientDate || nowInIst.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const [, month, day] = dateStr.split('-');

    if (!month || !day) {
      return NextResponse.json({ success: false, error: 'Invalid date format. Expected YYYY-MM-DD' }, { status: 400 });
    }

    const targetPattern = `%-${month}-${day}`;
    const mainSql = getMainDb();

    // Query players whose date of birth matches -MM-DD
    const players = await mainSql`
      SELECT id, player_id, name, display_name, team, team_id, category_id, profile_image, raw_data
      FROM realplayers
      WHERE raw_data->>'date_of_birth' LIKE ${targetPattern}
         OR raw_data->>'dob' LIKE ${targetPattern}
    `;

    if (players.length === 0) {
      return NextResponse.json({
        success: true,
        date: dateStr,
        month,
        day,
        count: 0,
        players: [],
      });
    }

    // Fetch career quick stats if tournament DB is available
    let statsMap: Record<string, { matches: number; goals: number; wins: number; clean_sheets: number }> = {};
    if (isTournamentDbAvailable()) {
      try {
        const tSql = getTournamentDb();
        const playerIds = players.map((p: any) => p.player_id || p.id);
        const statsRows = await tSql`
          SELECT player_id,
                 COALESCE(SUM(matches_played), 0) as total_matches,
                 COALESCE(SUM(goals_scored), 0) as total_goals,
                 COALESCE(SUM(matches_won), 0) as total_wins,
                 COALESCE(SUM(clean_sheets), 0) as total_clean_sheets
          FROM realplayerstats
          WHERE player_id = ANY(${playerIds})
          GROUP BY player_id
        `;

        for (const row of statsRows) {
          statsMap[row.player_id] = {
            matches: Number(row.total_matches),
            goals: Number(row.total_goals),
            wins: Number(row.total_wins),
            clean_sheets: Number(row.total_clean_sheets),
          };
        }
      } catch (statsErr) {
        console.warn('Could not aggregate birthday player quick stats:', statsErr);
      }
    }

    const formattedPlayers = players.map((p: any) => {
      const raw = p.raw_data || {};
      const dob = raw.date_of_birth || raw.dob || '';
      const photo = p.profile_image || raw.photo_url || raw.photoURL || raw.profile_image || raw.image;
      const pid = p.player_id || p.id;
      const playerStats = statsMap[pid] || { matches: 0, goals: 0, wins: 0, clean_sheets: 0 };

      return {
        id: p.id,
        player_id: pid,
        name: p.name || p.display_name || raw.name || 'SS League Player',
        display_name: p.display_name || p.name || raw.display_name || 'SS League Player',
        dob,
        age: calculateAge(dob, new Date(dateStr)),
        photo_url: formatPhotoUrl(photo),
        team: p.team || raw.team || raw.team_name || 'Free Agent',
        category: p.category_id || raw.category || raw.category_name || 'PLAYER',
        stats: playerStats,
      };
    });

    return NextResponse.json({
      success: true,
      date: dateStr,
      month,
      day,
      count: formattedPlayers.length,
      players: formattedPlayers,
    });
  } catch (error: any) {
    console.error('Error fetching today birthdays:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch birthday players' },
      { status: 500 }
    );
  }
}
