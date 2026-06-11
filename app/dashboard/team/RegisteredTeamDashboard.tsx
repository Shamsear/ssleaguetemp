'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import ConfirmModal from '@/components/modals/ConfirmModal';
import Image from 'next/image';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { useDashboardWebSocket } from '@/hooks/useWebSocket';
import NotificationButton from '@/components/notifications/NotificationButton';
import ManagerRegistrationForm from '@/components/forms/ManagerRegistrationForm';
import OwnerRegistrationForm from '@/components/forms/OwnerRegistrationForm';

// Position constants
const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'AMF', 'LMF', 'RMF', 'LWF', 'RWF', 'SS', 'CF'];
const MAX_PLAYERS_PER_TEAM = 25;

interface TeamData {
  id: string;
  name: string;
  balance: number;
  logo_url?: string;
  currency_system?: string;
  dollarBalance?: number;
  euroBalance?: number;
  football_budget?: number;
  real_player_budget?: number;
  football_spent?: number;
  real_player_spent?: number;
  real_players?: Array<{
    name: string;
    auctionValue: number;
    starRating: number;
    category: 'legend' | 'classic';
    points: number;
  }>;
  skipped_seasons?: number;
  penalty_amount?: number;
  last_played_season?: string;
  is_auto_registered?: boolean;
  football_base_slots?: number;
  football_purchased_slots?: number;
  football_total_slots?: number;
}

interface RoundTiebreaker {
  id: number;
  player_id: number;
  player_name: string;
  player_position: string;
  overall_rating: number;
  player_team: string;
  original_amount: number;
  status: string;
  winning_amount?: number;
  teams: Array<{
    team_id: string;
    team_name: string;
    original_bid: number;
    new_bid?: number;
    submitted: boolean;
  }>;
}

interface Round {
  id: string;
  season_id: string;
  round_number?: number;
  position?: string;
  status: string;
  end_time?: string;
  max_bids_per_team?: number;
  total_bids?: number;
  teams_bid?: number;
  player_count?: number;
  players?: Player[];
  tiebreakers?: RoundTiebreaker[];
  submission_status?: {
    submitted: boolean;
    submitted_at: string | null;
    bid_count: number;
    is_locked: boolean;
  };
}

interface Player {
  id: number;
  name: string;
  position: string;
  nfl_team: string;
  overall_rating: number;
  acquisition_value?: number;
}

interface Bid {
  id: number;
  player_id: number;
  player: Player;
  amount: number;
  round_id: number;
}

interface Tiebreaker {
  id: number;
  player_id: number;
  player: Player;
  round_id: number;
  round_type?: string;
  is_bulk?: boolean;
  original_amount: number;
  teams_involved: string[];
  status: string;
  new_amount?: number;
}

interface BulkTiebreaker {
  id: string;
  player_id: number;
  player: Player;
  bulk_round_id: number;
  base_price: number;
  current_highest_bid?: number;
  team_current_bid?: number;
  status: string;
  is_bulk: boolean;
}

interface BulkRound {
  id: number;
  season_id: string;
  base_price: number;
  status: string;
  end_time?: string;
  available_players_count?: number;
}

interface RoundResult {
  id: number;
  player: Player;
  won: boolean;
  bid_amount: number;
  final_amount: number;
  round: Round;
}

interface SeasonParticipation {
  status: string;
  points_earned: number;
  joined_at?: Date;
}

interface Owner {
  id: number;
  owner_id: string;
  team_id: string;
  season_id: string;
  name: string;
  photo_url?: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  place?: string;
  nationality?: string;
  bio?: string;
  instagram_handle?: string;
  twitter_handle?: string;
}

interface Manager {
  id: number;
  manager_id: string;
  team_id: string;
  season_id: string;
  name: string;
  photo_url?: string;
  player_id?: string;
  is_player: boolean;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  place?: string;
  nationality?: string;
  jersey_number?: number;
}

interface DashboardData {
  team: TeamData;
  owner?: Owner | null;
  manager?: Manager | null;
  activeRounds: Round[];
  pendingRounds: Round[];
  activeBids: Bid[];
  players: Player[];
  tiebreakers: Tiebreaker[];
  bulkTiebreakers: BulkTiebreaker[];
  activeBulkRounds: BulkRound[];
  roundResults: RoundResult[];
  seasonParticipation?: SeasonParticipation;
  hasFantasyTeam?: boolean;
  stats: {
    playerCount: number;
    balance: number;
    totalSpent: number;
    avgRating: number;
    activeBidsCount: number;
    positionBreakdown: { [key: string]: number };
  };
}

interface Props {
  seasonStatus: {
    hasActiveSeason: boolean;
    isRegistered: boolean;
    seasonName?: string;
    seasonId?: string;
  };
  user: any;
}

export default function RegisteredTeamDashboard({ seasonStatus, user }: Props) {
  // State Management
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<{ [key: string]: number }>({});
  const [bulkTimeRemaining, setBulkTimeRemaining] = useState<{ [key: number]: number }>({});
  const [activeTab, setActiveTab] = useState<'auctions' | 'squad' | 'results' | 'overview' | 'fantasy'>('auctions');
  const [selectedPosition, setSelectedPosition] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [bidSearchTerm, setBidSearchTerm] = useState('');
  const [resultFilter, setResultFilter] = useState<'all' | 'won' | 'lost'>('all');

  // Modal system
  const {
    alertState,
    showAlert,
    closeAlert,
    confirmState,
    showConfirm,
    closeConfirm,
    handleConfirm,
  } = useModal();

  const timerRefs = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const bulkTimerRefs = useRef<{ [key: number]: NodeJS.Timeout }>({});
  const previousDataRef = useRef<string>('');
  const fetchDashboardRef = useRef<(showLoader?: boolean, bustCache?: boolean) => Promise<void>>();
  const [showManagerForm, setShowManagerForm] = useState(false);
  const [showOwnerForm, setShowOwnerForm] = useState(false);

  // Fetch dashboard data
  const fetchDashboard = useCallback(async (showLoader = true, bustCache = false) => {
    if (!seasonStatus?.seasonId) return;
    if (showLoader) setIsLoading(true);

    try {
      const params = new URLSearchParams({
        season_id: seasonStatus.seasonId,
        ...(bustCache && { bust_cache: 'true' }) // ⚡ Bust cache on live updates
      });
      const response = await fetchWithTokenRefresh(`/api/team/dashboard?${params}`, {
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (!response.ok) {
        let errorMessage = `Server error (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = response.status === 404
            ? 'Team not registered for this season'
            : `Unable to load dashboard (${response.status})`;
        }
        setError(errorMessage);
        return;
      }

      const { success, data } = await response.json();

      if (success) {
        const dataString = JSON.stringify(data);
        if (dataString !== previousDataRef.current) {
          previousDataRef.current = dataString;
          setDashboardData(data);
          setError(null);
        }
      } else {
        setError(data?.error || 'Failed to load dashboard data');
      }
    } catch (err) {
      console.error('Error fetching dashboard:', err);
      setError('Unable to connect to the server');
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }, [seasonStatus?.seasonId]);

  // Update ref whenever fetchDashboard changes
  useEffect(() => {
    fetchDashboardRef.current = fetchDashboard;
  }, [fetchDashboard]);

  // ⚡ Firebase Realtime DB for instant dashboard updates
  // This hook automatically refetches dashboard data when squad/wallet changes occur
  const { isConnected } = useDashboardWebSocket(
    seasonStatus?.seasonId || null,
    dashboardData?.team?.id || null
  );

  // Initial fetch only (no polling)
  useEffect(() => {
    // Small delay to allow AuthContext to refresh token on page load
    const initialTimeout = setTimeout(() => {
      fetchDashboard(true);
    }, 500);

    return () => {
      clearTimeout(initialTimeout);
    };
  }, [seasonStatus?.seasonId]);

  // ⚡ Comprehensive Firebase Realtime Database listeners
  useEffect(() => {
    if (!seasonStatus?.seasonId) return;

    const { listenToSeasonRoundUpdates, listenToSquadUpdates, listenToWalletUpdates } = require('@/lib/realtime/listeners');

    console.log('🔴 [Team Dashboard] Setting up Firebase listeners for season:', seasonStatus.seasonId);

    // Listen to round updates (started, finalized, status changes)
    const unsubRounds = listenToSeasonRoundUpdates(seasonStatus.seasonId, (message: any) => {
      console.log('🔴 [Team Dashboard] Round update:', message.type, message);

      // Handle finalization completion event
      if (message.event_type === 'finalization_complete' && message.finalized) {
        console.log('🎉 [Team Dashboard] Round finalization completed:', message.round_id);

        // Show notification to user
        showAlert({
          type: 'success',
          title: 'Round Finalized! 🎉',
          message: `Auction results are now available. ${message.allocations_count || 0} player(s) have been allocated. Check your dashboard for updates!`,
        });

        // Also try browser notification if available
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('Round Finalized! 🎉', {
            body: `Auction results are now available. Check your dashboard for updates!`,
            icon: '/logo.png',
            tag: `round-finalized-${message.round_id}`,
          });
        }

        // Refetch dashboard to show new results
        fetchDashboard(false, true); // Bust cache for fresh data
        return;
      }

      // Refetch dashboard immediately without loader for any round event
      if (message.type === 'round_started' ||
        message.type === 'round_finalized' ||
        message.type === 'round_status_changed' ||
        message.type === 'round_updated' ||
        message.type === 'bid_submitted') {
        fetchDashboard(false, true); // Bust cache for fresh data
      }
    });

    // Listen to squad updates (player acquired/refunded)
    const unsubSquads = listenToSquadUpdates(seasonStatus.seasonId, (event: any) => {
      console.log('📦 [Team Dashboard] Squad update:', event);

      // Refetch if it's for this team or affects any team (could be tiebreaker result)
      if (!dashboardData?.team?.id || event.team_id === dashboardData.team.id) {
        fetchDashboard(false, true);
      }
    });

    // Listen to wallet updates (balance changes)
    const unsubWallets = listenToWalletUpdates(seasonStatus.seasonId, (event: any) => {
      console.log('💰 [Team Dashboard] Wallet update:', event);

      // Refetch if it's for this team
      if (!dashboardData?.team?.id || event.team_id === dashboardData.team.id) {
        fetchDashboard(false, true);
      }
    });

    return () => {
      console.log('🔴 [Team Dashboard] Cleaning up Firebase listeners');
      unsubRounds();
      unsubSquads();
      unsubWallets();
    };
  }, [seasonStatus?.seasonId, dashboardData?.team?.id, fetchDashboard, showAlert]);

  // Timer effect for active rounds - optimized with requestAnimationFrame
  useEffect(() => {
    if (!dashboardData?.activeRounds || dashboardData.activeRounds.length === 0) return;

    let animationFrameId: number;
    let lastUpdate = Date.now();

    const updateTimers = () => {
      const now = Date.now();

      // Only update every second to reduce re-renders
      if (now - lastUpdate >= 1000) {
        lastUpdate = now;

        const newTimeRemaining: { [key: string]: number } = {};
        let hasActiveTimers = false;

        dashboardData.activeRounds.forEach(round => {
          if (round.end_time) {
            const end = new Date(round.end_time).getTime();
            const remaining = Math.max(0, Math.floor((end - now) / 1000));
            newTimeRemaining[round.id] = remaining;
            if (remaining > 0) hasActiveTimers = true;
          }
        });

        setTimeRemaining(newTimeRemaining);

        // Continue animation loop only if there are active timers
        if (hasActiveTimers) {
          animationFrameId = requestAnimationFrame(updateTimers);
        }
      } else {
        animationFrameId = requestAnimationFrame(updateTimers);
      }
    };

    // Start the animation loop
    animationFrameId = requestAnimationFrame(updateTimers);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [dashboardData?.activeRounds]);

  // Timer effect for bulk rounds - optimized with requestAnimationFrame
  useEffect(() => {
    if (!dashboardData?.activeBulkRounds || dashboardData.activeBulkRounds.length === 0) return;

    let animationFrameId: number;
    let lastUpdate = Date.now();

    const updateBulkTimers = () => {
      const now = Date.now();

      // Only update every second to reduce re-renders
      if (now - lastUpdate >= 1000) {
        lastUpdate = now;

        const newBulkTimeRemaining: { [key: number]: number } = {};
        let hasActiveTimers = false;

        dashboardData.activeBulkRounds.forEach(bulkRound => {
          if (bulkRound.end_time) {
            const end = new Date(bulkRound.end_time).getTime();
            const remaining = Math.max(0, Math.floor((end - now) / 1000));
            newBulkTimeRemaining[bulkRound.id] = remaining;
            if (remaining > 0) hasActiveTimers = true;
          }
        });

        setBulkTimeRemaining(newBulkTimeRemaining);

        // Continue animation loop only if there are active timers
        if (hasActiveTimers) {
          animationFrameId = requestAnimationFrame(updateBulkTimers);
        }
      } else {
        animationFrameId = requestAnimationFrame(updateBulkTimers);
      }
    };

    // Start the animation loop
    animationFrameId = requestAnimationFrame(updateBulkTimers);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [dashboardData?.activeBulkRounds]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDeleteBid = async (bidId: number) => {
    const confirmed = await showConfirm({
      type: 'danger',
      title: 'Delete Bid',
      message: 'Are you sure you want to delete this bid?',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    const bidToDelete = dashboardData?.activeBids.find(b => b.id === bidId);
    if (!bidToDelete) return;

    setDashboardData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        activeBids: prev.activeBids.filter(bid => bid.id !== bidId),
        team: {
          ...prev.team,
          balance: prev.team.balance + bidToDelete.amount,
          football_budget: (prev.team.football_budget || 0) + bidToDelete.amount, // Fix: Update football_budget
        },
        stats: {
          ...prev.stats,
          balance: prev.stats.balance + bidToDelete.amount,
          activeBidsCount: prev.stats.activeBidsCount - 1,
        },
      };
    });

    try {
      const response = await fetchWithTokenRefresh(`/api/team/bids/${bidId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!data.success) {
        setDashboardData(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            activeBids: [...prev.activeBids, bidToDelete],
            team: {
              ...prev.team,
              balance: prev.team.balance - bidToDelete.amount,
              football_budget: (prev.team.football_budget || 0) - bidToDelete.amount, // Fix: Roll back football_budget
            },
            stats: {
              ...prev.stats,
              balance: prev.stats.balance - bidToDelete.amount,
              activeBidsCount: prev.stats.activeBidsCount + 1,
            },
          };
        });
        showAlert({
          type: 'error',
          title: 'Delete Failed',
          message: data.error || 'Failed to delete bid'
        });
      }
    } catch (err) {
      setDashboardData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          activeBids: [...prev.activeBids, bidToDelete],
          team: {
            ...prev.team,
            balance: prev.team.balance - bidToDelete.amount,
            football_budget: (prev.team.football_budget || 0) - bidToDelete.amount, // Fix: Roll back football_budget
          },
          stats: {
            ...prev.stats,
            balance: prev.stats.balance - bidToDelete.amount,
            activeBidsCount: prev.stats.activeBidsCount + 1,
          },
        };
      });
      console.error('Error deleting bid:', err);
      showAlert({
        type: 'error',
        title: 'Delete Failed',
        message: 'Failed to delete bid'
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (!dashboardData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
        <div className="text-center max-w-md mx-auto">
          <div className="inline-flex items-center justify-center p-4 bg-red-100 rounded-full mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">Unable to load dashboard</h3>
          <p className="text-gray-600 text-sm mb-6">{error || 'There was an error loading your team data.'}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  const { team, activeRounds, pendingRounds, players, tiebreakers, bulkTiebreakers, activeBulkRounds, stats, activeBids, roundResults, seasonParticipation } = dashboardData;

  // Filter players
  const filteredPlayers = players.filter(player => {
    const matchesPosition = selectedPosition === 'all' || player.position === selectedPosition;
    const matchesSearch = player.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesPosition && matchesSearch;
  });

  // Filter bids
  const filteredBids = activeBids.filter(bid =>
    bid.player.name.toLowerCase().includes(bidSearchTerm.toLowerCase())
  );

  // Filter results
  const filteredResults = roundResults.filter(result => {
    if (resultFilter === 'won') return result.won;
    if (resultFilter === 'lost') return !result.won;
    return true;
  });

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-8">

        {/* Hero Section - Fully Responsive */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-6 w-full md:w-auto">
            {/* Team Logo & Name - Mobile Optimized */}
            <div className="relative group flex-shrink-0">
              {team.logo_url ? (
                <div className="relative w-20 h-20 bg-white rounded-3xl flex items-center justify-center border border-slate-200 shadow-sm">
                  <img src={team.logo_url} alt={team.name} className="max-w-full max-h-full object-contain p-2" loading="lazy" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-3xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                  <span className="text-2xl font-bold text-amber-600">{team.name.charAt(0).toUpperCase()}</span>
                </div>
              )}
            </div>

            <div className="text-center sm:text-left">
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">TEAM PROFILE</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 truncate max-w-xs sm:max-w-md">{team.name}</h1>
              
              {seasonStatus && (
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-50 border border-amber-200 text-amber-800 uppercase tracking-wide">
                    {seasonStatus.seasonName}
                  </span>
                  {seasonParticipation && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-50 border border-emerald-200 text-emerald-800 uppercase tracking-wide">
                      {seasonParticipation.status}
                    </span>
                  )}
                </div>
              )}

              {/* Owner and Manager Names */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-3 text-xs font-mono text-slate-500">
                {dashboardData?.owner && (
                  <div className="flex items-center gap-1.5">
                    <span>👑 Owner:</span>
                    <span className="font-bold text-slate-700">{dashboardData.owner.name}</span>
                  </div>
                )}
                {dashboardData?.manager && (
                  <div className="flex items-center gap-1.5">
                    <span>⚽ Manager:</span>
                    <span className="font-bold text-slate-700">{dashboardData.manager.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Key Stats Cards - Responsive Grid (Always Dual Currency) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto lg:min-w-[450px]">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 sm:p-4 text-center font-mono">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">eCoin</div>
              <div className="text-sm sm:text-lg lg:text-2xl font-black text-amber-600">{(team.football_budget || 0).toLocaleString()}</div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 sm:p-4 text-center font-mono">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">SSCoin</div>
              <div className="text-sm sm:text-lg lg:text-2xl font-black text-emerald-600">{(team.real_player_budget || 0).toLocaleString()}</div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 sm:p-4 text-center font-mono">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Squad</div>
              <div className="text-sm sm:text-lg lg:text-2xl font-black text-slate-800">
                {stats.playerCount}/{team.football_total_slots || MAX_PLAYERS_PER_TEAM}
              </div>
              {team.football_purchased_slots && team.football_purchased_slots > 0 && (
                <div className="text-[9px] text-emerald-600 font-bold mt-0.5">
                  +{team.football_purchased_slots} extra
                </div>
              )}
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 sm:p-4 text-center font-mono">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Avg Rating</div>
              <div className="text-sm sm:text-lg lg:text-2xl font-black text-amber-600">{stats.avgRating.toFixed(1)}</div>
            </div>
          </div>
        </div>

        {/* Notification Button */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex-1">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight">Push Notifications</h3>
              <p className="text-xs text-slate-400 font-sans mt-0.5">Get real-time updates about auctions, matches, and results</p>
            </div>
            <NotificationButton />
          </div>
        </div>

        {/* Owner Registration Prompt */}
        {!dashboardData?.owner && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm border-l-4 border-amber-500 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-xl">
                  👑
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 leading-tight">Register Your Team Owner</h3>
                  <p className="text-xs text-slate-500 font-sans mt-0.5">Add your team owner information to complete your team profile.</p>
                </div>
              </div>
              <div className="flex-shrink-0">
                <button
                  onClick={() => setShowOwnerForm(true)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  Add Owner
                </button>
              </div>
            </div>

            {showOwnerForm && (
              <div className="mt-4 p-5 rounded-2xl border border-slate-200 bg-white">
                <OwnerRegistrationForm
                  teamId={team.id}
                  userId={user?.uid || ''}
                  userName={user?.displayName || ''}
                  userEmail={user?.email || ''}
                  onCancel={() => setShowOwnerForm(false)}
                  onSuccess={() => {
                    setShowOwnerForm(false);
                    fetchDashboardRef.current?.(true);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Mandatory Manager Registration Prompt */}
        {!dashboardData?.manager && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm border-l-4 border-emerald-500 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-xl">
                  ⚽
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 leading-tight">Register Your Team Manager</h3>
                  <p className="text-xs text-slate-500 font-sans mt-0.5">A manager is required for your team this season. Select a playing manager from your squad or register a non-playing manager.</p>
                </div>
              </div>
              <div className="flex-shrink-0">
                <button
                  onClick={() => setShowManagerForm(true)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  Add Manager
                </button>
              </div>
            </div>

            {showManagerForm && (
              <div className="mt-4 p-5 rounded-2xl border border-slate-200 bg-white">
                <ManagerRegistrationForm
                  teamId={team.id}
                  seasonId={seasonStatus.seasonId!}
                  userId={user?.uid || ''}
                  onCancel={() => setShowManagerForm(false)}
                  onSuccess={() => {
                    setShowManagerForm(false);
                    fetchDashboardRef.current?.(true);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Quick Actions Grid - Fully Responsive */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">

          {/* Auction Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm hover:border-amber-400/40 transition-all duration-250">
            <div className="flex items-center gap-3 mb-4 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-lg">
                🔥
              </div>
              <h3 className="font-extrabold text-slate-900 uppercase tracking-tight text-sm">Auction</h3>
            </div>
            <div className="space-y-2">
              {/* Quick Links to Active Auctions */}
              {activeRounds.filter(r => r.round_type !== 'bulk').map(round => (
                <Link
                  key={round.id}
                  href={`/dashboard/team/round/${round.id}`}
                  className="block w-full px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition-all text-xs font-mono font-bold uppercase tracking-wider text-center"
                >
                  🔥 Round #{round.round_number}{round.position ? ` - ${round.position.includes(',') ? round.position.split(',').join(' + ') : round.position}` : ''}
                </Link>
              ))}

              {activeRounds.filter(r => r.round_type === 'bulk').map(round => (
                <Link
                  key={round.id}
                  href={`/dashboard/team/bulk-round/${round.id}`}
                  className="block w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-all text-xs font-mono font-bold uppercase tracking-wider text-center"
                >
                  ⚡ Bulk Round #{round.round_number}
                </Link>
              ))}

              {/* Pending Rounds */}
              {pendingRounds && pendingRounds.length > 0 && pendingRounds.map(round => (
                <div
                  key={round.id}
                  className="block w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 text-xs font-mono font-bold uppercase tracking-wider text-center cursor-not-allowed"
                >
                  ⏳ Round #{round.round_number} - Pending
                </div>
              ))}

              {activeBulkRounds.map(bulkRound => (
                <Link
                  key={bulkRound.id}
                  href={`/dashboard/team/bulk-round/${bulkRound.id}`}
                  className="block w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-all text-xs font-mono font-bold uppercase tracking-wider text-center"
                >
                  ⚡ Bulk Auction
                </Link>
              ))}

              {tiebreakers.filter(t => !t.is_bulk).map(tiebreaker => (
                <Link
                  key={tiebreaker.id}
                  href={`/dashboard/team/tiebreaker/${tiebreaker.id}`}
                  className="block w-full px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-all text-xs font-mono font-bold uppercase tracking-wider text-center animate-pulse"
                >
                  ⚠️ Tiebreaker - {tiebreaker.player.name}
                </Link>
              ))}

              {tiebreakers.filter(t => t.is_bulk).map(tiebreaker => (
                <Link
                  key={tiebreaker.id}
                  href={`/dashboard/team/bulk-tiebreaker/${tiebreaker.id}`}
                  className="block w-full px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-all text-xs font-mono font-bold uppercase tracking-wider text-center animate-pulse"
                >
                  🚨 Bulk Tiebreaker - {tiebreaker.player.name}
                </Link>
              ))}

              {activeBids.length > 0 && (
                <button onClick={() => setActiveTab('auctions')} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                  📋 {activeBids.length} Active Bid{activeBids.length > 1 ? 's' : ''}
                </button>
              )}

              {activeRounds.length === 0 && activeBulkRounds.length === 0 && tiebreakers.length === 0 && activeBids.length === 0 && (!pendingRounds || pendingRounds.length === 0) && (
                <div className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-150 text-slate-400 text-xs font-mono font-bold uppercase tracking-wider text-center">No active auctions</div>
              )}

              {roundResults.length > 0 && (
                <button onClick={() => setActiveTab('results')} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                  📊 View Results
                </button>
              )}

              <Link href="/dashboard/team/auction-results" className="block w-full px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                🎯 Auction Results
              </Link>
            </div>
          </div>

          {/* Team Management Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm hover:border-amber-400/40 transition-all duration-250">
            <div className="flex items-center gap-3 mb-4 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-lg">
                ⚽
              </div>
              <h3 className="font-extrabold text-slate-900 uppercase tracking-tight text-sm">Team</h3>
            </div>
            <div className="space-y-2">
              <button onClick={() => setActiveTab('squad')} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                ⚽ My Squad ({stats.playerCount}/{team.football_total_slots || MAX_PLAYERS_PER_TEAM})
              </button>
              <Link href="/dashboard/team/real-players" className="block w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                👥 Real Players
              </Link>
              <Link href="/dashboard/team/footballplayers" className="block w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                🏈 Auction Players
              </Link>
              <Link href="/dashboard/team/players-database" className="block w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                📊 My Players
              </Link>
            </div>
          </div>

          {/* Competition Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm hover:border-amber-400/40 transition-all duration-250">
            <div className="flex items-center gap-3 mb-4 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-lg">
                🏆
              </div>
              <h3 className="font-extrabold text-slate-900 uppercase tracking-tight text-sm">Competition</h3>
            </div>
            <div className="space-y-2">
              <Link href="/dashboard/team/matches" className="block w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                📅 Matches
              </Link>
              <Link href="/dashboard/team/all-teams" className="block w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                👥 All Teams
              </Link>
              <Link href="/dashboard/team/team-leaderboard" className="block w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                🏆 Team Standings
              </Link>
              <Link href="/dashboard/team/player-leaderboard" className="block w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                📋 Player Stats
              </Link>
              <Link href={`/awards/season/${seasonStatus.seasonId}`} className="block w-full px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                🏅 Season Awards
              </Link>
              <Link href="/dashboard/team/player-stats" className="block w-full px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                ⭐ Player Point Change
              </Link>
              <Link href="/dashboard/team/my-player-stats" className="block w-full px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                📊 My Player Stats
              </Link>
              <Link href="/dashboard/team/fantasy/my-team" className="block w-full px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                ⭐ Fantasy
              </Link>
              <Link href="/rules" className="block w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                📋 Rules
              </Link>
            </div>
          </div>

          {/* Planning Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm hover:border-amber-400/40 transition-all duration-250">
            <div className="flex items-center gap-3 mb-4 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-lg">
                ⚙️
              </div>
              <h3 className="font-extrabold text-slate-900 uppercase tracking-tight text-sm">Planning</h3>
            </div>
            <div className="space-y-2">
              <Link href="/dashboard/team/budget-planner" className="block w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                💰 Budget Planner
              </Link>
              <Link href="/dashboard/team/real-players-planner" className="block w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                👥 Real Players Planner
              </Link>
              <Link href="/dashboard/team/transactions" className="block w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                💳 Transactions
              </Link>
              <Link href="/dashboard/team/profile/edit" className="block w-full px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-all text-xs font-mono font-bold uppercase tracking-wider text-center">
                ⚙️ Settings
              </Link>
            </div>
          </div>
        </div>

        {/* URGENT: Tiebreaker Alerts - Fully Responsive */}
        {tiebreakers.length > 0 && (
          <div className="console-card bg-white border border-rose-200 rounded-3xl p-6 shadow-sm border-l-4 border-rose-500 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-xl">
                  🚨
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-rose-600 uppercase tracking-tight">URGENT: Active Tiebreakers</h2>
                  <p className="text-xs text-rose-500 font-sans">Action required immediately</p>
                </div>
              </div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-bold bg-rose-50 border border-rose-200 text-rose-800 uppercase tracking-wide">
                {tiebreakers.length} pending
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {tiebreakers.map(tiebreaker => (
                <div key={tiebreaker.id} className={`bg-slate-50 border border-slate-100 rounded-2xl p-4 border-l-4 ${!tiebreaker.new_amount ? 'border-rose-500' : 'border-emerald-500'}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-mono font-bold uppercase">{tiebreaker.player.position}</span>
                        <div className="font-bold text-slate-800 truncate">{tiebreaker.player.name}</div>
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-1">Round #{tiebreaker.round_id}</div>
                      <div className="flex flex-wrap gap-2 mt-2 font-mono">
                        <div className="text-[10px] px-2 py-1 bg-white border border-slate-150 rounded">
                          Original: <span className="font-bold text-slate-700">eCoin {tiebreaker.original_amount.toLocaleString()}</span>
                        </div>
                        {tiebreaker.new_amount && (
                          <div className="text-[10px] px-2 py-1 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded">
                            New: <span className="font-bold">eCoin {tiebreaker.new_amount.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <Link href={`/dashboard/team/${tiebreaker.is_bulk ? 'bulk-tiebreaker' : 'tiebreaker'}/${tiebreaker.id}`} className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider ${!tiebreaker.new_amount ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'} transition-colors whitespace-nowrap`}>
                      {tiebreaker.new_amount ? 'View' : 'Resolve'}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab Navigation - Fully Responsive */}
        <div className="bg-white border border-slate-200/60 rounded-t-3xl p-2 shadow-sm flex flex-wrap gap-1">
          <button
            onClick={() => setActiveTab('auctions')}
            className={`flex-1 px-6 py-3 rounded-2xl font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'auctions'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
            }`}
          >
            🔥 Auctions {(activeRounds.length > 0 || activeBids.length > 0 || (pendingRounds && pendingRounds.length > 0)) && `(${activeRounds.length + activeBids.length + (pendingRounds?.length || 0)})`}
          </button>
          <button
            onClick={() => setActiveTab('squad')}
            className={`flex-1 px-6 py-3 rounded-2xl font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'squad'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
            }`}
          >
            ⚽ Squad {players.length > 0 && `(${players.length})`}
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`flex-1 px-6 py-3 rounded-2xl font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'results'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
            }`}
          >
            📊 Results {roundResults.length > 0 && `(${roundResults.length})`}
          </button>
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 px-6 py-3 rounded-2xl font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
            }`}
          >
            📈 Overview
          </button>
          {dashboardData?.hasFantasyTeam && (
            <button
              onClick={() => setActiveTab('fantasy')}
              className={`flex-1 px-6 py-3 rounded-2xl font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'fantasy'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
              }`}
            >
              ⭐ Fantasy
            </button>
          )}
        </div>

        {/* Tab Content - Fully Responsive */}
        <div className="console-card bg-white border border-t-0 border-slate-200/60 rounded-b-3xl p-6 sm:p-8 shadow-sm">

          {/* Auctions Tab */}
          {activeTab === 'auctions' && (
            <div className="space-y-6">
              {activeRounds.length === 0 && activeBids.length === 0 && (!pendingRounds || pendingRounds.length === 0) ? (
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center p-4 bg-slate-50 border border-slate-100 rounded-full mb-4">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900 leading-tight">No Active Auctions</h3>
                  <p className="text-xs text-slate-400 font-mono uppercase mt-1">Check back when new rounds start</p>
                </div>
              ) : (
                <>
                  {/* Active Rounds */}
                  {activeRounds.map(round => (
                    <div key={round.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-6 border-l-4 border-amber-500 space-y-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-lg font-extrabold text-slate-900">
                              Round #{round.round_number}{round.round_type === 'bulk' ? ' - Bulk Bidding' : (round.position ? ` - ${round.position.includes(',') ? round.position.split(',').join(' + ') : round.position}` : '')}
                            </h3>
                            {round.round_type === 'bulk' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono font-bold uppercase">
                                ⚡ BULK
                              </span>
                            )}
                            {round.submission_status?.submitted ? (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-50 border border-emerald-200 text-emerald-800 uppercase tracking-wide">
                                ✓ Submitted ({round.submission_status.bid_count} bids)
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-50 border border-amber-200 text-amber-800 uppercase tracking-wide animate-pulse">
                                ⚠️ Not Submitted
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 font-sans mt-1">
                            {round.round_type === 'bulk'
                              ? `${round.player_count || 0} players • Fixed price bidding`
                              : `${round.player_count || 0} players • Max ${round.max_bids_per_team || 0} bids per team`
                            }
                          </p>
                        </div>
                        {round.end_time && (
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-100 font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                            <span className="text-xs font-bold text-rose-700">
                              {formatTime(timeRemaining[round.id] || 0)}
                            </span>
                          </div>
                        )}
                      </div>
                      <Link
                        href={round.round_type === 'bulk' ? `/dashboard/team/bulk-round/${round.id}` : `/dashboard/team/round/${round.id}`}
                        className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider"
                      >
                        {round.round_type === 'bulk' ? 'Enter Bulk Round →' : 'Enter Round →'}
                      </Link>
                    </div>
                  ))}

                  {/* Pending Rounds */}
                  {pendingRounds && pendingRounds.length > 0 && pendingRounds.map(round => (
                    <div key={round.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-6 border-l-4 border-amber-500/50">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-extrabold text-slate-900">
                              Round #{round.round_number}{round.position ? ` - ${round.position.includes(',') ? round.position.split(',').join(' + ') : round.position}` : ''}
                            </h3>
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-xs font-mono font-bold uppercase">
                              ⏳ PENDING
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 font-sans mt-1">
                            {round.player_count || 0} players • Results are being finalized
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-4 rounded-xl bg-amber-50 border border-amber-100">
                        <span className="text-lg">⏳</span>
                        <p className="text-xs text-amber-800 font-sans leading-relaxed">
                          <span className="font-bold">Results Pending:</span> The committee is reviewing the auction results. They will be published soon.
                        </p>
                      </div>
                    </div>
                  ))}

                  {/* Active Bids */}
                  {activeBids.length > 0 && (
                    <div>
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                        <div>
                          <h3 className="text-lg font-extrabold text-slate-900 uppercase tracking-tight">My Active Bids ({activeBids.length})</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-50 border border-emerald-200 text-emerald-800 uppercase tracking-wide">
                              ✓ {activeBids.length} bid{activeBids.length > 1 ? 's' : ''} submitted & confirmed
                            </div>
                          </div>
                        </div>
                        <input
                          type="text"
                          placeholder="Search bids..."
                          value={bidSearchTerm}
                          onChange={(e) => setBidSearchTerm(e.target.value)}
                          className="w-full sm:w-64 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-sans"
                        />
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {filteredBids.map(bid => (
                          <div key={bid.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 hover:border-amber-400/40 transition-all duration-250 border-l-4 border-emerald-500">
                            <div className="flex items-center justify-between mb-3 border-b border-slate-200/40 pb-2">
                              <div className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono font-bold uppercase">
                                Submitted
                              </div>
                              <button
                                onClick={() => handleDeleteBid(bid.id)}
                                className="p-1.5 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-105 transition-colors"
                                title="Delete bid"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0 font-mono">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-mono font-bold uppercase">
                                    {bid.player.position}
                                  </span>
                                  <span className="font-bold text-slate-800 truncate">{bid.player.name}</span>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-slate-400">
                                  <span>{bid.player.nfl_team}</span>
                                  <span>•</span>
                                  <span className="font-black text-amber-600">eCoin {bid.amount.toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Squad Tab */}
          {activeTab === 'squad' && (
            <div className="space-y-6">
              {players.length === 0 ? (
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center p-4 bg-slate-50 border border-slate-100 rounded-full mb-4">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900 leading-tight">No Players Yet</h3>
                  <p className="text-xs text-slate-400 font-mono uppercase mt-1 mb-4">Start bidding in auctions to build your squad</p>
                  <button
                    onClick={() => setActiveTab('auctions')}
                    className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Go to Auctions
                  </button>
                </div>
              ) : (
                <>
                  {/* Filters */}
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
                    <input
                      type="text"
                      placeholder="Search players..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-sans"
                    />
                    <select
                      value={selectedPosition}
                      onChange={(e) => setSelectedPosition(e.target.value)}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-mono font-bold"
                    >
                      <option value="all">All Positions</option>
                      {POSITIONS.map(pos => (
                        <option key={pos} value={pos}>{pos}</option>
                      ))}
                    </select>
                  </div>

                  {/* Squad Stats Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center font-mono">
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Total Players</div>
                      <div className="text-xl font-black text-slate-800">{players.length}/{MAX_PLAYERS_PER_TEAM}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center font-mono">
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Avg Rating</div>
                      <div className="text-xl font-black text-amber-600">{stats.avgRating.toFixed(1)}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center font-mono">
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">eCoin Spent</div>
                      <div className="text-xl font-black text-slate-800">{(team.football_spent || 0).toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center font-mono">
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">eCoin Left</div>
                      <div className="text-xl font-black text-amber-600">{(team.football_budget || 0).toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center font-mono">
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">SSCoin</div>
                      <div className="text-xl font-black text-emerald-600">{(team.real_player_budget || 0).toLocaleString()}</div>
                    </div>
                  </div>

                  {/* Players Grid */}
                  {filteredPlayers.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-slate-400 text-xs font-mono uppercase">No players match your filters</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredPlayers.map(player => (
                        <div key={player.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 hover:border-amber-400/40 transition-all duration-250">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-white font-mono font-bold text-xs uppercase">
                                {player.position}
                              </div>
                              <div className="font-mono">
                                <div className="font-bold text-slate-800 text-sm truncate">{player.name}</div>
                                <div className="text-xs text-slate-400">{player.nfl_team}</div>
                              </div>
                            </div>
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200">
                              <span className="text-[10px] font-mono font-bold text-amber-800">OVR {player.overall_rating}</span>
                            </div>
                          </div>
                          {player.acquisition_value && (
                            <div className="pt-3 border-t border-slate-200/40 font-mono">
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-400">Acquisition</span>
                                <span className="font-bold text-amber-600">eCoin {player.acquisition_value.toLocaleString()}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Real Players Section (SS Members) */}
                  {team.real_players && team.real_players.length > 0 && (
                    <div className="mt-8 pt-8 border-t border-slate-200/40">
                      <h3 className="text-base font-extrabold text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
                        <span>👥 Real Players (SS Members)</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-50 border border-amber-200 text-amber-800 uppercase tracking-wide">
                          {team.real_players.length}
                        </span>
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {team.real_players.map((player, idx) => (
                          <div key={idx} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 hover:border-amber-400/40 transition-all duration-250 border-l-4 border-amber-500">
                            <div className="flex items-start justify-between mb-3 font-mono">
                              <div>
                                <div className="font-bold text-slate-800 mb-1">{player.name}</div>
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${player.category === 'legend'
                                    ? 'bg-amber-100 border border-amber-200 text-amber-800'
                                    : 'bg-slate-200 border border-slate-300 text-slate-700'
                                    }`}>
                                    {player.category === 'legend' ? '⭐ Legend' : 'Classic'}
                                  </span>
                                  <span className="text-[10px] text-amber-500 tracking-wider">
                                    {'★'.repeat(player.starRating)}{'☆'.repeat(10 - player.starRating)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-200/40 text-xs font-mono">
                              <div>
                                <div className="text-slate-400 uppercase text-[10px] font-bold">Auction</div>
                                <div className="font-bold text-slate-700">SSCoin {player.auctionValue.toLocaleString()}</div>
                              </div>
                              <div>
                                <div className="text-slate-400 uppercase text-[10px] font-bold">Points</div>
                                <div className="font-black text-amber-600">{player.points}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Results Tab */}
          {activeTab === 'results' && (
            <div className="space-y-6">
              {roundResults.length === 0 ? (
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center p-4 bg-slate-50 border border-slate-100 rounded-full mb-4">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900 leading-tight">No Results Yet</h3>
                  <p className="text-xs text-slate-400 font-mono uppercase mt-1">Results will appear here after rounds end</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <h3 className="text-lg font-extrabold text-slate-900 uppercase tracking-tight">Players Won ({roundResults.length})</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setResultFilter('all')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all ${resultFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setResultFilter('won')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all ${resultFilter === 'won' ? 'bg-emerald-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                      >
                        Won
                      </button>
                      <button
                        onClick={() => setResultFilter('lost')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all ${resultFilter === 'lost' ? 'bg-rose-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                      >
                        Lost
                      </button>
                    </div>
                  </div>

                  {/* Results Grid */}
                  {filteredResults.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-slate-400 text-xs font-mono uppercase">No results match your filter</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filteredResults.map(result => (
                        <div
                          key={result.id}
                          className={`bg-slate-50 border border-slate-100 rounded-2xl p-4 hover:border-amber-400/40 transition-all duration-250 border-l-4 ${result.won ? 'border-emerald-500' : 'border-rose-500'}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-mono font-bold text-xs uppercase bg-slate-800 shrink-0">
                              {result.player.position}
                            </div>
                            <div className="flex-1 min-w-0 font-mono">
                              <div className="font-bold text-slate-800 truncate">{result.player.name}</div>
                              <div className="text-xs text-slate-400 truncate">{result.player.nfl_team}</div>
                              <div className="flex items-center gap-1.5 mt-2">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${result.won ? 'bg-emerald-50 border border-emerald-100 text-emerald-800' : 'bg-rose-50 border border-rose-100 text-rose-800'}`}>
                                  {result.won ? 'WON' : 'LOST'}
                                </span>
                                <span className="text-xs font-black text-amber-600">eCoin {result.bid_amount.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <h3 className="text-lg font-extrabold text-slate-900 uppercase tracking-tight">Team Overview</h3>

              {/* Owner and Manager Section */}
              {(dashboardData?.owner || dashboardData?.manager) && (
                <div>
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider font-mono mb-3">Team Management</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Owner Card */}
                    {dashboardData?.owner && (
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 border-l-4 border-amber-500">
                        <div className="flex items-center gap-4">
                          {dashboardData.owner.photo_url ? (
                            <img
                              src={dashboardData.owner.photo_url}
                              alt={dashboardData.owner.name}
                              className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shadow-sm"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                              <span className="text-2xl font-black text-amber-600 font-mono">
                                {dashboardData.owner.name[0]?.toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="flex-1 font-mono">
                            <div className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Team Owner</div>
                            <div className="font-bold text-slate-850">{dashboardData.owner.name}</div>
                            {dashboardData.owner.place && (
                              <div className="text-xs text-slate-400 mt-1">{dashboardData.owner.place}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Manager Card */}
                    {dashboardData?.manager && (
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 border-l-4 border-emerald-500">
                        <div className="flex items-center gap-4">
                          {dashboardData.manager.photo_url ? (
                            <img
                              src={dashboardData.manager.photo_url}
                              alt={dashboardData.manager.name}
                              className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shadow-sm"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                              <span className="text-2xl font-black text-emerald-600 font-mono">
                                {dashboardData.manager.name[0]?.toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="flex-1 font-mono">
                            <div className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">
                              Team Manager {dashboardData.manager.is_player && '(Playing)'}
                            </div>
                            <div className="font-bold text-slate-850">{dashboardData.manager.name}</div>
                            {dashboardData.manager.place && (
                              <div className="text-xs text-slate-400 mt-1">{dashboardData.manager.place}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Position Breakdown */}
              <div>
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider font-mono mb-3">Position Breakdown</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {POSITIONS.map(position => {
                    const count = stats.positionBreakdown[position] || 0;
                    return (
                      <div key={position} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 font-mono flex justify-between items-center">
                        <span className="text-xs text-slate-400 font-bold uppercase">{position}</span>
                        <span className="text-xl font-black text-slate-800">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Team Stats */}
              <div>
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider font-mono mb-3">Season Statistics</h4>
                {team.currency_system === 'dual' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 font-mono">
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-center">
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-1.5">Total Bids</div>
                      <div className="text-3xl font-black text-slate-800">{activeBids.length + roundResults.length}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-center">
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-1.5">Success Rate</div>
                      <div className="text-3xl font-black text-emerald-600">
                        {roundResults.length > 0
                          ? `${Math.round((roundResults.filter(r => r.won).length / roundResults.length) * 100)}%`
                          : '0%'
                        }
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-center">
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-1.5">eCoin Spent</div>
                      <div className="text-3xl font-black text-slate-800">{(team.football_spent || 0).toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-center">
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-1.5">eCoin Left</div>
                      <div className="text-3xl font-black text-amber-600">{(team.football_budget || 0).toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-center">
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-1.5">SSCoin Budget</div>
                      <div className="text-3xl font-black text-emerald-600">{(team.real_player_budget || 0).toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-center">
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-1.5">Avg Per Player</div>
                      <div className="text-3xl font-black text-amber-600">
                        {players.length > 0 ? Math.round((team.football_spent || 0) / players.length).toLocaleString() : '0'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-center">
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-1.5">Total Bids</div>
                      <div className="text-3xl font-black text-slate-800">{activeBids.length + roundResults.length}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-center">
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-1.5">Success Rate</div>
                      <div className="text-3xl font-black text-emerald-600">
                        {roundResults.length > 0
                          ? `${Math.round((roundResults.filter(r => r.won).length / roundResults.length) * 100)}%`
                          : '0%'
                        }
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-center">
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-1.5">Total Invested</div>
                      <div className="text-3xl font-black text-slate-800">{stats.totalSpent.toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-center">
                      <div className="text-[10px] text-slate-400 font-bold uppercase mb-1.5">Avg Per Player</div>
                      <div className="text-3xl font-black text-amber-600">
                        {players.length > 0 ? Math.round(stats.totalSpent / players.length).toLocaleString() : '0'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div>
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider font-mono mb-3">Quick Links</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-center">
                  <Link href="/dashboard/team/profile" className="bg-slate-50 border border-slate-100 rounded-2xl p-5 hover:border-amber-400/40 transition-all duration-250">
                    <div className="text-3xl mb-2">👤</div>
                    <div className="font-bold text-slate-800 text-sm uppercase">Team Profile</div>
                  </Link>
                  <Link href="/dashboard/team/budget-planner" className="bg-slate-50 border border-slate-100 rounded-2xl p-5 hover:border-amber-400/40 transition-all duration-250">
                    <div className="text-3xl mb-2">💰</div>
                    <div className="font-bold text-slate-800 text-sm uppercase">Budget Planner</div>
                  </Link>
                  <Link href="/dashboard/team/real-players-planner" className="bg-slate-50 border border-slate-100 rounded-2xl p-5 hover:border-amber-400/40 transition-all duration-250">
                    <div className="text-3xl mb-2">👥</div>
                    <div className="font-bold text-slate-800 text-sm uppercase">Real Players Planner</div>
                  </Link>
                  <Link href="/dashboard/team/matches" className="bg-slate-50 border border-slate-100 rounded-2xl p-5 hover:border-amber-400/40 transition-all duration-250">
                    <div className="text-3xl mb-2">📅</div>
                    <div className="font-bold text-slate-800 text-sm uppercase">Match Schedule</div>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Fantasy Tab */}
          {activeTab === 'fantasy' && dashboardData?.hasFantasyTeam && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h3 className="text-lg font-extrabold text-slate-900 uppercase tracking-tight">Fantasy League</h3>
                <Link
                  href="/dashboard/team/fantasy/my-team"
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                >
                  View Full Stats →
                </Link>
              </div>

              <p className="text-slate-500 text-sm font-sans">
                You're registered for the fantasy league! Manage your fantasy team, view leaderboards, and compete with other teams.
              </p>

              {/* Quick Fantasy Links */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 font-mono text-center">
                <Link
                  href="/dashboard/team/fantasy/my-team"
                  className="bg-slate-50 border border-slate-100 rounded-2xl p-5 hover:border-amber-400/40 transition-all duration-250 border-l-4 border-amber-500"
                >
                  <div className="text-3xl mb-2">⚽</div>
                  <div className="font-bold text-slate-800 text-sm uppercase">My Fantasy Team</div>
                  <div className="text-xs text-slate-400 mt-1 font-sans">View your squad and stats</div>
                </Link>

                <Link
                  href="/dashboard/team/fantasy/leaderboard"
                  className="bg-slate-50 border border-slate-100 rounded-2xl p-5 hover:border-amber-400/40 transition-all duration-250 border-l-4 border-amber-500"
                >
                  <div className="text-3xl mb-2">🏆</div>
                  <div className="font-bold text-slate-800 text-sm uppercase">Leaderboard</div>
                  <div className="text-xs text-slate-400 mt-1 font-sans">Check your ranking</div>
                </Link>

                <Link
                  href="/dashboard/team/fantasy/draft"
                  className="bg-slate-50 border border-slate-100 rounded-2xl p-5 hover:border-amber-400/40 transition-all duration-250 border-l-4 border-emerald-500"
                >
                  <div className="text-3xl mb-2">➕</div>
                  <div className="font-bold text-slate-805 text-sm uppercase">Draft Players</div>
                  <div className="text-xs text-slate-400 mt-1 font-sans">Add players to your team</div>
                </Link>

                <Link
                  href="/dashboard/team/fantasy/transfers"
                  className="bg-slate-50 border border-slate-100 rounded-2xl p-5 hover:border-amber-400/40 transition-all duration-250 border-l-4 border-blue-500"
                >
                  <div className="text-3xl mb-2">🔄</div>
                  <div className="font-bold text-slate-800 text-sm uppercase">Transfers</div>
                  <div className="text-xs text-slate-400 mt-1 font-sans">Manage your transfers</div>
                </Link>

                <Link
                  href="/dashboard/team/fantasy/all-teams"
                  className="bg-slate-50 border border-slate-100 rounded-2xl p-5 hover:border-amber-400/40 transition-all duration-250 border-l-4 border-rose-500"
                >
                  <div className="text-3xl mb-2">👥</div>
                  <div className="font-bold text-slate-800 text-sm uppercase">All Teams</div>
                  <div className="text-xs text-slate-400 mt-1 font-sans">View all fantasy teams</div>
                </Link>
              </div>

              {/* Info Banner */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 border-l-4 border-amber-500">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-lg shrink-0">
                    ℹ️
                  </div>
                  <div className="flex-1 font-sans">
                    <h4 className="font-bold text-slate-800 text-sm mb-1">About Fantasy League</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Draft real players from registered teams to build your fantasy squad. Earn points based on their match performance,
                      including goals, clean sheets, and man of the match awards. Compete with other managers to top the leaderboard!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Components */}
        <AlertModal
          isOpen={alertState.isOpen}
          onClose={closeAlert}
          title={alertState.title}
          message={alertState.message}
          type={alertState.type}
        />

        <ConfirmModal
          isOpen={confirmState.isOpen}
          onConfirm={handleConfirm}
          onCancel={closeConfirm}
          title={confirmState.title}
          message={confirmState.message}
          confirmText={confirmState.confirmText}
          cancelText={confirmState.cancelText}
          type={confirmState.type}
        />
      </div>
    </div>
  );
}
