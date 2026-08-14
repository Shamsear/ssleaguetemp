'use client';
import { CheckCircle, Clock, AlertTriangle, Users, Play, HelpCircle } from 'lucide-react';
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
      const res = await fetchWithTokenRefresh(`/api/fantasy/draft/submissions?league_id=${leagueId}`);
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams || []);
        setTotalTeams(data.total_teams || 0);
        setSubmittedCount(data.submitted_count || 0);
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
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 font-semibold">Loading submissions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AlertModal {...alertState} onClose={closeAlert} />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/dashboard/committee/fantasy/${leagueId}`}
            className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors mb-4 text-sm font-semibold"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-slate-900">Finalize Draft</h1>
          <p className="text-slate-500 mt-1">Review team submissions and run the blind bid allocation engine.</p>
        </div>

        {/* Submissions Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase">Total Managers</p>
              <h3 className="text-2xl font-bold text-slate-900">{totalTeams}</h3>
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase">Submitted & Locked</p>
              <h3 className="text-2xl font-bold text-slate-900">
                {submittedCount} / {totalTeams}
              </h3>
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase">Pending Submissions</p>
              <h3 className="text-2xl font-bold text-slate-900">
                {totalTeams - submittedCount}
              </h3>
            </div>
          </div>
        </div>

        {/* Actions panel */}
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-2">Resolve Draft Bids</h2>
          <p className="text-sm text-slate-500 mb-6">
            When you run the resolution engine, the system will process all blind bids slot-by-slot, resolve priority fallbacks, and assign players/teams exclusively.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <button
              onClick={handleFinalize}
              disabled={isProcessing}
              className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" />
              {isProcessing ? 'Processing Draft Engine...' : 'Run Resolution Engine & Finalize'}
            </button>

            {submittedCount < totalTeams && (
              <span className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                Warning: {totalTeams - submittedCount} teams have not submitted/locked their draft lists yet.
              </span>
            )}
          </div>
        </div>

        {/* Team Checklist */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-8">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Manager submissions tracking</h2>
            <p className="text-xs text-slate-400 mt-0.5">Real-time status of all participating team draft wishlists</p>
          </div>

          <div className="divide-y divide-slate-100">
            {teams.map(t => (
              <div key={t.team_id} className="p-4 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{t.team_name}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Owner: {t.owner_name || 'N/A'}</p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-600">{t.total_bids} bids configured</span>
                    <p className="text-[10px] text-slate-400">Budget: {t.budget_remaining} Left</p>
                  </div>
                  {t.draft_submitted ? (
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-black rounded-full uppercase tracking-wider flex items-center gap-1">
                      ✓ Submitted
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-black rounded-full uppercase tracking-wider flex items-center gap-1">
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
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-b pb-2">Draft Resolution Results</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-6">
              <div className="bg-slate-50 p-4 rounded-xl text-center">
                <span className="text-xs font-bold text-slate-400 uppercase">Players Awarded</span>
                <h4 className="text-xl font-bold text-slate-800 mt-1">{results.total_players_drafted}</h4>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl text-center">
                <span className="text-xs font-bold text-slate-400 uppercase">Teams Awarded</span>
                <h4 className="text-xl font-bold text-slate-800 mt-1">{results.total_teams_drafted}</h4>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl text-center">
                <span className="text-xs font-bold text-slate-400 uppercase">Budget Spent</span>
                <h4 className="text-xl font-bold text-slate-800 mt-1">{results.total_budget_spent} Credits</h4>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl text-center">
                <span className="text-xs font-bold text-slate-400 uppercase">Average Squad Size</span>
                <h4 className="text-xl font-bold text-slate-800 mt-1">{results.average_squad_size.toFixed(1)}</h4>
              </div>
            </div>

            <div className="space-y-6">
              {results.results_by_slot.map((slot: any) => (
                <div key={slot.slot_index} className="border border-slate-100 rounded-xl p-4">
                  <h3 className="font-bold text-slate-800 border-b pb-2 mb-3 text-sm flex justify-between">
                    <span>{slot.slot_name}</span>
                    <span className="text-xs text-indigo-600 font-bold">{slot.winners} won / {slot.total_bids} bids</span>
                  </h3>
                  {slot.winning_bids.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {slot.winning_bids.map((win: any) => (
                        <div key={win.target_id} className="bg-slate-50 p-3 rounded-lg flex items-center justify-between">
                          <div>
                            <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider text-[10px]">{win.bid_type === 'player' ? 'Player' : 'Real Team'}</span>
                            <h4 className="font-bold text-slate-800 text-sm mt-0.5">{win.target_id}</h4>
                            <p className="text-[10px] text-slate-400">Awarded to: {win.team_name}</p>
                          </div>
                          <span className="font-black text-emerald-600 text-sm">{win.bid_amount} Credits</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No bids resolved for this slot.</p>
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
