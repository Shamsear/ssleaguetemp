import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BirthdayClient from './BirthdayClient';
import { getMainDb, isMainDbAvailable } from '../../../lib/neon/main-config';
import { getTournamentDb, isTournamentDbAvailable } from '../../../lib/neon/tournament-config';
import { generateFallbackBirthdayStory, PlayerBirthdayContext } from '../../../lib/birthdays/story';
import { getPlayerTournamentHistory } from '../../../lib/birthdays/stats-helper';

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

interface PageProps {
  params: Promise<{ playerId: string }> | { playerId: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const { playerId } = resolvedParams;

  if (!isMainDbAvailable()) {
    return {
      title: 'Player Birthday Celebration | SS Premier Super League',
    };
  }

  try {
    const mainSql = getMainDb();
    const rows = await mainSql`
      SELECT name, display_name, profile_image, raw_data
      FROM realplayers
      WHERE player_id = ${playerId} OR id = ${playerId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return {
        title: 'Player Not Found | SS Premier Super League',
      };
    }

    const player = rows[0];
    const raw = player.raw_data || {};
    const name = player.name || player.display_name || 'Champion';
    const dob = raw.date_of_birth || raw.dob || '';
    const age = calculateAge(dob);
    const photo = player.profile_image || raw.photo_url || raw.photoURL || raw.profile_image || raw.image;

    return {
      title: `🎂 Happy ${age ? `${age}th ` : ''}Birthday, ${name}! 🎉 | SS Premier Super League`,
      description: `Celebrate ${name}'s birthday with SS Premier Super League! Explore their career tournament stats, milestones, and birthday chronicle.`,
      openGraph: {
        title: `🎂 Happy Birthday, ${name}! 🎉`,
        description: `Join the SS Premier Super League in celebrating ${name}'s birthday milestone! Check out career stats & the birthday roast.`,
        images: photo ? [formatPhotoUrl(photo)] : ['/logo.png'],
      },
      twitter: {
        card: 'summary_large_image',
        title: `🎂 Happy Birthday, ${name}! 🎉 | SS League`,
        description: `Explore ${name}'s stats and hilarious birthday roast on SS Premier Super League!`,
        images: photo ? [formatPhotoUrl(photo)] : ['/logo.png'],
      },
    };
  } catch (err) {
    return {
      title: 'Happy Birthday! | SS Premier Super League',
    };
  }
}

export default async function BirthdayPage({ params }: PageProps) {
  const resolvedParams = await params;
  const { playerId } = resolvedParams;

  if (!isMainDbAvailable()) {
    notFound();
  }

  const mainSql = getMainDb();
  const playerRows = await mainSql`
    SELECT id, player_id, name, display_name, team, team_id, category_id, profile_image, raw_data
    FROM realplayers
    WHERE player_id = ${playerId} OR id = ${playerId}
    LIMIT 1
  `;

  if (playerRows.length === 0) {
    notFound();
  }

  const player = playerRows[0];
  const raw = player.raw_data || {};
  const pid = player.player_id || player.id;
  const dob = raw.date_of_birth || raw.dob || '';
  const age = calculateAge(dob);
  const photo = player.profile_image || raw.photo_url || raw.photoURL || raw.profile_image || raw.image;

  const { seasons, aggregatedStats } = await getPlayerTournamentHistory(pid);

  let awards: any[] = [];
  if (isTournamentDbAvailable()) {
    try {
      const tSql = getTournamentDb();
      awards = await tSql`
        SELECT id, award_type, season_id, round_number, week_number, team_name, performance_stats, created_at, instagram_post_url
        FROM awards
        WHERE player_id = ${pid}
        ORDER BY created_at DESC
      `;
    } catch (err) {
      console.warn('Failed to load awards for player birthday page:', err);
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

  const story = generateFallbackBirthdayStory(birthdayContext);

  const initialData = {
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
  };

  return <BirthdayClient initialData={initialData} />;
}
