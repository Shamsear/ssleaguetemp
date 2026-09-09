'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { ArrowLeft, Target, Users, Clock, AlertTriangle, CheckCircle, Trophy, RefreshCw, Zap, Shield, Sparkles, Filter, Lock, Unlock, Play, Pause, Timer, Save, Eye, Crown } from 'lucide-react';
import AlertModal from '@/components/modals/AlertModal';
import { useModal } from '@/hooks/useModal';
import AuthGuard from '@/components/auth/AuthGuard';

interface TransferWindow {
  window_id: string;
  window_name: string;
  opens_at: string;
  closes_at: string;
  is_active: boolean;
  status: string;
  start_round: number | null;
  end_round: number | null;
}

interface ReleaseItem {
  release_id: string;
  window_id?: string;
  team_id: string;
  team_name: string;
  real_player_id: string;
  player_name: string;
  category: string;
  is_passive_team: boolean;
  purchase_price: number;
  refund_amount: number;
  released_at: string;
}

interface ParticipatingTeam {
  team_id: string;
  team_name: string;
  owner_name: string;
  budget_remaining: number;
  releases: ReleaseItem[];
  reserved_funds: number;
  max_allowed_bid: number;
}

interface Bid {
  bid_id: string;
  draft_round_id: string;
  team_id: string;
  team_name: string;
  owner_name: string;
  category: string;
  is_passive_team: boolean;
  target_id: string;
  target_name: string;
  bid_amount: number;
  status: string;
  submitted_at: string;
  budget_remaining: number;
}

interface Tie {
  tie_id: string;
  target_id: string;
  target_name: string;
  category: string;
  is_passive_team: boolean;
  tied_team_ids: string[];
  tied_bid_amount: number;
  status: string;
  winning_team_id?: string;
  admin_adjusted_amount?: number;
}

interface CategoryTab {
  id: string;
  label: string;
  baseCategory: string;
  slotIndex: number;
}

// ── IST Timezone Helpers ──────────────────────────────────────────────────
const formatISTForInput = (isoOrLocal?: string) => {
  if (!isoOrLocal) {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 10);
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(now).replace(' ', 'T');
  }
  const d = new Date(isoOrLocal);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(' ', 'T');
};

const istInputToUTC = (istInput: string): string => {
  if (!istInput) return new Date().toISOString();
  try {
    const cleanInput = istInput.substring(0, 16);
    const istDateString = `${cleanInput}:00+05:30`;
    return new Date(istDateString).toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
};

export default function PostWindowDraftProcessPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const leagueId = params?.leagueId as string;
  const windowId = searchParams.get('window_id') || '';

  const [windowDetails, setWindowDetails] = useState<TransferWindow | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('Passive Team');
  const [categoryTabs, setCategoryTabs] = useState<CategoryTab[]>([]);
  const [allReleases, setAllReleases] = useState<ReleaseItem[]>([]);
  
  const [participatingTeams, setParticipatingTeams] = useState<ParticipatingTeam[]>([]);
  const [allBids, setAllBids] = useState<Bid[]>([]);
  const [ties, setTies] = useState<Tie[]>([]);
  
  const [roundStatus, setRoundStatus] = useState<'pending' | 'active' | 'closed' | 'finalized'>('pending');
  const [opensAtInput, setOpensAtInput] = useState<string>(formatISTForInput());
  const [closesAtInput, setClosesAtInput] = useState<string>(formatISTForInput());
  const [countdown, setCountdown] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Tie modal state
  const [selectedTie, setSelectedTie] = useState<Tie | null>(null);
  const [tieWinnerId, setTieWinnerId] = useState<string>('');
  const [tieAdjustedAmount, setTieAdjustedAmount] = useState<string>('');
  const [isResolvingTie, setIsResolvingTie] = useState<boolean>(false);

  const { alertState, showAlert, closeAlert } = useModal();

  const loadData = useCallback(async () => {
    if (!leagueId || !windowId) return;
    try {
      setIsLoading(true);

      // 1. Fetch Window Details
      let foundWin: any = null;
      const windowRes = await fetchWithTokenRefresh(`/api/fantasy/transfer-windows?league_id=${leagueId}`);
      if (windowRes.ok) {
        const windowData = await windowRes.json();
        foundWin = (windowData.windows || []).find((w: any) => w.window_id === windowId);
        if (foundWin) {
          setWindowDetails(foundWin);
        }
      }

      // 2. Fetch All Teams
      const teamsRes = await fetchWithTokenRefresh(`/api/fantasy/teams?league_id=${leagueId}`);
      const teamsData = teamsRes.ok ? await teamsRes.json() : { teams: [] };
      const allTeams = teamsData.teams || [];

      // 3. Fetch All Window Releases with resolved categories
      const releasesRes = await fetchWithTokenRefresh(`/api/fantasy/releases?league_id=${leagueId}`);
      const releasesData = releasesRes.ok ? await releasesRes.json() : { releases: [] };
      const rawReleases: ReleaseItem[] = releasesData.releases || [];
      const windowFiltered = rawReleases.filter((r) => r.window_id === windowId || !r.window_id);
      const fetchedReleases = windowFiltered.length > 0 ? windowFiltered : rawReleases;
      setAllReleases(fetchedReleases);

      const dynamicTabs: CategoryTab[] = [];
      dynamicTabs.push({ id: 'Passive Team', label: '🛡️ Supported Teams', baseCategory: 'Passive Team', slotIndex: 1 });
      dynamicTabs.push({ id: 'RED 1', label: '🔴 RED Slot 1', baseCategory: 'RED 1', slotIndex: 1 });
      dynamicTabs.push({ id: 'RED 2', label: '🔴 RED Slot 2', baseCategory: 'RED 2', slotIndex: 2 });

      ['BLACK', 'BLUE', 'WHITE'].forEach((cat) => {
        const icon = cat === 'BLACK' ? '⚫' : cat === 'BLUE' ? '🔵' : '⚪';
        dynamicTabs.push({
          id: cat,
          label: `${icon} ${cat} Category`,
          baseCategory: cat,
          slotIndex: 1
        });
      });

      setCategoryTabs(dynamicTabs);

      // Map releases by team
      const teamsMap: Record<string, ParticipatingTeam> = {};
      allTeams.forEach((t: any) => {
        const teamReleases = fetchedReleases.filter((r) => r.team_id === t.team_id);
        teamsMap[t.team_id] = {
          team_id: t.team_id,
          team_name: t.team_name,
          owner_name: t.owner_name || t.owner_uid,
          budget_remaining: Number(t.budget_remaining || 0),
          releases: teamReleases,
          reserved_funds: 0,
          max_allowed_bid: Number(t.budget_remaining || 0),
        };
      });

      // Calculate reserves for future rounds based on N_future
      const currentTabObj = dynamicTabs.find(t => t.id.toUpperCase() === activeCategory.toUpperCase()) || dynamicTabs[0];

      Object.values(teamsMap).forEach((pTeam) => {
        const teamCats = new Set<string>();
        pTeam.releases.forEach((r) => {
          const cat = r.is_passive_team ? 'Passive Team' : (r.category || 'RED').toUpperCase();
          teamCats.add(cat);
        });

        let reserved = 0;
        teamCats.forEach((futureCat) => {
          if (futureCat !== activeCategory.toUpperCase()) {
            const futureParticipatingCount = Object.values(teamsMap).filter((t) =>
              t.releases.some((r) =>
                futureCat === 'PASSIVE TEAM'
                  ? r.is_passive_team
                  : (r.category || '').toUpperCase() === futureCat
              )
            ).length;

            const N_future = Math.max(1, futureParticipatingCount);
            const basePrice = 10;
            const increment = 1;
            reserved += basePrice + (N_future - 1) * increment;
          }
        });

        pTeam.reserved_funds = reserved;
        pTeam.max_allowed_bid = Math.max(0, pTeam.budget_remaining - reserved);
      });

      setParticipatingTeams(Object.values(teamsMap));

      // 4. Fetch Submitted Bids & Ties for active category, and matching slot schedule
      let fetchedBids: Bid[] = [];
      const bidsRes = await fetchWithTokenRefresh(
        `/api/fantasy/draft/post-release-bids?league_id=${leagueId}&window_id=${windowId}&category=${encodeURIComponent(activeCategory)}`
      );
      if (bidsRes.ok) {
        const bidsData = await bidsRes.json();
        fetchedBids = bidsData.bids || [];
        setAllBids(fetchedBids);
        setTies(bidsData.ties || []);
      }

      // Fetch per-slot active status & schedule from fantasy_draft_rounds
      const roundsRes = await fetchWithTokenRefresh(`/api/fantasy/draft/rounds?league_id=${leagueId}`);
      let matchingRound: any = null;
      if (roundsRes.ok) {
        const roundsData = await roundsRes.json();
        const rounds = roundsData.rounds || [];

        let slotPattern = activeCategory.toUpperCase();
        if (slotPattern === 'RED 1') slotPattern = 'RED SLOT 1';
        else if (slotPattern === 'RED 2') slotPattern = 'RED SLOT 2';
        else if (slotPattern.includes('PASSIVE') || slotPattern.includes('SUPPORTED')) slotPattern = 'REAL TEAM SLOT';

        matchingRound = rounds.find((r: any) => {
          const sName = (r.slot_name || '').toUpperCase();
          if (slotPattern === 'RED SLOT 1') return sName.includes('SLOT 1') || sName.includes('RED 1');
          if (slotPattern === 'RED SLOT 2') return sName.includes('SLOT 2') || sName.includes('RED 2');
          if (slotPattern === 'REAL TEAM SLOT') return sName.includes('REAL TEAM') || sName.includes('PASSIVE') || sName.includes('SUPPORTED');
          return sName.includes(slotPattern);
        });
      }

      const activeOpensAt = matchingRound?.opens_at || foundWin?.opens_at;
      const activeClosesAt = matchingRound?.closes_at || foundWin?.closes_at;

      if (activeOpensAt) setOpensAtInput(formatISTForInput(activeOpensAt));
      if (activeClosesAt) setClosesAtInput(formatISTForInput(activeClosesAt));

      const opensTime = activeOpensAt ? new Date(activeOpensAt).getTime() : 0;
      const closesTime = activeClosesAt ? new Date(activeClosesAt).getTime() : 0;
      const nowTime = Date.now();

      if (matchingRound?.status === 'active') {
        setRoundStatus('active');
      } else if (matchingRound?.status === 'closed') {
        setRoundStatus('closed');
      } else if (matchingRound?.status === 'completed') {
        setRoundStatus('finalized');
      } else if (fetchedBids.some((b: any) => b.status === 'won')) {
        setRoundStatus('finalized');
      } else if (opensTime > nowTime) {
        setRoundStatus('pending');
      } else if (closesTime > 0 && nowTime >= closesTime) {
        setRoundStatus('closed');
      } else if (foundWin?.is_active) {
        setRoundStatus('active');
      } else {
        setRoundStatus('closed');
      }

    } catch (error: any) {
      console.error('Error loading window draft data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [leagueId, windowId, activeCategory]);

  useEffect(() => {
    if (leagueId && windowId) {
      loadData();
    }
  }, [leagueId, windowId, activeCategory, loadData]);

  // Live countdown timer for closesAtInput
  useEffect(() => {
    if (roundStatus !== 'active' || !closesAtInput) {
      setCountdown('');
      return;
    }
    const updateCountdown = () => {
      const closeTime = new Date(istInputToUTC(closesAtInput)).getTime();
      const diff = closeTime - Date.now();
      if (diff <= 0) {
        setCountdown('Deadline Passed');
        return;
      }
      const totalSecs = Math.floor(diff / 1000);
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const s = totalSecs % 60;
      setCountdown(`${h}h ${m}m ${s}s`);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [roundStatus, closesAtInput]);

  // Auto-refresh interval (5s) for live preview of submitted bids
  useEffect(() => {
    if (!autoRefresh || !leagueId || !windowId) return;
    const interval = setInterval(() => {
      loadData();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, leagueId, windowId, loadData]);

  const addTimeMinutes = async (minutesToAdd: number) => {
    try {
      const currentUTC = new Date(istInputToUTC(closesAtInput));
      currentUTC.setMinutes(currentUTC.getMinutes() + minutesToAdd);
      const newClosesInput = formatISTForInput(currentUTC.toISOString());
      setClosesAtInput(newClosesInput);

      await fetchWithTokenRefresh('/api/fantasy/draft/toggle-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: leagueId,
          window_id: windowId,
          category: activeCategory,
          action: 'open',
          opens_at: istInputToUTC(opensAtInput),
          closes_at: currentUTC.toISOString()
        })
      });

      showAlert({
        type: 'success',
        title: 'Time Extended!',
        message: `Extended ${activeCategory} bidding deadline by +${minutesToAdd} minutes. Saved to database!`
      });
    } catch (e) {
      console.error('Error extending time:', e);
    }
  };

  // Save modified IST schedule (Opens At / Closes At) to database
  const handleSaveSchedule = async () => {
    try {
      setIsProcessing(true);
      const opensUTC = istInputToUTC(opensAtInput);
      const closesUTC = istInputToUTC(closesAtInput);

      const targetWinId = windowId || windowDetails?.window_id || '';
      const res = await fetchWithTokenRefresh('/api/fantasy/draft/toggle-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: leagueId,
          window_id: targetWinId,
          category: activeCategory,
          action: 'open',
          opens_at: opensUTC,
          closes_at: closesUTC
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update schedule');
      }

      const now = Date.now();
      const opensMs = new Date(opensUTC).getTime();
      const closesMs = new Date(closesUTC).getTime();

      let newStatusDisplay: 'pending' | 'active' | 'closed' | 'finalized' = 'active';
      if (now < opensMs) newStatusDisplay = 'pending';
      else if (now >= closesMs) newStatusDisplay = 'closed';

      setRoundStatus(newStatusDisplay);

      showAlert({
        type: 'success',
        title: 'Schedule Saved!',
        message: `Updated bidding schedule for ${activeCategory}.\nOpens At: ${opensAtInput.replace('T', ' ')} IST\nCloses At: ${closesAtInput.replace('T', ' ')} IST`
      });
    } catch (err: any) {
      console.error('Error saving schedule:', err);
      showAlert({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Failed to save schedule.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const currentTabObj = categoryTabs.find(t => t.id.toUpperCase() === activeCategory.toUpperCase()) || {
    id: activeCategory,
    label: activeCategory,
    baseCategory: activeCategory.replace(/ \d+$/, ''),
    slotIndex: 1
  };

  // Teams participating in active category/slot
  const activeCategoryTeams = participatingTeams.filter((t) =>
    t.releases.some((r) => {
      if (activeCategory.toLowerCase().includes('passive')) return r.is_passive_team;
      const rCat = (r.category || '').toUpperCase();
      return rCat === activeCategory.toUpperCase();
    })
  );

  // Targets released in this window for active category
  const activeCategoryReleases = allReleases.filter((r) => {
    if (activeCategory.toLowerCase().includes('passive')) return r.is_passive_team;
    const rCat = (r.category || '').toUpperCase();
    return rCat === activeCategory.toUpperCase();
  });

  const maxBidsPerTeam = Math.max(1, activeCategoryTeams.length);

  // Toggle Bidding Status & Save IST Timing to DB
  const handleToggleBiddingStatus = async (newStatus: 'active' | 'closed') => {
    try {
      setIsProcessing(true);
      const action = newStatus === 'active' ? 'open' : 'close';
      const opensUTC = istInputToUTC(opensAtInput);
      const closesUTC = istInputToUTC(closesAtInput);

      const targetWinId = windowId || windowDetails?.window_id || '';
      const res = await fetchWithTokenRefresh('/api/fantasy/draft/toggle-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: leagueId,
          window_id: targetWinId,
          category: activeCategory,
          action,
          opens_at: opensUTC,
          closes_at: closesUTC
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update round status');
      }

      setRoundStatus(newStatus);
      showAlert({
        type: 'success',
        title: newStatus === 'active' ? 'Bidding Round Opened!' : 'Bidding Round Closed',
        message: newStatus === 'active' 
          ? `Bidding for ${activeCategory} is now OPEN (Deadline: ${closesAtInput.replace('T', ' ')} IST). Saved to database! Team owners can now place their bids on their dashboard.`
          : `Bidding for ${activeCategory} is now CLOSED. Click "Finalize Round" to process winning bids.`
      });
    } catch (err: any) {
      console.error('Error toggling round status:', err);
      showAlert({
        type: 'error',
        title: 'Error Updating Round Status',
        message: err.message || 'Failed to update round status'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Finalize Category Round
  const finalizeCategoryRound = async () => {
    if (!confirm(`Are you sure you want to finalize the ${activeCategory} Category Round?\nThis will award targets to highest bidders and update team balances immediately.`)) {
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/draft/process-post-release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: leagueId,
          draft_round_id: windowId,
          category: activeCategory
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to finalize category round');
      }

      setRoundStatus('finalized');
      showAlert({
        type: 'success',
        title: 'Category Round Finalized!',
        message: `${data.message}\nAwarded: ${data.awarded?.length || 0} items | Ties Flagged: ${data.ties?.length || 0}`
      });

      loadData();

    } catch (error: any) {
      console.error('Finalize error:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: error.message || 'Failed to finalize round'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Resolve Tie
  const handleResolveTie = async () => {
    if (!selectedTie || !tieWinnerId || !tieAdjustedAmount) {
      showAlert({
        type: 'error',
        title: 'Incomplete Selection',
        message: 'Please select a winning team and enter the final adjusted amount.'
      });
      return;
    }

    setIsResolvingTie(true);
    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/draft/resolve-tie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tie_id: selectedTie.tie_id,
          winning_team_id: tieWinnerId,
          admin_adjusted_amount: parseFloat(tieAdjustedAmount)
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to resolve tie');

      showAlert({
        type: 'success',
        title: 'Tie Resolved!',
        message: data.message || 'Successfully resolved tie.'
      });

      setSelectedTie(null);
      setTieWinnerId('');
      setTieAdjustedAmount('');
      loadData();

    } catch (error: any) {
      showAlert({
        type: 'error',
        title: 'Tie Resolution Failed',
        message: error.message || 'Failed to resolve tie'
      });
    } finally {
      setIsResolvingTie(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold">Loading post-window draft data...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <AuthGuard requiredRole="committee_admin">
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
        <AlertModal
          isOpen={alertState.isOpen}
          onClose={closeAlert}
          title={alertState.title}
          message={alertState.message}
          type={alertState.type}
        />

        <div className="max-w-5xl mx-auto relative z-10 space-y-6">
          {/* Navigation */}
          <div>
            <Link
              href={`/dashboard/committee/fantasy/${leagueId}/transfer-windows`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Transfer Windows
            </Link>
          </div>

          {/* Header Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">FANTASY CONSOLE</span>
                <span className="px-2 py-0.5 bg-amber-100 border border-amber-300 text-amber-800 text-[9px] font-black rounded-md">
                  IST TIMEZONE (UTC+5:30)
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1 uppercase flex items-center gap-3">
                <Target className="w-7 h-7 text-amber-500" />
                Post-Window Draft Process
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1 uppercase">
                League: <span className="text-amber-600 font-bold">{leagueId}</span> • Window: <span className="text-emerald-700 font-bold">{windowDetails?.window_name || windowId}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                onClick={loadData}
                disabled={isLoading}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-200 flex items-center gap-2 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
              </button>

              <button
                onClick={finalizeCategoryRound}
                disabled={isProcessing}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-900 font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <Zap className="w-4 h-4 fill-amber-400" />
                {isProcessing ? 'Finalizing...' : `Finalize ${activeCategory} Round`}
              </button>
            </div>
          </div>

          {/* Dynamic Category & Sub-Slot Tabs */}
          <div className="console-card bg-white border border-slate-200/60 p-4 rounded-3xl shadow-sm flex flex-wrap items-center gap-2">
            <span className="text-xs font-black uppercase text-slate-700 tracking-wider px-2 flex items-center gap-2">
              <Filter className="w-4 h-4 text-amber-500" /> CATEGORY SUB-SLOTS:
            </span>
            {categoryTabs.map((tab) => {
              const isSelected = activeCategory.toUpperCase() === tab.id.toUpperCase();
              const count = participatingTeams.filter((t) =>
                t.releases.some((r) =>
                  tab.id === 'Passive Team'
                    ? r.is_passive_team
                    : (r.category || '').toUpperCase() === tab.id.toUpperCase()
                )
              ).length;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveCategory(tab.id)}
                  className={`px-4 py-2.5 rounded-xl font-mono text-xs uppercase tracking-wider transition flex items-center gap-2.5 cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800 text-amber-400 font-bold border border-slate-900 shadow-sm'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60 font-bold'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[9px] font-black ${
                      isSelected ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {count} Teams
                  </span>
                </button>
              );
            })}
          </div>

          {/* Round Timing & Countdown Banner */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">TIMING & DEADLINE CONTROLLER (IST)</span>
                <h3 className="text-base font-extrabold text-slate-900 uppercase flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" /> {activeCategory} Bidding Schedule
                </h3>
              </div>

              <div className="flex items-center gap-3">
                {roundStatus === 'active' && countdown && (
                  <div className="px-4 py-1.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl flex items-center gap-2">
                    <Timer className="w-4 h-4 text-emerald-600 animate-pulse" />
                    <span className="text-xs font-black font-mono">{countdown}</span>
                  </div>
                )}

                <span
                  className={`px-3 py-1 text-xs font-black rounded-xl uppercase tracking-wider border ${
                    roundStatus === 'active'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 animate-pulse'
                      : roundStatus === 'finalized'
                      ? 'bg-blue-100 text-blue-800 border-blue-300'
                      : 'bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                >
                  {roundStatus === 'active' ? '🟢 BIDDING ACTIVE (OPEN)' : roundStatus === 'finalized' ? '✅ ROUND FINALIZED' : '🔒 BIDDING CLOSED'}
                </span>
              </div>
            </div>

            {/* Datetime Local Inputs in IST */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1 flex justify-between">
                  <span>Opens At (IST)</span>
                  <span className="text-amber-600 font-black">UTC+5:30</span>
                </label>
                <input
                  type="datetime-local"
                  value={opensAtInput}
                  onChange={(e) => setOpensAtInput(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold font-mono outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1 flex justify-between">
                  <span>Closes At (IST)</span>
                  <span className="text-amber-600 font-black">UTC+5:30</span>
                </label>
                <input
                  type="datetime-local"
                  value={closesAtInput}
                  onChange={(e) => setClosesAtInput(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold font-mono outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Save Schedule Button */}
            <div className="flex justify-end pt-1">
              <button
                onClick={handleSaveSchedule}
                disabled={isProcessing}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" /> Save Schedule
              </button>
            </div>

            {/* Quick Extension Controls */}
            {roundStatus === 'active' && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                <span className="text-[10px] font-bold uppercase text-slate-500">Quick Extend Closes At:</span>
                <button
                  onClick={() => addTimeMinutes(5)}
                  className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-[10px] font-black uppercase cursor-pointer"
                >
                  +5 Mins
                </button>
                <button
                  onClick={() => addTimeMinutes(10)}
                  className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-[10px] font-black uppercase cursor-pointer"
                >
                  +10 Mins
                </button>
                <button
                  onClick={() => addTimeMinutes(15)}
                  className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-[10px] font-black uppercase cursor-pointer"
                >
                  +15 Mins
                </button>
              </div>
            )}

            {/* Step Workflow Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <button
                onClick={() => handleToggleBiddingStatus('active')}
                disabled={roundStatus === 'finalized' || isProcessing}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                  roundStatus === 'finalized'
                    ? 'bg-slate-50 border-slate-200 text-slate-400 font-bold opacity-60 cursor-not-allowed'
                    : roundStatus === 'active'
                    ? 'bg-emerald-50/50 border-emerald-300 text-emerald-900 font-bold hover:bg-emerald-100/60 shadow-sm'
                    : 'bg-white hover:bg-emerald-50/50 border-slate-200 text-slate-800 hover:border-emerald-300 shadow-sm'
                }`}
              >
                <div className="flex items-center gap-2 font-black text-xs uppercase mb-1">
                  <Play className="w-4 h-4 text-emerald-600" />
                  {roundStatus === 'active' ? 'Step 1: Update / Re-open Bidding' : 'Step 1: Open Bidding'}
                </div>
                <p className="text-[10px] text-slate-500 font-mono">
                  Starts bidding round in IST for team owners.
                </p>
              </button>

              <button
                onClick={() => handleToggleBiddingStatus('closed')}
                disabled={roundStatus === 'closed' || roundStatus === 'pending'}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                  roundStatus === 'closed'
                    ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold opacity-60 cursor-not-allowed'
                    : 'bg-white hover:bg-amber-50/50 border-slate-200 text-slate-800 hover:border-amber-300 shadow-sm'
                }`}
              >
                <div className="flex items-center gap-2 font-black text-xs uppercase mb-1">
                  <Pause className="w-4 h-4 text-amber-600" />
                  Step 2: Close Bidding
                </div>
                <p className="text-[10px] text-slate-500 font-mono">
                  Locks submissions prior to finalization.
                </p>
              </button>

              <button
                onClick={finalizeCategoryRound}
                disabled={isProcessing}
                className="p-4 rounded-2xl border text-left bg-slate-800 hover:bg-slate-700 border-slate-900 text-white transition cursor-pointer shadow-sm disabled:opacity-50"
              >
                <div className="flex items-center gap-2 font-black text-xs text-amber-400 uppercase mb-1">
                  <Zap className="w-4 h-4 fill-amber-400" />
                  Step 3: Finalize Round
                </div>
                <p className="text-[10px] text-slate-300 font-mono">
                  Awards targets & updates budget savings instantly.
                </p>
              </button>
            </div>
          </div>

          {/* ── LIVE DRAFT RESULT PREVIEW ── */}
          <div className="console-card bg-white border border-amber-300/80 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-amber-500 text-slate-950 font-black text-[9px] rounded-lg uppercase tracking-wider flex items-center gap-1">
                    <Eye className="w-3 h-3" /> LIVE PREVIEW
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">{activeCategory} Category</span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase mt-1 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" /> Projected Draft Winners &amp; Standings
                </h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Live standings updated as team owners submit bids. Shows projected winners and ties in real-time before finalization.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <label className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3.5 py-2 rounded-xl cursor-pointer text-xs font-mono font-bold text-amber-900 shadow-sm">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="accent-amber-500 w-4 h-4 cursor-pointer"
                  />
                  <span>Live Auto-Refresh (5s)</span>
                </label>
              </div>
            </div>

            {/* Teams Submissions Monitor */}
            {(() => {
              const submittedTeamsCount = activeCategoryTeams.filter(t => 
                allBids.some(b => b.team_id === t.team_id)
              ).length;

              return (
                <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Submission Monitor</span>
                    <h4 className="text-xs font-black text-slate-800 uppercase mt-0.5">
                      {submittedTeamsCount} of {activeCategoryTeams.length} Participating Teams Have Submitted Bids
                    </h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeCategoryTeams.map((t) => {
                      const teamBidsCount = allBids.filter(b => b.team_id === t.team_id).length;
                      const hasSubmitted = teamBidsCount > 0;

                      return (
                        <span
                          key={t.team_id}
                          className={`px-2.5 py-1 text-[9px] font-black rounded-lg uppercase border flex items-center gap-1.5 ${
                            hasSubmitted
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm'
                              : 'bg-amber-50 border-amber-300 text-amber-800 animate-pulse'
                          }`}
                        >
                          {hasSubmitted ? (
                            <>
                              <CheckCircle className="w-3 h-3 text-emerald-600" />
                              <span>{t.team_name}</span>
                              <span className="bg-emerald-200 text-emerald-900 px-1 py-0.2 rounded text-[8px]">{teamBidsCount} bid{teamBidsCount !== 1 ? 's' : ''}</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>{t.team_name} (Awaiting)</span>
                            </>
                          )}
                        </span>
                      );
                    })}

                    {activeCategoryTeams.length === 0 && (
                      <span className="text-[10px] text-slate-400 font-bold uppercase">No participating teams for this category</span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Projected Winners Cards per Released Target */}
            {(() => {
              const isSelfReleaseBid = (bid: Bid) => {
                return allReleases.some((r) => 
                  r.team_id === bid.team_id && 
                  (r.real_player_id === bid.target_id || (r.is_passive_team && bid.is_passive_team))
                );
              };

              const categoryTargetsMap = new Map<string, { target_id: string; target_name: string; is_passive_team: boolean }>();
              activeCategoryReleases.forEach((r) => {
                categoryTargetsMap.set(r.real_player_id, {
                  target_id: r.real_player_id,
                  target_name: r.player_name,
                  is_passive_team: r.is_passive_team
                });
              });

              allBids.forEach((b) => {
                if (!categoryTargetsMap.has(b.target_id)) {
                  categoryTargetsMap.set(b.target_id, {
                    target_id: b.target_id,
                    target_name: b.target_name,
                    is_passive_team: b.is_passive_team
                  });
                }
              });

              const previewTargets = Array.from(categoryTargetsMap.values());

              if (previewTargets.length === 0) {
                return (
                  <div className="py-12 text-center text-slate-400 text-xs font-bold uppercase italic border border-dashed border-slate-200 rounded-2xl">
                    No released items or submitted bids in {activeCategory} category yet.
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {previewTargets.map((target) => {
                    const targetBids = allBids
                      .filter((b) => b.target_id === target.target_id)
                      .sort((a, b) => b.bid_amount - a.bid_amount);

                    const validBids = targetBids.filter((b) => !isSelfReleaseBid(b));
                    const selfReleaseBids = targetBids.filter((b) => isSelfReleaseBid(b));

                    const topBidAmount = validBids.length > 0 ? validBids[0].bid_amount : 0;
                    const topBidders = validBids.filter((b) => b.bid_amount === topBidAmount);
                    const isTie = topBidders.length > 1;
                    const wonBid = validBids.find((b) => b.status === 'won');

                    return (
                      <div
                        key={target.target_id}
                        className={`border rounded-2xl p-5 space-y-3.5 shadow-sm transition-all ${
                          wonBid
                            ? 'bg-emerald-50/40 border-emerald-300'
                            : isTie
                            ? 'bg-amber-50/40 border-amber-300'
                            : validBids.length > 0
                            ? 'bg-white border-slate-200 hover:border-amber-300'
                            : 'bg-slate-50/60 border-slate-200'
                        }`}
                      >
                        {/* Header */}
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                              {target.target_name}
                            </h4>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">
                              Target ID: {target.target_id}
                            </span>
                          </div>

                          <div>
                            {wonBid ? (
                              <span className="px-2.5 py-1 bg-emerald-600 text-white text-[9px] font-black rounded-lg uppercase tracking-wider shadow-sm flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> AWARDED (₹{wonBid.bid_amount} Cr)
                              </span>
                            ) : isTie ? (
                              <span className="px-2.5 py-1 bg-amber-500 text-slate-950 text-[9px] font-black rounded-lg uppercase tracking-wider shadow-sm flex items-center gap-1 animate-pulse">
                                <AlertTriangle className="w-3 h-3" /> TIE ({topBidders.length} Teams @ ₹{topBidAmount} Cr)
                              </span>
                            ) : validBids.length > 0 ? (
                              <span className="px-2.5 py-1 bg-amber-100 border border-amber-300 text-amber-900 text-[9px] font-black rounded-lg uppercase tracking-wider flex items-center gap-1">
                                <Crown className="w-3 h-3 text-amber-600" /> LEADER (₹{topBidAmount} Cr)
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-500 text-[9px] font-black rounded-lg uppercase tracking-wider">
                                NO BIDS YET
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Bids Standings List */}
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                            Bids Breakdown ({validBids.length} valid, {selfReleaseBids.length} self-release)
                          </span>

                          {validBids.map((b, idx) => {
                            const isWinner = !isTie && idx === 0;
                            const isTiedTop = isTie && b.bid_amount === topBidAmount;

                            return (
                              <div
                                key={b.bid_id}
                                className={`px-3 py-2 rounded-xl flex items-center justify-between text-xs font-mono font-bold transition-colors ${
                                  isWinner
                                    ? 'bg-amber-500 text-slate-950 border border-amber-600 shadow-sm'
                                    : isTiedTop
                                    ? 'bg-amber-100 border border-amber-300 text-amber-950'
                                    : 'bg-slate-50 border border-slate-100 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 truncate">
                                  <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${
                                    isWinner ? 'bg-slate-950 text-amber-400' : 'bg-slate-200 text-slate-700'
                                  }`}>
                                    {idx + 1}
                                  </span>
                                  <span className="truncate uppercase">{b.team_name}</span>
                                  {isWinner && <Crown className="w-3.5 h-3.5 text-slate-950 fill-amber-300 shrink-0" />}
                                  {isTiedTop && <span className="text-[8px] bg-amber-200 text-amber-900 px-1 py-0.2 rounded font-black uppercase shrink-0">TIED</span>}
                                </div>

                                <span className={`font-black shrink-0 ${isWinner ? 'text-slate-950 text-xs font-extrabold' : 'text-emerald-700'}`}>
                                  ₹{b.bid_amount} Cr
                                </span>
                              </div>
                            );
                          })}

                          {selfReleaseBids.map((sb) => (
                            <div
                              key={sb.bid_id}
                              className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[10px] font-mono font-bold flex items-center justify-between opacity-80"
                            >
                              <span className="truncate uppercase">{sb.team_name} (Self-Release)</span>
                              <span className="font-black text-rose-600 line-through">₹{sb.bid_amount} Cr (Invalid)</span>
                            </div>
                          ))}

                          {validBids.length === 0 && selfReleaseBids.length === 0 && (
                            <p className="text-[10px] text-slate-400 font-bold uppercase italic py-2 text-center bg-slate-50/50 rounded-xl">
                              No bids submitted for this item yet
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Stat Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="console-card bg-white border border-slate-200/60 p-5 rounded-3xl shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
                Participating Teams
              </span>
              <span className="text-2xl font-black text-slate-900">{activeCategoryTeams.length} Teams</span>
              <p className="text-[10px] text-slate-400 font-bold uppercase">
                Eligible for {activeCategory}
              </p>
            </div>

            <div className="console-card bg-white border border-slate-200/60 p-5 rounded-3xl shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
                Released Targets Available
              </span>
              <span className="text-2xl font-black text-emerald-600">{activeCategoryReleases.length} Released</span>
              <p className="text-[10px] text-slate-400 font-bold uppercase">
                Released in this window
              </p>
            </div>

            <div className="console-card bg-white border border-slate-200/60 p-5 rounded-3xl shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
                Max Bids Limit Per Team
              </span>
              <span className="text-2xl font-black text-amber-600">{maxBidsPerTeam} Bids Max</span>
              <p className="text-[10px] text-slate-400 font-bold uppercase">
                Equal to total participating teams
              </p>
            </div>

            <div className="console-card bg-white border border-slate-200/60 p-5 rounded-3xl shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
                Submitted Bids Count
              </span>
              <span className="text-2xl font-black text-purple-600">{allBids.length} Bids</span>
              <p className="text-[10px] text-slate-400 font-bold uppercase">
                {ties.length > 0 ? `⚠️ ${ties.length} Tie(s) pending` : 'No ties detected'}
              </p>
            </div>
          </div>

          {/* Released Targets List for this Round */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" /> Released Pool Items ({activeCategory})
              </h3>
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                {activeCategoryReleases.length} Item(s) Released in Window
              </span>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {activeCategoryReleases.map((item) => (
                <div
                  key={item.release_id}
                  className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl space-y-1.5"
                >
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-black text-slate-900 uppercase">{item.player_name}</span>
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-black rounded-md uppercase">
                      {item.is_passive_team ? 'Supported Team' : item.category}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                    <span>Released By: <strong className="text-slate-800">{item.team_name}</strong></span>
                    <span>Refund: <strong className="text-emerald-700">₹{item.refund_amount} Cr</strong></span>
                  </div>
                </div>
              ))}

              {activeCategoryReleases.length === 0 && (
                <div className="col-span-full py-8 text-center text-slate-400 text-xs font-bold uppercase italic">
                  No items were released for {activeCategory} category in this window.
                </div>
              )}
            </div>
          </div>

          {/* All Window Releases Summary Log */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-amber-500" /> Complete Transfer Window Releases Log
              </h3>
              <span className="text-[10px] font-bold text-emerald-700 font-black uppercase">
                {allReleases.length} Total Window Releases Logged
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-bold font-mono">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b border-slate-200/60">
                  <tr>
                    <th className="px-6 py-3.5">Released By (Team)</th>
                    <th className="px-6 py-3.5">Released Item / Player</th>
                    <th className="px-6 py-3.5">Assigned Draft Category</th>
                    <th className="px-6 py-3.5">Purchase Price</th>
                    <th className="px-6 py-3.5">Refund Amount</th>
                    <th className="px-6 py-3.5">Release Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allReleases.map((rel) => (
                    <tr key={rel.release_id} className="hover:bg-slate-50/60 transition">
                      <td className="px-6 py-3.5 text-slate-900 font-extrabold">{rel.team_name}</td>
                      <td className="px-6 py-3.5 text-amber-600 font-extrabold">{rel.player_name}</td>
                      <td className="px-6 py-3.5">
                        <span className="px-2.5 py-1 bg-amber-100 border border-amber-300 text-amber-800 text-[9px] font-black rounded-lg uppercase">
                          {rel.is_passive_team ? '🛡️ Supported Team' : rel.category}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-700">₹{rel.purchase_price} Cr</td>
                      <td className="px-6 py-3.5 text-emerald-700 font-black">₹{rel.refund_amount} Cr</td>
                      <td className="px-6 py-3.5 text-slate-400 text-[10px]">
                        {new Date(rel.released_at).toLocaleDateString('en-US')}
                      </td>
                    </tr>
                  ))}

                  {allReleases.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-xs font-bold uppercase italic">
                        No releases found for this transfer window.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Participating Teams & Budget Reservation Table */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-500" /> Participating Teams & Budget Reservations
              </h3>
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                Max Bid = Budget - Reserved Funds (N_future × Base Price)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-bold font-mono">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b border-slate-200/60">
                  <tr>
                    <th className="px-6 py-3.5">Team Name</th>
                    <th className="px-6 py-3.5">Owner</th>
                    <th className="px-6 py-3.5">Released in Category</th>
                    <th className="px-6 py-3.5">Current Budget</th>
                    <th className="px-6 py-3.5">Reserved for Future Rounds</th>
                    <th className="px-6 py-3.5">Max Allowed Bid in Round</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeCategoryTeams.map((team) => {
                    const catReleases = team.releases.filter((r) =>
                      activeCategory.toLowerCase().includes('passive')
                        ? r.is_passive_team
                        : (r.category || '').toUpperCase() === currentTabObj.baseCategory.toUpperCase()
                    );

                    return (
                      <tr key={team.team_id} className="hover:bg-slate-50/60 transition">
                        <td className="px-6 py-3.5 text-slate-900 font-extrabold">{team.team_name}</td>
                        <td className="px-6 py-3.5 text-slate-600">{team.owner_name}</td>
                        <td className="px-6 py-3.5 text-amber-600 font-extrabold">
                          {catReleases.map((r) => r.player_name).join(', ') || 'N/A'}
                        </td>
                        <td className="px-6 py-3.5 text-emerald-700 font-black">₹{team.budget_remaining} Cr</td>
                        <td className="px-6 py-3.5 text-rose-600">₹{team.reserved_funds} Cr</td>
                        <td className="px-6 py-3.5 text-slate-900 font-black text-sm">
                          ₹{team.max_allowed_bid} Cr
                        </td>
                      </tr>
                    );
                  })}

                  {activeCategoryTeams.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-xs font-bold uppercase italic">
                        No teams released items in the {activeCategory} category for this window.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Submitted Bids Matrix */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" /> Submitted Bids Matrix ({activeCategory})
              </h3>
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                Highest Bid Wins Target
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-bold font-mono">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b border-slate-200/60">
                  <tr>
                    <th className="px-6 py-3.5">Team Name</th>
                    <th className="px-6 py-3.5">Target Player / Team</th>
                    <th className="px-6 py-3.5">Bid Amount</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Submitted At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allBids.map((b) => (
                    <tr key={b.bid_id} className="hover:bg-slate-50/60 transition">
                      <td className="px-6 py-3.5 text-slate-900 font-extrabold">{b.team_name}</td>
                      <td className="px-6 py-3.5 text-amber-600 font-extrabold">{b.target_name}</td>
                      <td className="px-6 py-3.5 text-emerald-700 font-black text-sm">₹{b.bid_amount} Cr</td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`px-2.5 py-1 text-[9px] font-black rounded-lg uppercase tracking-wider border ${
                            b.status === 'won'
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : b.status === 'tied'
                              ? 'bg-amber-50 border-amber-300 text-amber-800 animate-pulse'
                              : b.status === 'invalid_self_release'
                              ? 'bg-rose-50 border-rose-300 text-rose-800'
                              : 'bg-slate-100 border-slate-200 text-slate-600'
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-500 text-[10px]">
                        {new Date(b.submitted_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}

                  {allBids.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400 text-xs font-bold uppercase italic">
                        No bids submitted yet for {activeCategory}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Draft Ties Section */}
          {ties.length > 0 && (
            <div className="console-card bg-amber-50 border border-amber-200 rounded-3xl p-6 space-y-4 shadow-sm">
              <h3 className="text-sm font-black text-amber-900 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" /> DRAFT TIES PENDING RESOLUTION
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ties.map((t) => (
                  <div key={t.tie_id} className="bg-white border border-amber-300/80 p-5 rounded-2xl space-y-3 shadow-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-slate-900 uppercase">{t.target_name}</span>
                      <span className="text-xs font-bold text-amber-700 font-mono">Tied Bid: ₹{t.tied_bid_amount} Cr</span>
                    </div>

                    <div className="text-[10px] text-slate-500 font-bold uppercase">
                      Tied Teams Count: {t.tied_team_ids.length}
                    </div>

                    <button
                      onClick={() => {
                        setSelectedTie(t);
                        setTieWinnerId(t.tied_team_ids[0] || '');
                        setTieAdjustedAmount(String(t.tied_bid_amount));
                      }}
                      className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase rounded-xl transition cursor-pointer"
                    >
                      Resolve This Tie
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resolve Tie Modal */}
          {selectedTie && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="console-card bg-white border border-slate-200 p-6 rounded-3xl max-w-md w-full space-y-4 shadow-2xl">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" /> RESOLVE TIE: {selectedTie.target_name}
                </h3>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Select Winning Team
                  </label>
                  <select
                    value={tieWinnerId}
                    onChange={(e) => setTieWinnerId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold uppercase outline-none focus:border-amber-400 cursor-pointer"
                  >
                    {selectedTie.tied_team_ids.map((tid) => {
                      const teamObj = participatingTeams.find((pt) => pt.team_id === tid);
                      return (
                        <option key={tid} value={tid}>
                          {teamObj?.team_name || tid}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Final Adjusted Amount (Cr)
                  </label>
                  <input
                    type="number"
                    value={tieAdjustedAmount}
                    onChange={(e) => setTieAdjustedAmount(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold outline-none focus:border-amber-400"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setSelectedTie(null)}
                    className="w-1/2 py-2.5 border border-slate-200 rounded-xl font-bold text-xs uppercase hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleResolveTie}
                    disabled={isResolvingTie}
                    className="w-1/2 py-2.5 bg-slate-800 border border-slate-900 hover:bg-slate-700 text-amber-400 font-mono font-bold text-xs uppercase rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {isResolvingTie ? 'Resolving...' : 'Confirm Winner'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
