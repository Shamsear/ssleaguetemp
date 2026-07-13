import { Metadata } from 'next';
import PublicFixturesPage from './FixturesClient';

export const metadata: Metadata = {
  title: 'Match Fixtures & Live Results',
  description: 'View the official match fixtures, live scores, round robin results, group stage tables, and knockout schedules for the SS League.',
  alternates: {
    canonical: '/fixtures',
  },
  openGraph: {
    title: 'Match Fixtures & Live Results',
    description: 'View the official match fixtures, live scores, round robin results, group stage tables, and knockout schedules for the SS League.',
    images: ['/logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Match Fixtures & Live Results',
    description: 'View the official match fixtures, live scores, round robin results, group stage tables, and knockout schedules for the SS League.',
    images: ['/logo.png'],
  },
};

export default function Page() {
  return <PublicFixturesPage />;
}
