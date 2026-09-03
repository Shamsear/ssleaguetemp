import { Metadata } from 'next';
import FixturesClient from '@/app/fixtures/FixturesClient';

export const metadata: Metadata = {
  title: 'Team Fixtures & Match Schedule | SS League',
  description: 'View the official match fixtures, live scores, round robin results, and match details for your team.',
};

export default function TeamFixturesPage() {
  return <FixturesClient isTeamView={true} />;
}
