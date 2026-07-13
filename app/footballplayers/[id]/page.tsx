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
      title: 'Football Player Profile',
      description: 'The requested football player profile could not be found.',
    };
  }

  const title = `${player.name} (${player.position}) - Football Player Stats`;
  const description = `${player.name}, ${player.age || ''}-year-old ${player.nationality || ''} football player. Playing style: ${player.playing_style || ''}. Overall rating: ${player.overall_rating || ''}. View stats, market value history, and transfers.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/footballplayers/${id}`,
    },
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

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await getFootballPlayerData(id);

  const jsonLd = player ? {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": player.name,
    "image": 'https://ssleaguetemp.vercel.app/logo.png',
    "description": `${player.name} is a ${player.position || 'Player'} rating ${player.overall_rating || ''} in the SS Super Soccer League. View stats, market value history, and transfers.`,
    "jobTitle": "Football Player",
    "memberOf": {
      "@type": "SportsOrganization",
      "name": "SS Super Soccer League"
    }
  } : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <PublicPlayerDetailPage />
    </>
  );
}
