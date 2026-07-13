import { Metadata } from 'next';
import NewsPage from './NewsClient';

export const metadata: Metadata = {
  title: 'Newsroom & Transfer Updates',
  description: 'Stay updated with the latest transfer news, auction highlights, tournament announcements, and milestone events on SS League.',
  alternates: {
    canonical: '/news',
  },
  openGraph: {
    title: 'Newsroom & Transfer Updates',
    description: 'Stay updated with the latest transfer news, auction highlights, tournament announcements, and milestone events on SS League.',
    images: ['/logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Newsroom & Transfer Updates',
    description: 'Stay updated with the latest transfer news, auction highlights, tournament announcements, and milestone events on SS League.',
    images: ['/logo.png'],
  },
};

export default function Page() {
  return <NewsPage />;
}
