'use client';
import { CheckCircle, Clock, AlertTriangle, Users, Play, ArrowLeft, Target, Timer, Flag } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AlertModal from '@/components/modals/AlertModal';
import { useModal } from '@/hooks/useModal';
import AuthGuard from '@/components/auth/AuthGuard';

interface TeamSubmission {
  team_id: string;
  team_name: string;
  owner_name: string;
  draft_submitted: boolean;
  budget_remaining: number;
  total_bids: number;
}

// --- IST helpers (exported for sub-component) ---
const IST_TIMEZONE = 'Asia/Kolkata';
const parseAsUTC = (isoOrLocal: string): Date => {
  if (!isoOrLocal) return new Date(0);
  // If already has a Z suffix or explicit offset, parse as-is
  if (/Z$|[+-]\d{2}:\d{2}$/.test(isoOrLocal)) return new Date(isoOrLocal);
  // Neon returns timestamps without tz info (e.g. "2026-08-25 09:15:00");
  // Force UTC interpretation by replacing the space with 'T' and appending 'Z'
  return new Date(isoOrLocal.replace(' ', 'T') + 'Z');
};
const formatISTForInput = (isoString?: string) => {
  if (!isoString) return '';
  const d = parseAsUTC(isoString);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: IST_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(' ', 'T');
};
const istToUTC = (istDateTimeLocal: string): string => {
  const [datePart, timePart] = istDateTimeLocal.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  const utcMs = Date.UTC(year, month - 1, day, hours, minutes) - (5.5 * 60 * 60 * 1000);
  return new Date(utcMs).toISOString();
};
const formatISTDisplay = (isoOrLocal: string): string => {
  if (!isoOrLocal) return '';
  const d = parseAsUTC(isoOrLocal);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { timeZone: IST_TIMEZONE });
};

/** Per-slot round control card — compact by default, expands on click */
function SlotRoundCard({ slot, round, onAction, onToggleFinalization, expanded, onToggle }: {
  slot: any;
  round: any;
  onAction: (slotIndex: number, action: 'start' | 'close' | 'adjust' | 'reset', times?: { opens_at?: string; closes_at?: string }) => void;
  onToggleFinalization: (slotIndex: number) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = round?.status || 'pending';
  const [opensInput, setOpensInput] = useState(formatISTForInput(round?.opens_at));
  const [closesInput, setClosesInput] = useState(formatISTForInput(round?.closes_at));

  useEffect(() => {
    setOpensInput(formatISTForInput(round?.opens_at));
    setClosesInput(formatISTForInput(round?.closes_at));
  }, [round?.opens_at, round?.closes_at]);

  const statusColor =
    status === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
    status === 'closed' ? 'bg-rose-50 border-rose-200 text-rose-700' :
    status === 'completed' ? 'bg-blue-50 border-blue-200 text-blue-700' :
    'bg-slate-100 border-slate-200 text-slate-600';

  const isActive = status === 'active';

  return (
    <div className={`border rounded-2xl transition-all ${isActive ? 'border-emerald-300 bg-emerald-50/30 shadow-sm' : expanded ? 'border-amber-300 bg-amber-50/20 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
      {/* Compact header — always visible, clickable */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between cursor-pointer text-left"
      >
        <div className="flex items-center gap-3">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black ${isActive ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-amber-400'}`}>
            {slot.slot_index}
          </span>
          <div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{slot.name}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] text-slate-400 font-bold">Base: {slot.base_price} Cr</span>
              {round?.closes_at && (status === 'active' || status === 'pending') && (
                <span className="text-[9px] text-slate-500 font-bold">• Closes: {formatISTDisplay(round.closes_at)} IST</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 border text-[9px] font-black rounded-lg uppercase tracking-wider ${statusColor}`}>
            {status}
          </span>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          {/* Timing inputs for pending/active */}
          {(status === 'pending' || status === 'active') && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[9px] text-slate-500 font-bold uppercase">Opens At (IST)</label>
                <input type="datetime-local" value={opensInput} onChange={(e) => setOpensInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-amber-500" />
              </div>
              <div className="space-y-1">
                <label className="block text-[9px] text-slate-500 font-bold uppercase">Closes At (IST)</label>
                <input type="datetime-local" value={closesInput} onChange={(e) => setClosesInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-amber-500" />
              </div>
            </div>
          )}

          {/* Display times for closed/completed */}
          {(status === 'closed' || status === 'completed') && round?.opens_at && (
            <div className="flex gap-6 text-[9px] font-bold uppercase text-slate-500">
              <div>Opened: <span className="text-slate-700">{formatISTDisplay(round.opens_at)} IST</span></div>
              {round?.closes_at && <div>Closed: <span className="text-rose-600">{formatISTDisplay(round.closes_at)} IST</span></div>}
            </div>
          )}

          {/* Finalization mode toggle */}
          {status !== 'pending' && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-400 font-bold uppercase">Finalization:</span>
              <button
                onClick={() => onToggleFinalization(slot.slot_index)}
                title={`Click to switch to ${round?.finalization_mode === 'auto' ? 'Manual' : 'Auto'} mode`}
                className={`px-2.5 py-1 border text-[9px] font-black rounded-lg uppercase tracking-wider transition-all cursor-pointer ${
                  (round?.finalization_mode || 'auto') === 'manual'
                    ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                {(round?.finalization_mode || 'auto') === 'manual' ? '⚙️ Manual' : '⚡ Auto'}
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {status === 'pending' && (
              <button onClick={() => onAction(slot.slot_index, 'start', { opens_at: opensInput ? istToUTC(opensInput) : undefined, closes_at: closesInput ? istToUTC(closesInput) : undefined })}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-mono font-bold text-[10px] uppercase tracking-wider rounded-lg cursor-pointer transition-all shadow-sm">▶ Start Round</button>
            )}
            {status === 'active' && (
              <>
                <button onClick={() => onAction(slot.slot_index, 'close')}
                  className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white font-mono font-bold text-[10px] uppercase tracking-wider rounded-lg cursor-pointer transition-all shadow-sm">⏸ Close Round</button>
                <button onClick={() => onAction(slot.slot_index, 'adjust', { opens_at: opensInput ? istToUTC(opensInput) : undefined, closes_at: closesInput ? istToUTC(closesInput) : undefined })}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-[10px] uppercase tracking-wider rounded-lg cursor-pointer transition-all shadow-sm"><Clock className="w-3 h-3 inline mr-0.5" /> Adjust Time</button>
              </>
            )}
            {(status === 'closed' || status === 'active') && (
              <button onClick={() => onAction(slot.slot_index, 'reset')}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 font-mono font-bold text-[10px] uppercase tracking-wider rounded-lg cursor-pointer transition-all">🔄 Reset to Pending</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProcessDraftPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [teams, setTeams] = useState<TeamSubmission[]>([]);
  const [totalTeams, setTotalTeams] = useState(0);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [draftStatus, setDraftStatus] = useState<string>('pending');
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(1);
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');

  const [previewResults, setPreviewResults] = useState<any>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [addTimeMinutes, setAddTimeMinutes] = useState<string>('10');
  const [draftRounds, setDraftRounds] = useState<any[]>([]);
  const [expandedSlotIndex, setExpandedSlotIndex] = useState<number | null>(null);

  const { alertState, showAlert, closeAlert } = useModal();

  const loadSubmissions = async () => {
    if (!leagueId) return;
    setIsLoading(true);
    try {
      // 1. Fetch Wishlist submission counts
      const res = await fetchWithTokenRefresh(`/api/fantasy/draft/submissions?league_id=${leagueId}`);
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams || []);
        setTotalTeams(data.total_teams || 0);
        setSubmittedCount(data.submitted_count || 0);
      }
      
      // 2. Fetch current draft status settings
      const settingsRes = await fetchWithTokenRefresh(`/api/fantasy/draft/settings?league_id=${leagueId}`);
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setDraftStatus(settingsData.settings?.draft_status || 'pending');
        const loadedSlots = settingsData.settings?.category_settings?.slots || [];
        setSlots(loadedSlots);
        const serverActiveSlot = Number(settingsData.settings?.category_settings?.active_slot_index);
        if (serverActiveSlot) {
          setSelectedSlotIndex(serverActiveSlot);
        } else if (loadedSlots.length > 0) {
          setSelectedSlotIndex(loadedSlots[0].slot_index);
        }
      }

      // 3. Fetch per-slot draft rounds
      const roundsRes = await fetchWithTokenRefresh(`/api/fantasy/draft/rounds?league_id=${leagueId}`);
      if (roundsRes.ok) {
        const roundsData = await roundsRes.json();
        setDraftRounds(roundsData.rounds || []);
      }


    } catch (err) {
      console.error('Failed to load submissions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadSubmissions();
    }
  }, [user, leagueId]);

  const handleRoundAction = async (slotIndex: number, action: 'start' | 'close' | 'adjust' | 'reset', times?: { opens_at?: string; closes_at?: string }) => {
    try {
      const body: any = {
        league_id: leagueId,
        slot_index: slotIndex,
        action,
      };
      if (times?.opens_at) body.opens_at = times.opens_at;
      if (times?.closes_at) body.closes_at = times.closes_at;

      const response = await fetchWithTokenRefresh('/api/fantasy/draft/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update round');

      showAlert({
        type: 'success',
        title: 'Round Updated',
        message: `Slot ${slotIndex} ${action} successfully`,
      });
      setExpandedSlotIndex(slotIndex);
      loadSubmissions(); // re-fetch rounds
    } catch (err: any) {
      console.error('Error updating round:', err);
      showAlert({ type: 'error', title: 'Update Failed', message: err.message });
    }
  };

  const handleFinalize = async () => {
    if (!confirm('Are you sure you want to finalize the fantasy draft round? All submissions will be locked, bids will be processed sequentially, and squads will be awarded. This action CANNOT be undone!')) {
      return;
    }

    setIsProcessing(true);
    setResults(null);

    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/draft/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_id: leagueId })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to finalize draft');
      }

      setResults(data);
      showAlert({
        type: 'success',
        title: 'Draft Finalized!',
        message: `Successfully processed draft. Assigned ${data.total_players_drafted} players and ${data.total_teams_drafted} real teams!`,
      });
      loadSubmissions();
    } catch (err: any) {
      console.error('Error finalising draft:', err);
      showAlert({
        type: 'error',
        title: 'Finalization Failed',
        message: err.message || 'An error occurred during draft finalization.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleRoundFinalization = async (slotIndex: number) => {
    const round = draftRounds.find((r: any) => r.slot_index === slotIndex);
    const currentMode = round?.finalization_mode || 'auto';
    const newMode = currentMode === 'auto' ? 'manual' : 'auto';
    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/draft/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: leagueId,
          slot_index: slotIndex,
          action: 'adjust',
          finalization_mode: newMode,
        }),
      });
      const data = await response.json();
      if (data.success) {
        showAlert({
          type: 'success',
          title: 'Mode Updated',
          message: `Slot ${slotIndex} finalization: ${newMode.toUpperCase()}`,
        });
        loadSubmissions();
      } else {
        throw new Error(data.error || 'Failed to update');
      }
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Update Failed', message: err.message });
    }
  };

  const handlePreview = async () => {
    setIsLoadingPreview(true);
    setPreviewResults(null);
    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/draft/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_id: leagueId })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate preview');
      }

      setPreviewResults(data);
      showAlert({
        type: 'success',
        title: 'Preview Generated!',
        message: `Preview shows ${data.total_players_drafted} players and ${data.total_teams_drafted} teams would be awarded.`,
      });
    } catch (err: any) {
      console.error('Error generating preview:', err);
      showAlert({
        type: 'error',
        title: 'Preview Failed',
        message: err.message || 'An error occurred while generating preview.',
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading submissions...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      <AlertModal {...alertState} onClose={closeAlert} />
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Navigation */}
        <div>
          <Link
            href={`/dashboard/committee/fantasy/${leagueId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">FANTASY CONSOLE</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
              Finalize Draft
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Review team submissions and run the blind bid allocation engine
            </p>
          </div>
          <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center text-amber-400 shadow-sm shrink-0">
            <Users className="w-8 h-8" />
          </div>
        </div>



        {/* Per-Slot Draft Rounds */}
        <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
          <div>
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-1">Draft Round Controls</h2>
            <p className="text-[10px] text-slate-450 font-bold uppercase leading-normal">
              Each slot runs as its own independent round. Start, close, and adjust timing per slot.
            </p>
          </div>

          <div className="space-y-3">
            {slots.map((slot) => (
              <SlotRoundCard
                key={slot.slot_index}
                slot={slot}
                round={draftRounds.find((r: any) => r.slot_index === slot.slot_index)}
                onAction={handleRoundAction}
                onToggleFinalization={handleToggleRoundFinalization}
                expanded={expandedSlotIndex === slot.slot_index}
                onToggle={() => setExpandedSlotIndex(expandedSlotIndex === slot.slot_index ? null : slot.slot_index)}
              />
            ))}
          </div>
        </div>

        {/* Submissions Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-slate-800 text-amber-400 border border-slate-900 rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Managers</p>
              <h3 className="text-xl font-black text-slate-900 leading-tight">{totalTeams}</h3>
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-slate-800 text-emerald-400 border border-slate-900 rounded-xl">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[9px] text-slate-455 font-bold uppercase tracking-wider">Submitted & Locked</p>
              <h3 className="text-xl font-black text-slate-900 leading-tight">
                {submittedCount} <span className="text-slate-400 text-xs">/ {totalTeams}</span>
              </h3>
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-slate-800 text-amber-450 border border-slate-900 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[9px] text-slate-455 font-bold uppercase tracking-wider">Pending Submissions</p>
              <h3 className="text-xl font-black text-slate-900 leading-tight">
                {totalTeams - submittedCount}
              </h3>
            </div>
          </div>
        </div>

        {/* Actions panel */}
        <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
          <div>
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-1">Resolve Draft Bids</h2>
            <p className="text-[10px] text-slate-450 font-bold uppercase leading-normal">
              Each slot round has its own finalization mode (Auto/Manual). When a slot is closed in Auto mode, bids are processed immediately. In Manual mode, use Preview + Finalize below.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-center pt-2">
            <button
              onClick={handlePreview}
              disabled={isLoadingPreview}
              className="w-full sm:w-auto px-6 py-3.5 bg-blue-600 border border-blue-700 hover:bg-blue-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Play className="w-4 h-4" />
              {isLoadingPreview ? 'Generating Preview...' : 'Preview Results'}
            </button>
            
            <button
              onClick={handleFinalize}
              disabled={isProcessing}
              className="w-full sm:w-auto px-6 py-3.5 bg-slate-800 border border-slate-900 hover:bg-slate-700 text-amber-400 font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Play className="w-4 h-4 text-amber-400" />
              {isProcessing ? 'Processing Draft Engine...' : 'Finalize Draft (Apply Changes)'}
            </button>

            {submittedCount < totalTeams && draftStatus !== 'pending' && (
              <span className="text-[10px] text-amber-600 font-bold uppercase flex items-center gap-1.5 leading-tight">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                Warning: {totalTeams - submittedCount} teams have not submitted/locked their draft lists yet.
              </span>
            )}
          </div>
        </div>

        {/* Team Checklist */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-xs font-black text-slate-855 uppercase tracking-wider">Manager submissions tracking</h2>
            <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Real-time status of all participating team draft wishlists</p>
          </div>

          <div className="divide-y divide-slate-100">
            {teams.map(t => (
              <div key={t.team_id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                <div>
                  <h4 className="font-bold text-slate-800 text-xs uppercase">{t.team_name}</h4>
                  <p className="text-[10px] text-slate-455 font-bold uppercase mt-0.5">Owner: {t.owner_name || 'N/A'}</p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right font-mono">
                    <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[9px] font-black uppercase">
                      {t.total_bids} bids
                    </span>
                    <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Budget: {t.budget_remaining} Left</p>
                  </div>
                  {t.draft_submitted ? (
                    <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] font-black rounded-lg uppercase tracking-wider">
                      ✓ Submitted
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 bg-amber-50 border border-amber-250 text-amber-700 text-[9px] font-black rounded-lg uppercase tracking-wider">
                      ⏳ Pending
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview Results display (shows when preview is generated, not applied) */}
        {previewResults && previewResults.is_preview && (
          <div className="console-card bg-blue-50 border-2 border-blue-200 rounded-3xl p-6 shadow-lg space-y-6">
            <div className="flex items-center justify-between border-b border-blue-200 pb-3">
              <div>
                <h2 className="text-xs font-black text-blue-900 uppercase tracking-wider flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[8px]">PREVIEW</span>
                  Draft Resolution Preview
                </h2>
                <p className="text-[9px] text-blue-700 font-bold uppercase mt-1">⚠️ No changes have been applied - this is a preview only</p>
              </div>
              <button
                onClick={() => setPreviewResults(null)}
                className="text-blue-600 hover:text-blue-800 font-bold text-xs"
              >
                ✕ Close
              </button>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white border border-blue-200 p-4 rounded-2xl text-center">
                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Players to Award</span>
                <h4 className="text-lg font-black text-blue-900 mt-1">{previewResults.total_players_drafted}</h4>
              </div>
              <div className="bg-white border border-blue-200 p-4 rounded-2xl text-center">
                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Teams to Award</span>
                <h4 className="text-lg font-black text-blue-900 mt-1">{previewResults.total_teams_drafted}</h4>
              </div>
              <div className="bg-white border border-blue-200 p-4 rounded-2xl text-center">
                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Budget to Spend</span>
                <h4 className="text-lg font-black text-blue-900 mt-1">{previewResults.total_budget_spent} Cr</h4>
              </div>
              <div className="bg-white border border-blue-200 p-4 rounded-2xl text-center">
                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Avg Squad Size</span>
                <h4 className="text-lg font-black text-blue-900 mt-1">{previewResults.average_squad_size.toFixed(1)}</h4>
              </div>
            </div>

            <div className="space-y-4">
              {previewResults.results_by_slot.map((slot: any) => (
                <div key={slot.slot_index} className="border border-blue-200 bg-white rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="font-black text-blue-900 border-b border-blue-150 pb-2 mb-3 text-[11px] uppercase flex justify-between">
                    <span>{slot.slot_name}</span>
                    <span className="text-[9px] text-blue-700 font-black">{slot.winners} would win / {slot.total_bids} bids</span>
                  </h3>
                  {slot.winning_bids.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {slot.winning_bids.map((win: any) => (
                        <div key={win.target_id} className="bg-blue-50 border border-blue-150 p-3.5 rounded-xl flex items-center justify-between shadow-sm">
                          <div>
                            <span className="text-[9px] font-black text-blue-600 uppercase tracking-wider">{win.bid_type === 'player' ? 'Player' : 'Real Team'}</span>
                            <h4 className="font-bold text-blue-900 text-xs mt-0.5 uppercase">{win.target_id}</h4>
                            <p className="text-[9px] text-blue-700 font-bold uppercase mt-1">Would go to: {win.team_name}</p>
                          </div>
                          <span className="font-black text-blue-700 text-xs">{win.bid_amount} Credits</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-blue-600 font-bold uppercase italic">No bids would be resolved for this slot.</p>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-white border border-blue-200 rounded-xl p-4">
              <h3 className="text-xs font-black text-blue-900 uppercase mb-3">Team Impact Preview</h3>
              <div className="space-y-2">
                {previewResults.team_previews?.map((team: any) => (
                  <div key={team.team_id} className="flex items-center justify-between p-2 bg-blue-50 rounded-lg">
                    <span className="text-xs font-bold text-blue-900">{team.team_name}</span>
                    <div className="flex items-center gap-4 text-[10px] font-bold">
                      <span className="text-emerald-700">+{team.players_won} players</span>
                      <span className="text-rose-700">-{team.budget_spent} Cr</span>
                      <span className="text-blue-700">{team.projected_budget} Cr left</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black text-amber-900 uppercase">Preview Mode</h4>
                <p className="text-[10px] text-amber-800 font-bold mt-1">
                  This is a preview calculation only. No changes have been saved to the database. 
                  Click "Finalize Draft" to apply these changes permanently.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Results display */}
        {results && results.success && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100">Draft Resolution Results</h2>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Players Awarded</span>
                <h4 className="text-lg font-black text-slate-800 mt-1">{results.total_players_drafted}</h4>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Teams Awarded</span>
                <h4 className="text-lg font-black text-slate-800 mt-1">{results.total_teams_drafted}</h4>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Budget Spent</span>
                <h4 className="text-lg font-black text-slate-800 mt-1">{results.total_budget_spent} Cr</h4>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Avg Squad Size</span>
                <h4 className="text-lg font-black text-slate-800 mt-1">{results.average_squad_size.toFixed(1)}</h4>
              </div>
            </div>

            <div className="space-y-4">
              {results.results_by_slot.map((slot: any) => (
                <div key={slot.slot_index} className="border border-slate-200/80 bg-slate-50/50 rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="font-black text-slate-800 border-b border-slate-150 pb-2 mb-3 text-[11px] uppercase flex justify-between">
                    <span>{slot.slot_name}</span>
                    <span className="text-[9px] text-amber-600 font-black">{slot.winners} won / {slot.total_bids} bids</span>
                  </h3>
                  {slot.winning_bids.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {slot.winning_bids.map((win: any) => (
                        <div key={win.target_id} className="bg-white border border-slate-150 p-3.5 rounded-xl flex items-center justify-between shadow-sm">
                          <div>
                            <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider">{win.bid_type === 'player' ? 'Player' : 'Real Team'}</span>
                            <h4 className="font-bold text-slate-800 text-xs mt-0.5 uppercase">{win.target_id}</h4>
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Awarded to: {win.team_name}</p>
                          </div>
                          <span className="font-black text-emerald-650 text-xs">{win.bid_amount} Credits</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 font-bold uppercase italic">No bids resolved for this slot.</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  
    </AuthGuard>
  );
}
