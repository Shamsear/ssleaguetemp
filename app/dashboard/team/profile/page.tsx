'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCachedSeasons } from '@/hooks/useCachedFirebase';
import NotificationButton from '@/components/notifications/NotificationButton';

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'AMF', 'LMF', 'RMF', 'LWF', 'RWF', 'SS', 'CF'];
const MAX_PLAYERS_PER_TEAM = 25;

interface Owner {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  photo_url?: string;
  bio?: string;
  place?: string;
  nationality?: string;
}

interface Manager {
  id: string;
  name: string;
  is_player: boolean;
  photo_url?: string;
  email?: string;
  phone?: string;
  place?: string;
  nationality?: string;
}

interface TeamProfile {
  name: string;
  logoUrl?: string;
  managerName: string;
  playerCount: number;
  totalBids: number;
  wonBids: number;
  remainingBalance: number;
  totalSpent: number;
  initialBudget: number;
  positionCounts: { [key: string]: number };
  currencySystem?: string;
  footballBudget?: number;
  realPlayerBudget?: number;
  footballSpent?: number;
  realPlayerSpent?: number;
}

interface Player {
  id: string;
  name: string;
  position: string;
  overall_rating: number;
  acquisition_value: number;
}

export default function TeamProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [profileData, setProfileData] = useState<TeamProfile | null>(null);
  const [recentPlayers, setRecentPlayers] = useState<Player[]>([]);
  const [topPlayers, setTopPlayers] = useState<Player[]>([]);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [manager, setManager] = useState<Manager | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch active season using the same hook as main dashboard
  const { data: activeSeasons, isLoading: seasonsLoading } = useCachedSeasons(
    user?.role === 'team' ? { isActive: 'true' } : undefined
  );

  useEffect(() => {
    const fetchProfileData = async () => {
      if (!user || !activeSeasons || activeSeasons.length === 0) return;

      try {
        setIsLoading(true);
        
        const seasonId = activeSeasons[0].id;

        // Fetch dashboard data from API
        const response = await fetch(`/api/team/dashboard?season_id=${seasonId}`, {
          headers: { 'Cache-Control': 'no-cache' },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Dashboard API error:', response.status, errorText);
          setError(`API Error: ${response.status} - ${errorText}`);
          throw new Error('Failed to fetch dashboard data');
        }

        const { success, data } = await response.json();
        console.log('Dashboard data received:', { success, hasData: !!data });

        if (success && data) {
          const currencySystem = data.team.currency_system || 'single';
          const isDual = currencySystem === 'dual';

          setProfileData({
            name: data.team.name,
            logoUrl: data.team.logo_url,
            managerName: user.username || 'Manager',
            playerCount: data.stats.playerCount,
            totalBids: data.stats.activeBidsCount + data.roundResults.length,
            wonBids: data.roundResults.length,
            remainingBalance: isDual ? 0 : data.stats.balance,
            totalSpent: isDual ? data.team.football_spent : data.stats.totalSpent,
            initialBudget: isDual ? 0 : 15000,
            positionCounts: data.stats.positionBreakdown || {},
            currencySystem,
            footballBudget: isDual ? data.team.football_budget : undefined,
            realPlayerBudget: isDual ? data.team.real_player_budget : undefined,
            footballSpent: isDual ? data.team.football_spent : undefined,
            realPlayerSpent: isDual ? data.team.real_player_spent : undefined,
          });

          // Set recent players (last 5)
          const recentPlayersList = data.players.slice(0, 5);
          setRecentPlayers(recentPlayersList);

          // Set top players (sorted by rating)
          const topPlayersList = [...data.players]
            .sort((a: Player, b: Player) => b.overall_rating - a.overall_rating)
            .slice(0, 5);
          setTopPlayers(topPlayersList);

          // Set owner and manager data
          setOwner(data.owner);
          setManager(data.manager);
        }
      } catch (error: any) {
        console.error('Error fetching profile:', error);
        setError(error.message || 'Unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfileData();
  }, [user, activeSeasons]);

  if (loading || isLoading || seasonsLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team') {
    return null;
  }

  if (!profileData) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 max-w-md px-4">
          <div className="inline-flex items-center justify-center p-3 bg-rose-50 border border-rose-200 rounded-2xl mb-4 text-2xl">
            ⚠️
          </div>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-2">Unable to load profile</h3>
          <p className="text-xs text-slate-500 font-bold uppercase mb-4 leading-relaxed">Please make sure you are registered for the current season.</p>
          {error && (
            <div className="mb-4 p-3 bg-rose-50/50 border border-rose-150 rounded-xl text-xs font-semibold text-rose-700 max-w-md mx-auto text-left leading-relaxed">
              <strong className="uppercase">Error:</strong> {error}
            </div>
          )}
          <Link
            href="/dashboard/team"
            className="inline-flex px-6 py-3 bg-slate-800 text-amber-400 border border-slate-900 rounded-xl hover:bg-slate-700 hover:shadow-md transition-all font-mono text-xs uppercase tracking-wider font-extrabold cursor-pointer"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Back Link */}
        <Link
          href="/dashboard"
          className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit mb-4"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Dashboard
        </Link>
        {/* Header Title Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono relative overflow-hidden">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
            {/* Team Logo Section */}
            <div className="relative group flex-shrink-0">
              {profileData.logoUrl ? (
                <div className="w-32 h-32 rounded-2xl overflow-hidden border border-slate-200/60 shadow-md relative bg-white flex items-center justify-center p-2">
                  <Image
                    src={profileData.logoUrl}
                    alt={`${profileData.name} logo`}
                    width={128}
                    height={128}
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-32 h-32 bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-900 shadow-md relative">
                  <svg className="w-16 h-16 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              )}
              {/* Edit button overlay */}
              <Link
                href="/dashboard/team/profile/edit"
                className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer"
              >
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </Link>
            </div>

            {/* Team Information */}
            <div className="flex-grow w-full">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5 pb-3 border-b border-slate-100">
                <h1 className="text-xl sm:text-2xl font-black text-slate-800 uppercase tracking-wider">{profileData.name}</h1>
                <Link
                  href="/dashboard/team/profile/edit"
                  className="px-4 py-2 bg-slate-800 text-amber-400 border border-slate-900 rounded-xl hover:bg-slate-700 hover:shadow-md transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center cursor-pointer shadow-sm"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Profile
                </Link>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Owner</p>
                  <p className="text-xs font-extrabold text-slate-800 truncate">{owner?.name || 'Not set'}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Manager</p>
                  <p className="text-xs font-extrabold text-slate-800 truncate">{manager?.name || 'Not set'}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Squad Players</p>
                  <p className="text-xs font-extrabold text-slate-800">{profileData.playerCount}/{MAX_PLAYERS_PER_TEAM}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Won Bids</p>
                  <p className="text-xs font-extrabold text-slate-800">{profileData.wonBids}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Statistics */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
            <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">Financial Overview</h2>
          </div>

          {profileData.currencySystem === 'dual' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-sky-500 rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider">eCoin Budget</span>
                  <span className="px-1.5 py-0.2 bg-sky-50 text-sky-700 border border-sky-200/50 rounded-lg text-[8px] font-black uppercase">Available</span>
                </div>
                <p className="text-xl font-black text-sky-700">{(profileData.footballBudget || 0).toLocaleString()} eCoin</p>
              </div>

              <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-green-500 rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider">SSCoin Budget</span>
                  <span className="px-1.5 py-0.2 bg-green-50 text-green-700 border border-green-200/50 rounded-lg text-[8px] font-black uppercase">Real Player</span>
                </div>
                <p className="text-xl font-black text-green-700">{(profileData.realPlayerBudget || 0).toLocaleString()} SSCoin</p>
              </div>

              <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-purple-500 rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider">eCoin Spent</span>
                  <span className="px-1.5 py-0.2 bg-purple-50 text-purple-700 border border-purple-200/50 rounded-lg text-[8px] font-black uppercase">Virtual Squad</span>
                </div>
                <p className="text-xl font-black text-purple-700">{(profileData.footballSpent || 0).toLocaleString()} eCoin</p>
              </div>

              <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-orange-500 rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider">SSCoin Spent</span>
                  <span className="px-1.5 py-0.2 bg-orange-50 text-orange-700 border border-orange-200/50 rounded-lg text-[8px] font-black uppercase">Real Squad</span>
                </div>
                <p className="text-xl font-black text-orange-700">{(profileData.realPlayerSpent || 0).toLocaleString()} SSCoin</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-green-500 rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider">Current Balance</span>
                  <span className="px-1.5 py-0.2 bg-green-50 text-green-700 border border-green-200/50 rounded-lg text-[8px] font-black uppercase">eCoin</span>
                </div>
                <p className="text-xl font-black text-green-700">{profileData.remainingBalance.toLocaleString()} eCoin</p>
              </div>

              <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-purple-500 rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider">Total Spent</span>
                  <span className="px-1.5 py-0.2 bg-purple-50 text-purple-700 border border-purple-200/50 rounded-lg text-[9px] font-black uppercase">Spent</span>
                </div>
                <p className="text-xl font-black text-purple-700">{profileData.totalSpent.toLocaleString()} eCoin</p>
              </div>

              <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-orange-500 rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider">Initial Budget</span>
                  <span className="px-1.5 py-0.2 bg-orange-50 text-orange-700 border border-orange-200/50 rounded-lg text-[9px] font-black uppercase">Starting</span>
                </div>
                <p className="text-xl font-black text-orange-700">{profileData.initialBudget.toLocaleString()} eCoin</p>
              </div>
            </div>
          )}
        </div>

        {/* Position Breakdown */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
            <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">Squad Composition</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {POSITIONS.map((position) => {
              const count = profileData.positionCounts[position] || 0;
              return (
                <div key={position} className="bg-slate-50/50 border border-slate-150 rounded-xl p-4 text-center hover:bg-slate-50 transition-all duration-200 shadow-sm">
                  <div
                    className={`w-12 h-12 mx-auto mb-2 rounded-xl flex items-center justify-center font-black text-lg shadow-sm border ${
                      count === 0 
                        ? 'bg-white text-slate-400 border-slate-200' 
                        : count >= 2 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : 'bg-slate-800 text-amber-400 border-slate-900'
                    }`}
                  >
                    {count}
                  </div>
                  <p className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider">{position}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Owner & Manager Section */}
        {(owner || manager) && (
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">Team Management</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Owner Card */}
              {owner && (
                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center mb-4 pb-3 border-b border-slate-200/60">
                    {owner.photo_url ? (
                      <img
                        src={owner.photo_url}
                        alt={owner.name}
                        className="w-14 h-14 rounded-xl object-cover border border-slate-200 shadow-sm"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-slate-800 rounded-xl flex items-center justify-center text-amber-400 font-extrabold text-lg border border-slate-900 shadow-sm">
                        {owner.name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="ml-4 flex-grow min-w-0">
                      <p className="text-[9px] text-amber-600 font-bold uppercase tracking-wider mb-0.5">Team Owner</p>
                      <p className="text-sm font-black text-slate-800 truncate">{owner.name}</p>
                    </div>
                  </div>
                  {(owner.email || owner.phone || owner.place || owner.nationality) && (
                    <div className="space-y-2 text-xs font-semibold text-slate-650">
                      {owner.email && (
                        <div className="flex items-center">
                          <span className="w-5 text-slate-400 text-sm">📧</span>
                          <span className="truncate">{owner.email}</span>
                        </div>
                      )}
                      {owner.phone && (
                        <div className="flex items-center">
                          <span className="w-5 text-slate-400 text-sm">📞</span>
                          <span>{owner.phone}</span>
                        </div>
                      )}
                      {owner.place && (
                        <div className="flex items-center">
                          <span className="w-5 text-slate-400 text-sm">📍</span>
                          <span>{owner.place}</span>
                        </div>
                      )}
                      {owner.nationality && (
                        <div className="flex items-center">
                          <span className="w-5 text-slate-400 text-sm">🌐</span>
                          <span>{owner.nationality}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {owner.bio && (
                    <p className="mt-4 text-xs text-slate-500 italic font-medium bg-white border border-slate-100 rounded-xl p-3 leading-relaxed">
                      "{owner.bio}"
                    </p>
                  )}
                </div>
              )}

              {/* Manager Card */}
              {manager && (
                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center mb-4 pb-3 border-b border-slate-200/60">
                    {manager.photo_url ? (
                      <img
                        src={manager.photo_url}
                        alt={manager.name}
                        className="w-14 h-14 rounded-xl object-cover border border-slate-200 shadow-sm"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-slate-800 rounded-xl flex items-center justify-center text-amber-400 font-extrabold text-lg border border-slate-900 shadow-sm">
                        {manager.name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="ml-4 flex-grow min-w-0">
                      <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider mb-0.5">
                        {manager.is_player ? 'Playing Manager' : 'Team Manager'}
                      </p>
                      <p className="text-sm font-black text-slate-800 truncate">{manager.name}</p>
                    </div>
                  </div>
                  {(manager.email || manager.phone || manager.place || manager.nationality) && (
                    <div className="space-y-2 text-xs font-semibold text-slate-655 font-mono">
                      {manager.email && (
                        <div className="flex items-center">
                          <span className="w-5 text-slate-400 text-sm">📧</span>
                          <span className="truncate">{manager.email}</span>
                        </div>
                      )}
                      {manager.phone && (
                        <div className="flex items-center">
                          <span className="w-5 text-slate-400 text-sm">📞</span>
                          <span>{manager.phone}</span>
                        </div>
                      )}
                      {manager.place && (
                        <div className="flex items-center">
                          <span className="w-5 text-slate-400 text-sm">📍</span>
                          <span>{manager.place}</span>
                        </div>
                      )}
                      {manager.nationality && (
                        <div className="flex items-center">
                          <span className="w-5 text-slate-400 text-sm">🌐</span>
                          <span>{manager.nationality}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Acquisitions and Top Players */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Acquisitions */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Recent Acquisitions</h3>
            </div>

            {recentPlayers.length > 0 ? (
              <div className="space-y-3">
                {recentPlayers.map((player) => (
                  <div key={player.id} className="bg-slate-50 border border-slate-150 rounded-xl p-3 flex items-center justify-between hover:bg-slate-100/55 transition-all">
                    <div>
                      <p className="text-xs font-extrabold text-slate-800">{player.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{player.position} • Rating: {player.overall_rating}</p>
                    </div>
                    <p className="text-xs font-black text-slate-850">{profileData.currencySystem === 'dual' ? 'eCoin ' : 'eCoin '}{player.acquisition_value.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs font-bold uppercase">No players acquired yet</div>
            )}
          </div>

          {/* Top Rated Players */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Top Rated Players</h3>
            </div>

            {topPlayers.length > 0 ? (
              <div className="space-y-3">
                {topPlayers.map((player, index) => (
                  <div key={player.id} className="bg-slate-50 border border-slate-150 rounded-xl p-3 flex items-center justify-between hover:bg-slate-100/55 transition-all">
                    <div className="flex items-center">
                      <div className="w-6 h-6 bg-slate-850 text-amber-400 rounded-lg flex items-center justify-center font-black text-xs mr-3 shadow-md">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-slate-800">{player.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{player.position}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span className="text-xs font-black text-slate-800">{player.overall_rating}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs font-bold uppercase">No players in squad yet</div>
            )}
          </div>
        </div>

        {/* Notifications Section */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-2 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Push Notifications</h3>
            </div>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-4 mt-4">
            <div className="flex-1">
              <p className="text-xs text-slate-500 font-bold mb-1">Stay Updated</p>
              <p className="text-[10px] text-slate-400 font-medium">Get real-time updates about auctions, matches, and results directly on your device.</p>
            </div>
            <NotificationButton />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4 pb-2 border-b border-slate-100">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/dashboard/team"
              className="px-4 py-2.5 bg-slate-800 text-amber-400 border border-slate-900 rounded-xl hover:bg-slate-700 hover:shadow-md transition-all font-mono text-xs uppercase tracking-wider font-extrabold text-center shadow-sm"
            >
              Team Dashboard
            </Link>
            <Link
              href="/dashboard/team/profile/edit"
              className="px-4 py-2.5 bg-white border border-slate-200/60 rounded-xl hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold text-center shadow-sm"
            >
              Edit Profile
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

