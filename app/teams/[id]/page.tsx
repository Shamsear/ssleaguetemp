import { Metadata } from 'next';
import { adminDb } from '@/lib/firebase/admin';
import { neon } from '@neondatabase/serverless';
import TeamDetailPage from './TeamDetailClient';

export const dynamic = 'force-dynamic';

async function getTeamData(id: string) {
  try {
    const sql = process.env.NEON_TOURNAMENT_DB_URL ? neon(process.env.NEON_TOURNAMENT_DB_URL) : null;
    let teamName = id;

    if (sql) {
      const stats = await sql`
        SELECT MAX(team_name) as team_name 
        FROM teamstats 
        WHERE team_id = ${id}
      `;
      if (stats && stats.length > 0 && stats[0].team_name) {
        teamName = stats[0].team_name;
      }
    }

    // Query logo from Firestore
    const teamDoc = await adminDb.collection('teams').doc(id).get();
    const logoUrl = teamDoc.exists ? teamDoc.data()?.logo_url : null;

    return { teamName, logoUrl };
  } catch (error) {
    console.error('Error fetching team data for metadata:', error);
    return { teamName: id, logoUrl: null };
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const team = await getTeamData(id);

  const title = `${team.teamName} - Club Profile & Stats | SS League`;
  const description = `Official page of ${team.teamName} on SS League. View squad players, match history, league table position, and trophies.`;
  const imageUrl = team.logoUrl || '/logo.png';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [imageUrl],
      type: 'website',
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
  return <TeamDetailPage />;
}
