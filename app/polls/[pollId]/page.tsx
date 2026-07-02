import { Metadata } from 'next';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import PollPage from './PollDetailClient';

export const dynamic = 'force-dynamic';

async function getPollData(id: string) {
  try {
    const sql = getTournamentDb();
    const polls = await sql`
      SELECT * FROM polls 
      WHERE id = ${id} 
      LIMIT 1
    `;
    if (!polls || polls.length === 0) return null;
    return polls[0];
  } catch (error) {
    console.error('Error fetching poll data for metadata:', error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pollId: string }>;
}): Promise<Metadata> {
  const { pollId } = await params;
  const poll = await getPollData(pollId);

  if (!poll) {
    return {
      title: 'Poll Details Not Found | SS League',
      description: 'The requested community poll could not be found.',
    };
  }

  const title = `${poll.title_en || 'Community Poll'} | SS League`;
  const description = `Cast your vote on: ${poll.question_en || poll.title_en || 'SS League Poll'}. Participate in community decisions, predictions, and discussions.`;

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
  return <PollPage />;
}
