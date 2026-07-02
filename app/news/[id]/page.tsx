import { Metadata } from 'next';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import NewsArticleClient from './NewsArticleClient';

async function getNewsItem(id: string) {
  try {
    const sql = getTournamentDb();
    const newsItems = await sql`
      SELECT * FROM news 
      WHERE id = ${id} 
      LIMIT 1
    `;
    if (!newsItems || newsItems.length === 0) return null;
    return newsItems[0];
  } catch (error) {
    console.error('Error fetching news item for metadata:', error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const news = await getNewsItem(id);

  if (!news) {
    return {
      title: 'Article Not Found | SS League',
      description: 'The requested news article could not be found.',
    };
  }

  const title = (news.title_en || news.title || 'League News') + ' | SS League';
  const description =
    news.summary_en ||
    news.summary ||
    (news.content_en || news.content || '').substring(0, 160) ||
    'Read the latest updates and announcements from the SS League.';
  const imageUrl = news.image_url || '/logo.png';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [imageUrl],
      type: 'article',
      publishedTime: news.published_at || news.created_at,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function Page() {
  return <NewsArticleClient />;
}
