'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import ConfirmModal from '@/components/modals/ConfirmModal';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';
import { PlayerAvatar } from '@/components/PlayerImage';
import {
  Clock,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  XCircle,
  Layers,
  RefreshCw,
  Plus,
  RotateCcw,
  Sparkles,
  DollarSign,
  Trophy,
  ArrowRight,
  ShieldAlert,
  Award,
  Edit2,
  X
} from 'lucide-react';

interface TiebreakerTeam {
  team_id: string;
  team_name: string;
  submitted: boolean;
  new_bid_amount: number | null;
  submitted_at: string | null;
  budget?: number;
  squad_size?: number;
  total_slots?: number;
  pending_slots?: number;
  max_amount?: number;
}

interface Tiebreaker {
  id: string;
  player_id?: string;
  player_name: string;
  club?: string;
  position: string;
  overall_rating: number;
  round_position: string;
  round_id?: string;
  original_amount: number;
  status: 'active' | 'resolved' | 'excluded';
  winning_team_id: string | null;
  winning_amount: number | null;
  duration_minutes: number | null;
  created_at: string;
  resolved_at: string | null;
  teams_count: number;
  submitted_count: number;
  teams: TiebreakerTeam[];
  expiresAt: string | null;
  timeRemaining: number | null;
  isExpired: boolean;
  hasTimeLimit?: boolean;
}

export default function CommitteeTiebreakerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [tiebreakers, setTiebreakers] = useState<Tiebreaker[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'resolved' | 'excluded' | 'all'>('active');

  // Time adjustment state
  const [addingTimeId, setAddingTimeId] = useState<string | null>(null);
  const [minutesToAdd, setMinutesToAdd] = useState<{[key: string]: string}>({});

  // Action loading states
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Admin Manual Bid Entry Modal State
  const [adminBidModal, setAdminBidModal] = useState<{
    isOpen: boolean;
    tiebreaker: Tiebreaker | null;
    team: TiebreakerTeam | null;
    bidAmount: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    tiebreaker: null,
    team: null,
    bidAmount: '',
    isSubmitting: false,
  });

  // Modal system for alerts & confirms
  const {
    alertState,
    showAlert,
    closeAlert,
    confirmState,
    showConfirm,
    closeConfirm,
    handleConfirm,
  } = useModal();

  const fetchTiebreakers = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/admin/tiebreakers?status=${statusFilter}`);
      const result = await response.json();

      if (result.success && result.data?.tiebreakers) {
        setTiebreakers(result.data.tiebreakers);
      }
    } catch (error: any) {
      console.error('Error fetching tiebreakers:', error);
    } finally {
      setLoadingData(false);
      setIsRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (user && user.role === 'committee_admin') {
      fetchTiebreakers();

      // Live poll active tiebreakers every 5 seconds
      if (statusFilter === 'active') {
        const interval = setInterval(() => fetchTiebreakers(true), 5000);
        return () => clearInterval(interval);
      }
    }
  }, [user, statusFilter, fetchTiebreakers]);

  // Handle resolving a tiebreaker
  const handleResolve = async (tiebreakerId: string, resolutionType: 'auto' | 'exclude') => {
    const confirmMessage = resolutionType === 'auto'
      ? 'Resolve this tiebreaker now? The highest bid among submitted teams will be selected as the winner.'
      : 'Exclude this tiebreaker? No team will receive the player and the tiebreaker will be marked as excluded.';

    const confirmed = await showConfirm({
      type: resolutionType === 'auto' ? 'info' : 'warning',
      title: resolutionType === 'auto' ? 'Resolve Tiebreaker' : 'Exclude Tiebreaker',
      message: confirmMessage,
      confirmText: resolutionType === 'auto' ? 'Resolve' : 'Exclude',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    setResolvingId(tiebreakerId);
    try {
      const response = await fetchWithTokenRefresh(`/api/tiebreakers/${tiebreakerId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionType }),
      });

      const result = await response.json();
      if (result.success) {
        showAlert({
          type: 'success',
          title: 'Success',
          message: `Tiebreaker ${resolutionType === 'auto' ? 'resolved' : 'excluded'} successfully!`,
        });
        fetchTiebreakers(true);
      } else {
        showAlert({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to resolve tiebreaker',
        });
      }
    } catch (error: any) {
      console.error('Error resolving tiebreaker:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'An error occurred while resolving the tiebreaker.',
      });
    } finally {
      setResolvingId(null);
    }
  };

  // Handle adding / removing time
  const handleAddTime = async (tiebreakerId: string) => {
    const minutes = parseInt(minutesToAdd[tiebreakerId] || '5', 10);
    if (isNaN(minutes) || minutes === 0) {
      showAlert({
        type: 'warning',
        title: 'Invalid Input',
        message: 'Please enter a valid number of minutes (positive to add, negative to subtract)',
      });
      return;
    }

    const confirmed = await showConfirm({
      type: 'info',
      title: minutes > 0 ? 'Add Time' : 'Remove Time',
      message: `${minutes > 0 ? 'Add' : 'Remove'} ${Math.abs(minutes)} minute(s) ${minutes > 0 ? 'to' : 'from'} this tiebreaker?`,
      confirmText: minutes > 0 ? 'Add Time' : 'Remove Time',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    try {
      const response = await fetchWithTokenRefresh(`/api/tiebreakers/${tiebreakerId}/add-time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      });

      const result = await response.json();
      if (result.success) {
        showAlert({
          type: 'success',
          title: 'Success',
          message: `Successfully ${minutes > 0 ? 'added' : 'removed'} ${Math.abs(minutes)} minute(s)`,
        });
        setAddingTimeId(null);
        setMinutesToAdd(prev => ({ ...prev, [tiebreakerId]: '5' }));
        fetchTiebreakers(true);
      } else {
        showAlert({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to adjust time',
        });
      }
    } catch (error: any) {
      console.error('Error adjusting time:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'An error occurred while adjusting time.',
      });
    }
  };

  // Open Admin Manual Bid Entry Modal
  const openAdminBidModal = (tiebreaker: Tiebreaker, team: TiebreakerTeam) => {
    setAdminBidModal({
      isOpen: true,
      tiebreaker,
      team,
      bidAmount: team.new_bid_amount ? String(team.new_bid_amount) : String(tiebreaker.original_amount),
      isSubmitting: false,
    });
  };

  // Submit Admin Manual Bid
  const handleAdminBidSubmit = async () => {
    if (!adminBidModal.tiebreaker || !adminBidModal.team) return;

    const amount = parseInt(adminBidModal.bidAmount, 10);
    const originalAmount = adminBidModal.tiebreaker.original_amount;

    if (!amount || isNaN(amount) || amount < originalAmount) {
      showAlert({
        type: 'warning',
        title: 'Invalid Amount',
        message: `Bid amount must be at least £${originalAmount.toLocaleString()} (the tied bid amount).`,
      });
      return;
    }

    setAdminBidModal(prev => ({ ...prev, isSubmitting: true }));
    try {
      const response = await fetchWithTokenRefresh(`/api/admin/tiebreakers/${adminBidModal.tiebreaker.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: adminBidModal.team.team_id,
          newBidAmount: amount,
        }),
      });

      const result = await response.json();
      if (result.success) {
        showAlert({
          type: 'success',
          title: 'Bid Entered',
          message: result.message || `Successfully recorded £${amount.toLocaleString()} for ${adminBidModal.team.team_name}`,
        });
        setAdminBidModal({
          isOpen: false,
          tiebreaker: null,
          team: null,
          bidAmount: '',
          isSubmitting: false,
        });
        fetchTiebreakers(true);
      } else {
        showAlert({
          type: 'error',
          title: 'Failed to Enter Bid',
          message: result.error || 'Could not record tiebreaker bid',
        });
      }
    } catch (err: any) {
      console.error('Error recording admin tiebreaker bid:', err);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to record bid. Please try again.',
      });
    } finally {
      setAdminBidModal(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  // Revert Admin Bid (Set back to pending)
  const handleAdminRevertBid = async (tiebreakerId: string, team: TiebreakerTeam) => {
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Revert Submission',
      message: `Are you sure you want to revert ${team.team_name}'s tiebreaker bid back to pending?`,
      confirmText: 'Revert Bid',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    try {
      const response = await fetchWithTokenRefresh(`/api/admin/tiebreakers/${tiebreakerId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: team.team_id,
          action: 'revert',
        }),
      });

      const result = await response.json();
      if (result.success) {
        showAlert({
          type: 'success',
          title: 'Bid Reverted',
          message: `${team.team_name}'s tiebreaker bid has been reset to pending.`,
        });
        fetchTiebreakers(true);
      } else {
        showAlert({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to revert bid',
        });
      }
    } catch (err: any) {
      console.error('Error reverting bid:', err);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Could not revert bid.',
      });
    }
  };

  const formatTimeRemaining = (milliseconds: number | null) => {
    if (milliseconds === null) return 'Untimed';
    if (milliseconds <= 0) return 'Time Up';

    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    if (minutes > 0) return `${minutes}m ${seconds}s remaining`;
    return `${seconds}s remaining`;
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-500 uppercase tracking-wider font-extrabold font-mono">Loading tiebreaker console...</p>
        </div>
      </div>
    );
  }

  if (user.role !== 'committee_admin') {
    return null;
  }

  const activeCount = tiebreakers.filter(t => t.status === 'active').length;

  return (
    <AuthGuard requiredRole="committee_admin">
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
        {/* Ambient Gold Glow */}
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10 space-y-6">
          {/* Top Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/dashboard/committee"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </Link>

            <Link
              href="/dashboard/committee/rounds"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono font-bold text-xs uppercase tracking-wider border border-slate-200/80 shadow-xs transition-all"
            >
              <Layers className="w-3.5 h-3.5 text-amber-500" /> Rounds Console
            </Link>
          </div>

          {/* Header Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">COMMITTEE CONSOLE</span>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                  Tiebreaker Management
                </h1>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Monitor tied bids, enter offline WhatsApp bids, adjust timers, and resolve winners.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold uppercase font-mono shadow-sm">
                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500 mr-2 animate-pulse"></span>
                <span>{activeCount} Active</span>
              </span>

              <button
                type="button"
                onClick={() => fetchTiebreakers()}
                disabled={isRefreshing}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 transition-colors cursor-pointer"
                title="Refresh tiebreakers"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-500' : ''}`} />
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 flex-wrap font-mono">
            {(['active', 'resolved', 'excluded', 'all'] as const).map((status) => {
              const isActive = statusFilter === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white border border-slate-200/80 text-slate-600 hover:border-amber-400 hover:text-amber-600'
                  }`}
                >
                  {status}
                </button>
              );
            })}
          </div>

          {/* Tiebreakers List */}
          {loadingData ? (
            <div className="text-center py-16 console-card bg-white border border-slate-200/60 rounded-3xl p-8">
              <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-400 font-extrabold uppercase tracking-wider">Loading tiebreakers...</p>
            </div>
          ) : tiebreakers.length === 0 ? (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-extrabold uppercase text-slate-800 tracking-wider">No Tiebreakers Found</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                There are no {statusFilter !== 'all' ? statusFilter : ''} tiebreakers requiring attention at this time.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {tiebreakers.map((tb) => {
                const isAllSubmitted = tb.teams_count > 0 && tb.submitted_count === tb.teams_count;
                const isExpired = tb.timeRemaining !== null && tb.timeRemaining <= 0;

                return (
                  <div
                    key={tb.id}
                    className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 sm:p-7 shadow-sm space-y-5 hover:border-amber-400/40 transition-all"
                  >
                    {/* Top Row: Player Info + Status + Main Actions */}
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-slate-100">
                      <div className="flex items-center gap-3.5">
                        <PlayerAvatar
                          playerId={tb.player_id || tb.id}
                          playerName={tb.player_name}
                          size={52}
                        />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight">
                              {tb.player_name}
                            </h3>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-slate-100 text-slate-800 border border-slate-200">
                              {tb.position}
                            </span>
                            {tb.overall_rating && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-400 text-slate-950 shadow-xs">
                                {tb.overall_rating} OVR
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
                            Round {tb.round_position} • Original Tied Bid: <span className="text-slate-700 font-black">£{tb.original_amount.toLocaleString()}</span>
                          </p>
                        </div>
                      </div>

                      {/* Status Badges & Controls */}
                      <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-start lg:justify-end">
                        {tb.status === 'active' && (
                          <>
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                              Active
                            </span>

                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-xs ${
                              isExpired
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : tb.timeRemaining === null
                                ? 'bg-slate-100 text-slate-700 border-slate-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}>
                              <Clock className="w-3 h-3" />
                              {formatTimeRemaining(tb.timeRemaining)}
                            </span>

                            {/* Adjust Time Toggle */}
                            <button
                              type="button"
                              onClick={() => setAddingTimeId(addingTimeId === tb.id ? null : tb.id)}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1 cursor-pointer"
                              title="Add or remove time"
                            >
                              <Clock className="w-3.5 h-3.5 text-amber-500" />
                              <span>{addingTimeId === tb.id ? 'Close Timer' : 'Adjust Time'}</span>
                            </button>

                            {/* Resolve Button */}
                            <button
                              type="button"
                              onClick={() => handleResolve(tb.id, 'auto')}
                              disabled={resolvingId === tb.id}
                              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                              title="Resolve tiebreaker by awarding to highest submitted bid"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{resolvingId === tb.id ? 'Resolving...' : 'Resolve'}</span>
                            </button>

                            {/* Exclude Button */}
                            <button
                              type="button"
                              onClick={() => handleResolve(tb.id, 'exclude')}
                              disabled={resolvingId === tb.id}
                              className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                              title="Exclude this tiebreaker (no winner)"
                            >
                              Exclude
                            </button>
                          </>
                        )}

                        {tb.status === 'resolved' && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 shadow-xs">
                            <Trophy className="w-3.5 h-3.5 text-blue-500" />
                            Resolved
                          </span>
                        )}

                        {tb.status === 'excluded' && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 shadow-xs">
                            <XCircle className="w-3.5 h-3.5 text-slate-400" />
                            Excluded
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Time Adjustment Inline Panel */}
                    {addingTimeId === tb.id && tb.status === 'active' && (
                      <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200/80 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-amber-600" />
                            Adjust Tiebreaker Deadline
                          </span>
                          <span className="text-[10px] text-amber-700 font-bold">
                            Current: {formatTimeRemaining(tb.timeRemaining)}
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            {['+5', '+10', '+15', '-5'].map((mins) => (
                              <button
                                key={mins}
                                type="button"
                                onClick={() => setMinutesToAdd(prev => ({ ...prev, [tb.id]: mins.replace('+', '') }))}
                                className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-100 border border-amber-200 text-xs font-black text-amber-900 transition-colors cursor-pointer"
                              >
                                {mins}m
                              </button>
                            ))}
                          </div>

                          <div className="relative flex-1 sm:max-w-xs">
                            <input
                              type="number"
                              value={minutesToAdd[tb.id] !== undefined ? minutesToAdd[tb.id] : '5'}
                              onChange={(e) => setMinutesToAdd(prev => ({ ...prev, [tb.id]: e.target.value }))}
                              placeholder="Minutes (e.g. 5 or -5)"
                              className="w-full px-3 py-1.5 text-xs font-mono font-bold bg-white border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddTime(tb.id)}
                            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer shrink-0"
                          >
                            Apply Adjustment
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Stats Summary Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-slate-50 border border-slate-200/60 p-3 rounded-2xl">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Tied Teams</span>
                        <p className="text-base font-black text-slate-800 mt-0.5">{tb.teams_count}</p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200/60 p-3 rounded-2xl">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Submissions</span>
                        <p className={`text-base font-black mt-0.5 ${isAllSubmitted ? 'text-emerald-600' : 'text-slate-800'}`}>
                          {tb.submitted_count} / {tb.teams_count}
                          {isAllSubmitted && <span className="text-[10px] ml-1 text-emerald-600 font-bold">(All In)</span>}
                        </p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200/60 p-3 rounded-2xl">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Original Bid</span>
                        <p className="text-base font-black text-slate-800 mt-0.5">£{tb.original_amount.toLocaleString()}</p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200/60 p-3 rounded-2xl">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                          {tb.status === 'resolved' ? 'Winning Bid' : 'Highest Submitted'}
                        </span>
                        <p className="text-base font-black text-emerald-600 mt-0.5">
                          {tb.status === 'resolved' ? (
                            tb.winning_amount ? `£${tb.winning_amount.toLocaleString()}` : 'None'
                          ) : (
                            (() => {
                              const submittedAmounts = tb.teams.filter(t => t.submitted && t.new_bid_amount).map(t => t.new_bid_amount || 0);
                              return submittedAmounts.length > 0 ? `£${Math.max(...submittedAmounts).toLocaleString()}` : 'Waiting for bids';
                            })()
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Teams Submissions Table */}
                    <div className="rounded-2xl border border-slate-200/60 overflow-hidden bg-white shadow-xs">
                      <table className="min-w-full divide-y divide-slate-100 font-mono text-xs">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Team</th>
                            <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Submitted Bid</th>
                            <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                            {tb.status === 'active' && (
                              <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Admin Action</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {tb.teams.map((team) => {
                            const isWinner = tb.status === 'resolved' && tb.winning_team_id === team.team_id;

                            return (
                              <tr key={team.team_id} className={`hover:bg-slate-50/50 transition-colors ${isWinner ? 'bg-amber-50/30' : ''}`}>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    {isWinner && <Trophy className="w-4 h-4 text-amber-500 shrink-0" />}
                                    <div>
                                      <span className={`font-black ${isWinner ? 'text-amber-900 font-extrabold' : 'text-slate-800'}`}>
                                        {team.team_name}
                                      </span>
                                      {team.budget !== undefined && (
                                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-sans">
                                          <span className="text-slate-400 font-medium">Bal: £{team.budget.toLocaleString()}</span>
                                          <span className="text-slate-300">•</span>
                                          <span className="text-blue-600 font-medium">Pending: {team.pending_slots ?? 0}</span>
                                          <span className="text-slate-300">•</span>
                                          <span className="text-emerald-600 font-bold">Max: £{(team.max_amount ?? 0).toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                <td className="px-4 py-3 whitespace-nowrap text-center font-bold">
                                  {team.submitted && team.new_bid_amount ? (
                                    <div className="flex flex-col items-center">
                                      <span className="text-emerald-700 font-black text-sm">
                                        £{team.new_bid_amount.toLocaleString()}
                                      </span>
                                      {team.submitted_at && (
                                        <span className="text-[9px] text-slate-400 font-normal">
                                          {new Date(team.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-350">—</span>
                                  )}
                                </td>

                                <td className="px-4 py-3 whitespace-nowrap text-center">
                                  {team.submitted ? (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      ✓ Submitted
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200">
                                      ⏱ Pending
                                    </span>
                                  )}
                                </td>

                                {tb.status === 'active' && (
                                  <td className="px-4 py-3 whitespace-nowrap text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      {team.submitted ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => openAdminBidModal(tb, team)}
                                            className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-1 cursor-pointer"
                                            title="Edit bid on behalf of team"
                                          >
                                            <Edit2 className="w-3 h-3 text-slate-500" />
                                            <span>Edit Bid</span>
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => handleAdminRevertBid(tb.id, team)}
                                            className="px-2 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                                            title="Reset back to unsubmitted"
                                          >
                                            Revert
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => openAdminBidModal(tb, team)}
                                          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                                          title="Enter offline or WhatsApp bid on behalf of this team"
                                        >
                                          <Plus className="w-3.5 h-3.5 text-amber-400" />
                                          <span>Enter Bid</span>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Admin Manual Tiebreaker Bid Modal ── */}
        {adminBidModal.isOpen && adminBidModal.tiebreaker && adminBidModal.team && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-mono">
            <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 flex flex-col space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">ADMIN BID ENTRY</span>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-wide">
                    {adminBidModal.team.submitted ? 'Edit Tiebreaker Bid' : 'Enter Tiebreaker Bid'}
                  </h3>
                  <p className="text-xs text-slate-400 font-bold mt-0.5">{adminBidModal.team.team_name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAdminBidModal({ isOpen: false, tiebreaker: null, team: null, bidAmount: '', isSubmitting: false })}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Player Context Box */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center gap-3">
                <PlayerAvatar
                  playerId={adminBidModal.tiebreaker.player_id || adminBidModal.tiebreaker.id}
                  playerName={adminBidModal.tiebreaker.player_name}
                  size={42}
                />
                <div className="truncate">
                  <p className="font-extrabold text-slate-900 truncate uppercase text-sm">{adminBidModal.tiebreaker.player_name}</p>
                  <p className="text-[10px] text-slate-500 uppercase font-bold mt-0.5">
                    {adminBidModal.tiebreaker.position} • Tied Bid: £{adminBidModal.tiebreaker.original_amount.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Team Financial Limits */}
              {adminBidModal.team.budget !== undefined && (
                <div className="p-2.5 bg-blue-50/60 border border-blue-200/80 rounded-xl flex items-center justify-between text-xs">
                  <div className="text-slate-600 font-medium">
                    Bal: <span className="font-bold text-slate-800 font-mono">£{adminBidModal.team.budget.toLocaleString()}</span>
                    <span className="mx-1.5 text-slate-300">|</span>
                    Pending: <span className="font-bold text-blue-700">{adminBidModal.team.pending_slots ?? 0} slots</span>
                  </div>
                  <div className="text-emerald-700 font-black font-mono">
                    Max Bid: £{(adminBidModal.team.max_amount ?? 0).toLocaleString()}
                  </div>
                </div>
              )}

              {/* Amount Input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  New Bid Amount (£)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-sm">
                    £
                  </span>
                  <input
                    type="number"
                    value={adminBidModal.bidAmount}
                    onChange={(e) => setAdminBidModal(prev => ({ ...prev, bidAmount: e.target.value }))}
                    min={adminBidModal.tiebreaker.original_amount}
                    placeholder="Enter bid amount"
                    className="w-full pl-8 pr-3 py-2.5 text-sm font-mono font-bold rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-500 bg-white"
                    autoFocus
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Minimum bid: £{adminBidModal.tiebreaker.original_amount.toLocaleString()}
                </p>
              </div>

              {/* Quick Increment Buttons */}
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setAdminBidModal(prev => ({ ...prev, bidAmount: String(adminBidModal.tiebreaker?.original_amount || '') }))}
                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
                >
                  Tied (£{adminBidModal.tiebreaker.original_amount})
                </button>
                {adminBidModal.team.max_amount !== undefined && (
                  <button
                    type="button"
                    onClick={() => setAdminBidModal(prev => ({ ...prev, bidAmount: String(adminBidModal.team?.max_amount || 0) }))}
                    className="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 text-[10px] font-black uppercase"
                  >
                    Max (£{adminBidModal.team.max_amount.toLocaleString()})
                  </button>
                )}
                {[50, 100, 250, 500].map((inc) => (
                  <button
                    key={inc}
                    type="button"
                    onClick={() => {
                      const cur = parseInt(adminBidModal.bidAmount, 10) || adminBidModal.tiebreaker?.original_amount || 0;
                      setAdminBidModal(prev => ({ ...prev, bidAmount: String(cur + inc) }));
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
                  >
                    +{inc}
                  </button>
                ))}
              </div>

              {/* Footer Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setAdminBidModal({ isOpen: false, tiebreaker: null, team: null, bidAmount: '', isSubmitting: false })}
                  disabled={adminBidModal.isSubmitting}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-black uppercase tracking-wider hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAdminBidSubmit}
                  disabled={adminBidModal.isSubmitting}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {adminBidModal.isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 text-amber-400" />
                      <span>{adminBidModal.team.submitted ? 'Update Bid' : 'Confirm Bid'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

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
    </AuthGuard>
  );
}
