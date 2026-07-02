import { Metadata } from 'next';
import SeasonsArchivePage from './SeasonsClient';

export const metadata: Metadata = {
  title: 'Tournament Seasons Archive - SS League',
  description: 'Browse the historical archive of all tournament seasons in the SS League. View champions, runner-ups, and stats from active and completed seasons.',
  openGraph: {
    title: 'Tournament Seasons Archive - SS League',
    description: 'Browse the historical archive of all tournament seasons in the SS League. View champions, runner-ups, and stats from active and completed seasons.',
    images: ['/logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tournament Seasons Archive - SS League',
    description: 'Browse the historical archive of all tournament seasons in the SS League. View champions, runner-ups, and stats from active and completed seasons.',
    images: ['/logo.png'],
  },
};

export default function Page() {
  return <SeasonsArchivePage />;
}
