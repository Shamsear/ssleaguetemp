'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import Link from 'next/link';
import Image from 'next/image';

interface Player {
  id: string;
  name: string;
  position: string;
  rating: number;
  category?: string;
  value?: number;
  is_real_player?: boolean;
}

interface TeamDetails {
  id: string;
  name: string;
  logoUrl: string | null;
  balance: number;
  owner_uid?: string;
  owner_name?: string;
  owner_email?: string;
  dollar_balance?: number;
  euro_balance?: number;
  dollar_spent?: number;
  euro_spent?: number;
}

interface TeamData {
  team: TeamDetails;
  players: Player[];
  totalPlayers: number;
  totalValue: number;
  avgRating: number;
  positionBreakdown: { [key: string]: number };
  categoryBreakdown?: { [key: string]: number };
  seasonType?: 'single' | 'multi';
  maxPlayers?: number;
}

interface TournamentStat {
  tournament_id: string;
  tournament_name: string;
  tournament_type: string;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_scored: number;
  goals_conceded: number;
  goal_difference: number;
  points: number;
  clean_sheets: number;
  win_rate: string;
  goals_per_game: string;
  conceded_per_game: string;
}

interface OverallStat {
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_scored: number;
  goals_conceded: number;
  goal_difference: number;
  points: number;
  clean_sheets: number;
  win_rate: string;
  goals_per_game: string;
  conceded_per_game: string;
}

export default function TeamDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const { isCommitteeAdmin, userSeasonId } = usePermissions();
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [tournamentStats, setTournamentStats] = useState<TournamentStat[]>([]);
  const [overallStats, setOverallStats] = useState<OverallStat | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'players' | 'stats'>('players');
  const [playerFilter, setPlayerFilter] = useState<'all' | 'real' | 'football'>('all');
  const [seasonType, setSeasonType] = useState<'single' | 'multi'>('single');
  const [maxPlayers, setMaxPlayers] = useState(25);

  const teamId = params?.id as string;

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && !isCommitteeAdmin) {
      router.push('/dashboard');
    }
  }, [user, loading, router, isCommitteeAdmin]);

  useEffect(() => {
    const fetchTeamDetails = async () => {
      if (!userSeasonId || !teamId) {
        setError('Missing required parameters');
        setLoadingTeam(false);
        return;
      }

      try {
        setLoadingTeam(true);
        const response = await fetchWithTokenRefresh(
          `/api/team/${teamId}?season_id=${userSeasonId}`
        );
        const data = await response.json();

        if (data.success && data.data) {
          setTeamData(data.data);
          setSeasonType(data.data.seasonType || 'single');
          setMaxPlayers(data.data.maxPlayers || 25);
          setError(null);
        } else {
          setError(data.error || 'Team not found');
        }
      } catch (err) {
        console.error('Error fetching team details:', err);
        setError('Failed to load team details');
      } finally {
        setLoadingTeam(false);
      }
    };

    if (isCommitteeAdmin && userSeasonId && teamId) {
      fetchTeamDetails();
    }
  }, [isCommitteeAdmin, userSeasonId, teamId]);

  // Fetch tournament stats when Statistics tab is opened
  useEffect(() => {
    const fetchTournamentStats = async () => {
      if (!userSeasonId || !teamId || activeTab !== 'stats') {
        return;
      }

      try {
        setLoadingStats(true);
        const response = await fetchWithTokenRefresh(
          `/api/teams/${teamId}/statistics?seasonId=${userSeasonId}`
        );
        const data = await response.json();

        if (data.success) {
          const tournaments = data.tournaments || [];
          const overall = data.overall || null;
          
          const transformedTournaments = tournaments.map((t: any) => ({
            tournament_id: t.tournament_id,
            tournament_name: t.tournament_name,
            tournament_type: t.format,
            matches_played: t.matches_played,
            wins: t.wins,
            draws: t.draws,
            losses: t.losses,
            goals_scored: t.goals_for,
            goals_conceded: t.goals_against,
            goal_difference: t.goal_difference,
            points: t.points,
            clean_sheets: t.clean_sheets,
            win_rate: t.matches_played > 0 ? ((t.wins / t.matches_played) * 100).toFixed(1) : '0.0',
            goals_per_game: t.matches_played > 0 ? (t.goals_for / t.matches_played).toFixed(2) : '0.00',
            conceded_per_game: t.matches_played > 0 ? (t.goals_against / t.matches_played).toFixed(2) : '0.00',
          }));
          
          const transformedOverall = overall ? {
            matches_played: overall.matches_played,
            wins: overall.wins,
            draws: overall.draws,
            losses: overall.losses,
            goals_scored: overall.goals_for,
            goals_conceded: overall.goals_against,
            goal_difference: overall.goal_difference,
            points: overall.points,
            clean_sheets: overall.clean_sheets,
            win_rate: overall.win_percentage.toString(),
            goals_per_game: overall.matches_played > 0 ? (overall.goals_for / overall.matches_played).toFixed(2) : '0.00',
            conceded_per_game: overall.matches_played > 0 ? (overall.goals_against / overall.matches_played).toFixed(2) : '0.00',
          } : null;
          
          setTournamentStats(transformedTournaments);
          setOverallStats(transformedOverall);
        }
      } catch (err) {
        console.error('Error fetching tournament stats:', err);
      } finally {
        setLoadingStats(false);
      }
    };

    if (isCommitteeAdmin && userSeasonId && teamId && activeTab === 'stats') {
      fetchTournamentStats();
    }
  }, [isCommitteeAdmin, userSeasonId, teamId, activeTab]);

  const getPositionColor = (position: string) => {
    const colors: { [key: string]: string } = {
      GK: 'bg-amber-50 text-amber-700 border border-amber-200/40',
      CB: 'bg-rose-50 text-rose-700 border border-rose-200/40',
      LB: 'bg-rose-50/60 text-rose-700 border border-rose-200/30',
      RB: 'bg-rose-50/60 text-rose-700 border border-rose-200/30',
      DMF: 'bg-indigo-50 text-indigo-700 border border-indigo-200/40',
      CMF: 'bg-sky-50 text-sky-700 border border-sky-200/40',
      AMF: 'bg-violet-50 text-violet-700 border border-violet-200/40',
      LMF: 'bg-sky-50/60 text-sky-700 border border-sky-200/30',
      RMF: 'bg-sky-50/60 text-sky-700 border border-sky-200/30',
      LWF: 'bg-emerald-50/60 text-emerald-700 border border-emerald-200/30',
      RWF: 'bg-emerald-50/60 text-emerald-700 border border-emerald-200/30',
      SS: 'bg-emerald-50 text-emerald-700 border border-emerald-200/40',
      CF: 'bg-emerald-50 text-emerald-700 border border-emerald-200/40',
    };
    return colors[position] || 'bg-slate-50 text-slate-700 border border-slate-200/40';
  };

  if (loading || loadingTeam) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Team Details...</p>
        </div>
      </div>
    );
  }

  if (!user || !isCommitteeAdmin) {
    return null;
  }

  if (error || !teamData) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-8 max-w-md w-full mx-auto text-center relative z-10 font-mono">
          <div className="text-rose-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-2">Error Loading Team</h2>
          <p className="text-xs text-slate-500 uppercase font-semibold mb-6">{error || 'Team not found'}</p>
          <Link 
            href="/dashboard/committee/teams" 
            className="inline-flex items-center justify-center px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl text-xs uppercase tracking-wider font-bold transition-all shadow-sm w-full"
          >
            Back to Teams
          </Link>
        </div>
      </div>
    );
  }

  const { team, players } = teamData;
  const realPlayers = players.filter(p => p.is_real_player);
  const footballPlayers = players.filter(p => !p.is_real_player);

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-mono">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 flex-shrink-0 bg-white border border-slate-200/60 rounded-2xl flex items-center justify-center p-1.5 shadow-md relative overflow-hidden">
              {team.logoUrl ? (
                <Image 
                  src={team.logoUrl} 
                  alt={team.name} 
                  width={64} 
                  height={64} 
                  className="object-contain w-full h-full" 
                />
              ) : (
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              )}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wider text-slate-800">{team.name}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs uppercase tracking-wider font-bold">
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200/40">
                  Active
                </span>
                {team.owner_name && (
                  <span className="text-slate-500">
                    Owner: <span className="text-slate-800 font-extrabold">{team.owner_name}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <Link 
            href="/dashboard/committee/teams" 
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all text-xs uppercase tracking-wider font-bold"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Teams</span>
          </Link>
        </div>

        {/* Stats Overview Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 font-mono">
          {/* Total Players Card */}
          <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
            <span className="text-slate-400 text-[8px] uppercase tracking-wider font-bold block mb-1">Squad Players</span>
            <div className="text-xl font-black text-slate-700">⚽ {players.length} / {maxPlayers}</div>
            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">
              {realPlayers.length} Real · {footballPlayers.length} Football
            </div>
          </div>

          {/* Currency Details */}
          {seasonType === 'multi' || team.dollar_balance !== undefined ? (
            <>
              <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
                <span className="text-slate-400 text-[8px] uppercase tracking-wider font-bold block mb-1">eCoin Budget Left</span>
                <div className="text-xl font-black text-blue-600">💶 {(team.euro_balance || 0).toLocaleString()}</div>
                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                  Spent: {(team.euro_spent || 0).toLocaleString()}
                </div>
              </div>

              <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
                <span className="text-slate-400 text-[8px] uppercase tracking-wider font-bold block mb-1">SSCoin Budget Left</span>
                <div className="text-xl font-black text-purple-600">🪙 {(team.dollar_balance || 0).toLocaleString()}</div>
                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                  Spent: {(team.dollar_spent || 0).toLocaleString()}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
                <span className="text-slate-400 text-[8px] uppercase tracking-wider font-bold block mb-1">Total value</span>
                <div className="text-xl font-black text-emerald-600">💰 {teamData.totalValue.toLocaleString()}</div>
              </div>

              <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
                <span className="text-slate-400 text-[8px] uppercase tracking-wider font-bold block mb-1">Wallet Balance</span>
                <div className="text-xl font-black text-amber-600">💰 {team.balance.toLocaleString()}</div>
              </div>
            </>
          )}

          {/* Average Rating */}
          <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
            <span className="text-slate-400 text-[8px] uppercase tracking-wider font-bold block mb-1">Avg Rating</span>
            <div className="text-xl font-black text-amber-500">★ {teamData.avgRating.toFixed(1)}</div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="console-card bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden font-mono">
          <div className="flex border-b border-slate-100 p-2 bg-slate-50 gap-2">
            <button
              onClick={() => setActiveTab('players')}
              className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                activeTab === 'players'
                  ? 'bg-slate-800 text-white shadow-sm border border-slate-900'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/60'
              }`}
            >
              Players ({players.length})
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                activeTab === 'stats'
                  ? 'bg-slate-800 text-white shadow-sm border border-slate-900'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/60'
              }`}
            >
              Statistics
            </button>
          </div>

          <div className="p-5">
            {activeTab === 'players' ? (
              <div className="space-y-4">
                {/* Player Type Filter */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setPlayerFilter('all')}
                    className={`px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all ${
                      playerFilter === 'all'
                        ? 'bg-slate-800 text-white border border-slate-900'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/60'
                    }`}
                  >
                    All ({players.length})
                  </button>
                  <button
                    onClick={() => setPlayerFilter('real')}
                    className={`px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all ${
                      playerFilter === 'real'
                        ? 'bg-purple-600 text-white border border-purple-700'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/60'
                    }`}
                  >
                    Real ({realPlayers.length})
                  </button>
                  <button
                    onClick={() => setPlayerFilter('football')}
                    className={`px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all ${
                      playerFilter === 'football'
                        ? 'bg-blue-600 text-white border border-blue-700'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/60'
                    }`}
                  >
                    Football ({footballPlayers.length})
                  </button>
                </div>

                {/* Player Grid */}
                {(() => {
                  const filteredPlayers = 
                    playerFilter === 'all' ? players :
                    playerFilter === 'real' ? realPlayers : footballPlayers;
                  
                  return filteredPlayers.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredPlayers.map((player) => {
                        const CardWrapper = player.is_real_player ? Link : 'div';
                        const cardProps = player.is_real_player 
                          ? { href: `/dashboard/players/${player.id}` }
                          : {};
                        
                        return (
                          <CardWrapper
                            key={player.id}
                            {...cardProps}
                            className={`console-card bg-white border border-slate-200/60 rounded-2xl p-5 hover:border-amber-400/40 hover:shadow-md transition-all duration-200 flex flex-col justify-between ${
                              player.is_real_player ? 'cursor-pointer' : ''
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-slate-800 text-sm truncate uppercase tracking-wide">
                                  {player.name}
                                </h3>
                                {player.is_real_player ? (
                                  <span className="px-2.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200/40 text-[9px] font-bold rounded-full uppercase tracking-wider">
                                    Real
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200/40 text-[9px] font-bold rounded-full uppercase tracking-wider">
                                    Football
                                  </span>
                                )}
                              </div>
                              
                              <div className="space-y-2 text-[10px] uppercase font-bold tracking-wider text-slate-700">
                                <div className="flex items-center justify-between bg-slate-50 border border-slate-100 p-2 rounded-xl">
                                  <span className="text-slate-400 text-[8px]">Position</span>
                                  <span className={`px-2 py-0.5 rounded font-extrabold ${getPositionColor(player.position)}`}>
                                    {player.position}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between bg-slate-50 border border-slate-100 p-2 rounded-xl">
                                  <span className="text-slate-400 text-[8px]">Rating</span>
                                  <span className="text-amber-500 font-extrabold">
                                    ★ {player.rating.toFixed(1)}
                                  </span>
                                </div>
                                {player.category && (
                                  <div className="flex items-center justify-between bg-slate-50 border border-slate-100 p-2 rounded-xl">
                                    <span className="text-slate-400 text-[8px]">Category</span>
                                    <span className="text-purple-600 font-extrabold">
                                      {player.category}
                                    </span>
                                  </div>
                                )}
                                {player.value !== undefined && player.value > 0 && (
                                  <div className="flex items-center justify-between bg-slate-50 border border-slate-100 p-2 rounded-xl">
                                    <span className="text-slate-400 text-[8px]">Value</span>
                                    <span className="text-emerald-600 font-extrabold">
                                      {player.is_real_player ? '$' : '€'} {player.value.toLocaleString()}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardWrapper>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-16">
                      <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      <h3 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-1">No Players</h3>
                      <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">No players found in this category</p>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="space-y-6">
                {loadingStats ? (
                  <div className="text-center py-16">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto mb-4"></div>
                    <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Loading statistics...</p>
                  </div>
                ) : (
                  <>
                    {/* Overall Stats */}
                    {overallStats ? (
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center mb-4">
                          <svg className="w-4 h-4 mr-2 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          Overall Season Statistics
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 text-[10px] uppercase font-bold tracking-wider text-center">
                          <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
                            <div className="text-2xl font-black text-slate-700 mb-1">{overallStats.matches_played}</div>
                            <div className="text-slate-400 text-[8px] tracking-wide">Matches</div>
                          </div>
                          <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
                            <div className="text-2xl font-black text-green-600 mb-1">{overallStats.wins}</div>
                            <div className="text-slate-400 text-[8px] tracking-wide">Wins</div>
                          </div>
                          <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
                            <div className="text-2xl font-black text-yellow-600 mb-1">{overallStats.draws}</div>
                            <div className="text-slate-400 text-[8px] tracking-wide">Draws</div>
                          </div>
                          <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
                            <div className="text-2xl font-black text-red-600 mb-1">{overallStats.losses}</div>
                            <div className="text-slate-400 text-[8px] tracking-wide">Losses</div>
                          </div>
                          <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
                            <div className="text-2xl font-black text-purple-600 mb-1">{overallStats.points}</div>
                            <div className="text-slate-400 text-[8px] tracking-wide">Points</div>
                          </div>
                          <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
                            <div className="text-2xl font-black text-indigo-600 mb-1">{overallStats.win_rate}%</div>
                            <div className="text-slate-400 text-[8px] tracking-wide">Win Rate</div>
                          </div>
                        </div>

                        {/* Goals Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-[10px] uppercase font-bold tracking-wider text-center mt-4">
                          <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
                            <div className="text-xl font-black text-emerald-600 mb-1">{overallStats.goals_scored}</div>
                            <div className="text-slate-400 text-[8px] tracking-wide">Goals Scored</div>
                          </div>
                          <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
                            <div className="text-xl font-black text-rose-600 mb-1">{overallStats.goals_conceded}</div>
                            <div className="text-slate-400 text-[8px] tracking-wide">Goals Conceded</div>
                          </div>
                          <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
                            <div className={`text-xl font-black mb-1 ${overallStats.goal_difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {overallStats.goal_difference >= 0 ? '+' : ''}{overallStats.goal_difference}
                            </div>
                            <div className="text-slate-400 text-[8px] tracking-wide">Goal Difference</div>
                          </div>
                          <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
                            <div className="text-xl font-black text-teal-600 mb-1">{overallStats.goals_per_game}</div>
                            <div className="text-slate-400 text-[8px] tracking-wide">Goals/Game</div>
                          </div>
                          <div className="console-card bg-white rounded-xl p-4 border border-slate-200/60">
                            <div className="text-xl font-black text-cyan-600 mb-1">{overallStats.clean_sheets}</div>
                            <div className="text-slate-400 text-[8px] tracking-wide">Clean Sheets</div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* Tournament Breakdown */}
                    {tournamentStats.length > 0 ? (
                      <div className="space-y-4 pt-6">
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center">
                          <svg className="w-4 h-4 mr-2 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                          Tournament Statistics
                        </h3>
                        <div className="space-y-4">
                          {tournamentStats.map((stat) => (
                            <div key={stat.tournament_id} className="console-card bg-white rounded-2xl p-5 border border-slate-200/60 hover:border-amber-400/40 transition-all duration-200">
                              <div className="flex items-center justify-between mb-4">
                                <div>
                                  <h4 className="text-base font-bold text-slate-800 uppercase tracking-wide">{stat.tournament_name}</h4>
                                  <span className="inline-block px-2.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200/40 text-[9px] font-bold rounded-full mt-1 uppercase tracking-wider">
                                    {stat.tournament_type}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <div className="text-2xl font-black text-blue-600">{stat.points}</div>
                                  <div className="text-[8px] uppercase tracking-wider font-bold text-slate-400">Points</div>
                                </div>
                              </div>

                              <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-[10px] font-bold uppercase tracking-wider text-center">
                                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                                  <div className="text-slate-800 font-extrabold">{stat.matches_played}</div>
                                  <div className="text-slate-400 text-[8px]">Played</div>
                                </div>
                                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                                  <div className="text-green-600 font-extrabold">{stat.wins}</div>
                                  <div className="text-slate-400 text-[8px]">Wins</div>
                                </div>
                                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                                  <div className="text-yellow-600 font-extrabold">{stat.draws}</div>
                                  <div className="text-slate-400 text-[8px]">Draws</div>
                                </div>
                                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                                  <div className="text-red-600 font-extrabold">{stat.losses}</div>
                                  <div className="text-slate-400 text-[8px]">Losses</div>
                                </div>
                                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                                  <div className="text-emerald-600 font-extrabold">{stat.goals_scored}</div>
                                  <div className="text-slate-400 text-[8px]">GF</div>
                                </div>
                                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                                  <div className="text-rose-600 font-extrabold">{stat.goals_conceded}</div>
                                  <div className="text-slate-400 text-[8px]">GA</div>
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-100 text-[10px] font-bold uppercase tracking-wider text-center">
                                <div>
                                  <div className={`font-extrabold ${stat.goal_difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {stat.goal_difference >= 0 ? '+' : ''}{stat.goal_difference}
                                  </div>
                                  <div className="text-slate-400 text-[8px]">GD</div>
                                </div>
                                <div>
                                  <div className="text-indigo-600 font-extrabold">{stat.win_rate}%</div>
                                  <div className="text-slate-400 text-[8px]">Win Rate</div>
                                </div>
                                <div>
                                  <div className="text-cyan-600 font-extrabold">{stat.clean_sheets}</div>
                                  <div className="text-slate-400 text-[8px]">Clean Sheets</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      !overallStats && (
                        <div className="text-center py-16">
                          <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          <h3 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-1">No Statistics</h3>
                          <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">This team hasn't played any matches yet this season</p>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
