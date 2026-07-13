import { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ssleague.vercel.app';
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  // 1. Static Public Pages
  const staticPages = [
    '',
    '/news',
    '/players',
    '/teams',
    '/seasons',
    '/fixtures',
    '/awards',
    '/polls',
    '/rules',
    '/footballplayers',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: route === '' ? 1.0 : 0.8,
  }));

  // 2. Dynamic Seasons from Firestore
  let seasonUrls: any[] = [];
  try {
    const { adminDb } = await import('@/lib/firebase/admin');
    const seasonsSnapshot = await adminDb.collection('seasons').get();
    seasonUrls = seasonsSnapshot.docs.map((doc) => ({
      url: `${baseUrl}/seasons/${doc.id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));
  } catch (error) {
    console.error('Error generating seasons sitemap entries:', error);
  }

  // 3. Dynamic Real Players from Firestore
  let playerUrls: any[] = [];
  try {
    const { adminDb } = await import('@/lib/firebase/admin');
    const playersSnapshot = await adminDb
      .collection('realplayers')
      .where('is_active', '==', true)
      .get();
    playerUrls = playersSnapshot.docs
      .map((doc) => {
        const data = doc.data();
        const playerId = data.player_id || doc.id;
        if (!playerId) return null;
        return {
          url: `${baseUrl}/players/${playerId}`,
          lastModified: new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.6,
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error('Error generating real players sitemap entries:', error);
  }

  // 4. Dynamic Teams from Firestore
  let teamUrls: any[] = [];
  try {
    const { adminDb } = await import('@/lib/firebase/admin');
    const teamsSnapshot = await adminDb.collection('teams').get();
    teamUrls = teamsSnapshot.docs.map((doc) => ({
      url: `${baseUrl}/teams/${doc.id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
  } catch (error) {
    console.error('Error generating teams sitemap entries:', error);
  }

  // 5. Dynamic News Articles from Neon
  let newsUrls: any[] = [];
  try {
    const { getTournamentDb } = await import('@/lib/neon/tournament-config');
    const sql = getTournamentDb();
    const newsItems = await sql`
      SELECT id, updated_at 
      FROM news 
      WHERE is_published = true 
      ORDER BY created_at DESC 
      LIMIT 1000
    `;
    newsUrls = newsItems.map((item: any) => ({
      url: `${baseUrl}/news/${item.id}`,
      lastModified: item.updated_at ? new Date(item.updated_at) : new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));
  } catch (error) {
    console.error('Error generating news sitemap entries:', error);
  }

  // 6. Dynamic Polls from Neon
  let pollUrls: any[] = [];
  try {
    const { getTournamentDb } = await import('@/lib/neon/tournament-config');
    const sql = getTournamentDb();
    const polls = await sql`
      SELECT id, created_at 
      FROM polls 
      ORDER BY created_at DESC 
      LIMIT 500
    `;
    pollUrls = polls.map((poll: any) => ({
      url: `${baseUrl}/polls/${poll.id}`,
      lastModified: new Date(poll.created_at),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));
  } catch (error) {
    console.error('Error generating polls sitemap entries:', error);
  }

  // 7. Dynamic Football Players from Neon
  let footballPlayerUrls: any[] = [];
  try {
    const { getTournamentDb } = await import('@/lib/neon/tournament-config');
    const sql = getTournamentDb();
    const footballPlayers = await sql`
      SELECT player_id, updated_at 
      FROM footballplayers 
      ORDER BY name ASC 
      LIMIT 2000
    `;
    footballPlayerUrls = footballPlayers.map((player: any) => ({
      url: `${baseUrl}/footballplayers/${player.player_id}`,
      lastModified: player.updated_at ? new Date(player.updated_at) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));
  } catch (error) {
    console.error('Error generating football players sitemap entries:', error);
  }

  return [
    ...staticPages,
    ...seasonUrls,
    ...playerUrls,
    ...teamUrls,
    ...newsUrls,
    ...pollUrls,
    ...footballPlayerUrls,
  ];
}
