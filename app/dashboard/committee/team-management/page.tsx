'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { usePermissions } from '@/hooks/usePermissions';
import TeamManagementClient from './team-management-client';
interface Team {
  team: {
    id: string;
    name: string;
    logoUrl?: string;
    balance: number;
    dollar_balance?: number;
    euro_balance?: number;
  };
  totalPlayers: number;
  totalValue: number;
  avgRating: number;
  positionBreakdown: { [key: string]: number };
  realPlayerSpent?: number;
  footballSpent?: number;
}

interface Match {
  id: string;
  round_number: number;
  leg: string;
  match_number: number;
  status: string;
  result: string;
  home_team_name: string;
  away_team_name: string;
  home_score?: number;
  away_score?: number;
  updated_at?: any;
  created_at?: any;
}


export default function TeamManagementPage() {
  const { user, loading } = useAuth();
  const { userSeasonId } = usePermissions();
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [seasonName, setSeasonName] = useState('');
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Redirect if not authenticated or not committee admin
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login?redirect=/dashboard/committee/team-management');
    }
    if (!loading && user && user.role !== 'committee_admin' && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch teams and season data
  useEffect(() => {
    const fetchData = async () => {
      if (!user || !userSeasonId) return;
      
      setIsLoading(true);
      try {
        // Fetch season info
        const seasonResponse = await fetchWithTokenRefresh(`/api/seasons/${userSeasonId}`);
        const seasonData = await seasonResponse.json();
        if (seasonData.success && seasonData.data) {
          setSeasonName(seasonData.data.name || '');
        }

        // Fetch teams
        const teamsResponse = await fetchWithTokenRefresh(`/api/team/all?season_id=${userSeasonId}`);
        const teamsData = await teamsResponse.json();
        if (teamsData.success && teamsData.data.teams) {
          setTeams(teamsData.data.teams);
        }

        // Fetch recent matches
        const matchesResponse = await fetchWithTokenRefresh(`/api/fixtures?season_id=${userSeasonId}&status=completed&limit=5`);
        const matchesData = await matchesResponse.json();
        if (matchesData.success && matchesData.data) {
          setRecentMatches(matchesData.data.slice(0, 5));
        }
      } catch (error) {
        console.error('Error fetching team management data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user, userSeasonId]);

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono font-mono">Loading team management console...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <TeamManagementClient
      teams={teams}
      seasonName={seasonName}
      recentMatches={recentMatches}
    />
  );
}
