'use client';
import { CheckCircle, Clock, AlertTriangle, Users, Play, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AlertModal from '@/components/modals/AlertModal';
import { useModal } from '@/hooks/useModal';

interface TeamSubmission {
  team_id: string;
  team_name: string;
  owner_name: string;
  draft_submitted: boolean;
  budget_remaining: number;
  total_bids: number;
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

  const { alertState, showAlert, closeAlert } = useModal();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && user.role !== 'committee_admin' && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

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

        const formatForInput = (isoString?: string) => {
          if (!isoString) return '';
          const d = new Date(isoString);
          if (isNaN(d.getTime())) return '';
          const pad = (n: number) => n.toString().padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        setOpensAt(formatForInput(settingsData.settings?.draft_opens_at));
        setClosesAt(formatForInput(settingsData.settings?.draft_closes_at));
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

  const handleUpdateStatus = async (status: string) => {
    try {
      const body: any = {
        league_id: leagueId,
        draft_status: status
      };

      if (status === 'active') {
        body.active_slot_index = selectedSlotIndex;
        body.draft_opens_at = opensAt ? new Date(opensAt).toISOString() : null;
        body.draft_closes_at = closesAt ? new Date(closesAt).toISOString() : null;
      }

      const response = await fetchWithTokenRefresh('/api/fantasy/draft/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update draft status');
      }

      setDraftStatus(status);
      showAlert({
        type: 'success',
        title: 'Draft Status Updated',
        message: `Draft status successfully set to ${status.toUpperCase()}!`,
      });
      loadSubmissions();
    } catch (err: any) {
      console.error('Error updating draft status:', err);
      showAlert({
        type: 'error',
        title: 'Update Failed',
        message: err.message || 'An error occurred while updating draft status.',
      });
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

        {/* Manual Draft Controls Card */}
        <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-1">Draft Round Controls</h2>
              <p className="text-[10px] text-slate-450 font-bold uppercase leading-normal">
                Control the bidding window manually. Managers can only submit or edit bids when draft is active.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Current Status:</span>
              <span className={`px-2.5 py-0.5 border text-[9px] font-black rounded-lg uppercase tracking-wider ${
                draftStatus === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                draftStatus === 'closed' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                draftStatus === 'completed' ? 'bg-blue-50 border-blue-200 text-blue-750' :
                'bg-slate-100 border-slate-200 text-slate-650'
              }`}>
                {draftStatus}
              </span>
            </div>
          </div>

          {/* Active Slot Selector */}
          {draftStatus !== 'active' && draftStatus !== 'completed' && slots.length > 0 && (
            <div className="w-full max-w-xs space-y-1.5 pt-2">
              <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Select Draft Slot to Start</label>
              <select
                value={selectedSlotIndex}
                onChange={(e) => setSelectedSlotIndex(Number(e.target.value))}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200/80 focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800 rounded-xl text-xs font-bold uppercase cursor-pointer"
              >
                {slots.map(s => (
                  <option key={s.slot_index} value={s.slot_index}>{s.name} (Slot {s.slot_index})</option>
                ))}
              </select>
            </div>
          )}

          {/* Date-time window inputs for the round */}
          {draftStatus !== 'active' && draftStatus !== 'completed' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Draft Window Opens At</label>
                <input
                  type="datetime-local"
                  value={opensAt}
                  onChange={(e) => setOpensAt(e.target.value)}
                  className="w-full max-w-xs px-3.5 py-2 bg-slate-50 border border-slate-200/80 focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800 rounded-xl text-xs font-bold uppercase cursor-pointer"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Draft Window Closes At (Deadline)</label>
                <input
                  type="datetime-local"
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                  className="w-full max-w-xs px-3.5 py-2 bg-slate-50 border border-slate-200/80 focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800 rounded-xl text-xs font-bold uppercase cursor-pointer"
                />
              </div>
            </div>
          )}

          {draftStatus === 'active' && slots.length > 0 && (
            <div className="pt-2 text-xs font-bold text-slate-650 uppercase flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <span>🎯 Active Draft Slot:</span>
                <span className="text-amber-600 font-black">
                  {slots.find(s => s.slot_index === selectedSlotIndex)?.name || `Slot ${selectedSlotIndex}`}
                </span>
              </div>
              {opensAt && (
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span>⏳ Opened At:</span>
                  <span className="text-slate-700 font-bold">{new Date(opensAt).toLocaleString()}</span>
                </div>
              )}
              {closesAt && (
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span>🏁 Deadline (Closes):</span>
                  <span className="text-rose-600 font-black">{new Date(closesAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            {draftStatus !== 'active' && draftStatus !== 'completed' && (
              <button
                onClick={() => handleUpdateStatus('active')}
                className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-mono font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-sm"
              >
                ▶ Start Round (Open Bids)
              </button>
            )}
            {draftStatus === 'active' && (
              <button
                onClick={() => handleUpdateStatus('closed')}
                className="px-4 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-mono font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-sm"
              >
                ⏸ Close Round (Lock Bids)
              </button>
            )}
            {(draftStatus === 'closed' || draftStatus === 'active') && (
              <button
                onClick={() => handleUpdateStatus('pending')}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 font-mono font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-sm"
              >
                🔄 Reset to Pending
              </button>
            )}
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
              When you run the resolution engine, the system will process all blind bids slot-by-slot, resolve priority fallbacks, and assign players/teams exclusively.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-center pt-2">
            <button
              onClick={handleFinalize}
              disabled={isProcessing || draftStatus === 'pending'}
              title={draftStatus === 'pending' ? 'Draft must be opened and closed before finalization' : ''}
              className="w-full sm:w-auto px-6 py-3.5 bg-slate-800 border border-slate-900 hover:bg-slate-700 text-amber-400 font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Play className="w-4 h-4 text-amber-400" />
              {isProcessing ? 'Processing Draft Engine...' : 'Run Resolution Engine & Finalize'}
            </button>

            {submittedCount < totalTeams && (
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
  );
}
