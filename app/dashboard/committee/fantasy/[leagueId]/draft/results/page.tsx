'use client';
import { ArrowLeft, Eye, Trophy, Users, DollarSign, Clock, CheckCircle, XCircle, Minus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import AuthGuard from '@/components/auth/AuthGuard';

const IST_TIMEZONE = 'Asia/Kolkata';
const parseAsUTC = (isoOrLocal: string): Date => {
  if (!isoOrLocal) return new Date(0);
  if (/Z$|[+-]\d{2}:\d{2}$/.test(isoOrLocal)) return new Date(isoOrLocal);
  return new Date(isoOrLocal.replace(' ', 'T') + 'Z');
};
const formatISTDisplay = (isoOrLocal: string): string => {
  if (!isoOrLocal) return '—';
  const d = parseAsUTC(isoOrLocal);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { timeZone: IST_TIMEZONE });
};

export default function DraftDetailedResultsPage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [league, setLeague] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'by-slot' | 'by-team'>('by-slot');
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'won' | 'lost'>('all');

  const { alertState, showAlert, closeAlert } = useModal();

  const loadData = useCallback(async () => {
    if (!leagueId) return;
    setIsLoading(true);
    try {
      const res = await fetchWithTokenRefresh(`/api/fantasy/draft/all-bids?league_id=${leagueId}`);
      if (!res.ok) throw new Error('Failed to load results');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setLeague(data.league);
      setSlots(data.slots);
      setTeams(data.teams);
      setTotals(data.totals);

      if (data.slots.length > 0 && selectedSlot === null) {
        setSelectedSlot(data.slots[0].slot_index);
      }
      if (data.teams.length > 0 && !selectedTeam) {
        setSelectedTeam(data.teams[0].team_id);
      }
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [leagueId, selectedSlot, selectedTeam]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading results...</p>
        </div>
      </div>
    );
  }

  const currentSlot = slots.find(s => s.slot_index === selectedSlot);
  const currentTeam = teams.find(t => t.team_id === selectedTeam);

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-blue-50 border-blue-200 text-blue-700';
      case 'closed': return 'bg-rose-50 border-rose-200 text-rose-700';
      case 'active': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      case 'pending': return 'bg-slate-100 border-slate-200 text-slate-600';
      default: return 'bg-slate-100 border-slate-200 text-slate-600';
    }
  };

  const bidStatusColor = (status: string) => {
    switch (status) {
      case 'won': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      case 'lost': return 'bg-rose-50 border-rose-200 text-rose-700';
      default: return 'bg-slate-100 border-slate-200 text-slate-600';
    }
  };

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
      <AlertModal {...alertState} onClose={closeAlert} />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Navigation */}
        <div>
          <Link
            href={`/dashboard/committee/fantasy/${leagueId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">FANTASY CONSOLE</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
              Draft Results
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Full bid breakdown — preview & final results per slot
            </p>
          </div>
          <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center text-amber-400 shadow-sm shrink-0">
            <Trophy className="w-8 h-8" />
          </div>
        </div>

        {/* Summary Stats */}
        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-slate-800 text-amber-400 border border-slate-900 rounded-xl">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Bids</p>
                <h3 className="text-xl font-black text-slate-900">{totals.total_bids}</h3>
              </div>
            </div>
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-slate-800 text-emerald-400 border border-slate-900 rounded-xl">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[9px] text-slate-455 font-bold uppercase tracking-wider">Players Awarded</p>
                <h3 className="text-xl font-black text-slate-900">{totals.total_players_awarded}</h3>
              </div>
            </div>
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-slate-800 text-blue-400 border border-slate-900 rounded-xl">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[9px] text-slate-455 font-bold uppercase tracking-wider">Budget Spent</p>
                <h3 className="text-xl font-black text-slate-900">{totals.total_budget_spent} Cr</h3>
              </div>
            </div>
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-slate-800 text-purple-400 border border-slate-900 rounded-xl">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[9px] text-slate-455 font-bold uppercase tracking-wider">Teams</p>
                <h3 className="text-xl font-black text-slate-900">{totals.total_teams}</h3>
              </div>
            </div>
          </div>
        )}

        {/* View Mode Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('by-slot')}
            className={`px-4 py-2 rounded-xl font-bold font-mono text-xs uppercase tracking-wider transition-all border cursor-pointer ${
              viewMode === 'by-slot'
                ? 'bg-slate-800 text-amber-400 border-slate-900 shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200/60'
            }`}
          >
            By Slot
          </button>
          <button
            onClick={() => setViewMode('by-team')}
            className={`px-4 py-2 rounded-xl font-bold font-mono text-xs uppercase tracking-wider transition-all border cursor-pointer ${
              viewMode === 'by-team'
                ? 'bg-slate-800 text-amber-400 border-slate-900 shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200/60'
            }`}
          >
            By Team
          </button>
        </div>

        {/* ═══════════ BY SLOT VIEW ═══════════ */}
        {viewMode === 'by-slot' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Slot Selector */}
            <div>
              <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm sticky top-4">
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4">Slots</h2>
                <div className="space-y-2">
                  {slots.map((slot) => (
                    <button
                      key={slot.slot_index}
                      onClick={() => { setSelectedSlot(slot.slot_index); setFilterStatus('all'); }}
                      className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                        selectedSlot === slot.slot_index
                          ? 'bg-slate-800 border-slate-900 text-amber-400 shadow-sm'
                          : 'bg-slate-50 border-slate-100 hover:border-slate-200 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-xs uppercase">{slot.slot_name}</div>
                        {slot.round && (
                          <span className={`px-2 py-0.5 text-[8px] font-black rounded-full uppercase ${statusColor(slot.round.status)}`}>
                            {slot.round.status}
                          </span>
                        )}
                      </div>
                      <div className={`text-[10px] font-bold uppercase mt-1 ${
                        selectedSlot === slot.slot_index ? 'text-amber-300' : 'text-slate-500'
                      }`}>
                        {slot.total_bids} bids • {slot.unique_targets} targets
                      </div>
                      {slot.preview && (
                        <div className={`text-[9px] font-bold uppercase mt-0.5 ${
                          selectedSlot === slot.slot_index ? 'text-emerald-300' : 'text-emerald-600'
                        }`}>
                          ✓ Preview ready
                        </div>
                      )}
                      {slot.final_awarded.length > 0 && (
                        <div className={`text-[9px] font-bold uppercase mt-0.5 ${
                          selectedSlot === slot.slot_index ? 'text-blue-300' : 'text-blue-600'
                        }`}>
                          ✓ Finalized ({slot.final_awarded.length} awarded)
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Slot Details */}
            <div className="lg:col-span-3 space-y-6">
              {currentSlot && (
                <>
                  {/* Slot Info Card */}
                  <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4 pb-4 border-b border-slate-100">
                      <div>
                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                          {currentSlot.slot_name} (Slot {currentSlot.slot_index})
                        </h2>
                        <p className="text-[10px] text-slate-450 font-bold uppercase mt-0.5">
                          Base Price: {currentSlot.base_price} Cr
                        </p>
                      </div>
                      {currentSlot.round && (
                        <div className="flex flex-wrap gap-2">
                          <span className={`px-2.5 py-1 border text-[9px] font-black rounded-lg uppercase tracking-wider ${statusColor(currentSlot.round.status)}`}>
                            {currentSlot.round.status}
                          </span>
                          <span className={`px-2.5 py-1 border text-[9px] font-black rounded-lg uppercase tracking-wider ${
                            currentSlot.round.finalization_mode === 'manual'
                              ? 'bg-amber-50 border-amber-200 text-amber-700'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          }`}>
                            ⚙️ {currentSlot.round.finalization_mode}
                          </span>
                        </div>
                      )}
                    </div>

                    {currentSlot.round && (
                      <div className="flex gap-6 text-[10px] font-bold uppercase text-slate-500">
                        {currentSlot.round.opens_at && (
                          <div>Opens: <span className="text-slate-700">{formatISTDisplay(currentSlot.round.opens_at)} IST</span></div>
                        )}
                        {currentSlot.round.closes_at && (
                          <div>Closes: <span className="text-rose-600">{formatISTDisplay(currentSlot.round.closes_at)} IST</span></div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Preview Results */}
                  {currentSlot.preview && (
                    <div className="console-card bg-blue-50/50 border border-blue-200/60 p-6 rounded-3xl shadow-sm">
                      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-blue-100">
                        <Eye className="w-4 h-4 text-blue-600" />
                        <h3 className="text-xs font-black text-blue-800 uppercase tracking-wider">Preview Results</h3>
                        <span className="text-[9px] text-blue-500 font-bold ml-auto">
                          {formatISTDisplay(currentSlot.preview.created_at)}
                        </span>
                      </div>

                      {currentSlot.preview.winning_bids.length > 0 ? (
                        <div className="space-y-3">
                          {currentSlot.preview.winning_bids.map((w: any, i: number) => (
                            <div key={i} className="bg-white border border-blue-100 rounded-xl p-4 flex items-center justify-between">
                              <div>
                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                  w.bid_type === 'player' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                }`}>
                                  {w.bid_type}
                                </span>
                                <h4 className="font-bold text-slate-800 text-xs uppercase mt-1">{w.target_name}</h4>
                                <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                                  Awarded to: <span className="text-amber-600">{w.team_name}</span>
                                </p>
                              </div>
                              <span className="font-black text-emerald-600 text-sm">{w.bid_amount} Cr</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-blue-500 font-bold uppercase text-center py-4">No winning bids in preview</p>
                      )}

                      <div className="flex gap-4 mt-4 pt-3 border-t border-blue-100 text-[10px] font-bold text-blue-600">
                        <span>Players: {currentSlot.preview.total_players_drafted}</span>
                        <span>Teams: {currentSlot.preview.total_teams_drafted}</span>
                        <span>Budget: {currentSlot.preview.total_budget_spent} Cr</span>
                      </div>
                    </div>
                  )}

                  {/* Final Awarded */}
                  {currentSlot.final_awarded.length > 0 && (
                    <div className="console-card bg-emerald-50/50 border border-emerald-200/60 p-6 rounded-3xl shadow-sm">
                      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-emerald-100">
                        <Trophy className="w-4 h-4 text-emerald-600" />
                        <h3 className="text-xs font-black text-emerald-800 uppercase tracking-wider">Final Awarded</h3>
                      </div>
                      <div className="space-y-3">
                        {currentSlot.final_awarded.map((a: any, i: number) => (
                          <div key={i} className="bg-white border border-emerald-100 rounded-xl p-4 flex items-center justify-between">
                            <div>
                              <h4 className="font-bold text-slate-800 text-xs uppercase">{a.player_name}</h4>
                              <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                                {a.position} • {a.real_team_name}
                              </p>
                              <p className="text-[10px] text-amber-600 font-bold uppercase mt-0.5">
                                → {a.team_name}
                              </p>
                            </div>
                            <span className="font-black text-emerald-600 text-sm">{a.purchase_price} Cr</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {currentSlot.final_team_awarded.length > 0 && (
                    <div className="console-card bg-purple-50/50 border border-purple-200/60 p-6 rounded-3xl shadow-sm">
                      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-purple-100">
                        <Trophy className="w-4 h-4 text-purple-600" />
                        <h3 className="text-xs font-black text-purple-800 uppercase tracking-wider">Real Teams Awarded</h3>
                      </div>
                      <div className="space-y-3">
                        {currentSlot.final_team_awarded.map((a: any, i: number) => (
                          <div key={i} className="bg-white border border-purple-100 rounded-xl p-4 flex items-center justify-between">
                            <div>
                              <h4 className="font-bold text-slate-800 text-xs uppercase">{a.supported_team_name}</h4>
                              <p className="text-[10px] text-amber-600 font-bold uppercase mt-0.5">→ {a.team_name}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* All Bids for this Slot */}
                  <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        All Bids ({currentSlot.total_bids})
                      </h3>
                      <div className="flex gap-1">
                        {(['all', 'won', 'lost'] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => setFilterStatus(f)}
                            className={`px-2.5 py-1 text-[9px] font-black rounded-lg uppercase tracking-wider border transition-all cursor-pointer ${
                              filterStatus === f
                                ? 'bg-slate-800 text-white border-slate-900'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-6">
                      {currentSlot.targets
                        .filter(target => {
                          if (filterStatus === 'all') return true;
                          return target.bids.some((b: any) => b.status === filterStatus);
                        })
                        .map((target) => (
                        <div key={target.target_id} className="border border-slate-100 rounded-2xl overflow-hidden">
                          <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                target.bid_type === 'player' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                              }`}>
                                {target.bid_type}
                              </span>
                              <span className="font-bold text-xs uppercase text-slate-800">{target.target_name}</span>
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase">{target.total_bids} bid{target.total_bids !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="divide-y divide-slate-50">
                            {target.bids
                              .filter((b: any) => filterStatus === 'all' || b.status === filterStatus)
                              .map((bid: any) => (
                              <div key={bid.bid_id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                <div className="flex items-center gap-3">
                                  <span className="text-[9px] font-black text-slate-400 w-4">#{bid.priority}</span>
                                  <div>
                                    <p className="font-bold text-xs uppercase text-slate-800">{bid.team_name}</p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">{bid.owner_name}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-black text-sm text-slate-700">{bid.bid_amount} Cr</span>
                                  <span className={`px-2 py-0.5 text-[8px] font-black rounded-lg uppercase tracking-wider border ${bidStatusColor(bid.status)}`}>
                                    {bid.status === 'won' ? '✓ Won' : bid.status === 'lost' ? '✗ Lost' : bid.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══════════ BY TEAM VIEW ═══════════ */}
        {viewMode === 'by-team' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Team Selector */}
            <div>
              <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm sticky top-4">
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4">Teams</h2>
                <div className="space-y-2">
                  {teams.map((team) => (
                    <button
                      key={team.team_id}
                      onClick={() => setSelectedTeam(team.team_id)}
                      className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                        selectedTeam === team.team_id
                          ? 'bg-slate-800 border-slate-900 text-amber-400 shadow-sm'
                          : 'bg-slate-50 border-slate-100 hover:border-slate-200 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-xs uppercase truncate">{team.team_name}</div>
                        {team.draft_submitted && (
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase ${
                            selectedTeam === team.team_id
                              ? 'bg-amber-400 text-slate-900'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            ✓
                          </span>
                        )}
                      </div>
                      <div className={`text-[10px] font-bold uppercase mt-1 ${
                        selectedTeam === team.team_id ? 'text-amber-300' : 'text-slate-500'
                      }`}>
                        {team.total_bids} bids • {team.won_bids} won • {team.budget_remaining} Cr left
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Team Details */}
            <div className="lg:col-span-3 space-y-6">
              {currentTeam && (
                <>
                  {/* Team Summary */}
                  <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4 pb-4 border-b border-slate-100">
                      <div>
                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">{currentTeam.team_name}</h2>
                        <p className="text-[10px] text-slate-450 font-bold uppercase mt-0.5">
                          Owner: {currentTeam.owner_name}
                        </p>
                      </div>
                      {currentTeam.draft_submitted && (
                        <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] font-black rounded-lg uppercase tracking-wider">
                          ✓ Submitted
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Total Bids</p>
                        <p className="text-lg font-black text-slate-800">{currentTeam.total_bids}</p>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                        <p className="text-[9px] text-emerald-600 font-bold uppercase mb-0.5">Won</p>
                        <p className="text-lg font-black text-emerald-700">{currentTeam.won_bids}</p>
                      </div>
                      <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
                        <p className="text-[9px] text-rose-600 font-bold uppercase mb-0.5">Lost</p>
                        <p className="text-lg font-black text-rose-700">{currentTeam.lost_bids}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Spent</p>
                        <p className="text-lg font-black text-slate-800">{currentTeam.budget_spent} Cr</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Remaining</p>
                        <p className="text-lg font-black text-amber-600">{currentTeam.budget_remaining} Cr</p>
                      </div>
                    </div>
                  </div>

                  {/* All Bids for this Team */}
                  <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4 pb-3 border-b border-slate-100">
                      All Bids ({currentTeam.bids.length})
                    </h3>

                    {currentTeam.bids.length === 0 ? (
                      <p className="text-xs text-slate-400 font-bold uppercase text-center py-8">No bids submitted</p>
                    ) : (
                      <div className="space-y-4">
                        {currentTeam.bids.map((bid: any, i: number) => (
                          <div key={i} className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                            bid.status === 'won'
                              ? 'bg-emerald-50/50 border-emerald-200'
                              : bid.status === 'lost'
                                ? 'bg-rose-50/30 border-rose-100 opacity-75'
                                : 'bg-slate-50 border-slate-100'
                          }`}>
                            <div className="flex items-center gap-3">
                              <span className="text-[9px] font-black text-slate-400">S{bid.slot_index}</span>
                              <div>
                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                  bid.bid_type === 'player' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                }`}>
                                  {bid.bid_type}
                                </span>
                                <h4 className="font-bold text-slate-800 text-xs uppercase mt-1">{bid.target_id}</h4>
                                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Priority {bid.priority}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-black text-sm text-slate-700">{bid.bid_amount} Cr</span>
                              <span className={`px-2 py-0.5 text-[8px] font-black rounded-lg uppercase tracking-wider border ${bidStatusColor(bid.status)}`}>
                                {bid.status === 'won' ? '✓ Won' : bid.status === 'lost' ? '✗ Lost' : bid.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    </AuthGuard>
  );
}
