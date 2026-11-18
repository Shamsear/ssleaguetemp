'use client';

import { Search, Star, XCircle } from 'lucide-react';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useRoundData, usePlaceBid, useCancelBid, useRoundStatus } from '@/hooks/useTeamDashboard';
import { useQueryClient } from '@tanstack/react-query';
import { useModal } from '@/hooks/useModal';
import { useAuctionWebSocket } from '@/hooks/useWebSocket';
import AlertModal from '@/components/modals/AlertModal';
import ConfirmModal from '@/components/modals/ConfirmModal';
import { PlayerAvatar } from '@/components/PlayerImage';
import { normalizeStr } from '@/lib/utils/normalizeStr';
import AuthGuard from '@/components/auth/AuthGuard';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface Player {
  id: string;
  name: string;
  position: string;
  position_group?: string;
  team_name: string;
  club?: string;
  overall_rating: number;
  playing_style?: string;
  is_starred?: boolean;
  player_id?: string;
  retired?: boolean;
}

interface Bid {
  id: string;
  player_id: string;
  player: Player;
  amount: number;
  round_id: string;
}

interface Round {
  id: string;
  position: string;
  max_bids_per_team: number;
  end_time: string;
  status: string;
  season_id: string;
}

export default function TeamRoundPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const roundId = params?.id as string;

  // Use React Query for data fetching with auto-refresh
  const queryClient = useQueryClient();
  const { 
    data: roundData, 
    isLoading, 
    isError, 
    error,
    refetch: refetchRoundData
  } = useRoundData(roundId, !loading && !!user && user.role === 'team');

  // Use React Query for round status checking
  const { data: statusData } = useRoundStatus(roundId, !!roundId);
  
  // WebSocket for live updates
  const { isConnected } = useAuctionWebSocket(roundId, !!roundId, roundData?.round?.season_id);

  // Local state for batch saving
  const [localBids, setLocalBids] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isEditingDraft, setIsEditingDraft] = useState(false);

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

  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPosition, setSelectedPosition] = useState<string>('all');
  const [selectedPlayingStyle, setSelectedPlayingStyle] = useState<string>('all');
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [editingBidId, setEditingBidId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [showMaxBidDetails, setShowMaxBidDetails] = useState(false);
  const [visibleCount, setVisibleCount] = useState(30);

  // Fast edit, delete & multi-select state
  const [selectedBidIds, setSelectedBidIds] = useState<Set<string>>(new Set());
  const [undoToast, setUndoToast] = useState<{ visible: boolean; message: string; bid: any; index: number } | null>(null);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isBatchEditMode, setIsBatchEditMode] = useState(false);
  const [batchAmounts, setBatchAmounts] = useState<Record<string, string>>({});

  // Quick Add state
  const [quickAddSearch, setQuickAddSearch] = useState('');
  const [quickAddSelectedPlayer, setQuickAddSelectedPlayer] = useState<any | null>(null);
  const [quickAddAmount, setQuickAddAmount] = useState('');
  const [isQuickAddDropdownOpen, setIsQuickAddDropdownOpen] = useState(false);
  const quickAmountInputRef = useRef<HTMLInputElement | null>(null);

  // Quick Paste state
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteRawText, setPasteRawText] = useState('');
  const [pasteParsedResults, setPasteParsedResults] = useState<any[]>([]);

  // Reset visible count when search term or filters change to speed up rendering
  useEffect(() => {
    setVisibleCount(30);
  }, [searchTerm, selectedPosition, selectedPlayingStyle, showStarredOnly]);

  // Extract data from React Query result
  const round = roundData?.round;
  const players = roundData?.players || [];
  const rawMyBids = roundData?.myBids || [];
  
  // Sync local bids with query data
  useEffect(() => {
    if (roundData && rawMyBids) {
      if (!isInitialized) {
        setLocalBids(rawMyBids.map((b: Bid) => ({
          id: b.id || `${(b as any).team_id || ''}_${roundId}_${b.player_id}`,
          player_id: b.player_id,
          amount: b.amount,
          round_id: roundId,
          player: b.player
        })));
        setIsInitialized(true);
      } else if (!hasUnsavedChanges && !isEditingDraft) {
        // Only update local state with query data if there are no unsaved changes,
        // user is NOT actively editing their draft, and the incoming data has actually changed
        const currentIds = localBids.map(b => `${b.player_id}_${b.amount}`).sort().join(',');
        const incomingIds = rawMyBids.map((b: Bid) => `${b.player_id}_${b.amount}`).sort().join(',');
        if (currentIds !== incomingIds) {
          setLocalBids(rawMyBids.map((b: Bid) => ({
            id: b.id || `${(b as any).team_id || ''}_${roundId}_${b.player_id}`,
            player_id: b.player_id,
            amount: b.amount,
            round_id: roundId,
            player: b.player
          })));
        }
      }
    }
  }, [roundData, rawMyBids, isInitialized, hasUnsavedChanges, isEditingDraft, roundId]);

  // Sort bids by amount (highest first) for display
  const myBids = [...localBids].sort((a: any, b: any) => (b.amount || 0) - (a.amount || 0));
  const initialBalance = roundData?.teamBalance || 0;
  // Balance displayed is always the real server balance — it only changes when a player is sold/bought in the DB.
  // Draft bids do NOT deduct from the displayed balance.
  const teamBalance = initialBalance;

  const teamName = roundData?.teamName || (user as any)?.displayName || 'Team';
  const completedRounds = roundData?.completedRounds || 0;
  const totalRounds = roundData?.totalRounds || 0;
  const minBalancePerRound = roundData?.minBalancePerRound || 10;
  const submission = roundData?.submission || null;

  // 1. Officially submitted: formal submission record exists and is locked (or round is closed)
  const isOfficiallySubmitted = (!!submission && submission.is_locked !== false) || (round && round.status !== 'active');
  const hasSubmitted = isOfficiallySubmitted;

  // 2. Draft saved & editing states
  const isDraftSaved = !isOfficiallySubmitted && !hasUnsavedChanges && localBids.length > 0;

  // 3. Overall locked: table editing is disabled if officially submitted, or if draft is saved and user hasn't toggled edit mode
  const isLocked = isOfficiallySubmitted || (isDraftSaved && !isEditingDraft);

  // Edit draft helper: quickly unlocks draft for modification without needing any API unlock call
  const handleEditDraft = () => {
    setIsEditingDraft(true);
  };

  // Extract phase settings and squad sizing details from roundData
  const settingsConfig = roundData?.settingsConfig || {
    phase_1_end_round: 18,
    phase_1_min_balance: 21,
    phase_2_end_round: 20,
    phase_2_min_balance: 22,
    phase_3_min_balance: 10,
    max_squad_size: 25
  };
  const squadSize = roundData?.squadSize || 0;

  // Determine current round number safely (default to completed + 1)
  const currentRoundNumber = round?.round_number || (completedRounds + 1);

  // Implement the calculateReserveCore logic directly on frontend for maximum stability
  const getReserveInfo = () => {
    let phase: 'phase_1' | 'phase_2' | 'phase_3';
    const hasPhase1 = settingsConfig.phase_1_end_round != null && settingsConfig.phase_1_end_round > 0;
    const hasPhase2 = settingsConfig.phase_2_end_round != null && settingsConfig.phase_2_end_round > 0;

    if (hasPhase1 && currentRoundNumber <= settingsConfig.phase_1_end_round!) {
      phase = 'phase_1';
    } else if (hasPhase2 && currentRoundNumber <= settingsConfig.phase_2_end_round!) {
      phase = 'phase_2';
    } else {
      phase = 'phase_3';
    }

    const emptySlots = settingsConfig.max_squad_size - squadSize;

    if (phase === 'phase_1') {
      const phase1Remaining = Math.max(0, settingsConfig.phase_1_end_round - currentRoundNumber);
      const phase2Full = Math.max(0, settingsConfig.phase_2_end_round - settingsConfig.phase_1_end_round);
      const playersAfterPhase2 = squadSize + 1 + phase1Remaining + phase2Full;
      const slotsAfterPhase2 = Math.max(0, settingsConfig.max_squad_size - playersAfterPhase2);
      
      const phase1Reserve = phase1Remaining * settingsConfig.phase_1_min_balance;
      const phase2Reserve = phase2Full * settingsConfig.phase_2_min_balance;
      const phase3Reserve = slotsAfterPhase2 * settingsConfig.phase_3_min_balance;
      const totalReserve = phase1Reserve + phase2Reserve + phase3Reserve;

      // Scenarios detail calculations
      const scenarios = [];
      for (let skippedPhase2 = 0; skippedPhase2 <= phase2Full; skippedPhase2++) {
        const actualPhase2Count = phase2Full - skippedPhase2;
        const simulatedPlayersAfterPhase2 = squadSize + 1 + phase1Remaining + actualPhase2Count;
        const simulatedSlotsAfterPhase2 = Math.max(0, settingsConfig.max_squad_size - simulatedPlayersAfterPhase2);
        
        const simPhase1Reserve = phase1Remaining * settingsConfig.phase_1_min_balance;
        const simPhase2Reserve = actualPhase2Count * settingsConfig.phase_2_min_balance;
        const simPhase3Reserve = simulatedSlotsAfterPhase2 * settingsConfig.phase_3_min_balance;
        const simTotalReserve = simPhase1Reserve + simPhase2Reserve + simPhase3Reserve;
        
        scenarios.push({
          skippedCount: skippedPhase2,
          participatedCount: actualPhase2Count,
          slotsPhase3: simulatedSlotsAfterPhase2,
          phase2Reserve: simPhase2Reserve,
          phase3Reserve: simPhase3Reserve,
          totalEnforced: simTotalReserve,
          maxBidSimulated: Math.max(0, initialBalance - simTotalReserve)
        });
      }

      return {
        reserve: totalReserve,
        floorReserve: totalReserve,
        maxBid: Math.max(0, initialBalance - totalReserve),
        phase: 'phase_1',
        explanation: `Phase 1 Strict: ${phase1Remaining}×£${settingsConfig.phase_1_min_balance} (Phase 1) + ${phase2Full}×£${settingsConfig.phase_2_min_balance} (Phase 2) + ${slotsAfterPhase2}×£${settingsConfig.phase_3_min_balance} (Phase 3) = £${totalReserve} Reserve Pool`,
        phase1Reserve,
        phase2Reserve,
        phase3Reserve,
        phase1Remaining,
        phase2Full,
        slotsAfterPhase2,
        scenarios
      };
    } else if (phase === 'phase_2') {
      const phase2Remaining = Math.max(0, settingsConfig.phase_2_end_round - currentRoundNumber);
      const playersAfterThisRound = squadSize + 1;
      const slotsAfterThisRound = Math.max(0, settingsConfig.max_squad_size - playersAfterThisRound);
      const phase3Floor = slotsAfterThisRound * settingsConfig.phase_3_min_balance;

      const playersAfterPhase2 = squadSize + phase2Remaining + 1;
      const slotsAfterPhase2 = Math.max(0, settingsConfig.max_squad_size - playersAfterPhase2);
      const phase2Reserve = phase2Remaining * settingsConfig.phase_2_min_balance;
      const recommendedPhase3Reserve = slotsAfterPhase2 * settingsConfig.phase_3_min_balance;
      const recommendedReserve = phase2Reserve + recommendedPhase3Reserve;

      // Scenarios detail calculations for Phase 2 (skippable rounds)
      const scenarios = [];
      for (let skippedPhase2 = 0; skippedPhase2 <= phase2Remaining; skippedPhase2++) {
        const actualPhase2Count = phase2Remaining - skippedPhase2;
        const simulatedPlayersAfterPhase2 = squadSize + 1 + actualPhase2Count;
        const simulatedSlotsAfterPhase2 = Math.max(0, settingsConfig.max_squad_size - simulatedPlayersAfterPhase2);
        
        const simPhase2Reserve = actualPhase2Count * settingsConfig.phase_2_min_balance;
        const simPhase3Reserve = simulatedSlotsAfterPhase2 * settingsConfig.phase_3_min_balance;
        const simTotalReserve = simPhase2Reserve + simPhase3Reserve;
        
        scenarios.push({
          skippedCount: skippedPhase2,
          participatedCount: actualPhase2Count,
          slotsPhase3: simulatedSlotsAfterPhase2,
          phase2Reserve: simPhase2Reserve,
          phase3Reserve: simPhase3Reserve,
          totalEnforced: simTotalReserve,
          maxBidSimulated: Math.max(0, initialBalance - simTotalReserve)
        });
      }

      return {
        reserve: recommendedReserve,
        floorReserve: phase3Floor,
        maxBid: Math.max(0, initialBalance - phase3Floor),
        phase: 'phase_2',
        explanation: `Phase 2 (Skippable): Min required is £${settingsConfig.phase_2_min_balance} to participate. Enforces a worst-case floor reserve of £${phase3Floor} (${slotsAfterThisRound} slots × £${settingsConfig.phase_3_min_balance}) assuming you skip remaining Phase 2 rounds.`,
        phase1Reserve: 0,
        phase2Reserve,
        phase3Reserve: recommendedPhase3Reserve,
        phase1Remaining: 0,
        phase2Full: phase2Remaining,
        slotsAfterPhase2,
        scenarios
      };
    } else {
      return {
        reserve: 0,
        floorReserve: 0,
        maxBid: initialBalance,
        phase: 'phase_3',
        explanation: `Phase 3: No reserve required (final phase), minimum £${settingsConfig.phase_3_min_balance} per slot.`,
        phase1Reserve: 0,
        phase2Reserve: 0,
        phase3Reserve: 0,
        phase1Remaining: 0,
        phase2Full: 0,
        slotsAfterPhase2: 0
      };
    }
  };

  const reserveInfo = getReserveInfo();
  const maxBidThisRound = reserveInfo.maxBid;

  // Auth guard
  useEffect(() => {
    if (roundData && 'redirect' in roundData) {
      console.log('👉 Redirect from round data:', roundData.redirect);
      router.push(roundData.redirect as string);
    }
  }, [roundData, router]);
  
  // Handle round fetch errors (deleted round, not found, etc.)
  useEffect(() => {
    if (isError) {
      console.error('<XCircle className="w-4 h-4 text-rose-500" /> Round fetch error:', error);
      console.log('👉 Redirecting to dashboard due to error');
      router.push('/dashboard/team');
    }
  }, [isError, error, router]);

  // Note: Auto-finalization disabled on team pages (requires admin access)
  // Only committee admins can trigger finalization

  // Calculate time remaining from round data
  useEffect(() => {
    if (!round?.end_time) return;

    // Check if round is no longer active (manually finalized or completed)
    if (round.status !== 'active') {
      console.log(`⏰ Round status is '${round.status}', redirecting to dashboard...`);
      router.push('/dashboard/team');
      return;
    }

    const updateTimeRemaining = () => {
      const endTime = new Date(round.end_time).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      setTimeRemaining(remaining);
      
      // Auto-redirect when timer reaches 0
      if (remaining === 0) {
        console.log('⏰ Round time expired, redirecting to dashboard...');
        setTimeout(() => {
          router.push('/dashboard/team');
        }, 2000); // Wait 2 seconds to show "Time's Up!" message
      }
    };

    // Check immediately - if round is explicitly closed or past end time and confirmed inactive, redirect
    const endTime = new Date(round.end_time).getTime();
    const now = Date.now();
    if (now >= endTime && (round.status !== 'active' || statusData?.active === false)) {
      console.log('⏰ Round already ended, redirecting immediately...');
      router.push('/dashboard/team');
      return;
    }

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [round, router]);

  // WebSocket connection status (refetching is handled by useAuctionWebSocket automatically)
  useEffect(() => {
    if (isConnected) {
      console.log('🔌 WebSocket connected for round:', roundId);
    }
  }, [isConnected, roundId]);

  // Handle round status changes (auto-checked by React Query)
  useEffect(() => {
    if (statusData) {
      console.log('<Search className="w-4 h-4 text-slate-500" /> Round status data:', statusData);
      
      // Only redirect if we have a valid response AND the round is explicitly not active
      // Don't redirect on API errors (success: false)
      if (statusData.success === false) {
        console.log('⚠️ Status check failed (likely auth issue), ignoring...');
        return;
      }
      
      if (statusData.active === false) {
        console.log('[WARNING] Round is not active, redirecting...');
        if (statusData.redirect) {
          router.push(statusData.redirect);
        } else {
          router.push('/dashboard/team');
        }
      } else if (statusData.active === true) {
        console.log('[SUCCESS] Round is active');
      }
    }
  }, [statusData, router]);

  // Save/Batch Bids to database
  const handleSaveBids = async (bidsToSave = localBids) => {
    // 1. Check bids limit
    if (bidsToSave.length > (round?.max_bids_per_team || 0)) {
      showAlert({
        type: 'error',
        title: 'Validation Failed',
        message: `Maximum number of bids (${round.max_bids_per_team}) exceeded.`
      });
      return;
    }

    // 2. Check duplicate bid amounts & min bid amount
    const amountsSet = new Set<number>();
    for (const bid of bidsToSave) {
      if (bid.amount < 10) {
        showAlert({
          type: 'error',
          title: 'Validation Failed',
          message: `Bid for ${bid.player?.name || 'player'} must be at least £10.`
        });
        return;
      }
      if (amountsSet.has(bid.amount)) {
        showAlert({
          type: 'error',
          title: 'Validation Failed',
          message: `Duplicate bid amount detected: £${bid.amount}. Each bid must have a unique amount.`
        });
        return;
      }
      amountsSet.add(bid.amount);
    }

    // 3. Check individual bid budgets
    for (const bid of bidsToSave) {
      if (bid.amount > maxBidThisRound) {
        showAlert({
          type: 'error',
          title: 'Validation Failed',
          message: `Bid of £${bid.amount} for ${bid.player?.name || 'player'} exceeds the allowed limit. Max bid allowed: £${maxBidThisRound.toLocaleString()}.`
        });
        return;
      }
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/team/round/${roundId}/save-bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bids: bidsToSave.map(b => ({ player_id: b.player_id, amount: b.amount })) })
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to save bids');
      }
      // Draft saved OK — keep localBids intact (amounts are not returned by the server)
      // Immediately clear any stale submission from cache so banner shows "Draft Saved" not "Bids Submitted"
      queryClient.setQueryData(['round', roundId], (old: any) => {
        if (!old) return old;
        return { ...old, submission: null };
      });
      setHasUnsavedChanges(false);
      setIsEditingDraft(false);
      refetchRoundData();
    } catch (err: any) {
      console.error('Failed to save bids:', err);
      showAlert({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Failed to save bids'
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
        e.returnValue = 'You have unsaved bids. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Helper to dynamically check if the local draft bids state differs from the database state (rawMyBids)
  const checkHasChanges = (updatedBids: any[]) => {
    const dbIds = [...rawMyBids].map(b => `${b.player_id}_${b.amount}`).sort().join(',');
    const localIds = [...updatedBids].map(b => `${b.player_id}_${b.amount}`).sort().join(',');
    return dbIds !== localIds;
  };

  // Place bid locally
  const handlePlaceBid = async (playerId: string, amount: number) => {
    if (!roundId) return;

    const player = players.find((p: any) => p.id === playerId);
    if (!player) return;

    const existingBidIndex = localBids.findIndex(b => b.player_id === playerId);
    const newLocalBids = [...localBids];

    const newBid = {
      id: existingBidIndex >= 0 ? localBids[existingBidIndex].id : 'temp-' + Date.now(),
      player_id: playerId,
      amount: amount,
      round_id: roundId,
      created_at: new Date().toISOString(),
      player: {
        id: player.id,
        player_id: player.player_id,
        name: player.name,
        position: player.position,
        position_group: player.position_group,
        team_name: player.team_name,
        club: player.club,
        overall_rating: player.overall_rating,
        playing_style: player.playing_style,
        retired: player.retired,
        is_starred: player.is_starred || false
      }
    };

    if (existingBidIndex >= 0) {
      newLocalBids[existingBidIndex] = newBid;
    } else {
      newLocalBids.push(newBid);
    }

    setLocalBids(newLocalBids);
    setHasUnsavedChanges(checkHasChanges(newLocalBids));
  };

  // Cancel bid locally
  const handleCancelBid = async (bidId: string) => {
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Cancel Bid',
      message: 'Are you sure you want to cancel this bid?',
      confirmText: 'Yes, Cancel',
      cancelText: 'No'
    });
    
    if (!confirmed) return;

    const updatedBids = localBids.filter(b => b.id !== bidId);
    setLocalBids(updatedBids);
    setHasUnsavedChanges(checkHasChanges(updatedBids));
  };

  // Silent delete locally
  const handleSilentDelete = async (bidId: string) => {
    const updatedBids = localBids.filter(b => b.id !== bidId);
    setLocalBids(updatedBids);
    setHasUnsavedChanges(checkHasChanges(updatedBids));
  };

  // Handle table edit
  const handleTableEdit = (bid: Bid) => {
    setEditingBidId(bid.id);
    setEditAmount(bid.amount.toString());
  };

  // Handle table edit submit
  const handleTableEditSubmit = async (bid: Bid) => {
    const amount = parseInt(editAmount);

    if (!amount || isNaN(amount) || amount < 10) {
      showAlert({
        type: 'warning',
        title: 'Invalid Amount',
        message: 'Bid amount must be at least £10'
      });
      return;
    }

    if (amount === bid.amount) {
      setEditingBidId(null);
      return; // No change
    }

    // Calculate dynamic available balance (add back old bid amount, taking reserve pool limits into account)
    const currentMaxAllowed = maxBidThisRound + bid.amount;
    
    if (amount > currentMaxAllowed) {
      showAlert({
        type: 'error',
        title: 'Reserve Pool Restriction',
        message: `Bid of £${amount} exceeds the allowed limit. You must maintain minimum budget reserves for future rounds. Max bid allowed: £${currentMaxAllowed.toLocaleString()}`
      });
      return;
    }

    // Check for duplicate bid amounts
    const otherBidAmounts = localBids
      .filter((b: any) => b.id !== bid.id)
      .map((b: any) => b.amount);
    
    if (otherBidAmounts.includes(amount)) {
      showAlert({
        type: 'error',
        title: 'Duplicate Bid Amount',
        message: 'You already have a bid with this amount. Each bid must have a unique amount.'
      });
      return;
    }

    // Edit locally
    const updatedBids = localBids.map(b => b.id === bid.id ? { ...b, amount } : b);
    setLocalBids(updatedBids);
    setHasUnsavedChanges(checkHasChanges(updatedBids));
    setEditingBidId(null);
    setEditAmount('');
  };

  // Cancel table edit
  const handleTableEditCancel = () => {
    setEditingBidId(null);
    setEditAmount('');
  };

  // Fast 1-Click Delete with Undo
  const handleQuickDelete = (bidId: string) => {
    const idx = localBids.findIndex(b => b.id === bidId);
    if (idx === -1) return;
    const deletedBid = localBids[idx];
    const updatedBids = localBids.filter(b => b.id !== bidId);
    setLocalBids(updatedBids);
    setHasUnsavedChanges(checkHasChanges(updatedBids));

    setSelectedBidIds(prev => {
      const next = new Set(prev);
      next.delete(bidId);
      return next;
    });

    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setUndoToast({
      visible: true,
      message: `Removed ${deletedBid.player?.name || 'player'}`,
      bid: deletedBid,
      index: idx
    });
    undoTimeoutRef.current = setTimeout(() => {
      setUndoToast(null);
    }, 4500);
  };

  const handleUndoDelete = () => {
    if (!undoToast?.bid) return;
    const restored = [...localBids];
    restored.splice(Math.min(undoToast.index, restored.length), 0, undoToast.bid);
    setLocalBids(restored);
    setHasUnsavedChanges(checkHasChanges(restored));
    setUndoToast(null);
  };

  // Multi-select & Bulk Delete
  const handleToggleSelectAll = () => {
    if (selectedBidIds.size === myBids.length) {
      setSelectedBidIds(new Set());
    } else {
      setSelectedBidIds(new Set(myBids.map((b: Bid) => b.id)));
    }
  };

  const handleToggleSelectBid = (bidId: string) => {
    setSelectedBidIds(prev => {
      const next = new Set(prev);
      if (next.has(bidId)) {
        next.delete(bidId);
      } else {
        next.add(bidId);
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedBidIds.size === 0) return;
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Delete Selected Bids',
      message: `Are you sure you want to delete ${selectedBidIds.size} selected bids?`,
      confirmText: `Yes, Delete (${selectedBidIds.size})`,
      cancelText: 'Cancel'
    });
    if (!confirmed) return;

    const updatedBids = localBids.filter(b => !selectedBidIds.has(b.id));
    setLocalBids(updatedBids);
    setHasUnsavedChanges(checkHasChanges(updatedBids));
    setSelectedBidIds(new Set());
  };

  const handleClearAllBids = async () => {
    if (localBids.length === 0) return;
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Clear All Bids',
      message: `Are you sure you want to remove all ${localBids.length} draft bids?`,
      confirmText: 'Yes, Clear All',
      cancelText: 'Cancel'
    });
    if (!confirmed) return;

    setLocalBids([]);
    setHasUnsavedChanges(true);
    setSelectedBidIds(new Set());
  };

  // Priority Reordering (Swap Amounts)
  const handleSwapBidAmounts = (idx1: number, idx2: number) => {
    if (idx1 < 0 || idx2 < 0 || idx1 >= myBids.length || idx2 >= myBids.length) return;
    const bid1 = myBids[idx1];
    const bid2 = myBids[idx2];
    if (!bid1 || !bid2) return;

    const amount1 = bid1.amount;
    const amount2 = bid2.amount;

    const updatedBids = localBids.map(b => {
      if (b.id === bid1.id) return { ...b, amount: amount2 };
      if (b.id === bid2.id) return { ...b, amount: amount1 };
      return b;
    });

    setLocalBids(updatedBids);
    setHasUnsavedChanges(checkHasChanges(updatedBids));
  };

  // Keyboard navigation for inline edit
  const handleTableEditAndNext = (currentBid: Bid, direction: number = 1) => {
    const amount = parseInt(editAmount);
    if (!amount || isNaN(amount) || amount < 10) {
      showAlert({ type: 'warning', title: 'Invalid Amount', message: 'Bid amount must be at least £10' });
      return;
    }
    const currentMaxAllowed = maxBidThisRound + currentBid.amount;
    if (amount > currentMaxAllowed) {
      showAlert({ type: 'error', title: 'Reserve Pool Restriction', message: `Bid of £${amount} exceeds allowed limit: £${currentMaxAllowed.toLocaleString()}` });
      return;
    }
    const otherBidAmounts = localBids.filter((b: any) => b.id !== currentBid.id).map((b: any) => b.amount);
    if (otherBidAmounts.includes(amount)) {
      showAlert({ type: 'error', title: 'Duplicate Bid Amount', message: 'Each bid must have a unique amount.' });
      return;
    }

    const updatedBids = localBids.map(b => b.id === currentBid.id ? { ...b, amount } : b);
    setLocalBids(updatedBids);
    setHasUnsavedChanges(checkHasChanges(updatedBids));

    const currentIdx = myBids.findIndex((b: Bid) => b.id === currentBid.id);
    const nextIdx = currentIdx + direction;
    if (nextIdx >= 0 && nextIdx < myBids.length) {
      const nextBid = myBids[nextIdx];
      setEditingBidId(nextBid.id);
      setEditAmount(nextBid.amount.toString());
    } else {
      setEditingBidId(null);
      setEditAmount('');
    }
  };

  // Batch / Spreadsheet Edit mode
  const handleToggleBatchEdit = () => {
    if (isBatchEditMode) {
      const amountsMap = { ...batchAmounts };
      const amountsSet = new Set<number>();

      for (const bid of myBids) {
        const valStr = amountsMap[bid.id];
        const val = valStr ? parseInt(valStr, 10) : bid.amount;
        if (isNaN(val) || val < 10) {
          showAlert({ type: 'warning', title: 'Invalid Bid Amount', message: `Bid for ${bid.player?.name} must be at least £10` });
          return;
        }
        if (val > maxBidThisRound) {
          showAlert({ type: 'error', title: 'Reserve Limit Exceeded', message: `Bid of £${val} for ${bid.player?.name} exceeds allowed max: £${maxBidThisRound.toLocaleString()}` });
          return;
        }
        if (amountsSet.has(val)) {
          showAlert({ type: 'error', title: 'Duplicate Bid Amount', message: `Duplicate amount £${val} detected. Each bid must have a unique amount.` });
          return;
        }
        amountsSet.add(val);
      }

      const updatedBids = localBids.map(b => {
        const valStr = amountsMap[b.id];
        return valStr ? { ...b, amount: parseInt(valStr, 10) } : b;
      });

      setLocalBids(updatedBids);
      setHasUnsavedChanges(false);
      setIsBatchEditMode(false);
      setBatchAmounts({});
      // Auto-save to database draft
      handleSaveBids(updatedBids);
    } else {
      const initial: Record<string, string> = {};
      localBids.forEach(b => {
        initial[b.id] = b.amount.toString();
      });
      setBatchAmounts(initial);
      setIsBatchEditMode(true);
    }
  };

  const handleBatchAmountChange = (bidId: string, val: string) => {
    setBatchAmounts(prev => ({ ...prev, [bidId]: val }));
  };

  // Quick Add Candidates
  const quickAddCandidates = useMemo(() => {
    if (!quickAddSearch || quickAddSearch.trim().length < 1) return [];
    const searchNorm = normalizeStr(quickAddSearch);
    const alreadyBidPlayerIds = new Set(localBids.map(b => b.player_id));
    return players
      .filter((p: any) => !alreadyBidPlayerIds.has(p.id) && normalizeStr(p.name).includes(searchNorm))
      .slice(0, 8);
  }, [quickAddSearch, players, localBids]);

  const handleQuickAddSubmit = async () => {
    const targetPlayer = quickAddSelectedPlayer || quickAddCandidates[0];
    if (!targetPlayer) {
      showAlert({ type: 'warning', title: 'Select Player', message: 'Please select a player to add' });
      return;
    }
    const amount = parseInt(quickAddAmount);
    if (!amount || isNaN(amount) || amount < 10) {
      showAlert({ type: 'warning', title: 'Invalid Amount', message: 'Bid amount must be at least £10' });
      return;
    }
    if (amount > maxBidThisRound) {
      showAlert({ type: 'error', title: 'Reserve Pool Restriction', message: `Bid of £${amount} exceeds the allowed limit: £${maxBidThisRound.toLocaleString()}` });
      return;
    }
    if (myBids.some((b: Bid) => b.amount === amount)) {
      showAlert({ type: 'error', title: 'Duplicate Bid Amount', message: 'You already have a bid with this amount.' });
      return;
    }
    if (bidCount >= round.max_bids_per_team) {
      showAlert({ type: 'warning', title: 'Slot Limit Reached', message: `You have reached the maximum of ${round.max_bids_per_team} bids.` });
      return;
    }

    await handlePlaceBid(targetPlayer.id, amount);
    setQuickAddSearch('');
    setQuickAddSelectedPlayer(null);
    setQuickAddAmount('');
    setIsQuickAddDropdownOpen(false);
  };

  // Quick Paste parser & apply
  const handleParsePasteText = (text: string) => {
    if (!text || !text.trim()) {
      setPasteParsedResults([]);
      return;
    }

    const lines = text.split(/\r?\n/);
    const results: any[] = [];
    const usedAmounts = new Set<number>();
    const usedPlayerIds = new Set<string>();

    for (let rawLine of lines) {
      let line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('*') && line.endsWith('*')) continue;
      const lower = line.toLowerCase();
      if (lower.startsWith('round') || lower.startsWith('position:') || lower.startsWith('team:') || lower.startsWith('bids:') || lower.startsWith('player')) continue;

      line = line.replace(/^\d+[\.\)\:\-\s]+/, '').trim();

      let namePart = '';
      let amount = 0;

      const delimiterMatch = line.match(/^(.*?)(?:\s*[-–—:,|]\s*|\s+)[£$€]?\s*(\d[\d,]*)\s*$/);
      if (delimiterMatch) {
        namePart = delimiterMatch[1].replace(/[*-_]/g, '').trim();
        amount = parseInt(delimiterMatch[2].replace(/,/g, ''), 10);
      } else {
        const endNumMatch = line.match(/^(.*?)[£$€]?\s*(\d[\d,]*)\s*$/);
        if (endNumMatch) {
          namePart = endNumMatch[1].replace(/[-–—:,|*]/g, '').trim();
          amount = parseInt(endNumMatch[2].replace(/,/g, ''), 10);
        }
      }

      if (!namePart || isNaN(amount)) {
        continue;
      }

      const searchNorm = normalizeStr(namePart);
      let matched = players.find((p: any) => normalizeStr(p.name) === searchNorm);
      if (!matched) {
        matched = players.find((p: any) => normalizeStr(p.name).includes(searchNorm) || searchNorm.includes(normalizeStr(p.name)));
      }

      let error = '';
      if (!matched) {
        error = `Player "${namePart}" not found in this round`;
      } else if (usedPlayerIds.has(matched.id)) {
        error = `Duplicate player "${matched.name}" in paste list`;
      } else if (amount < 10) {
        error = `Bid £${amount} is below minimum £10`;
      } else if (amount > maxBidThisRound) {
        error = `Bid £${amount} exceeds allowed max £${maxBidThisRound.toLocaleString()}`;
      } else if (usedAmounts.has(amount)) {
        error = `Duplicate bid amount £${amount}`;
      }

      if (!error && matched) {
        usedAmounts.add(amount);
        usedPlayerIds.add(matched.id);
      }

      results.push({
        rawLine,
        rawName: namePart,
        amount,
        matchedPlayer: matched || null,
        valid: !error && !!matched,
        error
      });
    }

    setPasteParsedResults(results);
  };

  const handleApplyPasteBids = (replace: boolean) => {
    const validItems = pasteParsedResults.filter(r => r.valid && r.matchedPlayer);
    if (validItems.length === 0) {
      showAlert({ type: 'warning', title: 'No Valid Bids', message: 'No valid bids to apply. Please check the preview.' });
      return;
    }

    let nextBids: any[] = replace ? [] : [...localBids];
    const existingAmounts = new Set<number>(nextBids.map(b => b.amount));
    const existingPlayerIds = new Set<string>(nextBids.map(b => b.player_id));

    let addedCount = 0;
    for (const item of validItems) {
      const p = item.matchedPlayer;
      if (!replace) {
        if (existingPlayerIds.has(p.id)) continue;
        if (existingAmounts.has(item.amount)) continue;
        if (nextBids.length >= round.max_bids_per_team) break;
      }

      nextBids.push({
        id: 'temp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        player_id: p.id,
        amount: item.amount,
        round_id: roundId,
        created_at: new Date().toISOString(),
        player: {
          id: p.id,
          player_id: p.player_id,
          name: p.name,
          position: p.position,
          position_group: p.position_group,
          team_name: p.team_name,
          club: p.club,
          overall_rating: p.overall_rating,
          playing_style: p.playing_style,
          retired: p.retired,
          is_starred: p.is_starred || false
        }
      });
      existingAmounts.add(item.amount);
      existingPlayerIds.add(p.id);
      addedCount++;
    }

    setLocalBids(nextBids);
    setHasUnsavedChanges(checkHasChanges(nextBids));
    setIsPasteModalOpen(false);
    setPasteRawText('');
    setPasteParsedResults([]);

    showAlert({
      type: 'success',
      title: 'Bids Applied',
      message: replace
        ? `Replaced draft with ${addedCount} pasted bids!`
        : `Added ${addedCount} pasted bids to your draft!`
    });
  };

  // Submit bids
  const handleSubmitBids = async () => {
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Submit Bids',
      message: `Are you sure you want to submit your ${localBids.length} bid(s)? After submission, you won't be able to modify them unless you unlock.`,
      confirmText: 'Yes, Submit',
      cancelText: 'Cancel'
    });
    
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      // 1. Unconditionally sync localBids state to database to replace any previous database state
      // Validate amounts and reserves like in handleSaveBids
      const amountsSet = new Set<number>();
      for (const bid of localBids) {
        if (amountsSet.has(bid.amount)) {
          throw new Error(`Duplicate bid amount detected: £${bid.amount}. Each bid must have a unique amount.`);
        }
        amountsSet.add(bid.amount);
      }

      for (const bid of localBids) {
        if (bid.amount > maxBidThisRound) {
          throw new Error(`Bid of £${bid.amount} for ${bid.player?.name || 'player'} exceeds the allowed limit. Max bid allowed: £${maxBidThisRound.toLocaleString()}.`);
        }
      }

      // Overwrite/Sync database bids with currently visible localBids
      const saveResponse = await fetch(`/api/team/round/${roundId}/save-bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bids: localBids.map(b => ({ player_id: b.player_id, amount: b.amount })) })
      });
      const saveResult = await saveResponse.json();
      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Failed to sync bids to database before submitting');
      }
      setHasUnsavedChanges(false);
      setIsEditingDraft(false);

      // 2. Perform the actual submit / lock action
      const response = await fetch(`/api/team/round/${roundId}/submit`, {
        method: 'POST',
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to submit bids');
      }

      showAlert({
        type: 'success',
        title: 'Bids Submitted',
        message: 'Your bids have been submitted successfully!'
      });

      // Refetch round data to update submission status
      refetchRoundData();
    } catch (error: any) {
      showAlert({
        type: 'error',
        title: 'Submission Failed',
        message: error.message || 'Failed to submit bids'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate bids message text
  const generateBidsMessage = () => {
    if (myBids.length === 0 || !round) return '';
    
    // Get round number from completedRounds
    const currentRoundNumber = completedRounds + 1;
    
    // Extract season number from season_id (e.g., "sspsls16" -> "16")
    const seasonNumber = round.season_id?.match(/\d+$/)?.[0] || '';
    
    // Format position display
    const positionDisplay = round.position.includes(',') 
      ? round.position.split(',').join(' + ') 
      : round.position;
    
    // Build the message
    let message = `*SS Super League S${seasonNumber}*\n\n`;
    message += `*Round ${currentRoundNumber} Bids*\n`;
    message += `*Position:* ${positionDisplay}\n`;
    message += `*Team:* ${teamName}\n\n`;
    message += `*Bids:*\n`;
    
    // Sort bids by amount (highest first) for display
    const sortedBids = [...myBids].sort((a, b) => b.amount - a.amount);
    sortedBids.forEach((bid, index) => {
      message += `${index + 1}. ${bid.player.name} - £${bid.amount.toLocaleString()}\n`;
    });
    
    return message;
  };

  // Calculate dynamic WhatsApp URL for browser navigation (avoids Safari popup blocker)
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(generateBidsMessage())}`;

  // Copy bids to clipboard (Safari/iOS compatible synchronous action)
  const handleCopyToClipboard = () => {
    const message = generateBidsMessage();
    if (!message) return;
    
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(message)
        .then(() => {
          showAlert({
            type: 'success',
            title: 'Copied!',
            message: 'Bids copied to clipboard'
          });
        })
        .catch((error) => {
          console.error('Clipboard write failed, using fallback:', error);
          fallbackCopy(message);
        });
    } else {
      fallbackCopy(message);
    }
  };

  const fallbackCopy = (text: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    document.body.appendChild(textArea);
    textArea.focus();
    
    if (navigator.userAgent.match(/ipad|ipod|iphone/i)) {
      const range = document.createRange();
      range.selectNodeContents(textArea);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      textArea.setSelectionRange(0, 999999);
    } else {
      textArea.select();
    }

    try {
      const successful = document.execCommand('copy');
      if (successful) {
        showAlert({
          type: 'success',
          title: 'Copied!',
          message: 'Bids copied to clipboard'
        });
      } else {
        throw new Error('Copy command returned false');
      }
    } catch (err: any) {
      showAlert({
        type: 'error',
        title: 'Copy Failed',
        message: 'Failed to copy to clipboard'
      });
    }
    document.body.removeChild(textArea);
  };

  // Unlock bids for modification
  const handleUnlockBids = async () => {
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Unlock Bids',
      message: 'Are you sure you want to unlock your bids? You will need to submit them again.',
      confirmText: 'Yes, Unlock',
      cancelText: 'Cancel'
    });
    
    if (!confirmed) return;

    setIsUnlocking(true);
    try {
      const response = await fetch(`/api/team/round/${roundId}/submit`, {
        method: 'DELETE',
      });

      const result = await response.json();

      // If database has no lock submission record, just catch/fallback and unlock local state
      if (!result.success && result.error !== 'Submission not found') {
        throw new Error(result.error || 'Failed to unlock bids');
      }

      showAlert({
        type: 'success',
        title: 'Bids Unlocked',
        message: 'You can now modify your bids. Remember to submit again!'
      });

      // Unlock local modifications
      setHasUnsavedChanges(true);
      setIsEditingDraft(true);
      refetchRoundData();
    } catch (error: any) {
      showAlert({
        type: 'error',
        title: 'Unlock Failed',
        message: error.message || 'Failed to unlock bids'
      });
    } finally {
      setIsUnlocking(false);
    }
  };

  // Format time
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Extract distinct positions from round and players (only used if there are multiple positions)
  const availablePositions = useMemo(() => {
    const list: string[] = [];
    if (round?.position && round.position.includes(',')) {
      round.position.split(',').forEach((p: string) => {
        const trimmed = p.trim();
        if (trimmed && !list.includes(trimmed)) list.push(trimmed);
      });
    }

    if (list.length > 1) return list;

    // Fallback: check distinct player positions
    const posSet = new Set<string>();
    players.forEach((p: Player) => {
      if (p.position && p.position.trim()) posSet.add(p.position.trim());
    });
    return Array.from(posSet).sort();
  }, [round?.position, players]);

  // Extract distinct playing styles from players
  const availablePlayingStyles = useMemo(() => {
    const styleMap = new Map<string, string>();
    players.forEach((p: Player) => {
      const raw = p.playing_style?.trim();
      if (raw) {
        const key = raw.replace(/\s+/g, '-').toLowerCase();
        if (!styleMap.has(key)) {
          styleMap.set(key, raw);
        }
      }
    });
    return Array.from(styleMap.values()).sort((a, b) => a.localeCompare(b));
  }, [players]);

  // Count of starred players
  const starredCount = useMemo(() => {
    return players.filter((p: Player) => p.is_starred).length;
  }, [players]);

  // Filter players
  const filteredPlayers = players.filter((player: Player) => {
    // 0. Starred filter
    if (showStarredOnly && !player.is_starred) {
      return false;
    }

    // 1. Search term filter
    if (searchTerm && !normalizeStr(player.name).includes(normalizeStr(searchTerm))) {
      return false;
    }

    // 2. Position filter (if multiple positions exist and a specific one is selected)
    if (selectedPosition !== 'all') {
      const isMatch = player.position === selectedPosition || player.position_group === selectedPosition;
      if (!isMatch) return false;
    }

    // 3. Playing style filter
    if (selectedPlayingStyle !== 'all') {
      if (!player.playing_style) return false;
      const playerStyleNorm = player.playing_style.trim().replace(/\s+/g, '-').toLowerCase();
      const selectedStyleNorm = selectedPlayingStyle.trim().replace(/\s+/g, '-').toLowerCase();
      if (playerStyleNorm !== selectedStyleNorm) return false;
    }

    return true;
  });

  // Sort players (starred first)
  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    if (a.is_starred && !b.is_starred) return -1;
    if (!a.is_starred && b.is_starred) return 1;
    return 0;
  });

  // Toggle star status for player
  const toggleStarPlayer = async (playerId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const player = players.find((p: Player) => p.id === playerId);
    if (!player) return;

    const newStarredStatus = !player.is_starred;

    // Optimistic update in React Query cache
    queryClient.setQueryData(['round', roundId], (oldData: any) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        players: (oldData.players || []).map((p: Player) =>
          p.id === playerId ? { ...p, is_starred: newStarredStatus } : p
        ),
        myBids: (oldData.myBids || []).map((b: Bid) =>
          b.player_id === playerId && b.player
            ? { ...b, player: { ...b.player, is_starred: newStarredStatus } }
            : b
        )
      };
    });

    const endpoint = player.is_starred 
      ? `/api/players/unstar/${playerId}` 
      : `/api/players/star/${playerId}`;

    try {
      const response = await fetchWithTokenRefresh(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        queryClient.setQueryData(['round', roundId], (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            players: (oldData.players || []).map((p: Player) =>
              p.id === playerId ? { ...p, is_starred: !newStarredStatus } : p
            ),
            myBids: (oldData.myBids || []).map((b: Bid) =>
              b.player_id === playerId && b.player
                ? { ...b, player: { ...b.player, is_starred: !newStarredStatus } }
                : b
            )
          };
        });

        showAlert({
          type: 'error',
          title: 'Update Failed',
          message: 'Failed to update starred status. Please try again.'
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ['starredPlayers'] });
        queryClient.invalidateQueries({ queryKey: ['teamDashboard'] });
      }
    } catch (err: any) {
      console.error('Error toggling star:', err);
      queryClient.setQueryData(['round', roundId], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          players: (oldData.players || []).map((p: Player) =>
            p.id === playerId ? { ...p, is_starred: !newStarredStatus } : p
          ),
          myBids: (oldData.myBids || []).map((b: Bid) =>
            b.player_id === playerId && b.player
              ? { ...b, player: { ...b.player, is_starred: !newStarredStatus } }
              : b
          )
        };
      });

      showAlert({
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update starred status. Please try again.'
      });
    }
  };

  // Check if player has bid
  const hasBid = (playerId: string) => {
    return myBids.some((bid: Bid) => bid.player_id === playerId);
  };

  // Get player bid
  const getPlayerBid = (playerId: string) => {
    return myBids.find((bid: Bid) => bid.player_id === playerId);
  };

  // Get timer color
  const getTimerColor = () => {
    if (timeRemaining === 0) return 'text-red-600 animate-pulse';
    if (timeRemaining < 300) return 'text-red-600 animate-pulse';
    if (timeRemaining < 600) return 'text-orange-500';
    return 'text-primary';
  };

  if (loading || (isLoading && !isInitialized)) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Round...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team' || !round) {
    return null;
  }

  const bidCount = myBids.length;
  const bidProgress = (bidCount / round.max_bids_per_team) * 100;

  return (
    <AuthGuard requiredRole="team">
    <>
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-4 sm:p-6 shadow-sm">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 sm:mb-6 gap-3 font-mono">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800">
              Active Rounds
            </h2>
            <p className="text-xs text-slate-500 uppercase font-semibold mt-1">Place bids on players in active rounds</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
            <Link
              href="/dashboard/team"
              className="flex-1 sm:flex-initial px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-bold flex items-center justify-center"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Dashboard
            </Link>
            <Link
              href="/dashboard/team/bids"
              className="flex-1 sm:flex-initial px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-bold flex items-center justify-center"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              My Bids
            </Link>
          </div>
        </div>
        </div>

      {/* Mobile Selected Count Notch */}
        <div className="md:hidden sticky top-0 z-30 -mt-2 mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary text-white text-xs font-semibold shadow-md">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Selected {bidCount} / {round.max_bids_per_team}</span>
          </div>
        </div>

        {/* Timer Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl mb-6 p-5 sm:p-6 shadow-sm hover:border-amber-400/40 hover:shadow-md transition-all duration-200 font-mono">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
            <div className="mb-4 md:mb-0">
              <div className="flex items-center gap-2">
                {round.status === 'active' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse">
                    Live
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider bg-rose-50 text-rose-700 border-rose-200">
                    {round.status === 'completed' ? 'Completed' : round.status}
                  </span>
                )}
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
                <h3 className="text-base font-extrabold uppercase tracking-wider text-slate-800">{round.position.includes(',') ? round.position.split(',').join(' + ') : round.position} Round</h3>
              </div>
              <p className="text-xs text-slate-400 uppercase font-bold mt-1.5">
                You must place exactly {round.max_bids_per_team} bids in this round for your bids to be considered
              </p>
            </div>
            <div className="flex flex-col items-center bg-slate-50 border border-slate-100 p-3 rounded-xl">
              <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Time Remaining</div>
              <div className={`text-xl font-black ${round.status !== 'active' ? 'text-rose-600' : getTimerColor()}`}>
                {round.status !== 'active' ? '00:00:00' : formatTime(timeRemaining)}
              </div>
            </div>
          </div>

          {/* Auction Status Info */}
          <div className="mt-5 mb-4 p-4 bg-slate-50 border border-slate-200/60 rounded-2xl font-mono">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 bg-slate-100 border border-slate-200 p-2 rounded-xl">
                <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Auction Status</h4>
                <div className="mt-2.5 sm:mt-3 text-[10px] text-slate-500 uppercase font-bold grid grid-cols-2 sm:grid-cols-4 gap-y-2 gap-x-3 sm:gap-x-4">
                  <div>
                    <span className="text-slate-400">Rounds completed:</span>
                    <p className="text-xs text-slate-700 font-mono font-black mt-0.5">{completedRounds} of {totalRounds}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Rounds remaining:</span>
                    <p className="text-xs text-slate-700 font-mono font-black mt-0.5">{totalRounds - completedRounds}</p>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-slate-400">Max bid this round:</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-xs text-slate-700 font-mono font-black">
                        £{maxBidThisRound.toLocaleString()}
                      </p>
                      <button
                        onClick={() => setShowMaxBidDetails(!showMaxBidDetails)}
                        className="text-[9px] px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-650 rounded font-black uppercase transition-colors"
                      >
                        {showMaxBidDetails ? 'Hide' : 'Info'}
                      </button>
                    </div>
                    <span className="text-[8px] text-slate-400 block mt-0.5 leading-none uppercase font-extrabold truncate">
                      (Phase 1 Strict • Phase 2 Skippable • Phase 3 Flex)
                    </span>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-slate-400">Your balance:</span>
                    <p className={`text-xs font-mono font-black mt-0.5 ${teamBalance >= minBalancePerRound ? 'text-emerald-600' : 'text-rose-600'}`}>
                      £{teamBalance.toLocaleString()}
                      <span className={`text-[10px] ml-1 ${teamBalance >= minBalancePerRound ? 'text-emerald-500' : 'text-rose-500'}`}>
                        ({teamBalance >= minBalancePerRound ? 'sufficient' : 'insufficient'})
                      </span>
                    </p>
                  </div>
                </div>

                {showMaxBidDetails && (
                  <div className="mt-4 p-3 bg-amber-50/50 border border-amber-200/60 rounded-xl space-y-2 text-[10px] text-amber-900 font-mono animate-fadeIn">
                    <div className="font-extrabold uppercase text-amber-800 border-b border-amber-200/60 pb-1.5">Max Bid Calculation Breakdown</div>
                    <div className="grid grid-cols-2 gap-y-1">
                      <span>Available Balance:</span>
                      <span className="font-bold text-right">£{teamBalance.toLocaleString()}</span>
                      
                      <span>Current Round:</span>
                      <span className="font-bold text-right">Round {currentRoundNumber}</span>

                      <span>Current Phase:</span>
                      <span className="font-bold text-right capitalize">{reserveInfo.phase.replace('_', ' ')}</span>
                      
                      <span>Current Squad Size:</span>
                      <span className="font-bold text-right">{squadSize} / {settingsConfig.max_squad_size} players</span>
                      
                      <span className="border-t border-amber-200/60 pt-1 mt-1 font-extrabold col-span-2">Reserve Pool Targets:</span>
                      
                      {settingsConfig.phase_1_end_round != null && settingsConfig.phase_1_end_round >= currentRoundNumber && (
                        <>
                          <span className="pl-2">- Phase 1 ({reserveInfo.phase1Remaining} round(s) @ £{settingsConfig.phase_1_min_balance}):</span>
                          <span className="font-bold text-right">£{reserveInfo.phase1Reserve?.toLocaleString()}</span>
                        </>
                      )}

                      {settingsConfig.phase_2_end_round != null && settingsConfig.phase_2_end_round > currentRoundNumber && (
                        <>
                          <span className="pl-2">- Phase 2 ({reserveInfo.phase2Full} round(s) @ £{settingsConfig.phase_2_min_balance}):</span>
                          <span className="font-bold text-right">£{reserveInfo.phase2Reserve?.toLocaleString()}</span>
                        </>
                      )}

                      <span className="pl-2">- Phase 3 ({reserveInfo.slotsAfterPhase2} slot(s) @ £{settingsConfig.phase_3_min_balance}):</span>
                      <span className="font-bold text-right">£{reserveInfo.phase3Reserve?.toLocaleString()}</span>
                      
                      <span className="border-t border-amber-200/60 pt-1 mt-1 font-extrabold">Total Reserve Enforced:</span>
                      <span className="border-t border-amber-200/60 pt-1 mt-1 font-bold text-right text-amber-850">
                        £{reserveInfo.floorReserve.toLocaleString()}
                      </span>
                      
                      <span className="border-t border-amber-300 pt-1.5 mt-1 text-xs font-black">Max Bid Allowed:</span>
                      <span className="border-t border-amber-300 pt-1.5 mt-1 text-xs font-black text-right text-slate-900">
                        £{maxBidThisRound.toLocaleString()}
                      </span>
                    </div>
                    {reserveInfo.scenarios && reserveInfo.scenarios.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-amber-250/60 text-[9px] space-y-1.5 leading-normal">
                        <span className="font-extrabold uppercase text-amber-800 tracking-wider">Simulated Skippable Scenarios:</span>
                        <div className="space-y-1 bg-amber-100/30 p-2 rounded-lg border border-amber-200/40">
                          {reserveInfo.scenarios.map((sc: any, sIdx: number) => (
                            <div key={sIdx} className="flex justify-between items-center text-amber-950 font-medium">
                              <span>
                                Skip {sc.skippedCount} Phase 2 round(s) → Need {sc.slotsPhase3} slot(s) in Phase 3
                              </span>
                              <span className="font-bold text-slate-800">
                                Reserve: £{sc.totalEnforced} | Max Bid: £{sc.maxBidSimulated.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-2 pt-2 border-t border-amber-200/60 text-[9px] text-amber-800 leading-normal">
                      <span className="font-bold">Formula detail: </span> {reserveInfo.explanation}
                    </div>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-slate-200/60">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Budget Reserve System: The system enforces phase-based minimum reserves to ensure you have enough balance for future rounds. Bids that would leave you below the required reserve will be rejected.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Bids Progress */}
          <div className="mt-4 mb-6 font-mono">
            <div className="flex justify-between items-center mb-2 text-[10px] uppercase font-bold tracking-wider">
              <span className="text-slate-400">Bids Placed</span>
              <span className="text-slate-800">
                {bidCount} / {round.max_bids_per_team}
              </span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-xl overflow-hidden border border-slate-200/60">
              <div
                className="h-full rounded-xl bg-slate-800 transition-all duration-300"
                style={{ width: `${Math.min(bidProgress, 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Submission or Draft Status Banner */}
          {(isOfficiallySubmitted || isDraftSaved || isEditingDraft) && (
            <div className={`mb-4 p-4 rounded-2xl font-mono border ${
              isOfficiallySubmitted
                ? 'bg-emerald-50 border-emerald-200'
                : isEditingDraft
                ? 'bg-amber-50/70 border-amber-200'
                : 'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl border ${
                    isOfficiallySubmitted
                      ? 'bg-emerald-100 border-emerald-200'
                      : isEditingDraft
                      ? 'bg-amber-100 border-amber-200'
                      : 'bg-blue-100 border-blue-200'
                  }`}>
                    {isOfficiallySubmitted ? (
                      <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : isEditingDraft ? (
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className={`font-extrabold uppercase tracking-wide text-sm ${
                      isOfficiallySubmitted
                        ? 'text-emerald-800'
                        : isEditingDraft
                        ? 'text-amber-800'
                        : 'text-blue-800'
                    }`}>
                      {isOfficiallySubmitted
                        ? 'Bids Submitted & Locked'
                        : isEditingDraft
                        ? 'Editing Draft Bids'
                        : 'Draft Saved & Locked'}
                    </p>
                    <p className={`text-[10px] uppercase font-bold mt-0.5 ${
                      isOfficiallySubmitted
                        ? 'text-emerald-600'
                        : isEditingDraft
                        ? 'text-amber-600'
                        : 'text-blue-600'
                    }`}>
                      {round.status !== 'active'
                        ? 'This round has ended and is finalized'
                        : isOfficiallySubmitted
                        ? 'Your bids are locked and submitted'
                        : isEditingDraft
                        ? 'Draft unlocked. Adjust bids or add/remove players, then save or submit.'
                        : 'Draft bids are locked to prevent accidental changes. Submit directly or edit to modify.'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto mt-3 sm:mt-0 items-center justify-start sm:justify-end">
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-xl font-mono text-xs uppercase tracking-wider font-extrabold transition-all border inline-flex items-center justify-center text-center ${
                      isOfficiallySubmitted
                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200/60'
                        : isEditingDraft
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200/60'
                        : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200/60'
                    }`}
                  >
                    Share
                  </a>
                  <button
                    onClick={handleCopyToClipboard}
                    className={`w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-xl font-mono text-xs uppercase tracking-wider font-extrabold transition-all border inline-flex items-center justify-center text-center ${
                      isOfficiallySubmitted
                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200/60'
                        : isEditingDraft
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200/60'
                        : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200/60'
                    }`}
                  >
                    Copy
                  </button>

                  {/* During Draft (Locked): Show Direct Submit button + Edit button */}
                  {isDraftSaved && round.status === 'active' && (
                    <>
                      <button
                        type="button"
                        onClick={handleEditDraft}
                        className="w-full sm:w-auto px-3 py-2 sm:py-1.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl font-mono text-xs uppercase tracking-wider font-extrabold transition-all inline-flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span>Edit to Modify</span>
                      </button>

                      {bidCount === round.max_bids_per_team && (
                        <button
                          type="button"
                          onClick={handleSubmitBids}
                          disabled={isSubmitting}
                          className="w-full sm:w-auto col-span-2 sm:col-span-1 px-4 py-2 sm:py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 rounded-xl font-mono text-xs uppercase tracking-wider font-extrabold transition-all inline-flex items-center justify-center gap-1.5 shadow-sm animate-pulse hover:animate-none"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{isSubmitting ? 'Submitting...' : '🚀 Submit Bids'}</span>
                        </button>
                      )}
                    </>
                  )}

                  {/* During Draft Editing: Show Lock Draft button + Direct Submit if complete */}
                  {isEditingDraft && !isOfficiallySubmitted && round.status === 'active' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingDraft(false);
                          if (hasUnsavedChanges && roundData?.myBids) {
                            setLocalBids(roundData.myBids);
                            setHasUnsavedChanges(false);
                          }
                        }}
                        className="w-full sm:w-auto px-3 py-2 sm:py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 border border-slate-300 rounded-xl font-mono text-xs uppercase tracking-wider font-extrabold transition-all inline-flex items-center justify-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <span>Done / Lock</span>
                      </button>

                      {bidCount === round.max_bids_per_team && (
                        <button
                          type="button"
                          onClick={handleSubmitBids}
                          disabled={isSubmitting}
                          className="w-full sm:w-auto col-span-2 sm:col-span-1 px-4 py-2 sm:py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 rounded-xl font-mono text-xs uppercase tracking-wider font-extrabold transition-all inline-flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{isSubmitting ? 'Submitting...' : '🚀 Submit Bids'}</span>
                        </button>
                      )}
                    </>
                  )}

                  {/* If Officially Submitted: Show Unlock button */}
                  {isOfficiallySubmitted && round.status === 'active' && (
                    <button
                      type="button"
                      onClick={handleUnlockBids}
                      disabled={isUnlocking}
                      className="w-full sm:w-auto col-span-2 sm:col-span-1 px-3 py-2 sm:py-1.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl font-mono text-xs uppercase tracking-wider font-extrabold transition-all text-center"
                    >
                      {isUnlocking ? 'Unlocking...' : 'Unlock to Modify'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Your Selected Players ── */}
          <div className="mb-6">

            {/* Section header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center justify-between sm:justify-start gap-2.5 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${!!submission ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">Your Selected Players</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      {myBids.length > 0 ? `${myBids.length} / ${round.max_bids_per_team} bids placed` : 'No bids placed yet'}
                    </p>
                  </div>
                </div>

                {/* Mobile-only status badge beside title */}
                {(isOfficiallySubmitted || isDraftSaved || isEditingDraft) && (
                  <span className={`sm:hidden px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-full border shrink-0 ${
                    isOfficiallySubmitted
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : isEditingDraft
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}>
                    {isOfficiallySubmitted ? '✓ Submitted' : isEditingDraft ? '✏️ Editing' : '🔒 Locked'}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-start sm:justify-end">
                {/* Desktop Submission status badge */}
                {(isOfficiallySubmitted || isDraftSaved || isEditingDraft) && (
                  <span className={`hidden sm:inline-flex px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-full border ${
                    isOfficiallySubmitted
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : isEditingDraft
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}>
                    {isOfficiallySubmitted ? '✓ Submitted' : isEditingDraft ? '✏️ Editing Draft' : '🔒 Draft Locked'}
                  </span>
                )}

                {/* Edit Draft Quick Button in header when draft is locked */}
                {isDraftSaved && isLocked && round.status === 'active' && (
                  <button
                    type="button"
                    onClick={handleEditDraft}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-1.5 text-[11px] font-bold font-mono transition-colors shadow-xs"
                    title="Unlock draft to edit players and bids"
                  >
                    <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span>Edit Draft</span>
                  </button>
                )}

                {/* Fast Tools for Unlocked Mode */}
                {!isLocked && (
                  <>
                    {/* Paste Bids Button */}
                    <button
                      type="button"
                      onClick={() => setIsPasteModalOpen(true)}
                      className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1 text-[11px] font-bold font-mono transition-colors shadow-xs"
                      title="Paste bids from WhatsApp or text"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <span>Paste</span>
                    </button>

                    {myBids.length > 0 && (
                      <>
                        {/* Edit All Toggle */}
                        <button
                          type="button"
                          onClick={handleToggleBatchEdit}
                          className={`px-2.5 py-1.5 rounded-xl flex items-center gap-1 text-[11px] font-bold font-mono transition-colors border shadow-xs ${isBatchEditMode ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}
                          title={isBatchEditMode ? 'Save and finish editing all' : 'Spreadsheet mode: edit all bids'}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>{isBatchEditMode ? 'Done' : 'Edit All'}</span>
                        </button>

                        {/* Delete Selected Button */}
                        {selectedBidIds.size > 0 && (
                          <button
                            type="button"
                            onClick={handleBulkDelete}
                            className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1 text-[11px] font-bold font-mono transition-colors shadow-xs"
                            title="Delete selected bids"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span>Delete ({selectedBidIds.size})</span>
                          </button>
                        )}

                        {/* Clear All Drafts */}
                        <button
                          type="button"
                          onClick={handleClearAllBids}
                          className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 flex items-center gap-1 text-[11px] font-bold font-mono transition-colors shadow-xs"
                          title="Clear all draft bids"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          <span className="hidden sm:inline">Clear</span>
                        </button>
                      </>
                    )}
                  </>
                )}

                {/* Action buttons */}
                {myBids.length > 0 && (
                  <>
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 rounded-xl bg-green-600 hover:bg-green-700 text-white flex items-center justify-center transition-colors"
                      title="Share to WhatsApp"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                    </a>
                    <button
                      onClick={handleCopyToClipboard}
                      className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center transition-colors"
                      title="Copy to clipboard"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ── Quick Search & Add Bar ── */}
            {!isLocked && bidCount < round.max_bids_per_team && (
              <div className="mb-4 p-3 bg-slate-50/80 border border-slate-200 rounded-2xl font-mono shadow-xs">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 relative">
                  {/* Player search input */}
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Search className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      value={quickAddSearch}
                      onChange={(e) => {
                        setQuickAddSearch(e.target.value);
                        setQuickAddSelectedPlayer(null);
                        setIsQuickAddDropdownOpen(true);
                      }}
                      onFocus={() => setIsQuickAddDropdownOpen(true)}
                      placeholder={quickAddSelectedPlayer ? quickAddSelectedPlayer.name : "Quick search player to add..."}
                      className="w-full pl-9 pr-8 py-2 text-xs font-sans font-medium rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-500 bg-white"
                    />
                    {quickAddSearch && (
                      <button
                        type="button"
                        onClick={() => { setQuickAddSearch(''); setQuickAddSelectedPlayer(null); }}
                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Dropdown candidates */}
                    {isQuickAddDropdownOpen && quickAddCandidates.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-30 divide-y divide-slate-100">
                        {quickAddCandidates.map((p: any) => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => {
                              setQuickAddSelectedPlayer(p);
                              setQuickAddSearch(p.name);
                              setIsQuickAddDropdownOpen(false);
                              setTimeout(() => quickAmountInputRef.current?.focus(), 50);
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-amber-50/70 flex items-center justify-between gap-2 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <PlayerAvatar playerId={p.player_id || p.id} playerName={p.name} size={28} />
                              <div className="truncate">
                                <p className="text-xs font-bold text-slate-900 truncate">{p.name}</p>
                                <p className="text-[10px] text-slate-400 truncate">{p.club || p.team_name || 'Free Agent'} • {p.position}</p>
                              </div>
                            </div>
                            <span className="text-[10px] font-black font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                              {p.overall_rating}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Amount input + Add button on mobile side-by-side */}
                  <div className="flex items-center gap-2 sm:w-auto">
                    <div className="relative flex-1 sm:w-36">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold text-xs">£</span>
                      <input
                        ref={quickAmountInputRef}
                        type="number"
                        value={quickAddAmount}
                        onChange={(e) => setQuickAddAmount(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleQuickAddSubmit();
                          }
                        }}
                        placeholder="Amount"
                        min="10"
                        max={maxBidThisRound}
                        className="w-full pl-7 pr-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-500 bg-white"
                      />
                    </div>

                    {/* Add button */}
                    <button
                      type="button"
                      onClick={handleQuickAddSubmit}
                      disabled={!quickAddSelectedPlayer || !quickAddAmount}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            {myBids.length > 0 ? (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead>
                      <tr className="bg-slate-900">
                        {!isLocked && (
                          <th className="px-3 py-3 text-center w-8">
                            <input
                              type="checkbox"
                              checked={myBids.length > 0 && selectedBidIds.size === myBids.length}
                              onChange={handleToggleSelectAll}
                              className="w-3.5 h-3.5 rounded text-amber-500 focus:ring-amber-400 cursor-pointer accent-amber-500"
                              title="Select all"
                            />
                          </th>
                        )}
                        <th className="px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">#</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Player</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Pos</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Bid</th>
                        {!isLocked && <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {myBids.map((bid: Bid, idx: number) => (
                        <React.Fragment key={bid.id}>
                          <tr className={`hover:bg-slate-50 transition-colors ${editingBidId === bid.id ? 'bg-amber-50/60' : bid.player.is_starred ? 'bg-amber-50/30' : ''} ${selectedBidIds.has(bid.id) ? 'bg-indigo-50/40' : ''}`}>
                            {!isLocked && (
                              <td className="px-3 py-3 text-center w-8">
                                <input
                                  type="checkbox"
                                  checked={selectedBidIds.has(bid.id)}
                                  onChange={() => handleToggleSelectBid(bid.id)}
                                  className="w-3.5 h-3.5 rounded text-amber-500 focus:ring-amber-400 cursor-pointer accent-amber-500"
                                />
                              </td>
                            )}
                            {/* # and reorder arrows */}
                            <td className="px-3 py-3 text-[11px] font-black text-slate-400 font-mono whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <span>{idx + 1}</span>
                                {!isLocked && myBids.length > 1 && (
                                  <div className="flex flex-col">
                                    <button
                                      type="button"
                                      onClick={() => handleSwapBidAmounts(idx, idx - 1)}
                                      disabled={idx === 0}
                                      className="p-0.5 text-slate-300 hover:text-slate-800 disabled:opacity-0 transition-colors"
                                      title="Move Up"
                                    >
                                      ▲
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSwapBidAmounts(idx, idx + 1)}
                                      disabled={idx === myBids.length - 1}
                                      className="p-0.5 text-slate-300 hover:text-slate-800 disabled:opacity-0 transition-colors"
                                      title="Move Down"
                                    >
                                      ▼
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                            {/* Player */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="relative flex-shrink-0">
                                  <PlayerAvatar
                                    playerId={bid.player.player_id || bid.player.id}
                                    playerName={bid.player.name}
                                    size={36}
                                  />
                                </div>
                                <div>
                                  <div className="text-xs font-black text-slate-900 flex items-center gap-1.5 uppercase tracking-tight">
                                    {bid.player.name}
                                    <button
                                      type="button"
                                      onClick={() => toggleStarPlayer(bid.player_id)}
                                      className={`${bid.player.is_starred ? 'text-amber-500' : 'text-slate-350'} hover:text-amber-400 transition-colors p-0.5 cursor-pointer`}
                                      title={bid.player.is_starred ? 'Unstar player' : 'Star player'}
                                    >
                                      <svg className="w-3.5 h-3.5" fill={bid.player.is_starred ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                      </svg>
                                    </button>
                                    {bid.player.retired && (
                                      <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-rose-100 text-rose-700 uppercase tracking-wider">Retired</span>
                                    )}
                                  </div>
                                  <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{bid.player.club || bid.player.team_name || 'Free Agent'}</div>
                                </div>
                              </div>
                            </td>
                            {/* Position */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="inline-block px-2 py-0.5 text-[9px] font-black uppercase rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                                {bid.player.position_group || bid.player.position}
                              </span>
                            </td>
                            {/* Bid */}
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              {isBatchEditMode ? (
                                <div className="relative inline-flex items-center max-w-[110px]">
                                  <span className="absolute left-2 text-slate-400 font-mono text-xs font-bold pointer-events-none">£</span>
                                  <input
                                    type="number"
                                    value={batchAmounts[bid.id] ?? bid.amount}
                                    onChange={(e) => handleBatchAmountChange(bid.id, e.target.value)}
                                    className="w-full pl-5 pr-2 py-1 text-right text-xs font-black text-slate-900 font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-500 bg-white"
                                    min="10"
                                    max={teamBalance + bid.amount}
                                  />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleTableEdit(bid)}
                                  disabled={isLocked}
                                  className="group/bid inline-flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors text-right cursor-pointer"
                                  title="Click to edit bid"
                                >
                                  <span className="text-sm font-black text-slate-900 font-mono group-hover/bid:text-amber-700">£{(bid.amount || 0).toLocaleString()}</span>
                                  {!isLocked && (
                                    <svg className="w-3 h-3 text-slate-300 group-hover/bid:text-amber-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                  )}
                                </button>
                              )}
                            </td>
                            {/* Actions */}
                            {!isLocked && (
                              <td className="px-4 py-3 whitespace-nowrap text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleTableEdit(bid)}
                                    disabled={editingBidId !== null}
                                    className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-all disabled:opacity-30"
                                    title="Edit"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => handleQuickDelete(bid.id)}
                                    disabled={editingBidId !== null}
                                    className="w-7 h-7 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-all disabled:opacity-30"
                                    title="Delete (Instant)"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                          {/* Inline edit row */}
                          {editingBidId === bid.id && (
                            <tr className="bg-amber-50/60 border-y border-amber-200">
                              <td colSpan={6} className="px-4 py-3">
                                <form onSubmit={(e) => { e.preventDefault(); handleTableEditSubmit(bid); }} className="flex flex-wrap items-center gap-3">
                                  <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider whitespace-nowrap">Edit — {bid.player.name}</span>
                                  <div className="relative flex-grow max-w-xs">
                                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold text-xs">£</span>
                                    <input
                                      type="number"
                                      value={editAmount}
                                      onChange={(e) => setEditAmount(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                          e.preventDefault();
                                          handleTableEditCancel();
                                        } else if (e.key === 'Tab') {
                                          e.preventDefault();
                                          handleTableEditAndNext(bid, e.shiftKey ? -1 : 1);
                                        }
                                      }}
                                      className="block w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-500 bg-white font-mono"
                                      placeholder="New amount"
                                      min="10"
                                      max={teamBalance + bid.amount}
                                      autoFocus
                                    />
                                  </div>
                                  <button type="submit" className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-colors">Save (Enter)</button>
                                  <button type="button" onClick={handleTableEditCancel} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-black uppercase tracking-wider hover:bg-slate-200 transition-colors">Cancel (Esc)</button>
                                  <span className="text-[10px] text-slate-400 hidden sm:inline">Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-600 font-mono">Tab</kbd> for next</span>
                                </form>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-2.5">
                  {myBids.map((bid: Bid, idx: number) => (
                    <div key={bid.id} className={`rounded-2xl overflow-hidden border shadow-sm ${editingBidId === bid.id ? 'border-amber-300 bg-amber-50/30' : bid.player.is_starred ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200 bg-white'}`}>
                      <div className="p-3.5">
                        {/* Top row: avatar + info + bid */}
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-slate-400 font-mono w-4 flex-shrink-0">{idx + 1}</span>
                          <div className="relative flex-shrink-0">
                            <PlayerAvatar
                              playerId={bid.player.player_id || bid.player.id}
                              playerName={bid.player.name}
                              size={44}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-black text-slate-900 uppercase tracking-tight truncate">{bid.player.name}</span>
                              <button
                                type="button"
                                onClick={() => toggleStarPlayer(bid.player_id)}
                                className={`${bid.player.is_starred ? 'text-amber-500' : 'text-slate-350'} hover:text-amber-400 transition-colors p-0.5 cursor-pointer`}
                                title={bid.player.is_starred ? 'Unstar player' : 'Star player'}
                              >
                                <svg className="w-3.5 h-3.5" fill={bid.player.is_starred ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                              </button>
                              {bid.player.retired && <span className="px-1 py-0.5 rounded text-[8px] font-black bg-rose-100 text-rose-700 uppercase">Retired</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="inline-block px-1.5 py-0.5 text-[9px] font-black uppercase rounded-md bg-slate-100 text-slate-700">{bid.player.position_group || bid.player.position}</span>
                              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest truncate">{bid.player.club || bid.player.team_name || 'Free Agent'}</span>
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <div className="text-base font-black text-slate-900 font-mono">£{(bid.amount || 0).toLocaleString()}</div>
                          </div>
                        </div>

                        {/* Edit form inline */}
                        {editingBidId === bid.id && (
                          <div className="mt-3 pt-3 border-t border-amber-200 space-y-2">
                            <div className="relative">
                              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold text-xs">£</span>
                              <input
                                type="number"
                                value={editAmount}
                                onChange={(e) => setEditAmount(e.target.value)}
                                className="block w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400/30 bg-white font-mono"
                                placeholder="New amount"
                                min="10"
                                max={teamBalance + bid.amount}
                                autoFocus
                              />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleTableEditSubmit(bid)} className="flex-1 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-colors">Save</button>
                              <button onClick={handleTableEditCancel} className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-black uppercase tracking-wider hover:bg-slate-200 transition-colors">Cancel</button>
                            </div>
                          </div>
                        )}

                        {/* Action buttons */}
                        {!isLocked && editingBidId !== bid.id && (
                          <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                            <button
                              onClick={() => handleTableEdit(bid)}
                              disabled={editingBidId !== null}
                              className="flex-1 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wider hover:bg-slate-200 transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Edit
                            </button>
                            {myBids.length > 1 && (
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSwapBidAmounts(idx, idx - 1)}
                                  disabled={idx === 0}
                                  className="px-2 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-slate-200 disabled:opacity-20 transition-colors"
                                  title="Move Up"
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSwapBidAmounts(idx, idx + 1)}
                                  disabled={idx === myBids.length - 1}
                                  className="px-2 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-slate-200 disabled:opacity-20 transition-colors"
                                  title="Move Down"
                                >
                                  ▼
                                </button>
                              </div>
                            )}
                            <button
                              onClick={() => handleQuickDelete(bid.id)}
                              disabled={editingBidId !== null}
                              className="flex-1 py-1.5 rounded-xl bg-rose-50 text-rose-600 text-[10px] font-black uppercase tracking-wider hover:bg-rose-100 transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete
                            </button>
                          </div>
                        )}

                        {isLocked && (
                          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-center gap-1.5">
                            <span className={`text-[9px] font-black uppercase tracking-widest ${!!submission ? 'text-emerald-600' : 'text-blue-600'}`}>
                              {!!submission ? '✓ Submitted' : 'Draft'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              /* ── Empty state ── */
              <div className="flex flex-col items-center justify-center py-14 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4 ring-4 ring-white shadow-sm">
                  <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <p className="text-sm font-black text-slate-700 uppercase tracking-wider">No Bids Placed</p>
                <p className="text-[11px] text-slate-400 font-bold mt-1">Search for players below and place your bids</p>
              </div>
            )}

            {/* Unsaved Changes Inline Action Card */}
            {hasUnsavedChanges && !isLocked && (
              <div className="mt-4 p-4 bg-amber-50/60 border border-amber-200/60 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 font-mono">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0"></span>
                  <div className="text-left">
                    <p className="text-xs uppercase font-black tracking-wider text-amber-800">Unsaved Changes</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Please save your draft bids before leaving</p>
                  </div>
                </div>
                <button
                  onClick={() => handleSaveBids(localBids)}
                  disabled={isSaving}
                  className="w-full sm:w-auto px-5 py-2.5 bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-bold uppercase rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {isSaving ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </span>
                  ) : (
                    <>
                      <span>💾</span>
                      <span>Save Draft</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Submit Bids Button Card (Available directly during draft, even if draft is locked) */}
            {!isOfficiallySubmitted && bidCount === round.max_bids_per_team && (
              <div className="mt-4 p-4 sm:p-5 bg-gradient-to-br from-emerald-50 to-teal-50/30 border border-emerald-200/80 rounded-2xl shadow-sm font-mono animate-fadeIn">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl flex items-center justify-center animate-bounce">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black text-emerald-800 uppercase tracking-wider">Ready to Submit</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">You've successfully placed all {round.max_bids_per_team} required bids</p>
                    </div>
                  </div>
                  <button
                    onClick={handleSubmitBids}
                    disabled={isSubmitting}
                    className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl font-bold uppercase text-xs tracking-wider transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center justify-center gap-2 transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Submitting...
                      </span>
                    ) : (
                      <>
                        <span>🚀</span>
                        <span>Submit Bids</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Available Players Section ── */}
          <div className="mb-6">

            {/* Section header row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">Available Players</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{sortedPlayers.length} player{sortedPlayers.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              {/* Starred legend */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200">
                <span className="text-amber-500 text-xs">★</span>
                <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Starred first</span>
              </div>
            </div>

            {/* Search and Filters Bar */}
            <div className="space-y-2.5 mb-5 font-mono">
              <div className="flex flex-col md:flex-row gap-2.5">
                {/* Search Input */}
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                    <Search className="w-4 h-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="block w-full pl-10 pr-10 py-2.5 text-sm font-sans font-medium text-slate-800 placeholder:text-slate-400 placeholder:font-normal bg-white rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-all shadow-sm"
                    placeholder="Search by player name…"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                      title="Clear search"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Filter Controls (Position + Playing Style) */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Position Filter (visible if round has multiple positions) */}
                  {availablePositions.length > 1 && (
                    <div className="relative min-w-[120px] flex-1 sm:flex-initial">
                      <select
                        value={selectedPosition}
                        onChange={(e) => setSelectedPosition(e.target.value)}
                        className={`w-full py-2.5 pl-3 pr-8 text-xs font-bold rounded-2xl border transition-all appearance-none bg-white cursor-pointer shadow-sm ${
                          selectedPosition !== 'all'
                            ? 'border-amber-500 bg-amber-50/50 text-amber-900 ring-2 ring-amber-500/10'
                            : 'border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <option value="all">All Positions ({availablePositions.length})</option>
                        {availablePositions.map((pos) => (
                          <option key={pos} value={pos}>
                            {pos}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  )}

                  {/* Playing Style Filter */}
                  {availablePlayingStyles.length > 0 && (
                    <div className="relative min-w-[130px] flex-1 sm:flex-initial">
                      <select
                        value={selectedPlayingStyle}
                        onChange={(e) => setSelectedPlayingStyle(e.target.value)}
                        className={`w-full py-2.5 pl-3 pr-8 text-xs font-bold rounded-2xl border transition-all appearance-none bg-white cursor-pointer shadow-sm ${
                          selectedPlayingStyle !== 'all'
                            ? 'border-amber-500 bg-amber-50/50 text-amber-900 ring-2 ring-amber-500/10'
                            : 'border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <option value="all">All Styles ({availablePlayingStyles.length})</option>
                        {availablePlayingStyles.map((style) => (
                          <option key={style} value={style}>
                            {style}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  )}

                  {/* Starred Filter Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowStarredOnly(!showStarredOnly)}
                    className={`py-2.5 px-3.5 text-xs font-bold rounded-2xl border transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                      showStarredOnly
                        ? 'border-amber-400 bg-amber-400 text-slate-950 font-black shadow-amber-200'
                        : 'border-slate-200 text-slate-700 hover:border-amber-300 bg-white'
                    }`}
                    title="Filter to starred players only"
                  >
                    <svg className={`w-3.5 h-3.5 ${showStarredOnly ? 'text-slate-950 fill-slate-950' : 'text-amber-500 fill-amber-500'}`} viewBox="0 0 24 24">
                      <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                    <span>Starred ({starredCount})</span>
                  </button>

                  {/* Clear all active filters */}
                  {(searchTerm || selectedPosition !== 'all' || selectedPlayingStyle !== 'all' || showStarredOnly) && (
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setSelectedPosition('all');
                        setSelectedPlayingStyle('all');
                        setShowStarredOnly(false);
                      }}
                      className="px-3 py-2.5 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-2xl transition-all whitespace-nowrap cursor-pointer shadow-sm flex items-center gap-1.5"
                      title="Reset all filters"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Active Filter Badges */}
              {(selectedPosition !== 'all' || selectedPlayingStyle !== 'all' || searchTerm || showStarredOnly) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                  <span className="text-slate-400 font-bold uppercase text-[10px] mr-1">Active:</span>
                  {showStarredOnly && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold">
                      ★ Starred Only
                      <button onClick={() => setShowStarredOnly(false)} className="hover:text-amber-950 ml-0.5 cursor-pointer">×</button>
                    </span>
                  )}
                  {selectedPosition !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                      Position: {selectedPosition}
                      <button onClick={() => setSelectedPosition('all')} className="hover:text-amber-950 ml-0.5 cursor-pointer">×</button>
                    </span>
                  )}
                  {selectedPlayingStyle !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold">
                      Style: {selectedPlayingStyle}
                      <button onClick={() => setSelectedPlayingStyle('all')} className="hover:text-indigo-950 ml-0.5 cursor-pointer">×</button>
                    </span>
                  )}
                  {searchTerm && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
                      Name: "{searchTerm}"
                      <button onClick={() => setSearchTerm('')} className="hover:text-slate-900 ml-0.5 cursor-pointer">×</button>
                    </span>
                  )}
                  <span className="text-slate-400 ml-auto font-mono text-[10px]">
                    Showing {sortedPlayers.length} of {players.length} players
                  </span>
                </div>
              )}
            </div>

            {/* Players Grid */}
            {sortedPlayers.length > 0 ? (
              <div className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sortedPlayers.slice(0, visibleCount).map((player) => {
                    const playerHasBid = hasBid(player.id);
                    const playerBid = getPlayerBid(player.id);

                    return (
                      <PlayerCard
                        key={player.id}
                        player={player}
                        hasBid={playerHasBid}
                        bid={playerBid}
                        bidCount={bidCount}
                        maxBids={round.max_bids_per_team}
                        teamBalance={teamBalance}
                        maxBidAllowed={maxBidThisRound}
                        existingBidAmounts={myBids.map((b: Bid) => b.amount)}
                        onPlaceBid={handlePlaceBid}
                        onCancelBid={handleCancelBid}
                        onSilentDelete={handleSilentDelete}
                        isLocked={isLocked}
                        submission={submission}
                        showAlert={showAlert}
                        onToggleStar={toggleStarPlayer}
                      />
                    );
                  })}
                </div>
                {sortedPlayers.length > visibleCount && (
                  <div className="flex justify-center pt-4 font-mono" style={{ overflowAnchor: 'none' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.currentTarget.blur();
                        const currentScrollY = window.scrollY;
                        setVisibleCount(prev => prev + 30);
                        requestAnimationFrame(() => {
                          window.scrollTo({ top: currentScrollY, behavior: 'instant' });
                        });
                      }}
                      style={{ overflowAnchor: 'none' }}
                      className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm hover:shadow-md cursor-pointer"
                    >
                      Load More Players ({sortedPlayers.length - visibleCount} remaining)
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p className="text-sm font-black text-slate-600 uppercase tracking-wider">No players found</p>
                {(searchTerm || selectedPosition !== 'all' || selectedPlayingStyle !== 'all') && (
                  <button 
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedPosition('all');
                      setSelectedPlayingStyle('all');
                    }} 
                    className="mt-2 text-xs text-slate-500 hover:text-slate-800 font-bold uppercase tracking-wider underline underline-offset-2 cursor-pointer"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>
      </div>

      {/* Saved status indicators handled inline in card above */}

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

      {/* ── Undo Deleted Bid Toast ── */}
      {undoToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-3 font-mono text-xs animate-slideUp">
          <span>{undoToast.message}</span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="px-2.5 py-1 bg-amber-400 text-slate-950 font-black rounded-lg text-[10px] uppercase tracking-wider hover:bg-amber-300 transition-colors shadow-xs"
          >
            Undo
          </button>
        </div>
      )}

      {/* ── Quick Paste Modal ── */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs font-mono">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl p-4 sm:p-6 max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                  <span>📋</span>
                  <span>Quick Paste Bids</span>
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-400 font-bold mt-0.5">Paste your bids list from WhatsApp, Notes, or Excel</p>
              </div>
              <button
                type="button"
                onClick={() => { setIsPasteModalOpen(false); setPasteRawText(''); setPasteParsedResults([]); }}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="py-3 sm:py-4 space-y-3 sm:space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5 tracking-wider">
                  Paste Text Below
                </label>
                <textarea
                  value={pasteRawText}
                  onChange={(e) => {
                    setPasteRawText(e.target.value);
                    handleParsePasteText(e.target.value);
                  }}
                  placeholder={`1. Désiré Doué - £824\n2. Michael Olise - £823\n3. Lamine Yamal - £684\n...`}
                  rows={5}
                  className="w-full p-3 text-xs font-mono rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-500 bg-slate-50/50"
                />
              </div>

              {/* Parsed Preview Table */}
              {pasteParsedResults.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                      Preview ({pasteParsedResults.filter(r => r.valid).length} valid / {pasteParsedResults.length} parsed)
                    </span>
                    <span className="text-[10px] font-black text-slate-500">
                      Total: £{pasteParsedResults.filter(r => r.valid).reduce((acc, r) => acc + r.amount, 0).toLocaleString()}
                    </span>
                  </div>

                  <div className="max-h-52 sm:max-h-60 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100">
                    {pasteParsedResults.map((r, i) => (
                      <div key={i} className={`p-2.5 flex items-center justify-between text-xs ${r.valid ? 'bg-white' : 'bg-rose-50/60'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-black text-slate-400 w-4">{i + 1}</span>
                          {r.valid ? (
                            <span className="text-emerald-600 font-bold">✓</span>
                          ) : (
                            <span className="text-rose-600 font-bold">✕</span>
                          )}
                          <div className="truncate">
                            <p className="font-bold text-slate-900 truncate">
                              {r.matchedPlayer ? r.matchedPlayer.name : r.rawName}
                            </p>
                            {!r.valid && (
                              <p className="text-[10px] text-rose-500 font-semibold">{r.error}</p>
                            )}
                          </div>
                        </div>
                        <div className="font-mono font-black text-slate-900 flex-shrink-0">
                          £{r.amount.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 sm:pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={() => { setIsPasteModalOpen(false); setPasteRawText(''); setPasteParsedResults([]); }}
                className="w-full sm:w-auto px-4 py-2 sm:py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-black uppercase tracking-wider hover:bg-slate-200 transition-colors order-3 sm:order-1 text-center"
              >
                Cancel
              </button>
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto order-1 sm:order-2">
                <button
                  type="button"
                  disabled={pasteParsedResults.filter(r => r.valid).length === 0}
                  onClick={() => handleApplyPasteBids(false)}
                  className="w-full sm:w-auto px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-slate-800 text-white text-[11px] sm:text-xs font-black uppercase tracking-wider hover:bg-slate-700 transition-colors disabled:opacity-40 text-center truncate"
                  title="Keep existing bids and add new valid ones"
                >
                  Add to Existing
                </button>
                <button
                  type="button"
                  disabled={pasteParsedResults.filter(r => r.valid).length === 0}
                  onClick={() => handleApplyPasteBids(true)}
                  className="w-full sm:w-auto px-2.5 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-amber-400 text-slate-950 text-[11px] sm:text-xs font-black uppercase tracking-wider hover:bg-amber-300 transition-colors disabled:opacity-40 shadow-sm text-center truncate"
                  title="Replace entire draft with these bids"
                >
                  Replace Draft {pasteParsedResults.filter(r => r.valid).length > 0 ? `(${pasteParsedResults.filter(r => r.valid).length})` : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
      </div>
    </>
  
    </AuthGuard>
  );
}

// Player Card Component
interface PlayerCardProps {
  player: Player;
  hasBid: boolean;
  bid?: Bid;
  bidCount: number;
  maxBids: number;
  teamBalance: number;
  maxBidAllowed: number;
  existingBidAmounts: number[]; // Add this to check for duplicates
  onPlaceBid: (playerId: string, amount: number) => void;
  onCancelBid: (bidId: string) => void;
  onSilentDelete: (bidId: string) => Promise<void>;
  isLocked: boolean;
  submission: any;
  showAlert: (options: any) => void;
  onToggleStar?: (playerId: string, e?: React.MouseEvent) => void;
}

function PlayerCard({
  player,
  hasBid,
  bid,
  bidCount,
  maxBids,
  teamBalance,
  maxBidAllowed,
  existingBidAmounts,
  onPlaceBid,
  onCancelBid,
  onSilentDelete,
  isLocked,
  submission,
  showAlert,

  onToggleStar,
}: PlayerCardProps) {
  const [bidAmount, setBidAmount] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editAmount, setEditAmount] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  // Initialize edit amount when entering edit mode
  const handleEdit = () => {
    if (bid) {
      setEditAmount(bid.amount.toString());
      setIsEditing(true);
    }
  };

  // Handle edit submission
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(editAmount);

    if (!amount || isNaN(amount) || amount < 10) {
      showAlert({
        type: 'warning',
        title: 'Invalid Amount',
        message: 'Bid amount must be at least £10'
      });
      return;
    }

    if (bid && amount === bid.amount) {
      setIsEditing(false);
      return; // No change
    }

    // Calculate dynamic max allowed for editing (add back old bid amount)
    const currentMaxAllowed = maxBidAllowed + (bid ? bid.amount : 0);
    
    if (amount > currentMaxAllowed) {
      showAlert({
        type: 'error',
        title: 'Reserve Pool Restriction',
        message: `Bid of £${amount} exceeds the allowed limit. You must maintain minimum budget reserves for future rounds. Max bid allowed: £${currentMaxAllowed.toLocaleString()}`
      });
      return;
    }

    // Check for duplicate bid amounts (excluding current bid)
    const otherBidAmounts = existingBidAmounts.filter(a => bid ? a !== bid.amount : true);
    if (otherBidAmounts.includes(amount)) {
      showAlert({
        type: 'error',
        title: 'Duplicate Bid Amount',
        message: 'You already have a bid with this amount. Each bid must have a unique amount.'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Delete old bid and place new one (silent - no confirmation)
      if (bid) {
        await onSilentDelete(bid.id);
      }
      await onPlaceBid(player.id, amount);
      setIsEditing(false);
      setEditAmount('');
    } catch (error: any) {
      showAlert({
        type: 'error',
        title: 'Edit Failed',
        message: error.message || 'Failed to update bid'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(bidAmount);

    if (!amount || isNaN(amount) || amount < 10) {
      showAlert({
        type: 'warning',
        title: 'Invalid Amount',
        message: 'Bid amount must be at least £10'
      });
      return;
    }

    if (amount > maxBidAllowed) {
      showAlert({
        type: 'error',
        title: 'Reserve Pool Restriction',
        message: `Bid of £${amount} exceeds the allowed limit. You must maintain minimum budget reserves for future rounds. Max bid allowed: £${maxBidAllowed.toLocaleString()}`
      });
      return;
    }

    // Check for duplicate bid amounts
    if (existingBidAmounts.includes(amount)) {
      showAlert({
        type: 'error',
        title: 'Duplicate Bid Amount',
        message: 'You already have a bid with this amount in this round. Each bid must have a unique amount.'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onPlaceBid(player.id, amount);
      setBidAmount('');
    } catch (error: any) {
      // Error already shown by handlePlaceBid
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRatingBg = (rating: number) => {
    if (rating >= 90) return 'bg-emerald-500 text-white';
    if (rating >= 80) return 'bg-blue-600 text-white';
    if (rating >= 70) return 'bg-amber-500 text-slate-900';
    return 'bg-slate-500 text-white';
  };

  const cardBorderClass = hasBid
    ? 'border-2 border-slate-900 shadow-md ring-2 ring-slate-900/10 scale-[1.01]'
    : player.is_starred
      ? 'border border-amber-300 hover:border-amber-400 shadow-xs hover:shadow-md'
      : 'border border-slate-200/80 hover:border-slate-400 shadow-xs hover:shadow-md';

  const getHeroBg = () => {
    const rawPos = (player.position || player.position_group || '').toUpperCase();
    const pos = rawPos.split('-')[0].trim();

    if (pos === 'GK') {
      return 'bg-gradient-to-br from-violet-700 via-purple-800 to-slate-950';
    }
    if (['CB', 'LB', 'RB', 'LWB', 'RWB', 'DEF'].includes(pos)) {
      return 'bg-gradient-to-br from-emerald-700 via-teal-800 to-slate-950';
    }
    if (['CM', 'CMF', 'DM', 'DMF', 'CDM', 'AM', 'AMF', 'CAM', 'LM', 'LMF', 'RM', 'RMF', 'MID'].includes(pos)) {
      return 'bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-950';
    }
    if (['CF', 'ST', 'SS', 'LW', 'LWF', 'RW', 'RWF', 'FWD'].includes(pos)) {
      return 'bg-gradient-to-br from-rose-600 via-orange-700 to-slate-950';
    }
    return 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950';
  };

  return (

    <div
      className={`group bg-white rounded-2xl hover:shadow-xl transition-all duration-300 flex flex-col relative overflow-hidden ${cardBorderClass} ${isLocked && !hasBid ? 'opacity-85 hover:opacity-100' : ''}`}
    >
      {/* ── TOP: Player Photo Hero ── */}
      <div className={`relative h-44 overflow-hidden flex-shrink-0 no-console-override ${getHeroBg()}`}>
        {/* Subtle dot pattern */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '16px 16px' }} />

        {/* Starred glow */}
        {player.is_starred && (
          <div className="absolute inset-0 bg-amber-400/10 pointer-events-none" />
        )}

        {/* Player image centred */}
        <div className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
          <PlayerAvatar
            playerId={player.player_id || player.id}
            playerName={player.name}
            size={130}
          />
        </div>

        {/* Top-left: position pill */}
        <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-white/15 backdrop-blur-sm border border-white/25 text-white font-black text-[10px] uppercase tracking-widest shadow-xs">
          {player.position_group || player.position}
        </div>

        {/* Top-right: OVR badge */}
        {player.overall_rating && (
          <div className={`absolute top-2.5 right-2.5 w-9 h-9 rounded-xl font-mono font-black text-sm shadow-md flex items-center justify-center ${getRatingBg(player.overall_rating)}`}>
            {player.overall_rating}
          </div>
        )}

        {/* Star button / badge */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleStar?.(player.id, e);
          }}
          className={`absolute top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shadow-sm flex items-center gap-1 z-10 transition-all hover:scale-105 active:scale-95 cursor-pointer ${
            player.is_starred
              ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-500/20'
              : 'bg-black/45 hover:bg-black/65 backdrop-blur-sm border border-white/20 text-white/80 hover:text-amber-300 opacity-75 hover:opacity-100'
          }`}
          title={player.is_starred ? 'Starred player. Click to unstar' : 'Click to star player'}
        >
          <svg className={`w-3 h-3 ${player.is_starred ? 'text-slate-950 fill-slate-950' : 'text-amber-400'}`} fill={player.is_starred ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
          <span>{player.is_starred ? 'STARRED' : 'STAR'}</span>
        </button>
        

        {/* Submitted / Draft overlay banner */}
        {isLocked && hasBid && (
          <div className={`absolute bottom-0 inset-x-0 py-1 text-center text-[9px] font-black uppercase tracking-widest ${!!submission ? 'bg-emerald-500/80 text-white' : 'bg-blue-500/80 text-white'}`}>
            {!!submission ? '✓ Submitted' : 'Draft'}
          </div>
        )}

        {/* Bottom gradient overlay with name */}
        <div className={`absolute inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-8 pb-2.5 px-3 ${isLocked && hasBid ? 'bottom-6' : 'bottom-0'}`}>
          <div className="font-extrabold text-white text-sm uppercase tracking-tight leading-tight truncate">
            {player.name}
          </div>
          <div className="text-[9px] text-white/60 font-bold uppercase tracking-widest truncate mt-0.5">
            {player.club || player.team_name || 'Free Agent'}
          </div>
        </div>
      </div>

      {/* ── MIDDLE: Style row ── */}
      <div className="px-3 py-2 flex items-center justify-between bg-slate-50 border-b border-slate-100">
        <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Style</span>
        <span className="text-[10px] text-slate-700 font-bold uppercase tracking-wide truncate max-w-[60%] text-right">
          {player.playing_style || '—'}
        </span>
      </div>

      {/* ── BOTTOM: Bid section ── */}
      <div className="px-3 py-2.5 flex flex-col gap-2 bg-gradient-to-b from-slate-50 to-slate-100/70 rounded-b-2xl border-t border-slate-100/80 group-hover:from-white group-hover:to-slate-100/90 transition-colors">
        {hasBid && bid ? (
          <>
            <div className="flex items-center justify-between bg-slate-100 px-2.5 py-1.5 rounded-xl">
              <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Your Bid</span>
              <span className="text-sm font-black text-slate-900 font-mono">£{(bid.amount || 0).toLocaleString()}</span>
            </div>

            {!isLocked ? (
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={handleEdit}
                  disabled={isSubmitting || isCanceling}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-extrabold uppercase tracking-wider flex items-center gap-1 transition-colors disabled:opacity-40"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
                <button
                  onClick={async () => {
                    setIsCanceling(true);
                    await onCancelBid(bid.id);
                    setIsCanceling(false);
                  }}
                  disabled={isCanceling || isSubmitting}
                  className="text-[10px] text-red-500 hover:text-red-700 font-extrabold uppercase tracking-wider flex items-center gap-1 transition-colors disabled:opacity-40"
                >
                  {isCanceling ? '...' : (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </>
                  )}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {bidCount < maxBids && !isLocked ? (
              <form onSubmit={handleSubmit} className="flex gap-2">
                <div className="relative flex-grow">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold text-xs">£</span>
                  <input
                    type="number"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    className="block w-full pl-9 pr-2.5 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 font-mono"
                    placeholder="Amount"
                    required
                    min="10"
                    max={teamBalance}
                    disabled={isSubmitting}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                  Bid
                </button>
              </form>
            ) : isLocked ? (
              <div className="py-1.5 text-[9px] text-center text-slate-500 font-bold uppercase tracking-wider bg-white/90 border border-slate-200/90 rounded-xl shadow-xs">
                No Bid Placed
              </div>
            ) : (
              <div className="py-1.5 text-[9px] text-center text-slate-500 font-bold uppercase tracking-wider bg-white/90 border border-slate-200/90 rounded-xl shadow-xs">
                Slot Reached
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Edit overlay ── */}
      {/* ── Edit overlay ── */}
      {hasBid && bid && isEditing && !isLocked && (
        <div className="absolute inset-x-0 bottom-0 p-4 bg-slate-900 text-white rounded-t-2xl border-t border-amber-400/20 z-10">
          <form onSubmit={handleEditSubmit} className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-400">Edit Bid Amount</p>
            <div className="flex items-center gap-2">
              <div className="relative flex-grow">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold">£</span>
                <input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="block w-full pl-9 pr-3 py-2 text-xs text-slate-900 rounded-xl focus:outline-none font-mono"
                  placeholder="New bid"
                  required
                  min="10"
                  max={teamBalance + bid.amount}
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-3.5 py-2 bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-bold uppercase rounded-xl transition-colors disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isSubmitting}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase rounded-xl transition-colors disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </form>
        </div>
      )}

    </div>

  );
}
