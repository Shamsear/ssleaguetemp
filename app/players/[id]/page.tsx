import { Metadata } from 'next';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import PlayerDetailPage from './PlayerDetailClient';

export const dynamic = 'force-dynamic';

async function getPlayerData(id: string) {
  try {
    const playersSnapshot = await adminDb
      .collection('realplayers')
      .where('player_id', '==', id)
      .limit(1)
      .get();

    if (!playersSnapshot.empty) return playersSnapshot.docs[0].data();

    // Fallback 1: document ID lookup
    const docSnapshot = await adminDb.collection('realplayers').doc(id).get();
    if (docSnapshot.exists) return docSnapshot.data();

    // Fallback 2: Neon realplayerstats lookup
    const { getTournamentDb } = await import('@/lib/neon/tournament-config');
    const sql = getTournamentDb();
    const rows = await sql`
      SELECT player_id, player_name as name, category
      FROM realplayerstats
      WHERE player_id = ${id}
      LIMIT 1
    `;
    if (rows.length > 0) {
      return { player_id: rows[0].player_id, name: rows[0].name, category: rows[0].category };
    }

    return null;
  } catch (error: any) {
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

  const title = `${player.name || 'Player'} - Player Profile`;
  const description = `${player.name || 'Player'} (${player.category || 'Player'}) profile on SS League. View player stats, ratings, match performance, and awards.`;
  const imageUrl = player.photo_url || '/logo.png';
  const nameParts = (player.name || 'Player').split(' ');

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
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(' '),
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
