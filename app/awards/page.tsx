import { Metadata } from 'next';
import PublicAwardsPage from './AwardsClient';

export const metadata: Metadata = {
  title: 'Tournament Awards & Hall of Fame',
  description: 'Discover the award winners, Player of the Month (POTM), Golden Boot, Golden Glove, and Hall of Fame members of the SS League.',
  alternates: {
    canonical: '/awards',
  },
  openGraph: {
    title: 'Tournament Awards & Hall of Fame',
    description: 'Discover the award winners, Player of the Month (POTM), Golden Boot, Golden Glove, and Hall of Fame members of the SS League.',
    images: ['/logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tournament Awards & Hall of Fame',
    description: 'Discover the award winners, Player of the Month (POTM), Golden Boot, Golden Glove, and Hall of Fame members of the SS League.',
    images: ['/logo.png'],
  },
};

export default function Page() {
  return <PublicAwardsPage />;
}
