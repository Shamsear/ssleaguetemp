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
  bids?: Array<{
    slot_index: number;
    priority: number;
    target_id: string;
    bid_type: string;
    bid_amount: number;
  }>;
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
function SlotRoundCard({ slot, round, onAction, onToggleFinalization, onPreview, onApply, preview, expanded, onToggle }: {
  slot: any;
  round: any;
  onAction: (slotIndex: number, action: 'start' | 'close' | 'adjust' | 'reset', times?: { opens_at?: string; closes_at?: string }) => void;
  onToggleFinalization: (slotIndex: number) => void;
  onPreview: (slotIndex: number) => void;
  onApply: (slotIndex: number) => void;
  preview: any;
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = round?.status || 'pending';
  const [opensInput, setOpensInput] = useState(formatISTForInput(round?.opens_at));
  const [closesInput, setClosesInput] = useState(formatISTForInput(round?.closes_at));
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    setOpensInput(formatISTForInput(round?.opens_at));
    setClosesInput(formatISTForInput(round?.closes_at));
  }, [round?.opens_at, round?.closes_at]);

  // Live countdown for active rounds
  useEffect(() => {
    if (status !== 'active' || !round?.closes_at) {
      setCountdown('');
      return;
    }
    const tick = () => {
      const closeTime = new Date(round.closes_at).getTime();
      const diff = closeTime - Date.now();
      if (diff <= 0) {
        setCountdown('Closed');
        return;
      }
      const totalSecs = Math.floor(diff / 1000);
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const s = totalSecs % 60;
      setCountdown(`${h}h ${m}m ${s}s`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [status, round?.closes_at]);

  const statusColor =
    status === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
    status === 'closed' ? 'bg-rose-50 border-rose-200 text-rose-700' :
    status === 'completed' ? 'bg-blue-50 border-blue-200 text-blue-700' :
    'bg-slate-100 border-slate-200 text-slate-600';

  const isActive = status === 'active';
  const isExpiredActiveManual = isActive && (round?.finalization_mode || 'auto') === 'manual' &&
    round?.closes_at && new Date(round.closes_at).getTime() < Date.now();

  return (
    <div className={`border rounded-2xl transition-all ${isActive ? 'border-emerald-300 bg-emerald-50/30 shadow-sm' : expanded ? 'border-amber-300 bg-amber-50/20 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
      {/* Compact header — always visible, clickable */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between cursor-pointer text-left"
      >
        <div className="flex items-center gap-3">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black ${isActive ? 'bg-emerald-500 text-white animate-pulse' : 'bg-slate-800 text-amber-400'}`}>
            {slot.slot_index}
          </span>
          <div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{slot.name}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] text-slate-400 font-bold">Base: {slot.base_price} Cr</span>
              {status === 'active' && countdown && (
                <span className="text-[9px] font-black text-emerald-600">• ⏱ {countdown}</span>
              )}
              {status === 'pending' && round?.closes_at && (
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
          {/* Live countdown for active rounds */}
          {status === 'active' && countdown && (
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white shrink-0 animate-pulse">
                <Clock className="w-4 h-4" />
              </span>
              <div>
                <span className="text-[9px] font-black text-emerald-700 uppercase tracking-wider">Time Remaining</span>
                <p className="text-lg font-black text-emerald-800 mt-0.5 font-mono">{countdown}</p>
                <p className="text-[9px] text-emerald-600 font-bold uppercase">Closes at {formatISTDisplay(round.closes_at)} IST</p>
              </div>
            </div>
          )}

          {/* Auto-mode warning for active rounds */}
          {status === 'active' && (round?.finalization_mode || 'auto') === 'auto' && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="text-[9px] text-amber-700 font-bold uppercase">
                ⚡ Auto mode — This round will finalize automatically when the timer expires. Switch to Manual to preview first.
              </span>
            </div>
          )}

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
                <button onClick={() => {
                  if ((round?.finalization_mode || 'auto') === 'auto') {
                    if (!confirm('This round is in AUTO mode — it will be finalized immediately on close. Switch to Manual mode first if you want to preview results.')) return;
                  }
                  onAction(slot.slot_index, 'close');
                }}
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

          {/* Finalization controls for closed rounds or expired active manual rounds */}
          {(status === 'closed' || isExpiredActiveManual) && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              {(round?.finalization_mode || 'auto') === 'auto' ? (
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono font-bold text-[10px] uppercase tracking-wider rounded-lg">
                    ⚡ Auto-finalized on close
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  {preview ? (
                    <>
                      {/* Preview results table */}
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-black text-blue-700 uppercase">Preview Results — Slot {slot.slot_index}</span>
                        </div>
                        {preview.results_by_slot?.[0]?.winning_bids?.length > 0 ? (
                          <table className="w-full text-[9px]">
                            <thead>
                              <tr className="text-blue-600 font-black uppercase">
                                <th className="text-left py-1">Target</th>
                                <th className="text-left py-1">Awarded To</th>
                                <th className="text-right py-1">Bid</th>
                                <th className="text-left py-1 pl-2">Type</th>
                              </tr>
                            </thead>
                            <tbody className="text-blue-900 font-bold">
                              {preview.results_by_slot[0].winning_bids.map((w: any, i: number) => (
                                <tr key={i} className="border-t border-blue-100">
                                  <td className="py-1.5 uppercase">{w.target_name}</td>
                                  <td className="py-1.5 uppercase">{w.team_name}</td>
                                  <td className="py-1.5 text-right font-black">{w.bid_amount} Cr</td>
                                  <td className="py-1.5 pl-2"><span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${w.bid_type === 'player' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{w.bid_type === 'player' ? 'Player' : 'Team'}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-[9px] text-blue-500 font-bold">No winning bids in this slot.</p>
                        )}
                        <div className="flex gap-4 mt-2 pt-2 border-t border-blue-100 text-[9px] font-bold text-blue-600">
                          <span>Players: {preview.total_players_drafted}</span>
                          <span>Teams: {preview.total_teams_drafted}</span>
                          <span>Total: {preview.total_budget_spent} Cr</span>
                        </div>
                      </div>
                      <button onClick={() => onApply(slot.slot_index)}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-mono font-bold text-[10px] uppercase tracking-wider rounded-lg cursor-pointer transition-all shadow-sm">
                        ✓ Close & Finalize Slot {slot.slot_index}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => onPreview(slot.slot_index)}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-mono font-bold text-[10px] uppercase tracking-wider rounded-lg cursor-pointer transition-all shadow-sm">
                      👁 Preview Results
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
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
  const [results, setResults] = useState<any>(null);
  const [draftStatus, setDraftStatus] = useState<string>('pending');
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(1);
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');


  const [addTimeMinutes, setAddTimeMinutes] = useState<string>('10');
  const [draftRounds, setDraftRounds] = useState<any[]>([]);
  const [expandedSlotIndex, setExpandedSlotIndex] = useState<number | null>(null);
  const [slotNames, setSlotNames] = useState<Record<number, string>>({});

  const { alertState, showAlert, closeAlert } = useModal();

  const handleCopyAllSubmittedTeams = () => {
    if (teams.length === 0) return;
    // Prefer the currently active round, then most recently closed, then first slot
    const activeRound = draftRounds.find((r: any) => r.status === 'active')
      || draftRounds.filter((r: any) => r.status === 'closed').sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]
      || draftRounds[0];
    const slotName = activeRound?.slot_name || `Slot ${activeRound?.slot_index || ''}`;
    const roundNum = activeRound?.slot_index || '';
    let msg = `Fantasy Season\n`;
    msg += `Teams\n`;
    msg += `Round ${roundNum}\n`;
    msg += `${slotName}\n\n`;
    teams.forEach((t, i) => {
      msg += `${i + 1}. ${t.team_name} ${t.draft_submitted ? '✓' : ''}\n`;
    });
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(msg)
        .then(() => showAlert({ type: 'success', title: 'Copied!', message: 'Submission checklist copied to clipboard' }))
        .catch(() => {
          const ta = document.createElement('textarea');
          ta.value = msg;
          Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', width: '2em', height: '2em', opacity: '0' });
          document.body.appendChild(ta);
          ta.focus(); ta.select();
          try { document.execCommand('copy'); showAlert({ type: 'success', title: 'Copied!', message: 'Submission checklist copied' }); } catch { showAlert({ type: 'error', title: 'Copy Failed', message: 'Failed to copy' }); }
          document.body.removeChild(ta);
        });
    }
  };

  const loadSubmissions = async (silent = false) => {
    if (!leagueId) return;
    if (!silent) setIsLoading(true);
    try {
      // 1. Fetch Wishlist submission counts
      const res = await fetchWithTokenRefresh(`/api/fantasy/draft/submissions?league_id=${leagueId}`);
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams || []);
        setTotalTeams(data.total_teams || 0);
        setSubmittedCount(data.submitted_count || 0);
        if (data.slot_names) setSlotNames(data.slot_names);
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
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadSubmissions();
    }
  }, [user, leagueId]);

  // Auto-refresh: poll every 10s while a round is active or pending
  // Also triggers auto-finalize for rounds past their closes_at in auto mode
  // And auto-closes manual rounds past their closes_at
  useEffect(() => {
    if (!user || !leagueId) return;
    const hasActiveOrPending = draftRounds.some((r: any) => r.status === 'active' || r.status === 'pending' || r.status === 'closed');
    if (!hasActiveOrPending) return;
    const timer = setInterval(async () => {
      // Check if any active round is past its closes_at in auto mode
      const needsAutoFinalize = draftRounds.some((r: any) =>
        r.status === 'active' && r.finalization_mode === 'auto' &&
        r.closes_at && new Date(r.closes_at).getTime() < Date.now()
      );
      if (needsAutoFinalize) {
        try {
          await fetchWithTokenRefresh('/api/fantasy/draft/auto-finalize', {
            method: 'POST',            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ league_id: leagueId }),
          });
        } catch (err) {
          console.error('Auto-finalize check failed:', err);
        }
      }
      // Auto-close manual rounds past their closes_at so admin can preview & finalize
      const expiredManualRounds = draftRounds.filter((r: any) =>
        r.status === 'active' && (r.finalization_mode || 'auto') === 'manual' &&
        r.closes_at && new Date(r.closes_at).getTime() < Date.now()
      );
      for (const r of expiredManualRounds) {
        try {
          await fetchWithTokenRefresh('/api/fantasy/draft/rounds', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ league_id: leagueId, slot_index: r.slot_index, action: 'close' }),
          });
        } catch (err) {
          console.error('Auto-close manual round failed:', err);
        }
      }
      loadSubmissions(true);
    }, 10000);
    return () => clearInterval(timer);
  }, [user, leagueId, draftRounds.length]);

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

  const [slotPreview, setSlotPreview] = useState<any>(null);
  const [previewSlotIndex, setPreviewSlotIndex] = useState<number | null>(null);

  const handlePreviewSlot = async (slotIndex: number) => {
    try {
      const res = await fetchWithTokenRefresh('/api/fantasy/draft/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_id: leagueId, slot_index: slotIndex, action: 'preview' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Preview failed');
      setSlotPreview(data.preview);
      setPreviewSlotIndex(slotIndex);
      showAlert({ type: 'success', title: 'Preview Generated', message: `Slot ${slotIndex} preview saved. Review and click Close to finalize.` });
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Preview Failed', message: err.message });
    }
  };

  const handleApplySlot = async (slotIndex: number) => {
    if (!confirm(`Finalize Slot ${slotIndex}? This will award players/teams and deduct budgets. This cannot be undone.`)) return;
    try {
      const res = await fetchWithTokenRefresh('/api/fantasy/draft/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_id: leagueId, slot_index: slotIndex, action: 'apply' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Apply failed');
      setSlotPreview(null);
      setPreviewSlotIndex(null);
      showAlert({ type: 'success', title: 'Slot Finalized!', message: `Slot ${slotIndex} bids have been applied successfully.` });
      loadSubmissions();
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Finalize Failed', message: err.message });
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
                onPreview={handlePreviewSlot}
                onApply={handleApplySlot}
                preview={previewSlotIndex === slot.slot_index ? slotPreview : null}
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

        {/* Submission warning */}
        {submittedCount < totalTeams && draftStatus !== 'pending' && (
          <div className="console-card bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-[10px] text-amber-700 font-bold uppercase">
              {totalTeams - submittedCount} team(s) have not submitted their bids yet. They can still submit until the round closes.
            </p>
          </div>
        )}

        {/* Team Checklist */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-black text-slate-855 uppercase tracking-wider">Manager submissions tracking</h2>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Real-time status of all participating team draft wishlists</p>
            </div>
            {submittedCount > 0 && (
              <button
                onClick={handleCopyAllSubmittedTeams}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center transition-colors"
                title="Copy all submitted team names"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            )}
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
