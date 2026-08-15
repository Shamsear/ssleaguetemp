'use client';

import { Search, DollarSign, Clock, CheckCircle, AlertTriangle, User, Shield, Info, Trash2, ArrowUp, ArrowDown, Save, Lock, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AlertModal from '@/components/modals/AlertModal';
import { useModal } from '@/hooks/useModal';

interface Slot {
  slot_index: number;
  name: string;
  list_id: string;
  base_price: number;
}

interface DraftSettings {
  budget: number;
  is_active: boolean;
  status: string;
  draft_status: string;
  draft_opens_at: string;
  draft_closes_at: string;
  category_settings?: {
    slots: Slot[];
    lists: Record<string, string[]>;
    max_bids_per_team?: number;
  };
}

interface Player {
  real_player_id: string;
  player_name: string;
  real_team_name: string;
  category: string;
  star_rating: number;
}

interface RealTeam {
  team_uid: string;
  team_name: string;
  logo_url?: string;
}

interface LocalBid {
  slot_index: number;
  priority: number;
  target_id: string;
  target_name: string;
  bid_type: 'player' | 'real_team';
  bid_amount: number;
  team_name?: string; // real team name for players
}

export default function TeamDraftPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [myTeam, setMyTeam] = useState<any>(null);
  const [draftSettings, setDraftSettings] = useState<DraftSettings | null>(null);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [realTeams, setRealTeams] = useState<RealTeam[]>([]);
  
  // Local state for bids wishlist
  const [localBids, setLocalBids] = useState<LocalBid[]>([]);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { alertState, showAlert, closeAlert } = useModal();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const loadDraftData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // 1. Fetch user's team details
      const teamRes = await fetchWithTokenRefresh(`/api/fantasy/teams/my-team?user_id=${user.uid}`);
      if (!teamRes.ok) {
        throw new Error('Failed to load fantasy team details');
      }
      const teamData = await teamRes.json();
      setMyTeam(teamData.team);

      if (!teamData.team || !teamData.team.fantasy_league_id) {
        setIsLoading(false);
        return;
      }

      const leagueId = teamData.team.fantasy_league_id;

      // 2. Fetch draft settings and league info
      const settingsRes = await fetchWithTokenRefresh(`/api/fantasy/draft/settings?league_id=${leagueId}`);
      let seasonId = null;
      let settingsObj: DraftSettings | null = null;

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        const draftStatus = settingsData.settings?.draft_status || 'pending';
        const isDraftActive = settingsData.settings?.is_draft_active || false;
        seasonId = settingsData.settings?.season_id;
        
        const loadedCategorySettings = typeof settingsData.settings?.category_settings === 'string'
          ? JSON.parse(settingsData.settings.category_settings)
          : settingsData.settings?.category_settings;

        settingsObj = {
          budget: settingsData.settings?.budget_per_team || 500,
          is_active: isDraftActive,
          status: isDraftActive ? 'active' : (draftStatus === 'pending' ? 'pending' : 'completed'),
          draft_status: draftStatus,
          draft_opens_at: settingsData.settings?.draft_opens_at || '',
          draft_closes_at: settingsData.settings?.draft_closes_at || '',
          category_settings: loadedCategorySettings
        };
        setDraftSettings(settingsObj);

        const serverActiveSlot = Number(loadedCategorySettings?.active_slot_index);
        if (serverActiveSlot) {
          setActiveSlotIndex(serverActiveSlot);
        }
      }

      // 3. Fetch all players in the pool
      const playersRes = await fetchWithTokenRefresh(`/api/fantasy/players/pool?league_id=${leagueId}`);
      let playersList: Player[] = [];
      if (playersRes.ok) {
        const playersData = await playersRes.json();
        playersList = playersData.players || [];
        setAvailablePlayers(playersList);
      }

      // 4. Fetch real teams in the tournament
      const teamsRes = await fetchWithTokenRefresh(
        seasonId ? `/api/teams/registered?season_id=${seasonId}` : '/api/teams/registered'
      );
      let teamsList: RealTeam[] = [];
      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        teamsList = teamsData.teams || [];
        setRealTeams(teamsList);
      }

      // 5. Fetch team's current bids
      const bidsRes = await fetchWithTokenRefresh(`/api/fantasy/draft/bids/my-bids?user_id=${user.uid}`);
      if (bidsRes.ok) {
        const bidsData = await bidsRes.json();
        
        // Map bids to local state structure
        const mappedBids: LocalBid[] = (bidsData.bids || []).map((b: any) => {
          if (b.bid_type === 'player') {
            const playerObj = playersList.find((p: any) => p.real_player_id === b.target_id);
            return {
              slot_index: b.slot_index,
              priority: b.priority,
              target_id: b.target_id,
              target_name: playerObj?.player_name || b.target_id,
              bid_type: 'player',
              bid_amount: b.bid_amount,
              team_name: playerObj?.real_team_name
            };
          } else {
            const teamObj = teamsList.find((t: any) => t.team_uid === b.target_id);
            return {
              slot_index: b.slot_index,
              priority: b.priority,
              target_id: b.target_id,
              target_name: teamObj?.team_name || b.target_id,
              bid_type: 'real_team',
              bid_amount: b.bid_amount
            };
          }
        });

        setLocalBids(mappedBids);
        setHasUnsavedChanges(false);
      }

    } catch (error) {
      console.error('Failed to load draft data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Set up live countdown timer
  useEffect(() => {
    if (!draftSettings?.draft_closes_at) return;

    const timer = setInterval(() => {
      const closesAt = new Date(draftSettings.draft_closes_at).getTime();
      const now = new Date().getTime();
      const diff = closesAt - now;

      if (diff <= 0) {
        setTimeRemaining(0);
        clearInterval(timer);
      } else {
        setTimeRemaining(diff);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [draftSettings]);

  useEffect(() => {
    if (user) {
      loadDraftData();
    }
  }, [user, loadDraftData]);

  // Format time remaining
  const formatTime = (ms: number) => {
    if (ms <= 0) return 'Closed';
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hours}h ${mins}m ${secs}s`;
  };

  // Math for remaining budget: deduct the maximum bid amount placed in each slot
  const calculateRemainingBudget = () => {
    if (!draftSettings || !myTeam) return 0;
    const activeSlot = draftSettings.category_settings?.active_slot_index 
      ? Number(draftSettings.category_settings.active_slot_index) 
      : null;

    if (activeSlot) {
      // Slot-by-slot: Remaining budget is the team's current database budget minus the max bid in the active slot
      const slotBids = localBids.filter(b => b.slot_index === activeSlot);
      const maxBidInSlot = slotBids.length > 0 ? Math.max(...slotBids.map(b => b.bid_amount)) : 0;
      return Math.max(0, Number(myTeam.budget_remaining || 0) - maxBidInSlot);
    } else {
      // Legacy batch mode
      const maxBidsBySlot: Record<number, number> = {};
      localBids.forEach(bid => {
        const idx = bid.slot_index;
        if (!maxBidsBySlot[idx] || bid.bid_amount > maxBidsBySlot[idx]) {
          maxBidsBySlot[idx] = bid.bid_amount;
        }
      });
      const spent = Object.values(maxBidsBySlot).reduce((sum, amt) => sum + amt, 0);
      return Math.max(0, draftSettings.budget - spent);
    }
  };

  const getActiveSlot = (): Slot | undefined => {
    return draftSettings?.category_settings?.slots.find(s => s.slot_index === activeSlotIndex);
  };

  // Filter available player pool / teams based on selected active slot lists
  const getFilteredPool = () => {
    const slot = getActiveSlot();
    if (!slot || !draftSettings?.category_settings) return [];

    const listId = slot.list_id;
    const listPlayerIds = draftSettings.category_settings.lists[listId] || [];

    if (slot.name.toLowerCase().includes('team') || slot.list_id.includes('team')) {
      // Real Teams pool
      return realTeams.filter(t => 
        t.team_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } else {
      // Players pool
      return availablePlayers
        .filter(p => listPlayerIds.includes(p.real_player_id))
        .filter(p => 
          p.player_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
          p.real_team_name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }
  };

  const addBidToSlot = (targetId: string, name: string, isPlayer: boolean, teamName?: string) => {
    const slot = getActiveSlot();
    if (!slot) return;

    // Check if player is already bid on in this slot
    if (localBids.some(b => b.slot_index === activeSlotIndex && b.target_id === targetId)) {
      showAlert({
        type: 'error',
        title: 'Already Added',
        message: `${name} is already in your wishlist for this slot.`
      });
      return;
    }

    // Check if this player is bid on in ANY other slot
    if (isPlayer && localBids.some(b => b.target_id === targetId)) {
      showAlert({
        type: 'error',
        title: 'Duplicate Player Bidding',
        message: `You cannot bid on ${name} in multiple slots. Each player can only be bid on once.`
      });
      return;
    }

    const slotBids = localBids.filter(b => b.slot_index === activeSlotIndex);
    const maxBidsLimit = draftSettings?.category_settings?.max_bids_per_team || 0;

    if (maxBidsLimit > 0 && slotBids.length >= maxBidsLimit) {
      showAlert({
        type: 'error',
        title: 'Bid Limit Exceeded',
        message: `You cannot place more than ${maxBidsLimit} bids for this draft round.`
      });
      return;
    }

    const nextPriority = slotBids.length + 1;

    const newBid: LocalBid = {
      slot_index: activeSlotIndex,
      priority: nextPriority,
      target_id: targetId,
      target_name: name,
      bid_type: isPlayer ? 'player' : 'real_team',
      bid_amount: slot.base_price,
      team_name: teamName
    };

    setLocalBids([...localBids, newBid]);
    setHasUnsavedChanges(true);
  };

  const removeBid = (slotIndex: number, targetId: string) => {
    const updatedBids = localBids
      .filter(b => !(b.slot_index === slotIndex && b.target_id === targetId))
      .map((b) => {
        // Re-calculate priority for the remaining bids in this slot
        if (b.slot_index === slotIndex) {
          const slotBids = localBids.filter(x => x.slot_index === slotIndex && x.target_id !== targetId);
          const index = slotBids.findIndex(x => x.target_id === b.target_id);
          return { ...b, priority: index + 1 };
        }
        return b;
      });

    setLocalBids(updatedBids);
    setHasUnsavedChanges(true);
  };

  const updateBidAmount = (slotIndex: number, targetId: string, amount: number) => {
    const updatedBids = localBids.map(b => {
      if (b.slot_index === slotIndex && b.target_id === targetId) {
        return { ...b, bid_amount: amount };
      }
      return b;
    });
    setLocalBids(updatedBids);
    setHasUnsavedChanges(true);
  };

  const handlePriorityChange = (slotIndex: number, targetId: string, direction: 'up' | 'down') => {
    const slotBids = [...localBids.filter(b => b.slot_index === slotIndex)].sort((a, b) => a.priority - b.priority);
    const index = slotBids.findIndex(b => b.target_id === targetId);

    if (direction === 'up' && index > 0) {
      // Swap with previous
      const temp = slotBids[index].priority;
      slotBids[index].priority = slotBids[index - 1].priority;
      slotBids[index - 1].priority = temp;
    } else if (direction === 'down' && index < slotBids.length - 1) {
      // Swap with next
      const temp = slotBids[index].priority;
      slotBids[index].priority = slotBids[index + 1].priority;
      slotBids[index + 1].priority = temp;
    } else {
      return; // No-op
    }

    // Merge back into main list
    const otherBids = localBids.filter(b => b.slot_index !== slotIndex);
    setLocalBids([...otherBids, ...slotBids].sort((a, b) => a.slot_index - b.slot_index || a.priority - b.priority));
    setHasUnsavedChanges(true);
  };

  const saveBids = async (lockSubmit: boolean = false) => {
    if (!myTeam || !draftSettings) return;
    const activeSlot = draftSettings.category_settings?.active_slot_index 
      ? Number(draftSettings.category_settings.active_slot_index) 
      : null;

    if (lockSubmit) {
      if (activeSlot) {
        const slotBids = localBids.filter(b => b.slot_index === activeSlot);
        if (slotBids.length === 0) {
          showAlert({
            type: 'error',
            title: 'No Bids Placed',
            message: `You must place at least one bid for the active slot (${
              draftSettings.category_settings?.slots.find(s => s.slot_index === activeSlot)?.name || `Slot ${activeSlot}`
            }) before submitting.`
          });
          return;
        }
      } else {
        // Ensure they have placed at least one bid for each of the 6 slots
        const activeSlotIndices = new Set(localBids.map(b => b.slot_index));
        const requiredSlots = draftSettings.category_settings?.slots.map(s => s.slot_index) || [1,2,3,4,5,6];
        const missingSlots = requiredSlots.filter(idx => !activeSlotIndices.has(idx));

        if (missingSlots.length > 0) {
          const slotNames = missingSlots.map(idx => {
            const s = draftSettings.category_settings?.slots.find(sl => sl.slot_index === idx);
            return s ? s.name : `Slot ${idx}`;
          });
          showAlert({
            type: 'error',
            title: 'Missing Roster Slots',
            message: `To submit and lock, you must bid on at least one choice for: ${slotNames.join(', ')}.`
          });
          return;
        }
      }

      if (!confirm('Are you sure you want to lock your draft submissions? Once locked, you cannot modify your bids unless unlocked by the committee admin.')) {
        return;
      }
      setIsSubmitting(true);
    } else {
      setIsSaving(true);
    }

    try {
      const res = await fetchWithTokenRefresh('/api/fantasy/draft/bids/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user!.uid,
          bids: localBids.map(b => ({
            slot_index: b.slot_index,
            priority: b.priority,
            target_id: b.target_id,
            bid_type: b.bid_type,
            bid_amount: b.bid_amount
          })),
          lock: lockSubmit
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit bids');
      }

      setHasUnsavedChanges(false);
      showAlert({
        type: 'success',
        title: lockSubmit ? 'Bids Submitted & Locked!' : 'Draft Saved',
        message: lockSubmit 
          ? 'Your bids are now locked. Good luck in the draft!' 
          : 'Your draft bids have been synced to the database.'
      });
      loadDraftData();
    } catch (error) {
      console.error('Error saving bids:', error);
      showAlert({
        type: 'error',
        title: 'Failed to Save',
        message: error instanceof Error ? error.message : 'An error occurred.'
      });
    } finally {
      setIsSaving(false);
      setIsSubmitting(false);
    }
  };

  const handleUnlock = async () => {
    if (!confirm('Unlock your draft list to make edits?')) {
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetchWithTokenRefresh(`/api/fantasy/draft/bids/submit?user_id=${user!.uid}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to unlock');
      }
      showAlert({
        type: 'success',
        title: 'Draft Unlocked',
        message: 'You can now edit your wishlist and resubmit.'
      });
      loadDraftData();
    } catch (err: any) {
      showAlert({
        type: 'error',
        title: 'Unlock Failed',
        message: err.message || 'Failed to unlock.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading draft dashboard...</p>
        </div>
      </div>
    );
  }

  if (!myTeam || !draftSettings) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="max-w-md w-full bg-white border border-slate-200/60 p-8 rounded-3xl text-center shadow-sm relative z-10 font-mono">
          <div className="w-16 h-16 bg-slate-800 border border-slate-700 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">No Active Fantasy League</h3>
          <p className="text-xs text-slate-455 font-bold uppercase leading-normal mb-6">
            Your team is not registered in an active fantasy league. Contact the committee admin to enable fantasy.
          </p>
          <Link href="/dashboard" className="px-6 py-3 bg-slate-800 border border-slate-900 hover:bg-slate-700 text-amber-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const activeSlot = draftSettings?.category_settings?.active_slot_index 
    ? Number(draftSettings.category_settings.active_slot_index) 
    : null;

  if (draftSettings.draft_status === 'completed') {
    return (
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="max-w-md mx-auto relative z-10 font-mono">
          <Link
            href="/dashboard/team/fantasy/my-team"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm mb-6 transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to My Team
          </Link>

          <div className="console-card bg-white border border-slate-200/60 p-8 rounded-3xl text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-800 border border-slate-700 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Draft Completed</h3>
            <p className="text-xs text-slate-455 font-bold uppercase leading-normal mb-6">
              The fantasy league draft is completed and all rosters are finalized.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (activeSlot === null || draftSettings.draft_status === 'pending') {
    return (
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="max-w-md mx-auto relative z-10 font-mono">
          <Link
            href="/dashboard/team/fantasy/my-team"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm mb-6 transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to My Team
          </Link>

          <div className="console-card bg-white border border-slate-200/60 p-8 rounded-3xl text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-800 border border-slate-700 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow">
              <Clock className="w-8 h-8 text-amber-500 animate-pulse" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Draft Round Not Started</h3>
            <p className="text-xs text-slate-455 font-bold uppercase leading-normal mb-6">
              The fantasy draft is conducted round-by-round. Please wait for the committee admin to start the active bidding round.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isBiddingLocked = 
    myTeam?.draft_submitted || 
    (draftSettings?.draft_closes_at && timeRemaining <= 0);

  const isSlotDisabled = (slotIdx: number) => {
    return isBiddingLocked || slotIdx !== activeSlot;
  };

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <AlertModal {...alertState} onClose={closeAlert} />

      <div className="max-w-6xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Navigation */}
        <div className="flex justify-between items-center">
          <Link
            href="/dashboard/team/fantasy/my-team"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to My Team
          </Link>
        </div>

        {/* Top Banner (Status, Countdown, Budget) */}
        <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase bg-amber-500 border border-amber-600 text-slate-900 px-2.5 py-0.5 rounded-lg font-black tracking-wider">
                  FANTASY DRAFT ACTIVE
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase">{myTeam.team_name}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-1.5 uppercase">Blind Bid Category Draft</h1>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {/* Countdown */}
              <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200/80 px-4 py-2.5 rounded-xl">
                <Clock className="w-4.5 h-4.5 text-indigo-650" />
                <div>
                  <p className="text-[8px] text-slate-400 uppercase font-black">Draft Closes In</p>
                  <h4 className="text-xs font-black text-slate-800 uppercase mt-0.5">{formatTime(timeRemaining)}</h4>
                </div>
              </div>

              {/* Budget Display */}
              <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200/80 px-4 py-2.5 rounded-xl">
                <DollarSign className="w-4.5 h-4.5 text-emerald-650" />
                <div>
                  <p className="text-[8px] text-slate-400 uppercase font-black">Remaining Budget</p>
                  <h4 className="text-xs font-black text-emerald-600 mt-0.5">{calculateRemainingBudget()} / {draftSettings.budget} Cr</h4>
                </div>
              </div>

              {/* Submit Button */}
              <div>
                {isBiddingLocked ? (
                  <div className="flex items-center gap-2">
                    <span className="px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-250 text-xs font-black rounded-xl uppercase flex items-center gap-1.5 shadow-sm">
                      <CheckCircle className="w-4 h-4 text-emerald-600" /> Locked & Submitted
                    </span>
                    {myTeam.draft_submitted && draftSettings.draft_status === 'active' && timeRemaining > 0 && (
                      <button
                        onClick={handleUnlock}
                        disabled={isSubmitting}
                        className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-900 text-amber-400 font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer"
                      >
                        Unlock
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveBids(false)}
                      disabled={isSaving || isSubmitting}
                      className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-black rounded-xl border border-slate-300 transition-all uppercase flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" /> Save Draft
                    </button>
                    <button
                      onClick={() => saveBids(true)}
                      disabled={isSaving || isSubmitting}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-slate-750 text-white text-xs font-black rounded-xl transition-all uppercase flex items-center gap-1.5 shadow-sm cursor-pointer border border-slate-900"
                    >
                      <Lock className="w-3.5 h-3.5" /> Submit & Lock
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content split grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT AREA: Player Pool & Real Teams (Columns 1-7) */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            {/* Active Slot Context Card */}
            {(() => {
              const slot = getActiveSlot();
              if (!slot) return null;
              return (
                <div className="console-card bg-white border border-slate-200/60 p-5 rounded-2xl flex items-center justify-between gap-4">
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Active Slot Selection Pool</span>
                    <h3 className="text-base font-black text-slate-900 mt-0.5 uppercase">{slot.name}</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">List ID: <code className="text-indigo-600 font-extrabold">{slot.list_id}</code> | Base Price: {slot.base_price} Credits</p>
                  </div>
                  <div className="bg-slate-800 border border-slate-900 w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg text-amber-400 shadow-sm shrink-0">
                    {slot.slot_index}
                  </div>
                </div>
              );
            })()}

            {/* Search bar */}
            <div className="relative">
              <span className="absolute left-4 top-3.5 text-slate-400">
                <Search className="w-4.5 h-4.5" />
              </span>
              <input
                type="text"
                placeholder="Search by name, team, category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-250 rounded-xl text-xs font-bold uppercase text-slate-850 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
              />
            </div>

            {/* Available Targets Pool Card */}
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden flex flex-col shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider">Available Targets Pool</h3>
                <span className="text-[9px] text-slate-500 font-bold uppercase">{getFilteredPool().length} items found</span>
              </div>

              <div className="overflow-y-auto max-h-[500px] divide-y divide-slate-100">
                {getFilteredPool().map((item: any) => {
                  const isRealTeam = !('real_player_id' in item);
                  const itemId = isRealTeam ? item.team_uid : item.real_player_id;
                  const name = isRealTeam ? item.team_name : item.player_name;
                  const desc = isRealTeam ? 'Real Team' : `${item.real_team_name} | ${item.position}`;

                  return (
                    <div key={itemId} className="p-4 flex items-center justify-between hover:bg-slate-50/40 transition-colors gap-3">
                      <div>
                        <h4 className="font-bold text-slate-800 text-xs uppercase">{name}</h4>
                        <p className="text-[9px] text-slate-450 font-bold uppercase mt-1">{desc}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        {!isRealTeam && (
                          <span className={`px-2 py-0.5 text-[8px] font-black rounded-lg border uppercase tracking-wider ${
                            item.category === 'RED' ? 'bg-red-50 border-red-200 text-red-700' :
                            item.category === 'BLUE' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                            item.category === 'BLACK' ? 'bg-zinc-100 border-zinc-200 text-zinc-700' :
                            'bg-slate-50 border-slate-200 text-slate-650'
                          }`}>
                            {item.category}
                          </span>
                        )}
                        
                        <button
                          onClick={() => addBidToSlot(itemId, name, !isRealTeam, item.real_team_name)}
                          disabled={isBiddingLocked || isSlotDisabled(activeSlotIndex)}
                          className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-750 disabled:opacity-40 text-amber-400 font-mono font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer border border-slate-900"
                        >
                          Select
                        </button>
                      </div>
                    </div>
                  );
                })}

                {getFilteredPool().length === 0 && (
                  <div className="p-12 text-center text-slate-400 text-xs uppercase font-bold">
                    <Info className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    No matching targets in this slot's configuration list.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Roster Slots & Bids Wishlist (Columns 8-12) */}
          <div className="lg:col-span-5 flex flex-col space-y-4">
            <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Roster Slots Bidding</h2>

              {activeSlot !== null && activeSlotIndex !== activeSlot && (
                <div className="mb-4 bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-[10px] text-amber-700 font-bold uppercase flex items-center gap-2 leading-relaxed">
                  <Lock className="w-4 h-4 text-amber-500 shrink-0" />
                  This slot is locked. Bidding is currently active for Slot {activeSlot}: {draftSettings.category_settings?.slots.find(s => s.slot_index === activeSlot)?.name || `Slot ${activeSlot}`}.
                </div>
              )}

              <div className="space-y-4">
                {(draftSettings.category_settings?.slots || [])
                  .filter(slot => {
                    if (activeSlot !== null) {
                      return slot.slot_index === activeSlot;
                    }
                    return true;
                  })
                  .map(slot => {
                    const isActive = slot.slot_index === activeSlotIndex;
                    const slotBids = localBids.filter(b => b.slot_index === slot.slot_index).sort((a,b) => a.priority - b.priority);

                  return (
                    <div
                      key={slot.slot_index}
                      onClick={() => setActiveSlotIndex(slot.slot_index)}
                      className={`border rounded-2xl p-4 transition-all cursor-pointer ${
                        isActive 
                          ? 'border-amber-500 bg-amber-50/20 shadow-sm' 
                          : 'border-slate-200 bg-slate-50/50 hover:border-slate-350'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                            isActive ? 'bg-amber-500 text-slate-900' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {slot.slot_index}
                          </span>
                          <h4 className={`text-xs font-black uppercase tracking-wider ${isActive ? 'text-amber-600' : 'text-slate-700'} flex items-center gap-1.5`}>
                            {slot.name}
                            {activeSlot !== null && slot.slot_index !== activeSlot && (
                              <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                            )}
                          </h4>
                        </div>
                        <span className="text-[9px] text-slate-550 font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                          Base: {slot.base_price} Cr
                        </span>
                      </div>

                      {/* Wishlist/fallback bids in this slot */}
                      {slotBids.length > 0 ? (
                        <div className="space-y-2 mt-3 pl-8">
                          {slotBids.map((bid, bIndex) => (
                            <div 
                              key={bid.target_id} 
                              className="bg-white border border-slate-200 p-2.5 rounded-xl flex items-center justify-between gap-3 shadow-sm"
                              onClick={(e) => e.stopPropagation()} // Prevent clicking container from switching slots
                            >
                              <div className="min-w-0 flex-1">
                                <span className="text-[8px] uppercase font-black text-amber-650">
                                  Priority {bid.priority}
                                </span>
                                <h5 className="font-bold text-slate-800 text-xs truncate mt-0.5 uppercase">{bid.target_name}</h5>
                                <p className="text-[9px] text-slate-450 truncate uppercase">{bid.team_name || 'Roster Target'}</p>
                              </div>

                              <div className="flex items-center gap-2">
                                {/* Bid Amount input */}
                                <input
                                  type="number"
                                  value={bid.bid_amount}
                                  disabled={isSlotDisabled(slot.slot_index)}
                                  onChange={(e) => updateBidAmount(slot.slot_index, bid.target_id, parseInt(e.target.value) || 0)}
                                  className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-center text-xs font-bold text-emerald-600 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                                  min={slot.base_price}
                                  required
                                />

                                {/* Priority controls */}
                                {!isSlotDisabled(slot.slot_index) && (
                                  <div className="flex flex-col gap-0.5">
                                    <button
                                      onClick={() => handlePriorityChange(slot.slot_index, bid.target_id, 'up')}
                                      disabled={bIndex === 0}
                                      className="p-0.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded disabled:opacity-30"
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => handlePriorityChange(slot.slot_index, bid.target_id, 'down')}
                                      disabled={bIndex === slotBids.length - 1}
                                      className="p-0.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded disabled:opacity-30"
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}

                                {/* Delete button */}
                                {!isSlotDisabled(slot.slot_index) && (
                                  <button
                                    onClick={() => removeBid(slot.slot_index, bid.target_id)}
                                    className="p-1 text-slate-450 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[9px] text-slate-450 font-bold uppercase italic pl-8 mt-2.5">No bids placed for this slot yet. Select a target.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
