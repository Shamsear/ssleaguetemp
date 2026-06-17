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
  Briefcase,
  Sparkles,
  AlertCircle
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
          setSeasonStats(prev => ({
            ...prev,
            totalRounds: 0,
            totalBids: 0,
          }));
        }
      } else {
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

  const formatDate = (date?: any) => {
    if (!date) return 'N/A';
    const parsedDate = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    return parsedDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDateTime = (date?: any) => {
    if (!date) return 'N/A';
    const parsedDate = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    return parsedDate.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading || loadingSeason || teamStatsLoading || playerStatsLoading) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-500 font-mono text-xs tracking-widest uppercase animate-pulse">Fetching Season telemetry...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  if (error || !season) {
    return (
      <div className="flex items-center justify-center pt-32 p-4">
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-8 max-w-md w-full text-center space-y-6 shadow-sm">
          <div className="w-16 h-16 mx-auto rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-rose-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800">Season Context Missing</h2>
            <p className="text-xs text-slate-505 font-mono">{error || 'The requested season could not be loaded.'}</p>
          </div>
          <button
            onClick={() => router.push('/dashboard/superadmin/seasons')}
            className="w-full py-2.5 bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-700 text-xs font-mono font-bold rounded-xl transition-all shadow-sm inline-flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Seasons
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in font-mono">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/60">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/superadmin/seasons')}
            className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-600 hover:text-slate-950 transition-all flex-shrink-0 shadow-sm"
            title="Back to Seasons"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {season.name} Details
            </h1>
            <p className="text-xs text-slate-505 font-mono mt-1 flex items-center gap-2 flex-wrap">
              Telemetry stats, registered team rosters, and active draft records.
              {season.isActive && (
                <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9px] font-mono font-bold uppercase animate-pulse">
                  Active Context
                </span>
              )}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => alert('Player stats feature - To be implemented')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            <Award className="w-4 h-4" />
            Award Management
          </button>
        </div>
      </div>

      {/* Season Metadata Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono">
        
        {/* Year */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
            <Calendar className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <div className="text-[10px] font-mono font-semibold text-slate-450 uppercase tracking-wider">Tournament Year</div>
            <div className="text-lg font-extrabold text-slate-800 mt-0.5">{season.year}</div>
          </div>
        </div>

        {/* Created At */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-[10px] font-mono font-semibold text-slate-450 uppercase tracking-wider">Initialization Date</div>
            <div className="text-lg font-extrabold text-slate-800 mt-0.5 font-mono">{formatDate(season.createdAt)}</div>
          </div>
        </div>

        {/* Last Updated */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-center flex-shrink-0">
            <Activity className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <div className="text-[10px] font-mono font-semibold text-slate-450 uppercase tracking-wider">Last Sync Time</div>
            <div className="text-lg font-extrabold text-slate-800 mt-0.5 font-mono">{formatDate(season.updatedAt)}</div>
          </div>
        </div>

      </div>

      {/* Live Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono">
        
        {/* Teams count */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono font-semibold text-slate-450 uppercase tracking-wider">Total Registered Teams</div>
            <div className="text-2xl font-extrabold text-slate-800 mt-1">{seasonStats.totalTeams}</div>
          </div>
          <Users className="w-8 h-8 text-amber-500/30" />
        </div>

        {/* Players count */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono font-semibold text-slate-450 uppercase tracking-wider">Total Roster Players</div>
            <div className="text-2xl font-extrabold text-slate-800 mt-1">{seasonStats.totalPlayers}</div>
          </div>
          <UserCheck className="w-8 h-8 text-emerald-500/30" />
        </div>

      </div>

      {/* Teams stand-in Standings Table */}
      <div className="console-card bg-white border border-slate-200/60 shadow-sm rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/60 bg-slate-50/50">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-slate-500" />
            Registered Teams ({teams.length})
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200/60">
            <thead className="bg-slate-50/50">
              <tr className="font-mono text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3.5">Team Name</th>
                <th className="px-6 py-3.5">Owner</th>
                <th className="px-6 py-3.5 text-center">Points</th>
                <th className="px-6 py-3.5 text-right">Matches Played</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 text-xs text-slate-700">
              {teams.length > 0 ? (
                teams.map((team) => (
                  <tr key={team.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800">
                      {team.team_name || team.name || 'Unknown Team'}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-500">
                      {team.owner_name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-amber-600 text-center">
                      {team.stats?.p || team.stats?.points || 0}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-500 text-right">
                      {team.stats?.mp || team.stats?.matches_played || 0}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-mono">
                    No team standings database allocated for this season.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rounds Table (Multi-currency only) */}
      {season.type === 'multi' && rounds.length > 0 && (
        <div className="console-card bg-white border border-slate-200/60 shadow-sm rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/60 bg-slate-50/50">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-500" />
              Active Draft Rounds ({rounds.length})
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200/60">
              <thead className="bg-slate-50/50">
                <tr className="font-mono text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3.5">Round</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-center">Bids Count</th>
                  <th className="px-6 py-3.5 text-right">End Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 text-xs text-slate-700">
                {rounds.map((round: any) => (
                  <tr key={round.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800">
                      Round {round.round_number || round.position}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase border rounded ${
                        round.status === 'active' 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-250' 
                          : round.status === 'completed'
                          ? 'bg-slate-100 text-slate-650 border-slate-200'
                          : 'bg-amber-50 text-amber-705 border-amber-200'
                      }`}>
                        {round.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-amber-600 text-center">
                      {round.bidCount || 0}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-550 text-right">
                      {round.end_time ? formatDateTime(round.end_time) : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Bids Section (Multi-currency only) */}
      {season.type === 'multi' && topBids.length > 0 && (
        <div className="console-card bg-white border border-slate-200/60 shadow-sm rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/60 bg-slate-50/50">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Coins className="w-4 h-4 text-slate-500" />
              Top Bid Placements
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200/60">
              <thead className="bg-slate-50/50">
                <tr className="font-mono text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3.5">Player</th>
                  <th className="px-6 py-3.5">Position</th>
                  <th className="px-6 py-3.5">Assigned Team</th>
                  <th className="px-6 py-3.5 text-center">Amount</th>
                  <th className="px-6 py-3.5 text-right">Draft Round</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 text-xs text-slate-700">
                {topBids.map((bid: any, index: number) => (
                  <tr key={index} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800">
                      {bid.player_name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-500">
                      {bid.player_position || 'N/A'}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-500">
                      {bid.player_team || 'N/A'}
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-emerald-700 text-center">
                      €{bid.amount?.toLocaleString() || 0}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-500 text-right">
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
  );
}
