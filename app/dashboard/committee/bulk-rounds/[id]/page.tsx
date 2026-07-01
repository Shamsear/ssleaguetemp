'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use, useCallback } from 'react';
import Link from 'next/link';
import { useWebSocket } from '@/hooks/useWebSocket';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { ArrowLeft, Clock, DollarSign, Users, Check, Calendar, ChevronRight, Info, Sparkles, Plus, Play, Layers, Settings, Download, RefreshCw, AlertTriangle, XCircle, CheckCircle, Trash2, Lock, Trophy, BarChart2 } from 'lucide-react';

interface BulkBid {
  player_id: string;
  player_name: string;
  team_id: string;
  team_name: string;
  position: string;
}

interface TiebreakerInfo {
  id: string;
  status: string;
  created_at: string;
  team_count: number;
  highest_bid?: number;
  highest_bidder?: string;
  submissions: Array<{
    team_id: string;
    team_name: string;
    new_bid_amount: number;
    submitted: string;
  }>;
}

interface RoundPlayer {
  id: number;
  player_id: string;
  player_name: string;
  position: string;
  position_group: string;
  base_price: number;
  status: string;
  winning_team_id?: string;
  winning_bid?: number;
  bid_count?: number;
  tiebreaker_id?: string;
  tiebreaker?: TiebreakerInfo;
}

interface TeamSummary {
  team_id: string;
  team_name: string;
  slots_needed: number;
  players_selected: number;
  bids_submitted: number;
}

interface Round {
  id: number;
  season_id: string;
  round_number: number;
  status: string;
  round_type: string;
  base_price: number;
  start_time?: string;
  end_time?: string;
  duration_seconds: number;
  created_at: string;
  roundPlayers?: RoundPlayer[];
  stats?: {
    total_players?: number;
    sold_count?: number;
    pending_count?: number;
    contested_count?: number;
  };
}

export default function BulkRoundManagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, firebaseUser, loading } = useAuth();
  const router = useRouter();
  const resolvedParams = use(params);
  const [round, setRound] = useState<Round | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddPlayers, setShowAddPlayers] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([]);
  const [showAddTime, setShowAddTime] = useState(false);
  const [minutesToAdd, setMinutesToAdd] = useState('5');
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const [expandedTiebreakers, setExpandedTiebreakers] = useState<Set<string>>(new Set());
  const [expandedBids, setExpandedBids] = useState<Set<string>>(new Set());
  const [playerBids, setPlayerBids] = useState<Map<string, any[]>>(new Map());
  const [loadingBids, setLoadingBids] = useState<Set<string>>(new Set());
  const [teamSummary, setTeamSummary] = useState<TeamSummary[]>([]);
  const [loadingTeamSummary, setLoadingTeamSummary] = useState(false);
  const [teamSummaryRefreshTrigger, setTeamSummaryRefreshTrigger] = useState(0);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Fetch round details
  const fetchRound = useCallback(async () => {
    setIsLoading(true);
    try {
      // Add show_all=true to see all players, not just ones with bids
      const response = await fetchWithTokenRefresh(`/api/bulk-rounds/${resolvedParams.id}?show_all=true&limit=100`);
      const { success, data } = await response.json();

      if (success) {
        setRound(data);
      }
    } catch (err) {
      console.error('Error fetching round:', err);
    } finally {
      setIsLoading(false);
    }
  }, [resolvedParams.id]);

  // Fetch team summary
  const fetchTeamSummary = useCallback(async () => {
    setLoadingTeamSummary(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/bulk-rounds/${resolvedParams.id}/team-summary`);
      const { success, data, error } = await response.json();

      console.log('[Team Summary] Response:', { success, data, error });

      if (success && data?.teams) {
        setTeamSummary(data.teams);
        console.log('[Team Summary] Loaded teams:', data.teams.length);
      } else {
        console.error('[Team Summary] Error:', error);
      }
    } catch (err) {
      console.error('[Team Summary] Fetch error:', err);
    } finally {
      setLoadingTeamSummary(false);
    }
  }, [resolvedParams.id]);

  // ⚡ Enable WebSocket for real-time round updates - NO PAGE REFRESH NEEDED!
  const { isConnected: isRoundConnected } = useWebSocket({
    channel: round?.season_id ? `updates/${round.season_id}/rounds/${resolvedParams.id}` : `round:${resolvedParams.id}`,
    enabled: true,
    onMessage: useCallback((message: any) => {
      console.log('⚡ [Committee WS] Real-time update:', message);
      
      // Handle both string messages and object messages
      const messageType = typeof message === 'string' ? message : message.type;
      
      // Handle different message types for instant UI updates
      switch (messageType) {
        case 'round_updated':
          // ⚡ INSTANT: Update round metadata (timer, status, etc.)
          console.log('<RefreshCw className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Updating round metadata...', message);
          setRound(prev => prev ? {
            ...prev,
            status: message.status || prev.status,
            start_time: message.start_time || prev.start_time,
            end_time: message.end_time || prev.end_time,
            duration_seconds: message.duration_seconds || prev.duration_seconds,
          } : null);
          break;
          
        case 'bid_added':
          // ⚡ INSTANT: Team placed a bid - update bid count
          const playerId = message.data?.player_id || message.player_id;
          const bidCount = message.data?.bid_count || message.bid_count;
          const teamId = message.data?.team_id || message.team_id;
          
          if (playerId) {
            console.log(`<DollarSign className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Bid added for player ${playerId}: ${bidCount} total bids, team: ${teamId}`);
            setRound(prev => {
              if (!prev?.roundPlayers) return prev;
              return {
                ...prev,
                roundPlayers: prev.roundPlayers.map(player => 
                  player.player_id === playerId
                    ? { ...player, bid_count: bidCount }
                    : player
                ),
              };
            });
            // Always refresh team summary when any bid is added
            console.log('<RefreshCw className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Refreshing team summary due to bid_added');
            setTeamSummaryRefreshTrigger(prev => prev + 1);
          }
          break;
          
        case 'bid_removed':
          // ⚡ INSTANT: Team removed a bid - update bid count
          const removedPlayerId = message.data?.player_id || message.player_id;
          const removedBidCount = message.data?.bid_count || message.bid_count;
          const removedTeamId = message.data?.team_id || message.team_id;
          
          if (removedPlayerId) {
            console.log(`<XCircle className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> Bid removed for player ${removedPlayerId}: ${removedBidCount} total bids, team: ${removedTeamId}`);
            setRound(prev => {
              if (!prev?.roundPlayers) return prev;
              return {
                ...prev,
                roundPlayers: prev.roundPlayers.map(player => 
                  player.player_id === removedPlayerId
                    ? { ...player, bid_count: removedBidCount }
                    : player
                ),
              };
            });
            // Always refresh team summary when any bid is removed
            console.log('<RefreshCw className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Refreshing team summary due to bid_removed');
            setTeamSummaryRefreshTrigger(prev => prev + 1);
          }
          break;
          
        case 'player_status_updated':
          // ⚡ INSTANT: Player status changed (sold, contested, etc.)
          if (message.data?.player_id) {
            console.log(`<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Player ${message.data.player_id} status: ${message.data.status}`);
            setRound(prev => {
              if (!prev?.roundPlayers) return prev;
              return {
                ...prev,
                roundPlayers: prev.roundPlayers.map(player => 
                  player.player_id === message.data.player_id
                    ? {
                        ...player,
                        status: message.data.status || player.status,
                        winning_team_id: message.data.winning_team_id,
                        winning_bid: message.data.winning_bid,
                        bid_count: message.data.bid_count ?? player.bid_count,
                        tiebreaker_id: message.data.tiebreaker_id || player.tiebreaker_id,
                      }
                    : player
                ),
              };
            });
          }
          break;
          
        case 'tiebreaker_created':
          // ⚡ INSTANT: Tiebreaker created for a player
          if (message.data?.player_id && message.data?.tiebreaker_id) {
            console.log(`🎯 Tiebreaker created: ${message.data.tiebreaker_id} for player ${message.data.player_id}`);
            setRound(prev => {
              if (!prev?.roundPlayers) return prev;
              return {
                ...prev,
                roundPlayers: prev.roundPlayers.map(player => 
                  player.player_id === message.data.player_id
                    ? {
                        ...player,
                        tiebreaker_id: message.data.tiebreaker_id,
                        status: 'contested',
                      }
                    : player
                ),
              };
            });
          }
          break;
          
        case 'round_started':
          // ⚡ INSTANT: Round started
          console.log('🚀 Round started!');
          setRound(prev => prev ? { ...prev, status: 'active', start_time: message.data?.start_time } : null);
          break;
          
        case 'round_completed':
          // ⚡ INSTANT: Round completed - refresh full data to show allocations
          console.log('<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Round completed! Refreshing data...');
          setRound(prev => prev ? { ...prev, status: 'completed' } : null);
          // Fetch full round data to show player allocations
          fetchRound();
          fetchTeamSummary();
          break;
          
        case 'tiebreaker_bid':
          // ⚡ INSTANT: Tiebreaker bid placed - update tiebreaker data
          if (message.data?.tiebreaker_id) {
            console.log(`🎯 Tiebreaker bid: £${message.data.bid_amount} by ${message.data.team_name}`);
            // Find the player with this tiebreaker and update it
            setRound(prev => {
              if (!prev?.roundPlayers) return prev;
              return {
                ...prev,
                roundPlayers: prev.roundPlayers.map(player => {
                  if (player.tiebreaker_id === message.data.tiebreaker_id && player.tiebreaker) {
                    // Update tiebreaker data
                    const newSubmissions = player.tiebreaker.submissions?.map(sub =>
                      sub.team_id === message.data.team_id
                        ? { ...sub, new_bid_amount: message.data.bid_amount, submitted: new Date().toISOString() }
                        : sub
                    ) || [];
                    
                    // If team not in submissions yet, add them
                    const teamExists = newSubmissions.some(s => s.team_id === message.data.team_id);
                    if (!teamExists) {
                      newSubmissions.push({
                        team_id: message.data.team_id,
                        team_name: message.data.team_name,
                        new_bid_amount: message.data.bid_amount,
                        submitted: new Date().toISOString(),
                      });
                    }
                    
                    // Update highest bid
                    const highestBid = Math.max(...newSubmissions.map(s => s.new_bid_amount));
                    const highestBidder = newSubmissions.find(s => s.new_bid_amount === highestBid)?.team_name;
                    
                    return {
                      ...player,
                      tiebreaker: {
                        ...player.tiebreaker,
                        highest_bid: highestBid,
                        highest_bidder: highestBidder,
                        submissions: newSubmissions,
                      },
                    };
                  }
                  return player;
                }),
              };
            });
          }
          break;
      }
      
      setLastUpdate(Date.now());
    }, [fetchRound, fetchTeamSummary]),
  });
  
  // ⚡ ALSO listen to tiebreaker channels for ANY tiebreaker in this round
  // This catches tiebreaker bids even if round channel broadcast fails
  const activeTiebreakers = round?.roundPlayers?.filter(p => p.tiebreaker_id).map(p => p.tiebreaker_id) || [];
  
  useEffect(() => {
    // Subscribe to all active tiebreaker channels
    activeTiebreakers.forEach(tiebreakerId => {
      if (tiebreakerId) {
        console.log(`🎯 Subscribing to tiebreaker:${tiebreakerId}`);
      }
    });
  }, [JSON.stringify(activeTiebreakers)]);

  const isConnected = isRoundConnected;

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (resolvedParams.id) {
      fetchRound();
      fetchTeamSummary();
    }
  }, [resolvedParams.id]);

  // Refresh team summary when trigger changes
  useEffect(() => {
    if (teamSummaryRefreshTrigger > 0) {
      fetchTeamSummary();
    }
  }, [teamSummaryRefreshTrigger]);


  // Timer for active rounds
  useEffect(() => {
    if (round?.status === 'active' && round.end_time) {
      const interval = setInterval(() => {
        const now = new Date().getTime();
        const end = new Date(round.end_time!).getTime();
        const remaining = Math.floor((end - now) / 1000);
        
        if (remaining <= 0) {
          setTimeRemaining(0);
          clearInterval(interval);
        } else {
          setTimeRemaining(remaining);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [round]);

  // Fetch available players
  useEffect(() => {
    const fetchAvailablePlayers = async () => {
      if (!showAddPlayers) return;

      try {
        const response = await fetchWithTokenRefresh('/api/players?is_auction_eligible=true');
        const { success, data } = await response.json();

        if (success) {
          const currentPlayerIds = round?.roundPlayers?.map(p => p.player_id) || [];
          const available = data.filter((p: any) => !currentPlayerIds.includes(p.id));
          setAvailablePlayers(available);
        }
      } catch (err) {
        console.error('Error fetching players:', err);
      }
    };

    fetchAvailablePlayers();
  }, [showAddPlayers, round]);

  const handleUpdateStatus = async (newStatus: string) => {
    if (!round) return;

    let confirmMessage = `Are you sure you want to ${newStatus} this round?`;
    
    if (newStatus === 'active') {
      if (!confirm('Are you sure you want to start this bulk bidding round? Teams will be able to place bids immediately.')) {
        return;
      }
      
      try {
        const response = await fetchWithTokenRefresh(`/api/admin/bulk-rounds/${round.id}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        const { success, data, error } = await response.json();

        if (success) {
          alert(data.message || 'Round started successfully!');
          // ⚡ NO REFRESH NEEDED - WebSocket will update automatically!
        } else {
          alert(`Error: ${error}`);
        }
      } catch (err) {
        console.error('Error starting round:', err);
        alert('Failed to start round');
      }
      return;
    }

    if (!confirm(confirmMessage)) return;

    // Handle finalize/complete
    if (newStatus === 'completed') {
      // Prevent duplicate finalization
      if (isFinalizing) {
        alert('Finalization already in progress. Please wait...');
        return;
      }

      setIsFinalizing(true);
      
      try {
        const response = await fetchWithTokenRefresh(`/api/admin/bulk-rounds/${round.id}/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        const { success, data, error } = await response.json();

        if (success) {
          alert(data.message || `Round finalized! ${data.immediately_assigned || 0} players assigned, ${data.conflicts || 0} tiebreakers created.`);
          // Refresh to show updated allocations
          fetchRound();
          fetchTeamSummary();
        } else {
          alert(`Error: ${error}`);
        }
      } catch (err) {
        console.error('Error completing round:', err);
        alert('Failed to complete round. Please try again or contact support.');
      } finally {
        setIsFinalizing(false);
      }
      return;
    }

    // Handle other status changes
    try {
      const response = await fetchWithTokenRefresh(`/api/rounds/${round.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const { success, data } = await response.json();

      if (success) {
        setRound({ ...round, ...data });
        alert(`Round ${newStatus} successfully!`);
      }
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Failed to update status');
    }
  };

  const handleCreateTiebreaker = async (playerId: string, playerName: string) => {
    if (!round) return;

    if (!confirm(`Create tiebreaker for ${playerName}? This will allow the tied teams to submit new bids.`)) {
      return;
    }

    try {
      const response = await fetchWithTokenRefresh(`/api/admin/bulk-rounds/${round.id}/create-tiebreaker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId }),
      });

      const { success, data, error } = await response.json();

      if (success) {
        alert(data.message || 'Tiebreaker created successfully!');
        // ⚡ NO REFRESH NEEDED - WebSocket will update automatically!
      } else {
        alert(`Error: ${error}`);
      }
    } catch (err) {
      console.error('Error creating tiebreaker:', err);
      alert('Failed to create tiebreaker');
    }
  };

  const handleDeleteRound = async () => {
    if (!round) return;

    if (round.status === 'active' || round.status === 'completed') {
      alert('Cannot delete active or completed rounds');
      return;
    }

    const confirmMessage = 'Are you sure you want to delete this round? This action cannot be undone.';
    if (!confirm(confirmMessage)) return;

    try {
      const response = await fetchWithTokenRefresh(`/api/rounds/${round.id}`, {
        method: 'DELETE',
      });

      const { success } = await response.json();

      if (success) {
        alert('Round deleted successfully');
        router.push('/dashboard/committee/bulk-rounds');
      }
    } catch (err) {
      console.error('Error deleting round:', err);
      alert('Failed to delete round');
    }
  };

  const handleAddTime = async () => {
    if (!round) return;

    const minutes = parseInt(minutesToAdd);
    if (!minutes || minutes <= 0) {
      alert('Please enter a valid number of minutes');
      return;
    }

    if (!confirm(`Add ${minutes} minute(s) to the round?`)) {
      return;
    }

    try {
      const response = await fetchWithTokenRefresh(`/api/rounds/${round.id}/add-time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      });

      const { success, data, error } = await response.json();

      if (success) {
        alert(`Successfully added ${minutes} minute(s) to the round!`);
        setShowAddTime(false);
        setMinutesToAdd('5');
        // WebSocket will update automatically
      } else {
        alert(`Error: ${error}`);
      }
    } catch (err) {
      console.error('Error adding time to round:', err);
      alert('Failed to add time to round');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'scheduled': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'active': return 'bg-green-100 text-green-700 border-green-300';
      case 'completed': return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'cancelled': return 'bg-red-100 text-red-700 border-red-300';
      case 'expired': return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'expired_pending_finalization': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'finalizing': return 'bg-indigo-100 text-indigo-700 border-indigo-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const filteredPlayers = availablePlayers.filter(p =>
    p.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.position?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const playersByStatus = () => {
    if (!round || !round.roundPlayers) return { pending: [], sold: [], contested: [] };
    
    return {
      pending: round.roundPlayers.filter(p => p.status === 'pending'),
      sold: round.roundPlayers.filter(p => p.status === 'sold'),
      // Only show contested players that don't have a tiebreaker yet
      contested: round.roundPlayers.filter(p => p.bid_count && p.bid_count > 1 && !p.tiebreaker_id),
    };
  };

  if (loading || isLoading || !round) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono font-mono">Loading round details...</p>
        </div>
      </div>
    );
  }

  const { pending, sold, contested } = playersByStatus();
  const shouldShowBids = round.status === 'completed' || timeRemaining === 0;

  return (
    <>
      {/* Loading Overlay */}
      {isFinalizing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity duration-300 font-mono">
          <div className="flex flex-col items-center">
            <RefreshCw className="w-12 h-12 text-amber-400 animate-spin mb-4" />
            <p className="text-white font-bold text-xs uppercase tracking-wider">Finalizing round data...</p>
          </div>
        </div>
      )}

      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
        {/* Decorative glowing ambient overlay */}
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10 space-y-6">
          {/* Navigation */}
          <div>
            <Link
              href="/dashboard/committee/bulk-rounds"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Bulk Rounds
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
                  Bulk Round {round.round_number}
                </h1>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Manage bulk bidding round where teams bid on multiple players.
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* Round Status Badge */}
              <span className={`inline-flex items-center px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase font-mono shadow-sm ${getStatusColor(round.status)}`}>
                {round.status}
              </span>
              
              {/* WebSocket Status */}
              <span className={`inline-flex items-center px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase font-mono shadow-sm ${
                isRoundConnected 
                  ? 'bg-green-50 border-green-200 text-green-800' 
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full mr-2 ${
                  isRoundConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-400'
                }`}></span>
                {isRoundConnected ? 'Live Sync' : 'Offline'}
              </span>
            </div>
          </div>

          {/* Active Round Timer banner */}
          {round.status === 'active' && timeRemaining !== null && (
            <div className="console-card bg-emerald-50 border border-emerald-200 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6 animate-pulse-slow">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-600 border border-emerald-700 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                  <Clock className="w-5 h-5 text-emerald-100" />
                </div>
                <div>
                  <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider font-mono">ROUND ACTIVE</span>
                  <h3 className="text-sm sm:text-base font-extrabold text-emerald-900 mt-0.5">Teams are currently placing bids</h3>
                  <p className="text-xs text-emerald-600 font-mono mt-0.5">Bidding is live and real-time synced.</p>
                </div>
              </div>
              <div className="text-center sm:text-right">
                <div className="text-3xl sm:text-4xl font-extrabold text-emerald-600 font-mono tracking-wider">
                  {formatTime(timeRemaining)}
                </div>
                <div className="text-[10px] text-emerald-650 font-mono font-bold uppercase tracking-wider mt-1">Time Remaining</div>
              </div>
            </div>
          )}

          {/* Round Info & Status Controls */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
            <h2 className="text-sm sm:text-base font-extrabold mb-6 uppercase text-slate-900 tracking-wide flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-500" />
              Round Information
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4">
                <label className="block text-[10px] font-bold text-slate-405 uppercase font-mono mb-1">Base Price</label>
                <p className="text-lg sm:text-xl font-bold text-slate-800 font-mono">£{round.base_price}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4">
                <label className="block text-[10px] font-bold text-slate-405 uppercase font-mono mb-1">Duration</label>
                <p className="text-lg sm:text-xl font-bold text-slate-800 font-mono">{round.duration_seconds}s</p>
              </div>
              <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4">
                <label className="block text-[10px] font-bold text-slate-405 uppercase font-mono mb-1">Total Players</label>
                <p className="text-lg sm:text-xl font-bold text-slate-800 font-mono">{round.stats?.total_players || round.roundPlayers?.length || 0}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4">
                <label className="block text-[10px] font-bold text-slate-405 uppercase font-mono mb-1">Sold Count</label>
                <p className="text-lg sm:text-xl font-bold text-slate-800 font-mono">{round.stats?.sold_count || sold.length}</p>
              </div>
            </div>

            {/* Status Controls */}
            <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col sm:flex-row flex-wrap gap-3">
              {round.status === 'draft' && (
                <>
                  <button
                    onClick={() => handleUpdateStatus('active')}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all font-mono text-xs uppercase tracking-wider font-bold shadow-sm cursor-pointer border border-emerald-500/20"
                  >
                    🚀 Start Round Now
                  </button>
                  <button
                    onClick={handleDeleteRound}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-all font-mono text-xs uppercase tracking-wider font-bold shadow-sm cursor-pointer border border-rose-500/20 sm:ml-auto"
                  >
                    <Trash2 className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> Delete Round
                  </button>
                </>
              )}
              {round.status === 'active' && (
                <>
                  <button
                    onClick={() => setShowAddTime(!showAddTime)}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all font-mono text-xs uppercase tracking-wider font-bold shadow-sm cursor-pointer border border-blue-500/20"
                  >
                    ⏱️ Add Time
                  </button>
                  <button
                    onClick={() => handleUpdateStatus('completed')}
                    disabled={(timeRemaining !== null && timeRemaining > 0) || isFinalizing}
                    className={`px-5 py-2.5 rounded-xl transition-all font-mono text-xs uppercase tracking-wider font-bold shadow-sm flex items-center gap-2 cursor-pointer border border-transparent ${
                      (timeRemaining !== null && timeRemaining > 0) || isFinalizing
                        ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-700 text-white border-purple-500/20'
                    }`}
                  >
                    Check / Finalize Round
                  </button>
                </>
              )}
              
              {(round.status === 'scheduled' || round.status === 'expired' || round.status === 'expired_pending_finalization' || round.status === 'finalizing') && pending.length > 0 && (
                <button
                  onClick={() => handleUpdateStatus('completed')}
                  disabled={isFinalizing}
                  className={`px-5 py-2.5 rounded-xl transition-all font-mono text-xs uppercase tracking-wider font-bold shadow-sm flex items-center gap-2 cursor-pointer border border-transparent ${
                    isFinalizing
                      ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-700 text-white border-purple-500/20'
                  }`}
                >
                  Finalize Round
                </button>
              )}
            </div>

            {/* Add Time Interface */}
            {showAddTime && round.status === 'active' && (
              <div className="mt-6 p-5 bg-blue-50 border border-blue-200 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-200">
                <h3 className="font-bold text-slate-905 mb-4 flex items-center gap-2 text-sm">
                  <Clock className="w-5 h-5 text-blue-600" />
                  Add Time to Round
                </h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase font-mono mb-2">Minutes to Add</label>
                    <input
                      type="number"
                      value={minutesToAdd}
                      onChange={(e) => setMinutesToAdd(e.target.value)}
                      className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm"
                      min="1"
                      max="120"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      onClick={handleAddTime}
                      className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-mono text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
                    >
                      Add Time
                    </button>
                    <button
                      onClick={() => setShowAddTime(false)}
                      className="px-5 py-3 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 bg-white transition-colors font-mono text-xs font-bold uppercase tracking-wider cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Team Progress Summary */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
            <h2 className="text-sm sm:text-base font-extrabold mb-6 uppercase text-slate-900 tracking-wide flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-500" />
              Team Progress
            </h2>
            {loadingTeamSummary ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
                <p className="mt-2 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading team progress...</p>
              </div>
            ) : teamSummary.length === 0 ? (
              <div className="text-center py-8 text-slate-405 font-mono text-sm">
                <p>No teams found for this season</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {teamSummary
                  .sort((a, b) => b.players_selected - a.players_selected)
                  .map((team) => {
                    const progress = (team.players_selected / team.slots_needed) * 100;
                    const isComplete = team.players_selected >= team.slots_needed;
                    const hasStarted = team.players_selected > 0;
                    
                    return (
                      <div 
                        key={team.team_id} 
                        className={`border rounded-2xl p-4 transition-all hover:shadow-sm ${
                          isComplete 
                            ? 'bg-green-50/50 border-green-200' 
                            : hasStarted 
                            ? 'bg-blue-50/50 border-blue-200' 
                            : 'bg-slate-50/50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-extrabold text-slate-800 text-sm flex-1 pr-2 uppercase truncate">{team.team_name}</h4>
                          {isComplete && (
                            <span className="text-green-600 flex-shrink-0">
                              <Check className="w-5 h-5 text-green-500" />
                            </span>
                          )}
                        </div>
                        <div className="mt-3">
                          <div className="flex justify-between text-xs mb-1.5 font-mono">
                            <span className="text-slate-500">Slots:</span>
                            <span className={`font-bold ${
                              isComplete ? 'text-green-700' : hasStarted ? 'text-blue-700' : 'text-slate-700'
                            }`}>
                              {team.players_selected} / {team.slots_needed}
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className={`h-1.5 rounded-full transition-all duration-500 ${
                                isComplete 
                                  ? 'bg-green-600' 
                                  : hasStarted 
                                  ? 'bg-blue-600' 
                                  : 'bg-slate-400'
                              }`}
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Bids Hidden Message alert */}
          {!shouldShowBids && round.status === 'active' && (
            <div className="console-card bg-amber-50 border border-amber-200 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row items-center justify-center gap-4 text-center sm:text-left">
              <div className="p-3 rounded-full bg-amber-100 text-amber-600 flex-shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm sm:text-base font-extrabold text-amber-900 mb-0.5"><Lock className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Team Bids Hidden</h3>
                <p className="text-xs text-amber-700 font-mono">
                  Individual team bids will be revealed when the timer reaches zero.
                </p>
                {timeRemaining !== null && timeRemaining > 0 && (
                  <p className="text-xs text-amber-700 mt-1 font-bold font-mono">
                    Time remaining: {formatTime(timeRemaining)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Statistics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm border-l-4 border-l-slate-400 flex justify-between items-center">
              <div>
                <span className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider font-mono">STATUS</span>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-800 mt-0.5">Pending Players</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">Awaiting first bid</p>
              </div>
              <span className="bg-slate-100 border border-slate-200 text-slate-700 text-lg sm:text-xl font-extrabold px-3.5 py-1 rounded-2xl font-mono">
                {round.stats?.pending_count || pending.length}
              </span>
            </div>

            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm border-l-4 border-l-green-500 flex justify-between items-center">
              <div>
                <span className="text-[10px] text-green-700 font-bold uppercase tracking-wider font-mono">STATUS</span>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-800 mt-0.5">Sold Players</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">Successfully assigned</p>
              </div>
              <span className="bg-green-50 border border-green-200 text-green-700 text-lg sm:text-xl font-extrabold px-3.5 py-1 rounded-2xl font-mono">
                {round.stats?.sold_count || sold.length}
              </span>
            </div>

            {shouldShowBids && (
              <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm border-l-4 border-l-orange-500 flex justify-between items-center">
                <div>
                  <span className="text-[10px] text-orange-700 font-bold uppercase tracking-wider font-mono">STATUS</span>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-800 mt-0.5">Contested Players</h3>
                  <p className="text-xs text-slate-550 font-mono mt-0.5">Need tiebreaker</p>
                </div>
                <span className="bg-orange-50 border border-orange-200 text-orange-700 text-lg sm:text-xl font-extrabold px-3.5 py-1 rounded-2xl font-mono">
                  {contested.length}
                </span>
              </div>
            )}
          </div>

          {/* Players Card Section */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-100">
              <h2 className="text-sm sm:text-base font-extrabold uppercase text-slate-900 tracking-wide flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-500" />
                Round Players
              </h2>
              {round.status === 'draft' && (
                <button
                  onClick={() => setShowAddPlayers(!showAddPlayers)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Players
                </button>
              )}
            </div>

            {/* Add Players Interface */}
            {showAddPlayers && (
              <div className="mb-6 p-5 bg-blue-50 border border-blue-200 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-200">
                <h3 className="font-bold text-slate-800 mb-4 text-sm">Select Players to Add</h3>
                <input
                  type="text"
                  placeholder="Search players..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm mb-4"
                />
                <div className="max-h-64 overflow-y-auto space-y-2 mb-4 pr-1">
                  {filteredPlayers.map((player) => (
                    <label key={player.id} className="flex items-center p-3 hover:bg-white rounded-xl cursor-pointer border border-transparent hover:border-slate-200/60 transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedPlayers.includes(player.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPlayers([...selectedPlayers, player.id]);
                          } else {
                            setSelectedPlayers(selectedPlayers.filter(id => id !== player.id));
                          }
                        }}
                        className="mr-3"
                      />
                      <span className="flex-1 font-bold text-slate-800 text-sm">{player.full_name}</span>
                      <span className="text-xs font-mono text-slate-500">{player.position}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowAddPlayers(false);
                      setSelectedPlayers([]);
                    }}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl bg-white hover:bg-slate-100 transition-all font-mono text-xs uppercase tracking-wider font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      alert('Add players functionality is coming soon!');
                    }}
                    disabled={selectedPlayers.length === 0}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all font-mono text-xs uppercase tracking-wider font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add {selectedPlayers.length} Player{selectedPlayers.length !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            )}

            {/* Players List */}
            {!round.roundPlayers || round.roundPlayers.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <Layers className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <h3 className="text-sm font-bold text-slate-400 font-mono uppercase tracking-wider mb-1">Waiting for bids...</h3>
                <p className="text-slate-400 text-xs font-mono">This round has <span className="font-bold text-blue-600">{round.stats?.total_players || 0} players</span></p>
                <p className="text-slate-400 text-[10px] font-mono mt-1">Players with bids will appear here automatically.</p>
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="block lg:hidden space-y-4">
                  {round.roundPlayers?.sort((a, b) => (b.bid_count || 0) - (a.bid_count || 0)).map((player) => (
                    <div key={player.id} className="bg-slate-50/40 border border-slate-200 shadow-sm rounded-2xl hover:shadow-md transition-shadow overflow-hidden">
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="font-extrabold text-slate-800 text-sm mb-1">{player.player_name}</h3>
                            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">{player.position}</span>
                              <span className="font-semibold text-slate-755">£{player.base_price}</span>
                            </div>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                            player.status === 'sold' ? 'bg-green-50 text-green-700 border-green-200' :
                            player.status === 'unsold' ? 'bg-red-55' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-red-50' :
                            'bg-gray-50 text-gray-700 border-gray-200'
                          }`}>
                            {player.status}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between pt-3 border-t border-slate-200/60">
                          {shouldShowBids ? (
                            <span className={`px-2 py-1 rounded-lg text-xs font-mono font-bold border ${
                              (player.bid_count || 0) > 1 ? 'bg-orange-50 border-orange-200 text-orange-700' :
                              (player.bid_count || 0) === 1 ? 'bg-blue-50 border-blue-200 text-blue-700' :
                              'bg-slate-50 border-slate-200 text-slate-500'
                            }`}>
                              {player.bid_count || 0} {(player.bid_count || 0) === 1 ? 'bid' : 'bids'}
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-slate-50 border border-slate-200 text-slate-500 rounded-lg text-[10px] font-bold font-mono flex items-center gap-1.5">
                              Bids Hidden
                            </span>
                          )}
                          
                          {player.tiebreaker_id ? (
                            <button 
                              onClick={() => {
                                const newExpanded = new Set(expandedTiebreakers);
                                if (newExpanded.has(player.player_id)) {
                                  newExpanded.delete(player.player_id);
                                } else {
                                  newExpanded.add(player.player_id);
                                }
                                setExpandedTiebreakers(newExpanded);
                              }}
                              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-mono uppercase tracking-wider font-bold cursor-pointer"
                            >
                              {expandedTiebreakers.has(player.player_id) ? 'Hide' : 'View'} Tiebreaker
                            </button>
                          ) : shouldShowBids ? (
                            <button 
                              onClick={async () => {
                                const newExpanded = new Set(expandedBids);
                                if (newExpanded.has(player.player_id)) {
                                  newExpanded.delete(player.player_id);
                                  setExpandedBids(newExpanded);
                                } else {
                                  newExpanded.add(player.player_id);
                                  setExpandedBids(newExpanded);
                                  if (!playerBids.has(player.player_id) && !loadingBids.has(player.player_id)) {
                                    setLoadingBids(prev => new Set(prev).add(player.player_id));
                                    try {
                                      const response = await fetchWithTokenRefresh(`/api/rounds/${round.id}/players/${player.player_id}/bids`);
                                      const { success, data } = await response.json();
                                      if (success) {
                                        setPlayerBids(prev => {
                                          const newMap = new Map(prev);
                                          newMap.set(player.player_id, data);
                                          return newMap;
                                        });
                                      }
                                    } catch (err) {
                                      console.error('[Bids] Fetch error:', err);
                                    } finally {
                                      setLoadingBids(prev => {
                                        const newLoading = new Set(prev);
                                        newLoading.delete(player.player_id);
                                        return newLoading;
                                      });
                                    }
                                  }
                                }
                              }}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-mono uppercase tracking-wider font-bold cursor-pointer"
                            >
                              {expandedBids.has(player.player_id) ? 'Hide' : 'View'} Bids
                            </button>
                          ) : (
                            <span className="text-slate-400 text-xs font-mono">Hidden</span>
                          )}
                        </div>
                      </div>
                      
                      {/* Expandable Bid Details - Mobile */}
                      {!player.tiebreaker_id && expandedBids.has(player.player_id) && shouldShowBids && (
                        <div className="border-t border-slate-200/60 bg-blue-50/30 p-4">
                          <h4 className="font-bold text-slate-800 mb-3 flex items-center text-xs gap-1.5">
                            <Layers className="w-4 h-4 text-blue-600" />
                            Bids for {player.player_name}
                          </h4>
                          {loadingBids.has(player.player_id) ? (
                            <div className="text-center py-4">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
                            </div>
                          ) : playerBids.has(player.player_id) ? (
                            <div className="space-y-2">
                              {playerBids.get(player.player_id)!.length > 0 ? (
                                playerBids.get(player.player_id)!
                                  .sort((a: any, b: any) => b.amount - a.amount)
                                  .map((bid: any, idx: number) => (
                                    <div 
                                      key={bid.team_id}
                                      className={`flex items-center justify-between p-3 rounded-xl border ${
                                        idx === 0 ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200/60'
                                      }`}
                                    >
                                      <div>
                                        <p className={`font-bold text-sm ${idx === 0 ? 'text-green-800' : 'text-slate-800'}`}>
                                          {bid.team_name} {idx === 0 && <Trophy className="w-3.5 h-3.5 inline-block text-amber-500 mr-1" />}
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                          {new Date(bid.created_at).toLocaleString()}
                                        </p>
                                      </div>
                                      <div className={`text-sm font-bold font-mono ${idx === 0 ? 'text-green-700' : 'text-slate-700'}`}>
                                        £{bid.amount}
                                      </div>
                                    </div>
                                  ))
                              ) : (
                                <div className="text-center py-4 text-slate-400 font-mono text-xs">No bids placed yet</div>
                              )}
                            </div>
                          ) : (
                            <div className="text-center py-4 text-slate-400 font-mono text-xs">Failed to load bids</div>
                          )}
                        </div>
                      )}
                      
                      {/* Expandable Tiebreaker Details - Mobile */}
                      {player.tiebreaker_id && expandedTiebreakers.has(player.player_id) && player.tiebreaker && (
                        <div className="border-t border-slate-200/60 bg-orange-50/30 p-4">
                          <div className="mb-3 flex flex-col gap-2">
                            <h4 className="font-bold text-slate-800 flex items-center text-xs gap-1.5">
                              <Sparkles className="w-4 h-4 text-orange-600" />
                              Live Tiebreaker - {player.player_name}
                            </h4>
                            <div className="flex items-center justify-between">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                                player.tiebreaker.status === 'active' ? 'bg-green-50 border-green-200 text-green-700' :
                                player.tiebreaker.status === 'resolved' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                                'bg-gray-50 border-gray-200 text-gray-700'
                              }`}>
                                {player.tiebreaker.status}
                              </span>
                              <Link
                                href={`/dashboard/committee/bulk-rounds/${round.id}/tiebreakers`}
                                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider"
                              >
                                Manage
                              </Link>
                            </div>
                          </div>
                          {player.tiebreaker.highest_bid && (
                            <div className="mb-3 p-3 bg-white rounded-xl border border-green-200">
                              <div className="flex items-center justify-between text-xs">
                                <div>
                                  <p className="text-[10px] text-slate-405 font-mono">Highest Bid</p>
                                  <p className="text-lg font-extrabold text-green-600 font-mono">£{player.tiebreaker.highest_bid}</p>
                                </div>
                                {player.tiebreaker.highest_bidder && (
                                  <div className="text-right">
                                    <p className="text-[10px] text-slate-405 font-mono">Leading Team</p>
                                    <p className="font-bold text-slate-850 truncate max-w-[120px]">{player.tiebreaker.highest_bidder}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          <div>
                            <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-2">Team Bids ({player.tiebreaker.team_count})</h5>
                            <div className="space-y-2">
                              {player.tiebreaker.submissions && player.tiebreaker.submissions.length > 0 ? (
                                player.tiebreaker.submissions
                                  .sort((a, b) => b.new_bid_amount - a.new_bid_amount)
                                  .map((sub, idx) => (
                                    <div 
                                      key={sub.team_id}
                                      className={`flex items-center justify-between p-3 rounded-xl border ${
                                        idx === 0 ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200/60'
                                      }`}
                                    >
                                      <div>
                                        <p className="font-bold text-sm text-slate-850">{sub.team_name} {idx === 0 && <Trophy className="w-3.5 h-3.5 inline-block text-amber-500 mr-1" />}</p>
                                        <p className="text-[10px] text-slate-404 font-mono mt-0.5">{new Date(sub.submitted).toLocaleTimeString()}</p>
                                      </div>
                                      <div className="text-sm font-bold font-mono text-slate-700">£{sub.new_bid_amount}</div>
                                    </div>
                                  ))
                              ) : (
                                <div className="text-center py-4 text-slate-400 font-mono text-xs">No bids submitted yet</div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto font-mono">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/50">
                        <th className="text-left py-4 px-5 font-bold text-slate-705 text-xs font-mono uppercase tracking-wider">Player Name</th>
                        <th className="text-left py-4 px-5 font-bold text-slate-705 text-xs font-mono uppercase tracking-wider">Position</th>
                        <th className="text-left py-4 px-5 font-bold text-slate-705 text-xs font-mono uppercase tracking-wider">Base Price</th>
                        {shouldShowBids && (
                          <th className="text-left py-4 px-5 font-bold text-slate-705 text-xs font-mono uppercase tracking-wider">Bids</th>
                        )}
                        <th className="text-left py-4 px-5 font-bold text-slate-705 text-xs font-mono uppercase tracking-wider">Status</th>
                        <th className="text-left py-4 px-5 font-bold text-slate-705 text-xs font-mono uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {round.roundPlayers?.sort((a, b) => (b.bid_count || 0) - (a.bid_count || 0)).map((player) => (
                        <React.Fragment key={player.id}>
                          <tr className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                            <td className="py-4 px-5 font-extrabold text-slate-800">{player.player_name}</td>
                            <td className="py-4 px-5 text-slate-550 font-mono text-xs">
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">{player.position}</span>
                            </td>
                            <td className="py-4 px-5 text-slate-700 font-mono">£{player.base_price}</td>
                            {shouldShowBids && (
                              <td className="py-4 px-5 font-mono">
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                  (player.bid_count || 0) > 1 ? 'bg-orange-50 border-orange-200 text-orange-700' :
                                  (player.bid_count || 0) === 1 ? 'bg-blue-50 border-blue-200 text-blue-700' :
                                  'bg-slate-50 border-slate-200 text-slate-400'
                                }`}>
                                  {player.bid_count || 0} {(player.bid_count || 0) === 1 ? 'bid' : 'bids'}
                                </span>
                              </td>
                            )}
                            <td className="py-4 px-5">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase border ${
                                player.status === 'sold' ? 'bg-green-50 text-green-700 border-green-200' :
                                player.status === 'unsold' ? 'bg-red-50 text-red-700 border-red-200' :
                                'bg-gray-50 text-gray-700 border-gray-200'
                              }`}>
                                {player.status}
                              </span>
                            </td>
                            <td className="py-4 px-5">
                              {player.tiebreaker_id ? (
                                <button 
                                  onClick={() => {
                                    const newExpanded = new Set(expandedTiebreakers);
                                    if (newExpanded.has(player.player_id)) {
                                      newExpanded.delete(player.player_id);
                                    } else {
                                      newExpanded.add(player.player_id);
                                    }
                                    setExpandedTiebreakers(newExpanded);
                                  }}
                                  className="px-4 py-2 bg-orange-650 hover:bg-orange-700 bg-orange-600 text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider shadow-sm cursor-pointer transition-colors"
                                >
                                  {expandedTiebreakers.has(player.player_id) ? 'Hide' : 'View'} Tiebreaker
                                </button>
                              ) : shouldShowBids ? (
                                <button 
                                  onClick={async () => {
                                    const newExpanded = new Set(expandedBids);
                                    if (newExpanded.has(player.player_id)) {
                                      newExpanded.delete(player.player_id);
                                      setExpandedBids(newExpanded);
                                    } else {
                                      newExpanded.add(player.player_id);
                                      setExpandedBids(newExpanded);
                                      
                                      if (!playerBids.has(player.player_id) && !loadingBids.has(player.player_id)) {
                                        setLoadingBids(prev => new Set(prev).add(player.player_id));
                                        try {
                                          const response = await fetchWithTokenRefresh(`/api/rounds/${round.id}/players/${player.player_id}/bids`);
                                          const { success, data } = await response.json();
                                          if (success) {
                                            setPlayerBids(prev => {
                                              const newMap = new Map(prev);
                                              newMap.set(player.player_id, data);
                                              return newMap;
                                            });
                                          }
                                        } catch (err) {
                                          console.error('[Bids] Fetch error:', err);
                                        } finally {
                                          setLoadingBids(prev => {
                                            const newLoading = new Set(prev);
                                            newLoading.delete(player.player_id);
                                            return newLoading;
                                          });
                                        }
                                      }
                                    }
                                  }}
                                  className="text-blue-600 hover:text-blue-800 text-xs font-bold font-mono uppercase tracking-wider hover:underline transition-colors cursor-pointer"
                                >
                                  {expandedBids.has(player.player_id) ? 'Hide' : 'View'} Bids
                                </button>
                              ) : (
                                <span className="text-slate-400 font-mono text-xs">Hidden</span>
                              )}
                            </td>
                          </tr>
                          
                          {/* Expandable Bid Details */}
                          {!player.tiebreaker_id && expandedBids.has(player.player_id) && shouldShowBids && (
                            <tr className="bg-blue-50/20 border-b border-slate-200/50">
                              <td colSpan={shouldShowBids ? 6 : 5} className="py-4 px-5">
                                <div className="p-4 border border-blue-200/60 rounded-2xl bg-white space-y-4">
                                  <h4 className="font-extrabold text-slate-800 flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider">
                                    <Layers className="w-5 h-5 text-blue-500" />
                                    Bids for {player.player_name}
                                  </h4>
                                  
                                  {loadingBids.has(player.player_id) ? (
                                    <div className="text-center py-6">
                                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
                                    </div>
                                  ) : playerBids.has(player.player_id) ? (
                                    <div className="space-y-2 max-w-2xl">
                                      {playerBids.get(player.player_id)!.length > 0 ? (
                                        playerBids.get(player.player_id)!
                                          .sort((a: any, b: any) => b.amount - a.amount)
                                          .map((bid: any, idx: number) => (
                                            <div 
                                              key={bid.team_id}
                                              className={`flex items-center justify-between p-3.5 rounded-xl border ${
                                                idx === 0 ? 'bg-green-50 border-green-200' : 'bg-slate-50/50 border-slate-200'
                                              }`}
                                            >
                                              <div className="flex items-center gap-3">
                                                {idx === 0 && <Trophy className="w-4 h-4 inline-block text-amber-500 mr-1" />}
                                                <div>
                                                  <p className={`font-extrabold text-sm ${idx === 0 ? 'text-green-800' : 'text-slate-800'}`}>
                                                    {bid.team_name}
                                                  </p>
                                                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                    {new Date(bid.created_at).toLocaleString()}
                                                  </p>
                                                </div>
                                              </div>
                                              <div className={`text-base font-extrabold font-mono ${idx === 0 ? 'text-green-700' : 'text-slate-700'}`}>
                                                £{bid.amount}
                                              </div>
                                            </div>
                                          ))
                                      ) : (
                                        <div className="text-center py-4 text-slate-400 font-mono text-xs">No bids placed yet</div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-center py-4 text-slate-400 font-mono text-xs">Failed to load bids</div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                          
                          {/* Expandable Tiebreaker Details */}
                          {player.tiebreaker_id && expandedTiebreakers.has(player.player_id) && player.tiebreaker && (
                            <tr className="bg-orange-50/20 border-b border-slate-200/50">
                              <td colSpan={shouldShowBids ? 6 : 5} className="py-4 px-5">
                                <div className="p-4 border border-orange-200/60 rounded-2xl bg-white space-y-4">
                                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                    <h4 className="font-extrabold text-slate-800 flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider">
                                      <Sparkles className="w-5 h-5 text-orange-650 text-orange-600 animate-pulse" />
                                      Live Tiebreaker Auction - {player.player_name}
                                    </h4>
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                                        player.tiebreaker.status === 'active' ? 'bg-green-50 border-green-200 text-green-700' :
                                        player.tiebreaker.status === 'resolved' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                                        'bg-gray-50 border-gray-200 text-gray-700'
                                      }`}>
                                        {player.tiebreaker.status}
                                      </span>
                                      <Link
                                        href={`/dashboard/committee/bulk-rounds/${round.id}/tiebreakers`}
                                        className="px-3 py-1.5 bg-orange-650 bg-orange-600 hover:bg-orange-750 text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
                                      >
                                        Manage
                                      </Link>
                                    </div>
                                  </div>
                                  
                                  {player.tiebreaker.highest_bid && (
                                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl max-w-2xl">
                                      <div className="flex items-center justify-between text-xs">
                                        <div>
                                          <p className="text-[10px] text-slate-400 font-mono uppercase">Current Highest Bid</p>
                                          <p className="text-xl font-extrabold text-green-600 font-mono mt-0.5">£{player.tiebreaker.highest_bid}</p>
                                        </div>
                                        {player.tiebreaker.highest_bidder && (
                                          <div className="text-right">
                                            <p className="text-[10px] text-slate-400 font-mono uppercase">Leading Team</p>
                                            <p className="font-extrabold text-slate-850 mt-0.5">{player.tiebreaker.highest_bidder}</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  
                                  <div className="max-w-2xl">
                                    <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-2">Team Bids ({player.tiebreaker.team_count} teams)</h5>
                                    <div className="space-y-2">
                                      {player.tiebreaker.submissions && player.tiebreaker.submissions.length > 0 ? (
                                        player.tiebreaker.submissions
                                          .sort((a, b) => b.new_bid_amount - a.new_bid_amount)
                                          .map((sub, idx) => (
                                            <div 
                                              key={sub.team_id}
                                              className={`flex items-center justify-between p-3 rounded-xl border ${
                                                idx === 0 ? 'bg-green-50 border-green-200' : 'bg-slate-50/50 border-slate-200'
                                              }`}
                                            >
                                              <div className="flex items-center gap-3">
                                                {idx === 0 && <Trophy className="w-4 h-4 inline-block text-amber-500 mr-1" />}
                                                <div>
                                                  <p className="font-extrabold text-sm text-slate-800">{sub.team_name}</p>
                                                  <p className="text-[10px] text-slate-404 font-mono mt-0.5">
                                                    {new Date(sub.submitted).toLocaleTimeString()}
                                                  </p>
                                                </div>
                                              </div>
                                              <div className="text-sm font-bold font-mono text-slate-700">£{sub.new_bid_amount}</div>
                                            </div>
                                          ))
                                      ) : (
                                        <div className="text-center py-4 text-slate-400 font-mono text-xs">No bids submitted yet</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Tiebreakers Section */}
          {shouldShowBids && contested.length > 0 && (
            <div className="console-card bg-orange-50 border border-orange-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
              <h2 className="text-sm sm:text-base font-extrabold uppercase text-orange-900 tracking-wide flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                {round.status === 'completed' ? 'Tiebreakers Required' : 'Pending Tiebreakers'}
              </h2>
              <p className="text-xs text-orange-800 font-mono leading-relaxed">
                {round.status === 'completed' 
                  ? 'The following players have multiple bids and require a tiebreaker auction:'
                  : 'These players currently have multiple bids at the base price. Tiebreakers will be created when the round ends:'}
              </p>
              <div className="space-y-3 max-w-4xl">
                {contested.map((player) => (
                  <div key={player.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-white rounded-2xl border border-orange-200 shadow-sm">
                    <div className="flex-1">
                      <p className="font-extrabold text-slate-800 text-sm sm:text-base">{player.player_name}</p>
                      <p className="text-xs text-slate-500 font-mono mt-1">{player.position} • {player.bid_count} teams bidding</p>
                    </div>
                    <button 
                      onClick={() => handleCreateTiebreaker(player.player_id, player.player_name)}
                      className="px-4 py-2 bg-orange-655 bg-orange-600 hover:bg-orange-700 text-white rounded-xl transition-all font-mono text-xs uppercase tracking-wider font-bold shadow-sm cursor-pointer"
                    >
                      Create Tiebreaker
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
