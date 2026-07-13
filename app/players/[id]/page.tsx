import { Metadata } from 'next';
import { adminDb } from '@/lib/firebase/admin';
import PlayerDetailPage from './PlayerDetailClient';

export const dynamic = 'force-dynamic';

async function getPlayerData(id: string) {
  try {
    const playersSnapshot = await adminDb
      .collection('realplayers')
      .where('player_id', '==', id)
      .limit(1)
      .get();

    if (playersSnapshot.empty) return null;
    return playersSnapshot.docs[0].data();
  } catch (error) {
    console.error('Error fetching player data for metadata:', error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const player = await getPlayerData(id);

  if (!player) {
    return {
      title: 'Player Profile Not Found',
      description: 'The requested player profile could not be found.',
    };
  }

  const title = `${player.name} - Player Profile`;
  const description = `${player.name} (${player.category || 'Player'}) profile on SS League. View player stats, ratings, match performance, and awards.`;
  const imageUrl = player.photo_url || '/logo.png';

  return {
    title,
    description,
    alternates: {
      canonical: `/players/${id}`,
    },
    openGraph: {
      title,
      description,
      images: [imageUrl],
      type: 'profile',
      firstName: player.name.split(' ')[0],
      lastName: player.name.split(' ').slice(1).join(' '),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await getPlayerData(id);

  const jsonLd = player ? {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": player.name,
    "image": player.photo_url || 'https://ssleague.vercel.app/logo.png',
    "description": `${player.name} is a ${player.category || 'Player'} in the SS Super Soccer League. View stats, ratings, match performance, and awards.`,
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
      <PlayerDetailPage />
    </>
  );
}
