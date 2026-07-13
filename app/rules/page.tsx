import { Metadata } from 'next';
import RulesPage from './RulesClient';

export const metadata: Metadata = {
  title: 'Official Rules & Auction Guide',
  description: 'Read the official tournament rules, auction procedures, squad size limits, salary guidelines, transfer window rules, and scoring systems for the SS League.',
  alternates: {
    canonical: '/rules',
  },
  openGraph: {
    title: 'Official Rules & Auction Guide',
    description: 'Read the official tournament rules, auction procedures, squad size limits, salary guidelines, transfer window rules, and scoring systems for the SS League.',
    images: ['/logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Official Rules & Auction Guide',
    description: 'Read the official tournament rules, auction procedures, squad size limits, salary guidelines, transfer window rules, and scoring systems for the SS League.',
    images: ['/logo.png'],
  },
};

export default function Page() {
  return <RulesPage />;
}
