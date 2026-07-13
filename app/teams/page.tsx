import { Metadata } from 'next';
import AllTeamsPage from './TeamsClient';

export const metadata: Metadata = {
  title: 'Clubs & Teams Directory',
  description: 'Explore the clubs and team managers competing in the SS League. View rosters, budget allocations, transfer budgets, and championship history.',
  alternates: {
    canonical: '/teams',
  },
  openGraph: {
    title: 'Clubs & Teams Directory',
    description: 'Explore the clubs and team managers competing in the SS League. View rosters, budget allocations, transfer budgets, and championship history.',
    images: ['/logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Clubs & Teams Directory',
    description: 'Explore the clubs and team managers competing in the SS League. View rosters, budget allocations, transfer budgets, and championship history.',
    images: ['/logo.png'],
  },
};

export default function Page() {
  return <AllTeamsPage />;
}
