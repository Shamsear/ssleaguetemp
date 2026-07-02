import { Metadata } from 'next';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import PublicPlayerDetailPage from './FootballPlayerDetailClient';

export const dynamic = 'force-dynamic';

async function getFootballPlayerData(id: string) {
  try {
    const sql = getTournamentDb();
    const players = await sql`
      SELECT * FROM footballplayers 
      WHERE player_id = ${id} 
      LIMIT 1
    `;
    if (!players || players.length === 0) return null;
    return players[0];
  } catch (error) {
    console.error('Error fetching football player data for metadata:', error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const player = await getFootballPlayerData(id);

  if (!player) {
    return {
      title: 'Football Player Profile | SS League',
      description: 'The requested football player profile could not be found.',
    };
  }

  const title = `${player.name} (${player.position}) - Football Player stats | SS League`;
  const description = `${player.name}, ${player.age || ''}-year-old ${player.nationality || ''} football player. Playing style: ${player.playing_style || ''}. Overall rating: ${player.overall_rating || ''}. View stats, market value history, and transfers.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ['/logo.png'],
      type: 'profile',
      firstName: player.name.split(' ')[0],
      lastName: player.name.split(' ').slice(1).join(' '),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/logo.png'],
    },
  };
}

export default function Page() {
  return <PublicPlayerDetailPage />;
}
