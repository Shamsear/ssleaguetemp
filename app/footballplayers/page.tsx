import { Metadata } from 'next';
import PublicPlayerDatabasePage from './FootballPlayersClient';

export const metadata: Metadata = {
  title: 'Football Players Database',
  description: 'Browse the official football player database of the SS League. Search players, filter by position, club, age, nationality, ratings, and auction values.',
  alternates: {
    canonical: '/footballplayers',
  },
  openGraph: {
    title: 'Football Players Database',
    description: 'Browse the official football player database of the SS League. Search players, filter by position, club, age, nationality, ratings, and auction values.',
    images: ['/logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Football Players Database',
    description: 'Browse the official football player database of the SS League. Search players, filter by position, club, age, nationality, ratings, and auction values.',
    images: ['/logo.png'],
  },
};

export default function Page() {
  return <PublicPlayerDatabasePage />;
}
