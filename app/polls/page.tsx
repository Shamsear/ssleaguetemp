import { Metadata } from 'next';
import PublicPollsPage from './PollsClient';

export const metadata: Metadata = {
  title: 'Community Polls & Voting - SS League',
  description: 'Participate in community polls, voting, and surveys on the SS League. Share your opinion, predict match winners, and select player of the month.',
  openGraph: {
    title: 'Community Polls & Voting - SS League',
    description: 'Participate in community polls, voting, and surveys on the SS League. Share your opinion, predict match winners, and select player of the month.',
    images: ['/logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Community Polls & Voting - SS League',
    description: 'Participate in community polls, voting, and surveys on the SS League. Share your opinion, predict match winners, and select player of the month.',
    images: ['/logo.png'],
  },
};

export default function Page() {
  return <PublicPollsPage />;
}
