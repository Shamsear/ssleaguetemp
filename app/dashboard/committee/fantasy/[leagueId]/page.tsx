'use client';
import { ArrowLeft, Trophy } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

interface FantasyLeague {
  id: string;
  name: string;
  season_id: string;
  status: string;
  created_at: any;
}

interface FantasyTeam {
  id: string;
  team_name: string;
  owner_name: string;
  total_points: number;
  player_count: number;
  rank: number;
}

export default function FantasyLeagueDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [league, setLeague] = useState<FantasyLeague | null>(null);
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { alertState, showAlert, closeAlert } = useModal();

  useEffect(() => {
    const loadLeagueData = async (retryCount = 0, maxRetries = 3) => {
      if (!leagueId) return;

      try {
        const response = await fetchWithTokenRefresh(`/api/fantasy/leagues/${leagueId}`);

        if (!response.ok) {
          // If it's a 404 and we haven't exceeded retries, wait and try again
          if (response.status === 404 && retryCount < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 3000); // Exponential backoff, max 3s
            console.log(`League not found, retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return loadLeagueData(retryCount + 1, maxRetries);
          }
          throw new Error('Failed to load league');
        }

        const data = await response.json();
        setLeague(data.league);
        setTeams(data.teams || []);
      } catch (error) {
        console.error('Error loading league:', error);
        showAlert({
          type: 'error',
          title: 'Error',
          message: 'Failed to load fantasy league data. The league may still be creating, please refresh the page.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (user) {
      loadLeagueData();
    }
  }, [user, leagueId]);

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user || !league) return null;

  const managementCards = [
    // Core Setup
    {
      title: 'Enable Teams',
      description: 'Enable/disable teams for fantasy participation',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      href: `/dashboard/committee/fantasy/enable-teams`,
      color: 'from-teal-500 to-cyan-600',
      badge: null,
    },
    {
      title: 'League Settings',
      description: 'Configure budget, squad size, and tier settings',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      href: `/dashboard/committee/fantasy/draft-settings/${leagueId}`,
      color: 'from-indigo-500 to-purple-600',
      badge: null,
    },
    
    // Draft Management (NEW MODEL)
    {
      title: 'Process Draft',
      description: 'Process all blind slot bids and assign players/teams exclusively',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      href: `/dashboard/committee/fantasy/${leagueId}/draft/process`,
      color: 'from-emerald-500 to-green-600',
      badge: 'NEW',
    },
    {
      title: 'Draft Results',
      description: 'View slot-by-slot draft results and winning team squads',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      href: `/dashboard/committee/fantasy/draft/${leagueId}`,
      color: 'from-blue-500 to-indigo-600',
      badge: null,
    },
    {
      title: 'Bid Breakdown',
      description: 'View all team bids, preview & final results per slot',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      href: `/dashboard/committee/fantasy/${leagueId}/draft/results`,
      color: 'from-violet-500 to-purple-600',
      badge: 'NEW',
    },
    
    {
      title: 'Calculate Points',
      description: 'Process H2H results and finalize round scores',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      href: `/dashboard/committee/fantasy/${leagueId}/calculate-points`,
      color: 'from-amber-500 to-orange-600',
      badge: 'UPDATED',
    },
    {
      title: 'Captain Windows',
      description: 'Manage captain selection windows per round',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      ),
      href: `/dashboard/committee/fantasy/${leagueId}/captain-windows`,
      color: 'from-yellow-500 to-amber-600',
      badge: 'NEW',
    },
    
    // Transfer Management (UPDATED)
    {
      title: 'Transfer Windows',
      description: 'Manage release, draft, and trading phases',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      href: `/dashboard/committee/fantasy/${leagueId}/transfer-windows`,
      color: 'from-cyan-500 to-teal-600',
      badge: 'UPDATED',
    },
    {
      title: 'Process Transfers',
      description: 'Resolve contestant conflicts and finalize weekly swaps',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
        </svg>
      ),
      href: `/dashboard/committee/fantasy/${leagueId}/transfers`,
      color: 'from-teal-500 to-emerald-600',
      badge: 'NEW',
    },
    
    // Team & Scoring
    {
      title: 'View Teams',
      description: 'See all fantasy teams and their rosters',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      href: `/dashboard/committee/fantasy/teams/${leagueId}`,
      color: 'from-indigo-500 to-purple-600',
      badge: null,
    },
    {
      title: 'Scoring Rules',
      description: 'Configure points for goals, assists, captain multipliers',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
      href: `/dashboard/committee/fantasy/scoring/${leagueId}`,
      color: 'from-purple-500 to-pink-600',
      badge: 'UPDATED',
    },
    {
      title: 'Leaderboard',
      description: 'View overall points standings',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      href: `/dashboard/committee/fantasy/standings/${leagueId}`,
      color: 'from-yellow-500 to-orange-600',
      badge: 'UPDATED',
    },
    {
      title: 'All Players - Base Points',
      description: 'View all players base performance (without multipliers)',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 8l2 2 4-4" />
        </svg>
      ),
      href: `/dashboard/committee/fantasy/all-players-points`,
      color: 'from-blue-500 to-cyan-600',
      badge: 'NEW',
    },
    {
      title: 'Bonus Points',
      description: 'Award extra points to players or teams',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
        </svg>
      ),
      href: `/dashboard/committee/fantasy/${leagueId}/bonus-points`,
      color: 'from-rose-500 to-pink-600',
      badge: null,
    },
    {
      title: 'Recalculate Everything',
      description: 'Fix & recalculate points for all players, free agents, passive team bonuses & standings',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
      href: `/dashboard/committee/fantasy/recalculate`,
      color: 'from-amber-500 to-orange-600',
      badge: 'RECALC ALL',
    },
  ];

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      <AlertModal {...alertState} onClose={closeAlert} />
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">FANTASY CONSOLE</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
              {league.name}
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Fantasy League Command Center
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <div className="bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-xl border border-slate-700 shadow-sm shrink-0">
              Status: {league.status}
            </div>
            <div className="bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-xl border border-slate-700 shadow-sm shrink-0">
              Season: {league.season_id.replace('SSPSLS', 'Season ')}
            </div>
          </div>
        </div>

        {/* Quick Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-amber-500 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-450 text-[9px] font-bold uppercase tracking-wider">Registered Teams</span>
              <span className="p-1.5 rounded-lg bg-slate-800 text-amber-400 border border-slate-905">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </span>
            </div>
            <div className="text-xl font-black text-slate-850">{teams.length}</div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-purple-500 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-455 text-[9px] font-bold uppercase tracking-wider">Players Drafted</span>
              <span className="p-1.5 rounded-lg bg-slate-800 text-purple-400 border border-slate-905">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </span>
            </div>
            <div className="text-xl font-black text-slate-850">
              {teams.reduce((sum, t) => sum + t.player_count, 0)}
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-green-500 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-455 text-[9px] font-bold uppercase tracking-wider">Active Participants</span>
              <span className="p-1.5 rounded-lg bg-slate-800 text-green-400 border border-slate-905">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138z" />
                </svg>
              </span>
            </div>
            <div className="text-xl font-black text-slate-850">
              {teams.filter(t => t.total_points > 0).length}
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-blue-500 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-455 text-[9px] font-bold uppercase tracking-wider">Total Points</span>
              <span className="p-1.5 rounded-lg bg-slate-800 text-blue-400 border border-slate-905">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
            </div>
            <div className="text-xl font-black text-slate-850">
              {teams.reduce((sum, t) => sum + t.total_points, 0)}
            </div>
          </div>
        </div>



        {/* Management Tools Grid */}
        <div className="space-y-4">
          <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">Management Tools</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {managementCards.map((card, index) => (
              <Link
                key={index}
                href={card.href}
                className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all relative overflow-hidden"
              >
                {card.badge && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 bg-amber-500 text-slate-900 text-[9px] font-black rounded-full uppercase tracking-wider">
                    {card.badge}
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-lg bg-slate-850 text-amber-400 border border-slate-900 flex-shrink-0 group-hover:scale-105 transition-transform">
                    {card.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1 truncate">
                      {card.title}
                    </h3>
                    <p className="text-[10px] text-slate-550 font-bold uppercase truncate">{card.description}</p>
                  </div>
                  <svg
                    className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Leaderboard */}
        {teams.length > 0 && (
          <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">Leaderboard</h2>
              <Link
                href={`/dashboard/committee/fantasy/standings/${leagueId}`}
                className="text-[10px] font-black text-slate-550 hover:text-amber-600 flex items-center gap-1 uppercase tracking-wider"
              >
                View All
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
            
            <div className="divide-y divide-slate-100">
              {teams.slice(0, 5).map((team, index) => (
                <div
                  key={team.id}
                  className="flex items-center gap-4 py-3 hover:bg-slate-50/50 transition-colors rounded-xl px-2 -mx-2"
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 ${
                    index === 0 ? 'bg-amber-500 text-slate-900 shadow-sm' :
                    index === 1 ? 'bg-slate-300 text-slate-800' :
                    index === 2 ? 'bg-orange-400 text-white' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {index + 1}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-800 uppercase truncate">{team.team_name}</p>
                    <p className="text-[10px] text-slate-550 font-bold uppercase truncate">{team.owner_name}</p>
                  </div>
                  
                  <div className="flex items-center gap-6 text-right font-mono">
                    <div>
                      <p className="text-[9px] text-slate-400 font-bold uppercase">Points</p>
                      <p className="text-sm font-black text-slate-850">{team.total_points}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 font-bold uppercase">Players</p>
                      <p className="text-sm font-black text-amber-600">{team.player_count}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  
    </AuthGuard>
  );
}
