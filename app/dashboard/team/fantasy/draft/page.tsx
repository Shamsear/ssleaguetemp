'use client';
import { Search, DollarSign, Clock, CheckCircle, AlertTriangle, User, Shield, Info, Trash2, ArrowUp, ArrowDown, Save, Lock } from 'lucide-react';
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
        
        settingsObj = {
          budget: settingsData.settings?.budget_per_team || 500,
          is_active: isDraftActive,
          status: isDraftActive ? 'active' : (draftStatus === 'pending' ? 'pending' : 'completed'),
          draft_status: draftStatus,
          draft_opens_at: settingsData.settings?.draft_opens_at || '',
          draft_closes_at: settingsData.settings?.draft_closes_at || '',
          category_settings: settingsData.settings?.category_settings
        };
        setDraftSettings(settingsObj);
      }

      // 3. Fetch all players in the pool
      const playersRes = await fetchWithTokenRefresh(`/api/fantasy/players/pool?league_id=${leagueId}`);
      if (playersRes.ok) {
        const playersData = await playersRes.json();
        setAvailablePlayers(playersData.players || []);
      }

      // 4. Fetch real teams in the tournament
      const teamsRes = await fetchWithTokenRefresh(
        seasonId ? `/api/teams/registered?season_id=${seasonId}` : '/api/teams/registered'
      );
      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        setRealTeams(teamsData.teams || []);
      }

      // 5. Fetch team's current bids
      const bidsRes = await fetchWithTokenRefresh(`/api/fantasy/draft/bids/my-bids?user_id=${user.uid}`);
      if (bidsRes.ok) {
        const bidsData = await bidsRes.json();
        
        // Map bids to local state structure
        const mappedBids: LocalBid[] = (bidsData.bids || []).map((b: any) => {
          if (b.bid_type === 'player') {
            const playerObj = (playersData.players || []).find((p: any) => p.real_player_id === b.target_id);
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
            const teamObj = (teamsData.teams || []).find((t: any) => t.team_uid === b.target_id);
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
    if (!draftSettings) return 0;
    const maxBidsBySlot: Record<number, number> = {};
    localBids.forEach(bid => {
      const idx = bid.slot_index;
      if (!maxBidsBySlot[idx] || bid.bid_amount > maxBidsBySlot[idx]) {
        maxBidsBySlot[idx] = bid.bid_amount;
      }
    });
    const spent = Object.values(maxBidsBySlot).reduce((sum, amt) => sum + amt, 0);
    return Math.max(0, draftSettings.budget - spent);
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

    if (lockSubmit) {
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
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400 mx-auto"></div>
          <p className="mt-4 text-slate-400">Loading draft dashboard...</p>
        </div>
      </div>
    );
  }

  if (!myTeam || !draftSettings) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-6 rounded-2xl text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No Active Fantasy League</h3>
          <p className="text-slate-400 text-sm mb-6">
            Your team is not registered in an active fantasy league. Contact the committee admin to enable fantasy.
          </p>
          <Link href="/dashboard" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all inline-block">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const isBiddingLocked = myTeam.draft_submitted || draftSettings.draft_status === 'completed' || timeRemaining <= 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <AlertModal {...alertState} onClose={closeAlert} />

      {/* Top Banner (Status, Countdown, Budget) */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 shadow-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 px-2 py-0.5 rounded font-black tracking-wider">
                FANTASY DRAFT ACTIVE
              </span>
              <span className="text-xs text-slate-400 font-bold">{myTeam.team_name}</span>
            </div>
            <h1 className="text-xl font-black text-white mt-1">Blind Bid Category Draft</h1>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            {/* Countdown */}
            <div className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl">
              <Clock className="w-4 h-4 text-indigo-400" />
              <div>
                <p className="text-[9px] text-slate-400 uppercase font-black">Draft Closes In</p>
                <h4 className="text-sm font-black text-white">{formatTime(timeRemaining)}</h4>
              </div>
            </div>

            {/* Budget Display */}
            <div className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <div>
                <p className="text-[9px] text-slate-400 uppercase font-black">Remaining Budget</p>
                <h4 className="text-sm font-black text-emerald-400">{calculateRemainingBudget()} / {draftSettings.budget} Cr</h4>
              </div>
            </div>

            {/* Submit Button */}
            <div>
              {isBiddingLocked ? (
                <div className="flex items-center gap-2">
                  <span className="px-4 py-2.5 bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs font-black rounded-xl uppercase flex items-center gap-1.5 shadow">
                    <CheckCircle className="w-4 h-4" /> Locked & Submitted
                  </span>
                  {myTeam.draft_submitted && draftSettings.draft_status === 'active' && timeRemaining > 0 && (
                    <button
                      onClick={handleUnlock}
                      disabled={isSubmitting}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all"
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
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-black rounded-xl border border-slate-700 transition-all uppercase flex items-center gap-1 shadow"
                  >
                    <Save className="w-3.5 h-3.5" /> Save Draft
                  </button>
                  <button
                    onClick={() => saveBids(true)}
                    disabled={isSaving || isSubmitting}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-all uppercase flex items-center gap-1.5 shadow"
                  >
                    <Lock className="w-3.5 h-3.5" /> Submit & Lock
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT AREA: Player Pool & Real Teams (Columns 1-7) */}
        <div className="lg:col-span-7 flex flex-col min-h-[500px]">
          {/* Active Slot Context Card */}
          {(() => {
            const slot = getActiveSlot();
            if (!slot) return null;
            return (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4 flex items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Slot Selection Pool</span>
                  <h3 className="text-lg font-black text-white mt-0.5">{slot.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Showing pool for list ID: <code className="text-indigo-400">{slot.list_id}</code> (Base Price: {slot.base_price} Credits)</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg text-indigo-400 shadow">
                  {slot.slot_index}
                </div>
              </div>
            );
          })()}

          {/* Search bar */}
          <div className="relative mb-4">
            <span className="absolute left-4 top-3.5 text-slate-500">
              <Search className="w-4.5 h-4.5" />
            </span>
            <input
              type="text"
              placeholder="Search by name, team, position..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-inner"
            />
          </div>

          {/* List display */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl flex-1 overflow-hidden flex flex-col shadow-lg">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h3 className="font-bold text-slate-300 text-sm">Available Targets</h3>
              <span className="text-xs text-slate-500">{getFilteredPool().length} items found</span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[550px] divide-y divide-slate-800">
              {getFilteredPool().map((item: any) => {
                const isRealTeam = !('real_player_id' in item);
                const itemId = isRealTeam ? item.team_uid : item.real_player_id;
                const name = isRealTeam ? item.team_name : item.player_name;
                const desc = isRealTeam ? 'Real Team' : `${item.real_team_name} • ${item.position}`;

                return (
                  <div key={itemId} className="p-4 flex items-center justify-between hover:bg-slate-800/40 transition-colors">
                    <div>
                      <h4 className="font-bold text-white text-sm">{name}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      {!isRealTeam && (
                        <span className={`px-2 py-0.5 text-[9px] font-black rounded-full uppercase tracking-wider ${
                          item.category === 'RED' ? 'bg-red-950 text-red-300 border border-red-800/50' :
                          item.category === 'BLUE' ? 'bg-blue-950 text-blue-300 border border-blue-800/50' :
                          item.category === 'BLACK' ? 'bg-zinc-800 text-zinc-300 border border-zinc-700/50' :
                          'bg-slate-800 text-slate-300 border border-slate-700/50'
                        }`}>
                          {item.category}
                        </span>
                      )}
                      
                      <button
                        onClick={() => addBidToSlot(itemId, name, !isRealTeam, item.real_team_name)}
                        disabled={isBiddingLocked}
                        className="px-4 py-1.5 bg-indigo-600/90 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs font-black rounded-lg transition-colors shadow"
                      >
                        + Select Target
                      </button>
                    </div>
                  </div>
                );
              })}

              {getFilteredPool().length === 0 && (
                <div className="p-12 text-center text-slate-500 text-sm">
                  <Info className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  No matching targets in this slot's configuration list.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Roster Slots & Bids Wishlist (Columns 8-12) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
            <h2 className="text-base font-black text-white mb-4 border-b border-slate-800 pb-2">Roster Slots Bidding</h2>

            <div className="space-y-4">
              {draftSettings.category_settings?.slots.map(slot => {
                const isActive = slot.slot_index === activeSlotIndex;
                const slotBids = localBids.filter(b => b.slot_index === slot.slot_index).sort((a,b) => a.priority - b.priority);

                return (
                  <div
                    key={slot.slot_index}
                    onClick={() => setActiveSlotIndex(slot.slot_index)}
                    className={`border rounded-xl p-4 transition-all cursor-pointer ${
                      isActive 
                        ? 'border-indigo-500 bg-indigo-950/20 shadow-md shadow-indigo-950/20' 
                        : 'border-slate-800 bg-slate-950/30 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                          isActive ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {slot.slot_index}
                        </span>
                        <h4 className={`text-xs font-black uppercase tracking-wider ${isActive ? 'text-indigo-400' : 'text-slate-300'}`}>
                          {slot.name}
                        </h4>
                      </div>
                      <span className="text-[10px] text-slate-500 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                        Base: {slot.base_price} Credits
                      </span>
                    </div>

                    {/* Wishlist/fallback bids in this slot */}
                    {slotBids.length > 0 ? (
                      <div className="space-y-2 mt-3 pl-8">
                        {slotBids.map((bid, bIndex) => (
                          <div 
                            key={bid.target_id} 
                            className="bg-slate-900/60 border border-slate-850 p-2.5 rounded-lg flex items-center justify-between gap-3"
                            onClick={(e) => e.stopPropagation()} // Prevent clicking container from switching slots
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-[9px] uppercase font-black text-indigo-400">
                                Priority {bid.priority}
                              </span>
                              <h5 className="font-bold text-white text-xs truncate mt-0.5">{bid.target_name}</h5>
                              <p className="text-[9px] text-slate-500 truncate">{bid.team_name || 'Roster Target'}</p>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Bid Amount input */}
                              <input
                                type="number"
                                value={bid.bid_amount}
                                disabled={isBiddingLocked}
                                onChange={(e) => updateBidAmount(slot.slot_index, bid.target_id, parseInt(e.target.value) || 0)}
                                className="w-16 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-center text-xs font-bold text-emerald-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                min={slot.base_price}
                                required
                              />

                              {/* Priority controls */}
                              {!isBiddingLocked && (
                                <div className="flex flex-col gap-0.5">
                                  <button
                                    onClick={() => handlePriorityChange(slot.slot_index, bid.target_id, 'up')}
                                    disabled={bIndex === 0}
                                    className="p-0.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded disabled:opacity-30"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handlePriorityChange(slot.slot_index, bid.target_id, 'down')}
                                    disabled={bIndex === slotBids.length - 1}
                                    className="p-0.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded disabled:opacity-30"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                </div>
                              )}

                              {/* Delete button */}
                              {!isBiddingLocked && (
                                <button
                                  onClick={() => removeBid(slot.slot_index, bid.target_id)}
                                  className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-950/20 rounded transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 italic pl-8 mt-2">No bids placed for this slot yet. Select a target from the pool.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
