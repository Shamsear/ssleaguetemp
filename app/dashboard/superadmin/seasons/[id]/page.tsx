'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getSeasonById } from '@/lib/firebase/seasons';
import { Season } from '@/types/season';
import { usePlayerStats, useTeamStats } from '@/hooks';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { 
  ArrowLeft, 
  Calendar, 
  Users, 
  Clock, 
  Activity, 
  TrendingUp, 
  Coins, 
  Award, 
  Info, 
  UserCheck, 
  Layers, 
  DollarSign,
  Briefcase
} from 'lucide-react';

export default function SeasonDetails() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const seasonId = params.id as string;
  
  const [season, setSeason] = useState<Season | null>(null);
  const [loadingSeason, setLoadingSeason] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real data states
  const [seasonStats, setSeasonStats] = useState({
    totalTeams: 0,
    totalPlayers: 0,
    totalRounds: 0,
    totalBids: 0,
  });

  const [teams, setTeams] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [topBids, setTopBids] = useState<any[]>([]);
  
  // Use React Query hooks for stats from Neon
  const { data: teamStatsData, isLoading: teamStatsLoading } = useTeamStats({
    seasonId: seasonId || ''
  });
  
  const { data: playerStatsData, isLoading: playerStatsLoading } = usePlayerStats({
    seasonId: seasonId || ''
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && user.role === 'super_admin' && seasonId) {
      fetchSeasonData();
    }
  }, [user, seasonId]);

  useEffect(() => {
    if (teamStatsData && playerStatsData) {
      // Update season stats
      setSeasonStats(prev => ({
        ...prev,
        totalTeams: teamStatsData.length,
        totalPlayers: playerStatsData.length
      }));
    }
    if (teamStatsData) {
      setTeams(teamStatsData);
    }
    if (playerStatsData) {
      setPlayers(playerStatsData);
    }
  }, [teamStatsData, playerStatsData]);

  const fetchSeasonData = async () => {
    try {
      setLoadingSeason(true);
      
      // Fetch season details
      const seasonData = await getSeasonById(seasonId);
      if (!seasonData) {
        throw new Error('Season not found');
      }
      setSeason(seasonData);
      
      // For multi-season types (season 16+), fetch auction data from Neon
      if (seasonData.type === 'multi') {
        try {
          const auctionResponse = await fetchWithTokenRefresh(`/api/seasons/${seasonId}/auction-data`);
          if (auctionResponse.ok) {
            const auctionData = await auctionResponse.json();
            if (auctionData.success) {
              setRounds(auctionData.data.rounds || []);
              setTopBids(auctionData.data.topBids || []);
            }
          }
        } catch (auctionError) {
          console.error('Failed to fetch auction data:', auctionError);
          // Don't fail the whole page, just show without auction data
          setSeasonStats(prev => ({
            ...prev,
            totalRounds: 0,
            totalBids: 0,
          }));
        }
      } else {
        // For single-season types (historical), no auction data
        setSeasonStats(prev => ({
          ...prev,
          totalRounds: 0,
          totalBids: 0,
        }));
      }
      
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch season data');
      console.error('Error fetching season data:', err);
    } finally {
      setLoadingSeason(false);
    }
  };

  const formatDate = (date?: Date | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDateTime = (date?: Date | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading || loadingSeason || teamStatsLoading || playerStatsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-100 animate-pulse">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-slate-400 font-mono text-sm">Loading season details...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  if (error || !season) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Season Not Found</h2>
          <p className="text-gray-600 mb-6">{error || 'The requested season could not be found.'}</p>
          <button
            onClick={() => router.push('/dashboard/superadmin/seasons')}
            className="inline-flex items-center px-4 py-2 bg-[#9580FF] text-white rounded-xl hover:bg-[#9580FF]/90 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Seasons
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-6 sm:py-10 px-4 sm:px-6 bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-100 animate-fade-in font-sans">
      <div className="container mx-auto max-w-screen-2xl">
        
        {/* Page Header */}
        <header className="mb-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 border-b border-white/10 pb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard/superadmin/seasons')}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 transition-all duration-300 hover:scale-105"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shadow-inner hidden sm:flex">
                <Layers className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent mb-2">
                  {season.name} Details
                </h1>
                <p className="text-slate-400 text-sm font-mono flex items-center flex-wrap gap-2.5">
                  General telemetry and roster metrics for this season status:
                  {season.isActive ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                      Active Season
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-500/10 text-slate-400 border border-slate-500/20 rounded-full">
                      {season.status}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono">
            <button
              onClick={() => alert('Player stats feature - To be implemented')}
              className="inline-flex items-center px-4 py-2 border border-purple-500/20 text-xs font-bold uppercase tracking-wider rounded-xl text-purple-400 bg-purple-500/5 hover:bg-purple-500/10 transition-all duration-200"
            >
              <Award className="w-4 h-4 mr-2" />
              Player Stats & Awards
            </button>
            <button
              onClick={() => router.push('/dashboard/superadmin/seasons')}
              className="inline-flex items-center px-4 py-2 border border-white/10 text-xs font-bold uppercase tracking-wider rounded-xl text-slate-300 bg-white/5 hover:bg-white/10 transition-all duration-200"
            >
              Back to Seasons
            </button>
          </div>
        </header>

        {/* Season Info Card */}
        <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-xl mb-8">
          <div className="px-6 py-5 bg-white/5 border-b border-white/10">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <Info className="w-5 h-5 text-indigo-400" />
              Season Information
            </h2>
          </div>
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center md:border-r border-white/5 last:border-0 py-2">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3">
                  <Calendar className="w-6 h-6 text-blue-400" />
                </div>
                <dt className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">Year</dt>
                <dd className="text-xl font-black text-slate-200">{season.year}</dd>
              </div>
              <div className="text-center md:border-r border-white/5 last:border-0 py-2">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-3">
                  <Clock className="w-6 h-6 text-emerald-400" />
                </div>
                <dt className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">Created</dt>
                <dd className="text-xl font-black text-slate-200 font-mono">{formatDate(season.createdAt)}</dd>
              </div>
              <div className="text-center py-2">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-3">
                  <Activity className="w-6 h-6 text-purple-400" />
                </div>
                <dt className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">Last Updated</dt>
                <dd className="text-xl font-black text-slate-200 font-mono">{formatDate(season.updatedAt)}</dd>
              </div>
            </div>
          </div>
        </div>

        {/* Statistics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 font-mono">
          {/* Teams Stats */}
          <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-xl group hover:bg-white/10 transition-all duration-300">
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <Users className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <dt className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Teams</dt>
                  <dd className="text-3xl font-black text-slate-200 mt-1">{seasonStats.totalTeams}</dd>
                </div>
              </div>
            </div>
          </div>

          {/* Players Stats */}
          <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-xl group hover:bg-white/10 transition-all duration-300">
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <UserCheck className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <dt className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Registered Players</dt>
                  <dd className="text-3xl font-black text-slate-200 mt-1">{seasonStats.totalPlayers}</dd>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Teams Section */}
        <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-xl mb-8">
          <div className="px-6 py-4 bg-white/5 border-b border-white/10">
            <h3 className="text-md font-bold text-slate-200 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-indigo-400" />
              Registered Teams ({teams.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/5">
              <thead className="bg-white/5">
                <tr className="font-mono text-left text-xs font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-3.5">Team Name</th>
                  <th className="px-6 py-3.5">Owner</th>
                  <th className="px-6 py-3.5">Points</th>
                  <th className="px-6 py-3.5">Matches Played</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-slate-300">
                {teams.length > 0 ? (
                  teams.map((team) => (
                    <tr key={team.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-200">
                        {team.team_name || team.name || 'Unknown Team'}
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-400">
                        {team.owner_name || 'N/A'}
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-indigo-400">
                        {team.stats?.p || team.stats?.points || 0}
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-400">
                        {team.stats?.mp || team.stats?.matches_played || 0}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-slate-500 font-mono">
                      No team standings database allocated for this season.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rounds Section */}
        {season.type === 'multi' && rounds.length > 0 && (
          <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-xl mb-8">
            <div className="px-6 py-4 bg-white/5 border-b border-white/10">
              <h3 className="text-md font-bold text-slate-200 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
                Active Draft Rounds ({rounds.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/5">
                <thead className="bg-white/5">
                  <tr className="font-mono text-left text-xs font-bold uppercase tracking-wider text-slate-400">
                    <th className="px-6 py-3.5">Round</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Bids</th>
                    <th className="px-6 py-3.5">End Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm text-slate-300">
                  {rounds.map((round: any) => (
                    <tr key={round.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-200">
                        Round {round.round_number || round.position}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${
                          round.status === 'active' 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : round.status === 'completed'
                            ? 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {round.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-slate-200">
                        {round.bidCount || 0}
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-400">
                        {round.end_time ? formatDateTime(new Date(round.end_time)) : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Top Bids Section */}
        {season.type === 'multi' && topBids.length > 0 && (
          <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-xl mb-8">
            <div className="px-6 py-4 bg-white/5 border-b border-white/10">
              <h3 className="text-md font-bold text-slate-200 flex items-center gap-2">
                <Coins className="w-5 h-5 text-indigo-400" />
                Top Bid Placements
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/5">
                <thead className="bg-white/5">
                  <tr className="font-mono text-left text-xs font-bold uppercase tracking-wider text-slate-400">
                    <th className="px-6 py-3.5">Player</th>
                    <th className="px-6 py-3.5">Position</th>
                    <th className="px-6 py-3.5">Assigned Team</th>
                    <th className="px-6 py-3.5">Amount</th>
                    <th className="px-6 py-3.5">Draft Round</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm text-slate-300">
                  {topBids.map((bid: any, index: number) => (
                    <tr key={index} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-200">
                        {bid.player_name || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-400">
                        {bid.player_position || 'N/A'}
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-400">
                        {bid.player_team || 'N/A'}
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-emerald-400">
                        €{bid.amount?.toLocaleString() || 0}
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-400">
                        Round {bid.round_number || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
