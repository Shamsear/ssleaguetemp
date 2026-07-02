import { Metadata } from 'next';
import { adminDb } from '@/lib/firebase/admin';
import SeasonDetailPage from './SeasonDetailClient';

export const dynamic = 'force-dynamic';

async function getSeasonData(id: string) {
  try {
    const seasonDoc = await adminDb.collection('seasons').doc(id).get();
    if (!seasonDoc.exists) return null;
    return seasonDoc.data();
  } catch (error) {
    console.error('Error fetching season data for metadata:', error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const season = await getSeasonData(id);

  if (!season) {
    return {
      title: 'Season Details Not Found | SS League',
      description: 'The requested season details could not be found.',
    };
  }

  const seasonName = season.name || `Season ${season.season_number || id}`;
  const title = `${seasonName} - Standings, Stats & Awards | SS League`;
  const description = `Follow the action from ${seasonName} on SS League. View team standings, player performance charts, match day results, and award winners.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ['/logo.png'],
      type: 'website',
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
  return <SeasonDetailPage />;
}
