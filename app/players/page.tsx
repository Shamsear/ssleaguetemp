import { Metadata } from 'next';
import AllPlayersPage from './PlayersClient';

export const metadata: Metadata = {
  title: 'Real Players Database',
  description: 'Search and browse through all registered real players in the SS League. View player categories, stats, auction valuations, and historical ratings.',
  alternates: {
    canonical: '/players',
  },
  openGraph: {
    title: 'Real Players Database',
    description: 'Search and browse through all registered real players in the SS League. View player categories, stats, auction valuations, and historical ratings.',
    images: ['/logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Real Players Database',
    description: 'Search and browse through all registered real players in the SS League. View player categories, stats, auction valuations, and historical ratings.',
    images: ['/logo.png'],
  },
};

export default function Page() {
  return <AllPlayersPage />;
}
