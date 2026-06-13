'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { getSmartCache, setSmartCache, CACHE_DURATIONS } from '@/utils/smartCache';
import { POSITION_GROUPS } from '@/lib/constants/positions';
import { usePermissions } from '@/hooks/usePermissions';
import Image from 'next/image';

export default function CommitteeDashboard() {
  const { user, loading } = useAuth();
  const { userSeasonId } = usePermissions();
  const router = useRouter();

  const [teams, setTeams] = useState<any[]>([]);
  const [playerStats, setPlayerStats] = useState<{
    total: number;
    eligible: number;
    byPosition: { [key: string]: number };
  }>({ total: 0, eligible: 0, byPosition: {} });
  const [activeRounds, setActiveRounds] = useState<any[]>([]);
  const [roundTiebreakers, setRoundTiebreakers] = useState<{ [key: string]: any[] }>({});
  const [loadingRounds, setLoadingRounds] = useState(false);
  const [currentSeason, setCurrentSeason] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    teamPlayer: true,
    ratings: true,
    contracts: true,
    auction: true,
    fantasy: true,
    content: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch all initial data in parallel
  const fetchAllStats = useCallback(async () => {
    if (!user || user.role !== 'committee_admin' || !userSeasonId) return;

    setLoadingStats(true);

    try {
      // Fetch all data in parallel
      await Promise.all([
        // Fetch season
        (async () => {
          try {
            const cacheKey = `committee_season_${userSeasonId}`;
            const cachedSeason = getSmartCache<any>(cacheKey, CACHE_DURATIONS.MEDIUM);

            if (cachedSeason) {
              setCurrentSeason(cachedSeason);
              return;
            }

            const seasonRef = doc(db, 'seasons', userSeasonId);
            const seasonSnapshot = await getDoc(seasonRef);

            if (seasonSnapshot.exists()) {
              const seasonData = { id: seasonSnapshot.id, ...seasonSnapshot.data() };
              setSmartCache(cacheKey, seasonData, CACHE_DURATIONS.MEDIUM);
              setCurrentSeason(seasonData);
            }
          } catch (err) {
            console.error('Error fetching season:', err);
          }
        })(),

        // Fetch player stats from footballplayers (auction DB)
        (async () => {
          try {
            const cacheKey = `committee_football_players_${userSeasonId}`;
            const cachedStats = getSmartCache<any>(cacheKey, CACHE_DURATIONS.MEDIUM);

            if (cachedStats) {
              setPlayerStats(cachedStats);
              return;
            }

            const response = await fetchWithTokenRefresh(`/api/stats/registered-players?season_id=${userSeasonId}`);
            const data = await response.json();

            if (data.success && data.stats) {
              setSmartCache(cacheKey, data.stats, CACHE_DURATIONS.MEDIUM);
              setPlayerStats(data.stats);
            }
          } catch (err) {
            console.error('Error fetching registered player stats:', err);
          }
        })(),

        // Fetch teams
        (async () => {
          try {
            const response = await fetchWithTokenRefresh(`/api/team/all?season_id=${userSeasonId}`);
            const data = await response.json();

            if (data.success && data.data?.teams) {
              setTeams(data.data.teams);
            }
          } catch (err) {
            console.error('Error fetching teams:', err);
          }
        })(),
      ]);
    } finally {
      setLoadingStats(false);
    }
  }, [user, userSeasonId]);

  useEffect(() => {
    fetchAllStats();
  }, [fetchAllStats]);

  // Fetch active rounds
  const fetchActiveRounds = useCallback(async () => {
    if (!userSeasonId || !user || user.role !== 'committee_admin') return;

    setLoadingRounds(true);
    try {
      const roundsResponse = await fetchWithTokenRefresh(`/api/admin/rounds?season_id=${userSeasonId}&status=active`, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      const roundsData = await roundsResponse.json();

      if (roundsData.success) {
        setActiveRounds(roundsData.data || []);
      }

      const tbResponse = await fetchWithTokenRefresh(`/api/admin/tiebreakers?seasonId=${userSeasonId}&status=active`);
      const tbData = await tbResponse.json();

      if (tbData.success && tbData.data?.tiebreakers) {
        const tiebreakersByRound: { [key: string]: any[] } = {};
        tbData.data.tiebreakers.forEach((tb: any) => {
          if (!tiebreakersByRound[tb.round_id]) {
            tiebreakersByRound[tb.round_id] = [];
          }
          tiebreakersByRound[tb.round_id].push(tb);
        });
        setRoundTiebreakers(tiebreakersByRound);
      }
    } catch (err) {
      console.error('Error fetching active rounds:', err);
    } finally {
      setLoadingRounds(false);
    }
  }, [userSeasonId, user]);

  // Initial fetch
  useEffect(() => {
    fetchActiveRounds();
  }, [fetchActiveRounds]);

  // Firebase Realtime DB listener for live round updates
  useEffect(() => {
    if (!userSeasonId) return;

    const { listenToSeasonRoundUpdates } = require('@/lib/realtime/listeners');

    const unsubscribe = listenToSeasonRoundUpdates(userSeasonId, (message: any) => {
      console.log('📊 [Committee Dashboard] Round update:', message.type);

      // Refetch active rounds when any round event occurs
      if (message.type === 'round_started' ||
        message.type === 'round_finalized' ||
        message.type === 'round_updated' ||
        message.type === 'bid_submitted') {
        fetchActiveRounds();
      }
    });

    return () => unsubscribe();
  }, [userSeasonId, fetchActiveRounds]);

  if (loading || loadingStats) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'committee_admin') {
    return null;
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Enhanced Header */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-800 uppercase tracking-wider">
                Committee Dashboard
              </h1>
              <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                Complete administrative control center
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              {currentSeason && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex-grow lg:flex-grow-0 min-w-[200px]">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-900">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Active Season</div>
                      <div className="text-xs font-extrabold text-slate-850 truncate">{currentSeason.name}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-150">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">Teams Registered</span>
                    <span className="text-xs font-black text-amber-600">{teams.length}</span>
                  </div>
                </div>
              )}

              {currentSeason && (
                <a
                  href={`/api/admin/export/teams-excel?season_id=${currentSeason.id}`}
                  download
                  className="bg-white border border-slate-200 hover:border-amber-400/40 hover:text-amber-600 transition-all rounded-xl p-3 flex items-center gap-3 flex-grow lg:flex-grow-0 min-w-[200px] shadow-sm group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-900">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors">Export to Excel</div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Download teams & players</div>
                  </div>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Stats Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-amber-500 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-450 text-[9px] font-bold uppercase tracking-wider">Total Teams</span>
              <span className="p-1.5 rounded-lg bg-slate-800 text-amber-400 border border-slate-900">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </span>
            </div>
            <div className="text-xl font-black text-slate-850">{teams.length}</div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-purple-500 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-455 text-[9px] font-bold uppercase tracking-wider">Total Players</span>
              <span className="p-1.5 rounded-lg bg-slate-800 text-purple-400 border border-slate-900">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
            </div>
            <div className="text-xl font-black text-slate-850">{playerStats.total}</div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-green-500 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-455 text-[9px] font-bold uppercase tracking-wider">Eligible Players</span>
              <span className="p-1.5 rounded-lg bg-slate-800 text-green-400 border border-slate-900">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138z" />
                </svg>
              </span>
            </div>
            <div className="text-xl font-black text-slate-850">{playerStats.eligible}</div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-orange-500 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-455 text-[9px] font-bold uppercase tracking-wider">Active Rounds</span>
              <span className="p-1.5 rounded-lg bg-slate-800 text-orange-400 border border-slate-900">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            </div>
            <div className="text-xl font-black text-slate-850">{activeRounds.length}</div>
          </div>
        </div>        {/* Organized Navigation with Collapsible Sections */}
        <div className="space-y-6 mb-8">

          {/* Team & Player Management Section */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
            <button
              onClick={() => toggleSection('teamPlayer')}
              className="w-full flex items-center justify-between hover:text-amber-600 transition-colors"
            >
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center">
                <svg className="w-5 h-5 mr-2 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Team & Player Management
              </h2>
              {expandedSections.teamPlayer ? (
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>

            {expandedSections.teamPlayer && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6 pt-4 border-t border-slate-100">
                <Link href="/dashboard/committee/teams" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Season Teams</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">View teams registered for current season</p>
                </Link>

                <Link href="/dashboard/committee/registration" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192L5.636 18.364M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Team Registration</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Manage team registration for season</p>
                </Link>

                <Link href={userSeasonId ? `/register/players?season=${userSeasonId}` : '#'} className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-855 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Player Registration</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Register players to teams for season</p>
                </Link>

                <Link href="/dashboard/committee/players" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zm-4 7a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">All Players</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Browse all players in database</p>
                </Link>

                <Link href="/dashboard/committee/players/transfers" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Player Transfers</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Release, transfer & swap players</p>
                </Link>

                <Link href="/dashboard/committee/player-eligibility" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Player Eligibility</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Manage player eligibility status</p>
                </Link>

                <Link href="/dashboard/committee/penalties" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Tournament Penalties</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Apply & manage point deductions</p>
                </Link>
              </div>
            )}
          </div>

          {/* Player Ratings & Configuration Section */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
            <button
              onClick={() => toggleSection('ratings')}
              className="w-full flex items-center justify-between hover:text-amber-600 transition-colors"
            >
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center">
                <svg className="w-5 h-5 mr-2 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                Player Ratings & Configuration
              </h2>
              {expandedSections.ratings ? (
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>

            {expandedSections.ratings && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6 pt-4 border-t border-slate-100">
                <Link href="/dashboard/committee/real-players" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">SS Members</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Real player assignments</p>
                </Link>

                <Link href="/dashboard/committee/player-stats" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Player Stats</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Edit player statistics & ratings</p>
                </Link>

                <Link href="/dashboard/committee/team-management/player-stats-by-round" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-855 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Stats by Round</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Cumulative player stats & Excel export</p>
                </Link>

                <Link href="/dashboard/committee/player-awards" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Player Awards</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Season-end player awards</p>
                </Link>
              </div>
            )}
          </div>

          {/* Contracts & Financial Management Section */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
            <button
              onClick={() => toggleSection('contracts')}
              className="w-full flex items-center justify-between hover:text-amber-600 transition-colors"
            >
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center">
                <svg className="w-5 h-5 mr-2 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Contracts & Financial Management
              </h2>
              {expandedSections.contracts ? (
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>

            {expandedSections.contracts && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6 pt-4 border-t border-slate-100">
                <Link href="/dashboard/committee/all-transactions" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">All Transactions</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Complete transaction history & summary</p>
                </Link>

                <Link href="/dashboard/committee/reports/budget-sync" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Budget Sync</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Check & fix Firebase/Neon sync</p>
                </Link>

                <Link href="/dashboard/committee/reports/refunds" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Send Refunds</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Issue refunds to teams</p>
                </Link>
              </div>
            )}
          </div>

          {/* Auction Management Section */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
            <button
              onClick={() => toggleSection('auction')}
              className="w-full flex items-center justify-between hover:text-amber-600 transition-colors"
            >
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center">
                <svg className="w-5 h-5 mr-2 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Auction Management
              </h2>
              {expandedSections.auction ? (
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>

            {expandedSections.auction && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-4 border-t border-slate-100">
                <Link href="/dashboard/committee/auction-settings" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Auction Settings</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Configure rounds & rules</p>
                </Link>

                <Link href="/dashboard/committee/position-groups" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Position Groups</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Organize auction groups</p>
                </Link>

                <Link href="/dashboard/committee/database" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Database</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Import/export data</p>
                </Link>

                <Link href="/dashboard/committee/database/duplicates" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Duplicates</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Find & remove duplicates</p>
                </Link>

                <Link href="/dashboard/committee/rounds" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Create Rounds</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Manage auction rounds</p>
                </Link>

                <Link href="/dashboard/committee/bulk-rounds" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-855 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Bulk Rounds</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Manage bulk bidding</p>
                </Link>

                <Link href="/dashboard/committee/team-slots" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Team Slots</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Manage player slots</p>
                </Link>
              </div>
            )}
          </div>

          {/* Fantasy & Content Management Section */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
            <button
              onClick={() => toggleSection('fantasy')}
              className="w-full flex items-center justify-between hover:text-amber-600 transition-colors"
            >
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center">
                <svg className="w-5 h-5 mr-2 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Fantasy & Content Management
              </h2>
              {expandedSections.fantasy ? (
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>

            {expandedSections.fantasy && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-4 border-t border-slate-100">
                <Link href="/dashboard/committee/fantasy/create" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Fantasy League</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Create & manage draft</p>
                </Link>

                <Link href="/dashboard/committee/fantasy/enable-teams" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Enable Fantasy Teams</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Bulk enable teams</p>
                </Link>

                <Link href="/dashboard/committee/team-management" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Team Management</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Tournament operations</p>
                </Link>

                <Link href="/dashboard/committee/trophies" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m-3.75 1.5a3 3 0 11-6 0 3 3 0 016 0zm8.25 0a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Trophy Management</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Award season trophies</p>
                </Link>

                <Link href="/dashboard/committee/awards" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Awards</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">POTD, POTW & more</p>
                </Link>

                <Link href="/dashboard/committee/polls" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Polls</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Create award voting polls</p>
                </Link>

                <Link href="/admin/news" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">News Management</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">View AI-generated news</p>
                </Link>

                <Link href="/admin/notifications" className="group bg-slate-50 border border-slate-200/60 rounded-xl p-4 hover:border-amber-400 hover:shadow-md hover:bg-white transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-slate-850 text-amber-400 border border-slate-905 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors mb-1">Send Notifications</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Manual notifications to teams</p>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Active Rounds & Player Stats - Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Active Rounds */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center">
                <svg className="w-5 h-5 mr-2 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Active Rounds
                {activeRounds.length > 0 && (
                  <span className="ml-2 text-[10px] font-black px-2 py-0.5 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-md">
                    {activeRounds.length}
                  </span>
                )}
              </h2>
              <Link href="/dashboard/committee/rounds" className="text-[10px] font-black text-slate-800 uppercase tracking-wider bg-white hover:bg-slate-50 border border-slate-200 hover:border-amber-400/40 hover:text-amber-600 px-3 py-1.5 rounded-lg transition-all">
                View All
              </Link>
            </div>

            {loadingRounds ? (
              <div className="text-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
                <p className="mt-3 text-[10px] text-slate-500 uppercase tracking-wider font-bold">Loading...</p>
              </div>
            ) : activeRounds.length === 0 ? (
              <div className="bg-slate-50 border border-slate-100 p-6 rounded-xl text-center">
                <svg className="w-8 h-8 mx-auto text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[10px] text-slate-500 font-bold uppercase">No active rounds</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeRounds.map((round) => {
                  const tiebreakers = roundTiebreakers[round.id] || [];

                  return (
                    <div key={round.id} className="bg-slate-50 border border-slate-150 p-4 rounded-xl">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[9px] font-extrabold rounded-md uppercase">
                            {round.position}
                          </span>
                          <h3 className="font-extrabold text-slate-850 text-xs uppercase">{round.position} Round</h3>
                        </div>
                        <Link href="/dashboard/committee/rounds" className="text-[10px] font-bold text-amber-600 hover:text-amber-700 uppercase">
                          Details →
                        </Link>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white border border-slate-150 p-2 rounded-lg">
                          <p className="text-[9px] text-slate-450 uppercase font-bold">Bids</p>
                          <p className="text-base font-black text-slate-800">{round.total_bids || 0}</p>
                        </div>
                        <div className="bg-white border border-slate-150 p-2 rounded-lg">
                          <p className="text-[9px] text-slate-450 uppercase font-bold">Teams</p>
                          <p className="text-base font-black text-slate-800">{round.teams_bid || 0}</p>
                        </div>
                        <div className="bg-white border border-slate-150 p-2 rounded-lg">
                          <p className="text-[9px] text-slate-450 uppercase font-bold">Tiebreakers</p>
                          <p className={`text-base font-black ${tiebreakers.length > 0 ? 'text-orange-600' : 'text-slate-800'}`}>
                            {tiebreakers.length}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Player Stats */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center">
                <svg className="w-5 h-5 mr-2 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Player Distribution
              </h2>
              <Link href="/dashboard/committee/player-selection" className="text-[10px] font-black text-slate-800 uppercase tracking-wider bg-white hover:bg-slate-50 border border-slate-200 hover:border-amber-400/40 hover:text-amber-600 px-3 py-1.5 rounded-lg transition-all">
                Manage
              </Link>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold text-slate-800 uppercase">Auction Eligible</span>
                <span className="text-xs font-black text-amber-600">{playerStats.eligible} / {playerStats.total}</span>
              </div>
              <div className="w-full bg-slate-100 border border-slate-200/40 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-amber-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${playerStats.total > 0 ? (playerStats.eligible / playerStats.total) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { pos: 'GK', color: 'bg-yellow-500', icon: '🧤', label: 'Keepers' },
                { pos: 'DEF', color: 'bg-blue-500', icon: '🛡️', label: 'Defenders' },
                { pos: 'MID', color: 'bg-green-500', icon: '⚙️', label: 'Midfielders' },
                { pos: 'FWD', color: 'bg-red-500', icon: '⚽', label: 'Forwards' }
              ].map(({ pos, color, icon, label }) => (
                <div key={pos} className="bg-slate-50 border border-slate-150 p-4 rounded-xl hover:border-amber-400/40 hover:bg-white transition-all">
                  <div className="flex items-center mb-2">
                    <span className={`w-2 h-2 rounded-full mr-2 ${color}`}></span>
                    <span className="text-[10px] font-extrabold text-slate-800 uppercase">{pos}</span>
                  </div>
                  <p className="text-2xl font-black text-slate-850 mb-0.5">
                    {playerStats.byPosition[pos] || 0}
                  </p>
                  <p className="text-[9px] text-slate-455 uppercase font-bold flex items-center gap-1">
                    <span>{icon}</span>
                    <span>{label}</span>
                  </p>
                </div>
              ))
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
