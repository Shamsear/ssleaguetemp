'use client';
import { ArrowLeft, RotateCw, CheckCircle2, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

export default function FantasyRecalculatePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const startRecalculation = async () => {
    if (!confirm('Are you sure you want to recalculate all fantasy points?\n\nThis will:\n1. Recalculate ALL player points (Drafted & Free Agents)\n2. Recalculate all passive team outcome bonuses\n3. Sync player cumulative base totals\n4. Update team standings & leaderboard ranks')) {
      return;
    }

    setIsRecalculating(true);
    setProgress('Starting complete fantasy points recalculation...');
    setResults(null);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetchWithTokenRefresh('/api/admin/fantasy/recalculate-all-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.details || 'Recalculation failed');
      }

      const data = await response.json();
      setProgress('Complete fantasy points recalculation finished successfully!');
      setResults(data.results || null);
      setSuccess(true);
    } catch (err: any) {
      console.error('Recalculation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to recalculate points');
      setProgress('Recalculation failed');
    } finally {
      setIsRecalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-400 font-bold uppercase tracking-wider">Loading console...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthGuard requiredRole="committee_admin">
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto relative z-10 space-y-6 font-mono">
          {/* Navigation */}
          <div>
            <Link
              href="/dashboard/committee"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Committee Dashboard
            </Link>
          </div>

          {/* Header Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6">
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">FANTASY SYSTEM UTILITY</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
                Recalculate All Points
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Full-system auto-repair &amp; point recalculation for all players, free agents &amp; teams
              </p>
            </div>
            <div className="w-16 h-16 bg-slate-900 border border-slate-800 text-amber-400 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
              <RotateCw className={`w-8 h-8 ${isRecalculating ? 'animate-spin' : ''}`} />
            </div>
          </div>

          {/* Recalculation Scope Info */}
          <div className="console-card bg-amber-500/10 border border-amber-500/30 rounded-3xl p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-amber-500 text-slate-950 rounded-2xl shrink-0 mt-0.5">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wide">
                  Complete System Recalculation Scope
                </h3>
                <ul className="text-xs text-slate-700 font-bold space-y-1.5 list-disc pl-4">
                  <li><strong>All Real Players (Free Agents &amp; Drafted)</strong>: Recalculates match performance points for all players across completed fixtures.</li>
                  <li><strong>Player Cumulative Sync</strong>: Updates <code className="bg-white/80 px-1 py-0.5 rounded text-amber-700">total_points</code> in <code className="bg-white/80 px-1 py-0.5 rounded text-amber-700">fantasy_players</code> for every player.</li>
                  <li><strong>Squad Multipliers</strong>: Applies captain (2x) and vice-captain (1.5x) multipliers for team squad rosters.</li>
                  <li><strong>Passive Team Bonuses</strong>: Recalculates team outcome bonuses (win, loss, scored 6+ goals, clean sheets) for all 8 fantasy teams.</li>
                  <li><strong>Leaderboard Standings</strong>: Recalculates team totals and updates league ranks.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Action Trigger Button */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
            <button
              onClick={startRecalculation}
              disabled={isRecalculating}
              className={`w-full py-4 px-6 rounded-2xl font-mono font-extrabold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-3 shadow-md ${
                isRecalculating
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-800'
              }`}
            >
              {isRecalculating ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-400" />
                  Recalculating System Points...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 fill-amber-400 text-amber-400" /> Start Full System Recalculation
                </>
              )}
            </button>
          </div>

          {/* Status Message */}
          {progress && (
            <div className={`console-card rounded-2xl p-4 border text-xs font-bold font-mono ${
              success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
              error ? 'bg-rose-50 border-rose-200 text-rose-800' :
              'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <div className="flex items-center gap-3">
                {success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : error ? (
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                ) : (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-600 shrink-0" />
                )}
                <span>{progress}</span>
              </div>
            </div>
          )}

          {/* Detailed Summary Results */}
          {results && (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Recalculation Summary</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Player Records</span>
                  <span className="text-lg font-black text-slate-900">{results.playerPointsInserted ?? 0}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Passive Bonuses</span>
                  <span className="text-lg font-black text-slate-900">{results.passiveBonusesAwarded ?? 0}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Squad Players</span>
                  <span className="text-lg font-black text-slate-900">{results.squadPlayersUpdated ?? 0}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Teams Updated</span>
                  <span className="text-lg font-black text-amber-600">{results.teamsUpdated ?? 0}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
