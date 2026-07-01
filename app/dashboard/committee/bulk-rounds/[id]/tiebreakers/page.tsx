'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { useWebSocket } from '@/hooks/useWebSocket';
import { ArrowLeft, Clock, DollarSign, Users, Check, Calendar, ChevronRight, Info, Sparkles, Plus, Play, Layers, Settings, RefreshCw, AlertTriangle, CheckCircle, XCircle, BarChart2 } from 'lucide-react';

interface Tiebreaker {
  id: string;
  round_id: string;
  player_id: string;
  player_name: string;
  position: string;
  original_amount: number;
  status: string;
  teams_count: number;
  submitted_count: number;
  created_at: string;
  teams: TiebreakerTeam[];
  current_highest_team_id?: string | null;
}

interface TiebreakerTeam {
  team_id: string;
  team_name: string;
  bid_amount?: number;
  submitted_at?: string;
  status: string;
}

interface BulkRound {
  id: number;
  round_number: number;
  status: string;
  base_price: number;
}

interface ContestedPlayer {
  player_id: string;
  player_name: string;
  position: string;
  bid_count: number;
  status: string;
}

export default function BulkRoundTiebreakersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const roundId = params?.id as string;

  const [bulkRound, setBulkRound] = useState<BulkRound | null>(null);
  const [tiebreakers, setTiebreakers] = useState<Tiebreaker[]>([]);
  const [contestedPlayers, setContestedPlayers] = useState<ContestedPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedTiebreakers, setExpandedTiebreakers] = useState<Set<string>>(new Set());
  const [resolvingTiebreaker, setResolvingTiebreaker] = useState<string | null>(null);
  const [creatingTiebreaker, setCreatingTiebreaker] = useState<string | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch round and tiebreakers
  const fetchData = useCallback(async () => {
    if (!roundId) return;

    setIsLoading(true);
    try {
      // Fetch round details from bulk-rounds API
      const roundResponse = await fetchWithTokenRefresh(`/api/bulk-rounds/${roundId}`);
      const roundResult = await roundResponse.json();
      
      if (roundResult.success && roundResult.data) {
        const roundData = roundResult.data;
        setBulkRound({
          id: roundData.id,
          round_number: roundData.round_number,
          status: roundData.status,
          base_price: roundData.base_price,
        });
        if (roundData.season_id) {
          setSeasonId(roundData.season_id);
        }
      }

      // Fetch tiebreakers for this round
      const tiebreakerResponse = await fetchWithTokenRefresh(`/api/admin/bulk-rounds/${roundId}/tiebreakers`);
      const tiebreakerResult = await tiebreakerResponse.json();
      
      if (tiebreakerResult.success && tiebreakerResult.data) {
        setTiebreakers(tiebreakerResult.data);
        console.log(`<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Loaded ${tiebreakerResult.data.length} tiebreakers`);
      } else {
        console.error('<XCircle className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> Failed to load tiebreakers:', tiebreakerResult.error);
        setTiebreakers([]);
      }
      
      // Fetch contested players (pending tiebreaker creation)
      const contestedResponse = await fetchWithTokenRefresh(`/api/bulk-rounds/${roundId}`);
      const contestedResult = await contestedResponse.json();
      
      if (contestedResult.success && contestedResult.data) {
        const roundData = contestedResult.data;
        // Filter players with status 'contested' and no tiebreaker_id
        const pending = (roundData.players || []).filter((p: any) => 
          p.status === 'contested' && p.bid_count > 1 && !p.tiebreaker_id
        );
        setContestedPlayers(pending);
        console.log(`<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Found ${pending.length} contested players needing tiebreakers`);
      }
    } catch (err) {
      console.error('<XCircle className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> Error fetching data:', err);
      setTiebreakers([]);
    } finally {
      setIsLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // WebSocket for live updates - listen to the round channel where tiebreaker events are broadcast
  const { isConnected } = useWebSocket({
    channel: seasonId && roundId ? `updates/${seasonId}/rounds/${roundId}` : '',
    enabled: !!seasonId && !!roundId,
    onMessage: useCallback((message: any) => {
      console.log('⚡ [Tiebreaker WS] Real-time update:', message);
      
      const messageType = typeof message === 'string' ? message : message.type;
      
      switch (messageType) {
        case 'tiebreaker_created':
          // New tiebreaker created - refresh full data
          console.log('🎯 Tiebreaker created, refreshing data...');
          fetchData();
          break;
          
        case 'tiebreaker_bid':
        case 'bid_placed':
          // Team placed a bid - update bid amount
          if (message.data?.team_id && message.data?.bid_amount) {
            const { team_id, bid_amount, tiebreaker_id } = message.data;
            console.log(`<DollarSign className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Bid placed: £${bid_amount} by team ${team_id}`);
            setTiebreakers(prev => prev.map(tb => {
              if (tb.id !== tiebreaker_id) return tb;
              return {
                ...tb,
                teams: tb.teams.map(t => 
                  t.team_id === team_id 
                    ? { ...t, bid_amount, submitted_at: new Date().toISOString(), status: 'submitted' } 
                    : t
                ),
                submitted_count: tb.teams.filter(t => t.team_id === team_id || t.status === 'submitted').length,
              };
            }));
          }
          break;
          
        case 'tiebreaker_resolved':
        case 'tiebreaker_finalized':
          // Tiebreaker resolved - refresh full data
          console.log('<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Tiebreaker resolved, refreshing data...');
          fetchData();
          break;
          
        case 'team_withdrew':
          // Team withdrew from tiebreaker - refresh data
          console.log('🚪 Team withdrew, refreshing data...');
          fetchData();
          break;
          
        default:
          // Handle legacy format
          if (message.team_id && message.bid_amount) {
            setTiebreakers(prev => prev.map(tb => {
              const teamInTiebreaker = tb.teams.find(t => t.team_id === message.team_id);
              if (!teamInTiebreaker) return tb;
              return {
                ...tb,
                teams: tb.teams.map(t => 
                  t.team_id === message.team_id 
                    ? { ...t, bid_amount: message.bid_amount, submitted_at: new Date().toISOString() } 
                    : t
                ),
              };
            }));
          }
      }
    }, [fetchData]),
  });

  const toggleTiebreaker = (tiebreakerId: string) => {
    const newExpanded = new Set(expandedTiebreakers);
    if (newExpanded.has(tiebreakerId)) {
      newExpanded.delete(tiebreakerId);
    } else {
      newExpanded.add(tiebreakerId);
    }
    setExpandedTiebreakers(newExpanded);
  };

  const handleResolveTiebreaker = async (tiebreakerId: string, playerName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to resolve the tiebreaker for ${playerName}? This will assign the player to the highest bidder and cannot be undone.`
    );

    if (!confirmed) return;

    setResolvingTiebreaker(tiebreakerId);
    try {
      const response = await fetchWithTokenRefresh(`/api/admin/bulk-tiebreakers/${tiebreakerId}/finalize`, {
        method: 'POST',
      });
      const result = await response.json();

      if (result.success) {
        alert(`<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Tiebreaker resolved successfully! ${playerName} has been assigned to the winning team.`);
        // Refresh data instead of reloading page
        await fetchData();
      } else {
        alert(`<XCircle className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> Failed to resolve tiebreaker: ${result.error}`);
      }
    } catch (err) {
      console.error('Error resolving tiebreaker:', err);
      alert('[ERROR]  An error occurred while resolving the tiebreaker');
    } finally {
      setResolvingTiebreaker(null);
    }
  };

  const handleRefreshStatus = async () => {
    await fetchData();
    alert('[SUCCESS]  Status refreshed successfully');
  };
  
  const handleCreateTiebreaker = async (playerId: string, playerName: string) => {
    const confirmed = window.confirm(
      `Create tiebreaker for ${playerName}? This will start a Last Person Standing auction for all teams who bid on this player.`
    );
    
    if (!confirmed) return;
    
    setCreatingTiebreaker(playerId);
    try {
      const response = await fetchWithTokenRefresh(`/api/admin/bulk-rounds/${roundId}/create-tiebreaker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId }),
      });
      const result = await response.json();
      
      if (result.success) {
        alert(`<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Tiebreaker created successfully for ${playerName}!`);
        // Refresh data instead of reloading page
        await fetchData();
      } else {
        alert(`<XCircle className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> Failed to create tiebreaker: ${result.error}`);
      }
    } catch (err) {
      console.error('Error creating tiebreaker:', err);
      alert('[ERROR]  An error occurred while creating the tiebreaker');
    } finally {
      setCreatingTiebreaker(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-700';
      case 'active': return 'bg-yellow-100 text-yellow-700';
      case 'completed': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getTeamStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-600';
      case 'submitted': return 'bg-blue-100 text-blue-700';
      case 'won': return 'bg-green-100 text-green-700';
      case 'lost': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const filteredTiebreakers = tiebreakers.filter(tb => {
    if (filterStatus === 'all') return true;
    return tb.status === filterStatus;
  });

  // Debug: Log all tiebreaker statuses
  console.log('<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Tiebreaker statuses:', tiebreakers.map(tb => ({ id: tb.id, status: tb.status, player: tb.player_name })));

  const tiebreakerStats = {
    total: tiebreakers.length,
    active: tiebreakers.filter(tb => 
      tb.status === 'active' || 
      tb.status === 'ongoing' || 
      tb.status === 'in_progress'
    ).length,
    pending: tiebreakers.filter(tb => tb.status === 'pending').length,
    completed: tiebreakers.filter(tb => 
      tb.status === 'resolved' || 
      tb.status === 'finalized' || 
      tb.status === 'completed'
    ).length,
  };

  if (loading || !user || user.role !== 'committee_admin' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono font-mono">Loading tiebreakers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Navigation */}
        <div>
          <Link
            href={`/dashboard/committee/bulk-rounds/${roundId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Bulk Round
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Layers className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">SYSTEM CONTROL</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Bulk Round {bulkRound?.round_number} - Tiebreakers
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Manage tiebreakers for players with multiple bids.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* WebSocket Status */}
            <span className={`inline-flex items-center px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase font-mono shadow-sm ${
              isConnected 
                ? 'bg-green-50 border-green-200 text-green-800' 
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${
                isConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-400'
              }`}></span>
              {isConnected ? 'Live Sync' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Info Card */}
        <div className="console-card bg-amber-50 border border-amber-200 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row items-start gap-4">
          <div className="p-2 rounded-lg bg-amber-100 text-amber-600 flex-shrink-0">
            <Info className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-amber-900 mb-1">About Tiebreakers</h3>
            <p className="text-xs text-amber-700 font-mono leading-relaxed">
              When multiple teams bid on the same player at the base price, a tiebreaker auction is created. 
              Teams must submit higher bids to win the player. The highest bid wins the player.
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm border-l-4 border-l-slate-400 flex justify-between items-center">
            <div>
              <span className="text-[10px] text-slate-405 font-bold uppercase tracking-wider font-mono">STATS</span>
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-800 mt-0.5">Total</h3>
            </div>
            <span className="bg-slate-100 border border-slate-200 text-slate-700 text-base sm:text-lg font-extrabold px-3 py-0.5 rounded-xl font-mono">
              {tiebreakerStats.total}
            </span>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm border-l-4 border-l-yellow-500 flex justify-between items-center">
            <div>
              <span className="text-[10px] text-yellow-650 font-bold uppercase tracking-wider font-mono">STATS</span>
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-800 mt-0.5">Active</h3>
            </div>
            <span className="bg-yellow-50 border border-yellow-200 text-yellow-700 text-base sm:text-lg font-extrabold px-3 py-0.5 rounded-xl font-mono">
              {tiebreakerStats.active}
            </span>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm border-l-4 border-l-slate-500 flex justify-between items-center">
            <div>
              <span className="text-[10px] text-slate-405 font-bold uppercase tracking-wider font-mono">STATS</span>
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-805 mt-0.5">Pending</h3>
            </div>
            <span className="bg-slate-50 border border-slate-200 text-slate-600 text-base sm:text-lg font-extrabold px-3 py-0.5 rounded-xl font-mono">
              {tiebreakerStats.pending}
            </span>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm border-l-4 border-l-green-500 flex justify-between items-center">
            <div>
              <span className="text-[10px] text-green-700 font-bold uppercase tracking-wider font-mono">STATS</span>
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-805 mt-0.5">Completed</h3>
            </div>
            <span className="bg-green-50 border border-green-200 text-green-700 text-base sm:text-lg font-extrabold px-3 py-0.5 rounded-xl font-mono">
              {tiebreakerStats.completed}
            </span>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mr-2">Filter by Status:</span>
            {['all', 'pending', 'active', 'completed'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all duration-200 border cursor-pointer ${
                  filterStatus === status
                    ? 'bg-slate-800 border-slate-900 text-white shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <button
            onClick={handleRefreshStatus}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-blue-500/20"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-100 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </div>

        {/* Pending Tiebreakers (Not Yet Created) */}
        {contestedPlayers.length > 0 && (
          <div className="console-card bg-orange-50 border border-orange-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
            <h2 className="text-sm sm:text-base font-extrabold uppercase text-orange-900 tracking-wide flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Pending Tiebreakers ({contestedPlayers.length})
            </h2>
            <p className="text-xs text-orange-800 font-mono leading-relaxed">
              These players have multiple bids and need tiebreaker auctions to be created:
            </p>
            <div className="space-y-3 max-w-4xl">
              {contestedPlayers.map((player) => (
                <div
                  key={player.player_id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-white rounded-2xl border border-orange-200 shadow-sm"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2.5 mb-1">
                      <p className="font-extrabold text-slate-805 text-sm sm:text-base">{player.player_name}</p>
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-mono font-bold uppercase">
                        {player.position}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      {player.bid_count} teams bidding
                    </div>
                  </div>
                  <button
                    onClick={() => handleCreateTiebreaker(player.player_id, player.player_name)}
                    disabled={creatingTiebreaker === player.player_id}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl transition-all font-mono text-xs uppercase tracking-wider font-bold shadow-sm cursor-pointer"
                  >
                    {creatingTiebreaker === player.player_id ? 'Creating...' : 'Create Tiebreaker'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Tiebreakers List */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            <h2 className="text-sm sm:text-base font-extrabold uppercase text-slate-900 tracking-wide flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-500" />
              Active Tiebreakers
            </h2>
            <span className="bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-mono px-2.5 py-1 rounded-full uppercase tracking-wider font-bold">
              {filteredTiebreakers.length} total
            </span>
          </div>

          {filteredTiebreakers.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <Layers className="w-10 h-10 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-400 font-mono text-sm font-bold uppercase tracking-wider">No tiebreakers found</p>
              <p className="text-slate-500 text-xs font-mono mt-1">
                {filterStatus === 'all'
                  ? 'Tiebreakers will appear here when multiple teams bid on the same player.'
                  : `No ${filterStatus} tiebreakers at this time.`}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTiebreakers.map((tiebreaker) => {
                const isExpanded = expandedTiebreakers.has(tiebreaker.id);
                const highestBid = Math.max(...tiebreaker.teams.filter(t => t.bid_amount).map(t => t.bid_amount!), 0);

                return (
                  <div
                    key={tiebreaker.id}
                    className="bg-slate-50/40 border border-slate-200 rounded-2xl overflow-hidden hover:shadow-sm transition-shadow"
                  >
                    {/* Tiebreaker Header */}
                    <button
                      onClick={() => toggleTiebreaker(tiebreaker.id)}
                      className="w-full p-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <ChevronRight
                          className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
                            isExpanded ? 'rotate-90 text-amber-500' : ''
                          }`}
                        />
                        <div className="text-left font-mono">
                          <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                            <h3 className="font-extrabold text-slate-805 text-sm sm:text-base group-hover:text-amber-600">{tiebreaker.player_name}</h3>
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-mono font-bold uppercase">
                              {tiebreaker.position}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getStatusColor(tiebreaker.status)}`}>
                              {tiebreaker.status}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span>Base: £{tiebreaker.original_amount}</span>
                            <span>•</span>
                            <span>{tiebreaker.teams_count} teams</span>
                            <span>•</span>
                            <span>{tiebreaker.submitted_count}/{tiebreaker.teams_count} submitted</span>
                            {highestBid > 0 && (
                              <>
                                <span>•</span>
                                <span className="font-bold text-green-700">Highest: £{highestBid}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-slate-405 font-mono hidden sm:inline">
                        {new Date(tiebreaker.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </button>

                    {/* Tiebreaker Details */}
                    {isExpanded && (
                      <div className="border-t border-slate-200/60 bg-white p-5 space-y-4 font-mono">
                        <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Team Bids</h4>
                        <div className="space-y-2 max-w-3xl">
                          {tiebreaker.teams
                            .sort((a, b) => (b.bid_amount || 0) - (a.bid_amount || 0))
                            .map((team) => (
                              <div
                                key={team.team_id}
                                className={`flex items-center justify-between p-3.5 rounded-xl border ${
                                  team.status === 'won'
                                    ? 'bg-green-50 border-green-300'
                                    : 'bg-slate-50/50 border-slate-200'
                                }`}
                              >
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-bold text-slate-850 text-sm">{team.team_name}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getTeamStatusColor(team.status)}`}>
                                      {team.status}
                                    </span>
                                  </div>
                                  {team.submitted_at && (
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      Submitted: {new Date(team.submitted_at).toLocaleTimeString()}
                                    </span>
                                  )}
                                </div>
                                <div className="text-right">
                                  {team.bid_amount ? (
                                    <div className="text-base font-extrabold text-slate-850 font-mono">£{team.bid_amount}</div>
                                  ) : (
                                    <div className="text-xs text-slate-400 italic">No bid yet</div>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>

                        {/* Action Buttons */}
                        <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                          <button
                            onClick={() => handleResolveTiebreaker(tiebreaker.id, tiebreaker.player_name)}
                            disabled={resolvingTiebreaker === tiebreaker.id || tiebreaker.status === 'resolved' || tiebreaker.status === 'finalized' || !tiebreaker.current_highest_team_id}
                            className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl transition-all font-mono text-xs uppercase tracking-wider font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-green-500/20"
                          >
                            {resolvingTiebreaker === tiebreaker.id ? 'Resolving...' : tiebreaker.status === 'resolved' ? 'Already Resolved' : 'Resolve Tiebreaker'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
