'use client';

import { Star } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import ConfirmModal from '@/components/modals/ConfirmModal';
import { useAuctionWebSocket } from '@/hooks/useWebSocket';
import { fetchWithTokenRetry } from '@/lib/fetch-with-retry';
import { PlayerAvatar } from '@/components/PlayerImage';

interface Player {
  id: string;
  name: string;
  position: string;
  team_name: string;
  overall_rating: number;
  playing_style?: string;
  is_starred?: boolean;
  photo_url?: string | null;
  player_id?: string | number;
}

interface BulkRound {
  id: number;
  round_number: number;
  status: string;
  base_price: number;
  start_time?: string;
  end_time?: string;
  duration_seconds: number;
  player_count: number;
}

interface PlayerCardProps {
  player: Player;
  isBidded: boolean;
  basePrice: number;
  onToggle: (id: string) => void;
}

const PlayerCard = React.memo(({ player, isBidded, basePrice, onToggle }: PlayerCardProps) => {
  return (
    <button
      onClick={() => onToggle(player.id)}
      className={`bg-white border border-slate-200/60 rounded-2xl p-3 sm:p-4 transition-colors text-left active:scale-98 touch-manipulation font-mono border-l-4 w-full flex items-center gap-3 ${
        isBidded
          ? 'border-emerald-500 bg-emerald-50/20 border-l-emerald-500'
          : player.is_starred
          ? 'hover:border-amber-400/40 border-l-amber-500'
          : 'hover:border-amber-400/40 border-l-slate-300'
      }`}
    >
      {/* Player Avatar */}
      <div className="flex-shrink-0">
        <PlayerAvatar
          playerId={player.player_id || player.id}
          playerName={player.name}
          size={44}
        />
      </div>

      {/* Player Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
              <h3 className="font-extrabold text-sm text-slate-800 truncate uppercase tracking-wide">{player.name}</h3>
              {player.is_starred && (
                <span className="px-1.5 py-0.5 text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200/60 rounded-lg">
                  STARRED
                </span>
              )}
              {isBidded && (
                <span className="px-1.5 py-0.5 text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-lg whitespace-nowrap">
                  BID
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] text-slate-400 uppercase font-bold flex-wrap">
              <span className="px-1.5 sm:px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-lg">
                {player.position}
              </span>
              <span className="hidden sm:inline">•</span>
              <span className="truncate">{player.team_name}</span>
            </div>
          </div>
          <div className={`w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 rounded-xl border flex items-center justify-center transition-all ${
            isBidded
              ? 'bg-emerald-600 border-emerald-600 shadow-md text-white'
              : 'border-slate-200 bg-slate-50'
          }`}>
            {isBidded && (
              <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs mt-2 pt-1 border-t border-slate-50">
          <span className="text-slate-400 font-bold flex items-center gap-1">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400 inline" /> {player.overall_rating}
          </span>
          {player.playing_style && (
            <span className="text-[9px] text-slate-400 uppercase font-bold truncate max-w-[100px] sm:max-w-none">{player.playing_style}</span>
          )}
        </div>
      </div>
    </button>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.isBidded === nextProps.isBidded &&
    prevProps.basePrice === nextProps.basePrice &&
    prevProps.player.id === nextProps.player.id &&
    prevProps.player.is_starred === nextProps.player.is_starred &&
    prevProps.player.name === nextProps.player.name &&
    prevProps.player.position === nextProps.player.position &&
    prevProps.player.team_name === nextProps.player.team_name &&
    prevProps.player.overall_rating === nextProps.player.overall_rating &&
    prevProps.player.playing_style === nextProps.player.playing_style
  );
});

PlayerCard.displayName = 'PlayerCard';

export default function TeamBulkRoundPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const roundId = params?.id as string;

  const [bulkRound, setBulkRound] = useState<BulkRound | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [biddedPlayers, setBiddedPlayers] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [dbBids, setDbBids] = useState<Set<string>>(new Set());

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
  const [isLoading, setIsLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [teamBalance, setTeamBalance] = useState(1000);
  const [filterPosition, setFilterPosition] = useState<string>('all');
  const [filterStarred, setFilterStarred] = useState(false);
  const [squadInfo, setSquadInfo] = useState({ current: 0, max: 25, available: 25 });
  const [bidsCount, setBidsCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterPosition, filterStarred]);

  // [INFO] Enable WebSocket for real-time bid updates and round updates
  const { isConnected, lastMessage } = useAuctionWebSocket(roundId, true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch round and players
  useEffect(() => {
    const fetchData = async () => {
      // Wait for auth to be ready and user to be loaded
      if (!roundId || loading || !user) {
        console.log('[PENDING] Waiting for auth...', { roundId: !!roundId, loading, user: !!user });
        return;
      }

      setIsLoading(true);
      try {
        console.log(`[LAUNCH] Fetching bulk round ${roundId}...`);
        
        // Fetch round details and players
        const response = await fetchWithTokenRetry(`/api/team/bulk-rounds/${roundId}`);
        const { success, data, error } = await response.json();

        if (!success) {
          throw new Error(error || 'Failed to fetch round data');
        }

        console.log('[SUCCESS] Round data fetched successfully');
        
        // Check if round is completed/finalized - redirect immediately
        if (data.round.status === 'completed' || data.round.status === 'cancelled' || data.round.status === 'pending_tiebreakers') {
          console.log(`[WARNING] Round is ${data.round.status} - redirecting to dashboard`);
          const statusMessage = data.round.status === 'pending_tiebreakers' 
            ? 'has been finalized and tiebreakers have been created'
            : `has been ${data.round.status}`;
          showAlert({
            type: 'info',
            title: 'Round Ended',
            message: `This bulk round ${statusMessage}. Redirecting to dashboard...`
          });
          setTimeout(() => {
            router.push('/dashboard');
          }, 2000);
          return;
        }
        
        setBulkRound(data.round);
        setPlayers(data.players || []);
        setTeamBalance(data.balance || 1000);
        if (data.squad) {
          setSquadInfo(data.squad);
        }


        // Fetch team's existing bids
        const bidsResponse = await fetchWithTokenRetry(`/api/team/bulk-rounds/${roundId}/bids`);
        const bidsData = await bidsResponse.json();
        
        if (bidsData.success && bidsData.data.bids) {
          const bidPlayerIds = new Set(bidsData.data.bids.map((b: any) => b.player_id) as string[]);
          setDbBids(new Set(bidPlayerIds));
          setBiddedPlayers(bidPlayerIds);
          setBidsCount(bidsData.data.count || 0);
        }
      } catch (err: any) {
        console.error('Error fetching data:', err);
        showAlert({
          type: 'error',
          title: 'Error',
          message: err.message || 'Failed to load round data'
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [roundId, loading, user]);

  // Listen for WebSocket updates (round metadata changes)
  useEffect(() => {
    if (!lastMessage) return;

    try {
      const message = JSON.parse(lastMessage);
      console.log('[INFO] WebSocket message received:', message);

      // Handle round update (timer extension, etc.)
      if (message.type === 'round_updated') {
        console.log('[SYNC] Round metadata updated via WebSocket', message);
        
        // If round is completed/finalized, redirect to dashboard
        if (message.status === 'completed' || message.status === 'pending_tiebreakers') {
          console.log(`[SUCCESS] Round ${message.status} - redirecting to dashboard...`);
          const statusMessage = message.status === 'pending_tiebreakers'
            ? 'has been finalized. Tiebreakers have been created for contested players.'
            : 'has been completed.';
          showAlert({
            type: 'success',
            title: 'Round Finalized',
            message: `This bulk round ${statusMessage} Redirecting to dashboard...`
          });
          setTimeout(() => {
            router.push('/dashboard');
          }, 2000);
          return;
        }
        
        setBulkRound(prev => {
          if (!prev) return prev;
          console.log('[SYNC] Updating round state', { old: prev.end_time, new: message.end_time });
          return {
            ...prev,
            end_time: message.end_time || prev.end_time,
            duration_seconds: message.duration_seconds || prev.duration_seconds,
            status: message.status || prev.status,
          };
        });
      }

      // Handle bid updates
      if (message.type === 'bid_added' || message.type === 'bid_removed' || message.type === 'bulk_bids_updated') {
        console.log('[INFO] Bid update via WebSocket:', message.type);
        // Refetch bids to stay in sync
        fetchWithTokenRetry(`/api/team/bulk-rounds/${roundId}/bids`)
          .then(res => res.json())
          .then(data => {
            if (data.success && data.data.bids) {
              const bidPlayerIds = new Set(data.data.bids.map((b: any) => b.player_id) as string[]);
              setDbBids(new Set(bidPlayerIds));
              if (!hasUnsavedChangesRef.current) {
                setBiddedPlayers(bidPlayerIds);
                setBidsCount(data.data.count || 0);
              }
            }
          })
          .catch(err => console.error('Error refetching bids:', err));
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  }, [lastMessage, roundId]);





  // Timer countdown
  useEffect(() => {
    if (bulkRound?.status === 'active' && bulkRound.end_time) {
      const timer = setInterval(() => {
        const now = new Date().getTime();
        const end = new Date(bulkRound.end_time!).getTime();
        const remaining = Math.max(0, Math.floor((end - now) / 1000));
        setTimeRemaining(remaining);
        
        // Auto-redirect when timer reaches 0
        if (remaining === 0) {
          console.log('[INFO] Timer reached 0 - round should be completed');
          showAlert({
            type: 'info',
            title: 'Round Ended',
            message: 'Time is up! Waiting for admin to finalize results...'
          });
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [bulkRound, router, showAlert]);

  const squadInfoRef = useRef(squadInfo);
  const bidsCountRef = useRef(bidsCount);
  const teamBalanceRef = useRef(teamBalance);
  const bulkRoundRef = useRef(bulkRound);
  const biddedPlayersRef = useRef(biddedPlayers);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const dbBidsRef = useRef(dbBids);

  squadInfoRef.current = squadInfo;
  bidsCountRef.current = bidsCount;
  teamBalanceRef.current = teamBalance;
  bulkRoundRef.current = bulkRound;
  biddedPlayersRef.current = biddedPlayers;
  hasUnsavedChangesRef.current = hasUnsavedChanges;
  dbBidsRef.current = dbBids;

  const checkHasChanges = (local: Set<string>, db: Set<string>) => {
    if (local.size !== db.size) return true;
    for (const id of local) {
      if (!db.has(id)) return true;
    }
    return false;
  };

  const handleTogglePlayer = useCallback((playerId: string) => {
    const currentBidded = biddedPlayersRef.current;
    const isBidded = currentBidded.has(playerId);
    const currentBidsCount = bidsCountRef.current;
    const currentSquadInfo = squadInfoRef.current;
    const currentTeamBalance = teamBalanceRef.current;
    const currentBulkRound = bulkRoundRef.current;
    
    // Check constraints if adding a bid
    if (!isBidded) {
      // Check if slots available
      const availableSlots = currentSquadInfo.max - currentSquadInfo.current;
      if (currentBidsCount + 1 > availableSlots) {
        showAlert({
          type: 'error',
          title: 'No Slots Available',
          message: `No squad slots available. Current: ${currentSquadInfo.current}/${currentSquadInfo.max}, Bids: ${currentBidsCount}`
        });
        return;
      }
      
      // Check balance
      const totalReserved = (currentBidsCount + 1) * (currentBulkRound?.base_price || 10);
      if (currentTeamBalance < totalReserved) {
        showAlert({
          type: 'error',
          title: 'Insufficient Balance',
          message: `Insufficient balance! Required: £${totalReserved}, Available: £${currentTeamBalance}`
        });
        return;
      }
    }

    // Update local state for fast UI feedback
    const newBidded = new Set(currentBidded);
    if (isBidded) {
      newBidded.delete(playerId);
      setBidsCount(prev => prev - 1);
    } else {
      newBidded.add(playerId);
      setBidsCount(prev => prev + 1);
    }
    setBiddedPlayers(newBidded);
    setHasUnsavedChanges(checkHasChanges(newBidded, dbBidsRef.current));
  }, [showAlert]);

  const handleSaveBulkBids = async (selectedPlayerIds: Set<string>) => {
    const playerIdsArray = Array.from(selectedPlayerIds);
    const requestedBidsCount = playerIdsArray.length;
    
    // 1. Check squad slots constraint
    const availableSlots = squadInfo.max - squadInfo.current;
    if (requestedBidsCount > availableSlots) {
      showAlert({
        type: 'error',
        title: 'Validation Failed',
        message: `Insufficient squad slots. You are trying to place ${requestedBidsCount} bids, but you only have ${availableSlots} slots available.`
      });
      return;
    }

    // 2. Check total budget constraint
    const totalCost = requestedBidsCount * (bulkRound?.base_price || 10);
    if (teamBalance < totalCost) {
      showAlert({
        type: 'error',
        title: 'Validation Failed',
        message: `Insufficient balance. Required: £${totalCost}, Available: £${teamBalance}.`
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetchWithTokenRetry(`/api/team/bulk-rounds/${roundId}/bids/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_ids: playerIdsArray })
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to save bulk bids');
      }
      setDbBids(new Set(selectedPlayerIds));
      setHasUnsavedChanges(false);
      showAlert({
        type: 'success',
        title: 'Bids Submitted',
        message: 'Your bulk round bids have been saved and submitted successfully!'
      });
    } catch (err: any) {
      console.error('Failed to save bulk bids:', err);
      showAlert({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Failed to save bulk bids'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Warn user about unsaved changes when trying to close/leave page
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved bulk bids. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimerColor = () => {
    if (timeRemaining === 0) return 'text-rose-600';
    if (timeRemaining < 300) return 'text-rose-600 animate-pulse';
    if (timeRemaining < 600) return 'text-amber-500';
    return 'text-emerald-600';
  };

  const filteredPlayers = useMemo(() => {
    return players.filter(player => {
      const matchesSearch = player.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPosition = filterPosition === 'all' || player.position === filterPosition;
      const matchesStarred = !filterStarred || player.is_starred;
      return matchesSearch && matchesPosition && matchesStarred;
    });
  }, [players, searchTerm, filterPosition, filterStarred]);

  const sortedPlayers = useMemo(() => {
    return [...filteredPlayers].sort((a, b) => {
      if (a.is_starred && !b.is_starred) return -1;
      if (!a.is_starred && b.is_starred) return 1;
      return b.overall_rating - a.overall_rating;
    });
  }, [filteredPlayers]);

  const biddedPlayersList = useMemo(() => {
    return players.filter(player => biddedPlayers.has(player.id));
  }, [players, biddedPlayers]);

  const starredPlayersCount = useMemo(() => {
    return players.filter(p => p.is_starred).length;
  }, [players]);

  const totalPages = Math.ceil(sortedPlayers.length / itemsPerPage);

  const paginatedPlayers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedPlayers.slice(start, start + itemsPerPage);
  }, [sortedPlayers, currentPage]);

  const totalCost = bidsCount * (bulkRound?.base_price || 10);
  const remainingBalance = teamBalance - totalCost;
  const vacantSlots = squadInfo.max - squadInfo.current;
  const availableSlotsNow = vacantSlots - bidsCount;

  if (loading || !user || user.role !== 'team' || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading bulk round...</p>
        </div>
      </div>
    );
  }

  if (!bulkRound) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Bulk round not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Header */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-4 sm:p-6 shadow-sm font-mono mb-4 sm:mb-6">
          <div className="flex items-start sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <Link
              href="/dashboard/team"
              className="text-slate-500 hover:text-amber-600 transition-colors p-1 hover:bg-slate-50 rounded-lg mt-1 sm:mt-0"
              aria-label="Back to dashboard"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800 truncate">
                  Bulk Round {bulkRound.round_number}
                </h1>
                {/* WebSocket Status */}
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider ${
                  isConnected 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}>
                  <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                    isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
                  }`}></span>
                  {isConnected ? 'Live' : 'Offline'}
                </span>
                {isSaving ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider bg-blue-50 text-blue-700 border-blue-200">
                    Saving...
                  </span>
                ) : hasUnsavedChanges ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider bg-amber-50 text-amber-700 border-amber-200 animate-pulse">
                    Unsaved Changes
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider bg-slate-50 text-slate-700 border-slate-200">
                    Saved
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 uppercase font-semibold mt-1 sm:mt-2">
                Click players to bid £{bulkRound.base_price} each
              </p>
            </div>
          </div>
        </div>

        {/* Timer and Info Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6 font-mono">
          <div className="console-card bg-white border border-slate-200/60 rounded-xl p-3 sm:p-4 shadow-sm">
            <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Time Left</div>
            <div className={`text-lg sm:text-xl md:text-2xl font-black ${getTimerColor()}`}>
              {formatTime(timeRemaining)}
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-xl p-3 sm:p-4 shadow-sm">
            <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Price</div>
            <div className="text-lg sm:text-xl md:text-2xl font-black text-slate-800">£{bulkRound.base_price}</div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-xl p-3 sm:p-4 shadow-sm">
            <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Balance</div>
            <div className="text-lg sm:text-xl md:text-2xl font-black text-emerald-600">£{teamBalance}</div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-xl p-3 sm:p-4 shadow-sm">
            <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Squad</div>
            <div className={`text-lg sm:text-xl md:text-2xl font-black ${
              squadInfo.available > 0 ? 'text-blue-600' : 'text-rose-600'
            }`}>
              {squadInfo.current}/{squadInfo.max}
            </div>
            <div className="text-[9px] text-slate-400 uppercase font-bold mt-0.5">
              <span>current</span>
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-xl p-3 sm:p-4 shadow-sm col-span-2 sm:col-span-1">
            <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Your Bids</div>
            <div className={`text-lg sm:text-xl md:text-2xl font-black ${
              bidsCount > 0 ? 'text-blue-600' : 'text-slate-400'
            }`}>
              {bidsCount}
            </div>
            <div className="text-[9px] text-slate-400 uppercase font-bold mt-0.5">
              {availableSlotsNow} slots left
            </div>
          </div>
        </div>


        {/* Info Card - Collapsible on mobile */}
        <details className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 shadow-sm group font-mono" open>
          <summary className="flex items-center gap-2 sm:gap-3 cursor-pointer list-none">
            <div className="p-1.5 sm:p-2 rounded-xl bg-slate-50 border border-slate-200">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-slate-800 flex-1">How It Works</h3>
            <svg className="w-5 h-5 text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <ul className="space-y-1.5 sm:space-y-2 text-[10px] sm:text-xs text-slate-500 uppercase font-semibold mt-3 sm:mt-4 ml-10 sm:ml-11 list-disc">
            <li>Click any player to select and place a bid of £{bulkRound.base_price}</li>
            <li>Click again to remove your selected bid</li>
            <li>You must select exactly enough players to fill all vacant squad slots</li>
            <li>Bids are saved as a draft until you click "Submit Bids"</li>
            <li>Unsubmitted changes will be lost if you refresh or exit the page</li>
          </ul>
        </details>

        {/* Your Bidded Players */}
        {(bidsCount > 0 || hasUnsavedChanges) && (
          <div className="console-card bg-white border border-emerald-500 rounded-3xl p-4 sm:p-6 mb-4 sm:mb-6 shadow-sm font-mono border-l-8 border-l-emerald-500 animate-fadeIn">
            <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-slate-800 mb-3 sm:mb-4 flex items-center">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Your Bids ({bidsCount})
            </h2>

            {biddedPlayersList.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-emerald-200 bg-emerald-50/10 rounded-2xl mb-4">
                <p className="text-slate-400 text-xs font-mono font-bold uppercase">No active bids selected</p>
                <p className="text-[10px] text-slate-400 font-mono mt-1">Select players from the grid below to bid</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-3 sm:mb-4">
                {biddedPlayersList.map((player) => (
                  <div
                    key={player.id}
                    className="console-card bg-emerald-50/30 border border-emerald-200 rounded-2xl p-3 sm:p-4 hover:shadow-md transition-shadow font-mono border-l-4 border-l-emerald-500 flex items-center gap-3"
                  >
                    {/* Player Avatar */}
                    <div className="flex-shrink-0">
                      <PlayerAvatar
                        playerId={player.player_id || player.id}
                        playerName={player.name}
                        size={40}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                            <h3 className="font-extrabold text-sm text-slate-800 truncate uppercase tracking-wide">{player.name}</h3>
                            {player.is_starred && (
                              <span className="px-1.5 py-0.5 text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200/60 rounded-lg">
                                STARRED
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] text-slate-400 uppercase font-bold flex-wrap">
                            <span className="px-1.5 sm:px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-lg">
                              {player.position}
                            </span>
                            <span className="hidden sm:inline">•</span>
                            <span className="truncate">{player.team_name}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleTogglePlayer(player.id)}
                          className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 rounded-xl bg-rose-600 border border-rose-700 flex items-center justify-center hover:bg-rose-700 active:scale-95 transition-all touch-manipulation"
                          title="Remove bid"
                          aria-label="Remove bid"
                        >
                          <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-xs mt-2 pt-1 border-t border-slate-100">
                        <span className="text-slate-400 font-bold flex items-center gap-1">
                          <Star className="w-4 h-4 text-amber-400 fill-amber-400" /> {player.overall_rating}
                        </span>
                        <span className="text-emerald-600 font-black">£{bulkRound?.base_price}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1">
                  <p className="text-slate-800 font-black text-sm uppercase tracking-wide">
                    {bidsCount} bid{bidsCount !== 1 ? 's' : ''} placed
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500 uppercase font-bold mt-1">
                    <span className="whitespace-nowrap">Reserved: £{totalCost}</span>
                    <span className="hidden sm:inline">•</span>
                    <span className="whitespace-nowrap">Left: £{remainingBalance}</span>
                    <span className="hidden sm:inline">•</span>
                    <span className="whitespace-nowrap">{availableSlotsNow} slots</span>
                  </div>
                </div>

                {hasUnsavedChanges && (
                  <button
                    type="button"
                    onClick={() => handleSaveBulkBids(biddedPlayers)}
                    disabled={isSaving || bidsCount !== vacantSlots}
                    className="w-full sm:w-auto px-6 py-2.5 bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-mono font-bold uppercase rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed touch-manipulation font-black"
                  >
                    {isSaving ? (
                      <span className="flex items-center gap-1.5">
                        <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Saving...
                      </span>
                    ) : bidsCount < vacantSlots ? (
                      `Select ${vacantSlots - bidsCount} More Player${vacantSlots - bidsCount !== 1 ? 's' : ''}`
                    ) : bidsCount > vacantSlots ? (
                      `Remove ${bidsCount - vacantSlots} Player${bidsCount - vacantSlots !== 1 ? 's' : ''}`
                    ) : (
                      'Submit Bids'
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Filters and Controls */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-3 sm:p-4 mb-4 sm:mb-6 shadow-sm font-mono">
          <div className="flex flex-col gap-3">
            {/* Search with icon */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="SEARCH PLAYERS..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-2.5 bg-slate-50 border border-slate-200/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-xs font-bold uppercase transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Starred Filter Toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterStarred(!filterStarred)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                  filterStarred
                    ? 'bg-amber-50 text-amber-700 border-amber-300'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-amber-400/40 hover:text-amber-600'
                }`}
              >
                <svg className={`w-4 h-4 ${filterStarred ? 'fill-amber-500 text-amber-500' : 'fill-slate-400 text-slate-400'}`} viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span>Starred Only</span>
                {filterStarred && (
                  <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded-lg text-[10px] font-black">
                    {starredPlayersCount}
                  </span>
                )}
              </button>
            </div>
            
            {/* Position Tabs - Mobile Optimized with horizontal scroll */}
            <div className="-mx-3 sm:-mx-4 px-3 sm:px-4">
              <div className="overflow-x-auto scrollbar-hide">
                <div className="flex gap-1.5 sm:gap-2 min-w-max pb-1">
                  {['all', 'GK', 'CB', 'LB', 'RB', 'LWF', 'RWF', 'DMF', 'CMF', 'AMF', 'LMF', 'RMF', 'SS', 'CF'].map((pos) => (
                    <button
                      key={pos}
                      onClick={() => setFilterPosition(pos)}
                      className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap touch-manipulation border ${
                        filterPosition === pos
                          ? 'bg-slate-800 text-white border-slate-900 scale-105'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-amber-400/40 hover:text-amber-600 active:scale-95'
                      }`}
                    >
                      {pos === 'all' ? 'All' : pos}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Available Players */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-4 sm:p-6 shadow-sm font-mono">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-slate-800">
              Available Players
            </h2>
            <span className="text-xs font-black text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-lg">
              {filteredPlayers.length}
            </span>
          </div>

          {sortedPlayers.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <p className="text-gray-600 font-medium">No players found</p>
              <p className="text-sm text-gray-500 mt-2">Try adjusting your filters</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {paginatedPlayers.map((player) => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    isBidded={biddedPlayers.has(player.id)}
                    basePrice={bulkRound?.base_price || 10}
                    onToggle={handleTogglePlayer}
                  />
                ))}
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 pt-4 border-t border-slate-100 font-mono">
                  <div className="text-[10px] sm:text-xs text-slate-500 uppercase font-bold">
                    Showing <span className="text-slate-800 font-black">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, sortedPlayers.length)}</span> of <span className="text-slate-800 font-black">{sortedPlayers.length}</span> players
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:border-amber-400/40 hover:text-amber-600 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500 text-slate-700 rounded-xl text-[10px] sm:text-xs uppercase font-extrabold transition-all active:scale-95 touch-manipulation flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                      </svg>
                      Prev
                    </button>
                    
                    <span className="px-3.5 py-1.5 bg-slate-50 border border-slate-200/60 rounded-xl text-[10px] sm:text-xs font-black text-slate-700">
                      {currentPage} / {totalPages}
                    </span>
                    
                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:border-amber-400/40 hover:text-amber-600 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500 text-slate-700 rounded-xl text-[10px] sm:text-xs uppercase font-extrabold transition-all active:scale-95 touch-manipulation flex items-center gap-1"
                    >
                      Next
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
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
  );
}
