'use client';

import { Activity, Trophy, Users, RefreshCw, Zap, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

export default function CommitteeMasterRecalculatePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [activeTask, setActiveTask] = useState<'all' | 'real' | 'fantasy' | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Recalculate Real Player Stats
  const runRealPlayerRecalculation = async (): Promise<any> => {
    const res = await fetchWithTokenRefresh('/api/admin/recalculate-all-player-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Real player stats recalculation failed');
    }
    return await res.json();
  };

  // Recalculate Fantasy Points
  const runFantasyRecalculation = async (): Promise<any> => {
    const res = await fetchWithTokenRefresh('/api/admin/fantasy/recalculate-all-points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Fantasy points recalculation failed');
    }
    return await res.json();
  };

  // Handler: Real Player Stats Only
  const handleRecalculateReal = async () => {
    if (!confirm('Recalculate Real Player Stats?\n\nThis will re-evaluate Matches Played, W/D/L, Goals, Clean Sheets, MOTM awards, and Category Points across all completed fixtures.')) return;
    
    setIsRecalculating(true);
    setActiveTask('real');
    setProgress('Recalculating Real Player Match Stats...');
    setLogs([]);
    setError(null);
    setSuccess(false);

    try {
      const data = await runRealPlayerRecalculation();
      setProgress(`Real player stats recalculation complete! Updated ${data.playersUpdated || 0} players across ${data.fixturesProcessed || 0} fixtures.`);
      setLogs([
        `Completed Fixtures: ${data.fixturesProcessed || 0}`,
        `Matchups Evaluated: ${data.matchupsProcessed || 0}`,
        `Players Updated: ${data.playersUpdated || 0}`,
      ]);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to recalculate real player stats');
      setProgress('Real player stats recalculation failed');
    } finally {
      setIsRecalculating(false);
      setActiveTask(null);
    }
  };

  // Handler: Fantasy Points Only
  const handleRecalculateFantasy = async () => {
    if (!confirm('Recalculate Fantasy Points?\n\nThis will re-evaluate Fantasy Match Points, Captain/VC Multipliers, Team Bonuses, and Leaderboards.')) return;
    
    setIsRecalculating(true);
    setActiveTask('fantasy');
    setProgress('Recalculating Fantasy Points & Multipliers...');
    setLogs([]);
    setError(null);
    setSuccess(false);

    try {
      const data = await runFantasyRecalculation();
      setProgress('Fantasy points recalculation completed successfully!');
      setLogs(data.logs || ['Fantasy points updated successfully']);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to recalculate fantasy points');
      setProgress('Fantasy points recalculation failed');
    } finally {
      setIsRecalculating(false);
      setActiveTask(null);
    }
  };

  // Handler: Recalculate ALL (Both Real Player Stats & Fantasy Points)
  const handleRecalculateAll = async () => {
    if (!confirm('Recalculate ALL System Points & Stats?\n\n1. Recalculates Real Player Match Stats (MP, W/D/L, Goals, CS, MOTM, Category Points)\n2. Recalculates Fantasy Points (Drafted Player Points, Multipliers, Team Passive Bonuses, Leaderboards)\n\nThis may take 1-2 minutes.')) return;

    setIsRecalculating(true);
    setActiveTask('all');
    setProgress('[1/2] Recalculating Real Player Match Stats...');
    setLogs([]);
    setError(null);
    setSuccess(false);

    const fullLogs: string[] = [];

    try {
      // Step 1: Real Player Stats
      const realData = await runRealPlayerRecalculation();
      fullLogs.push(`✅ Step 1 (Real Player Stats): ${realData.playersUpdated || 0} players updated (${realData.fixturesProcessed || 0} fixtures).`);
      setLogs([...fullLogs]);

      // Step 2: Fantasy Points
      setProgress('[2/2] Recalculating Fantasy Points & Leaderboards...');
      const fantasyData = await runFantasyRecalculation();
      fullLogs.push('✅ Step 2 (Fantasy Points): Multipliers, Team Bonuses, and Leaderboards recalculated.');
      if (fantasyData.logs) fullLogs.push(...fantasyData.logs);

      setLogs(fullLogs);
      setProgress('🎉 Full System Recalculation (Real Player Stats + Fantasy Points) Completed Successfully!');
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Full system recalculation failed');
      setProgress('Recalculation failed');
    } finally {
      setIsRecalculating(false);
      setActiveTask(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthGuard requiredRole="committee_admin">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <Link href="/dashboard/committee" className="text-blue-600 hover:underline mb-2 inline-block">
            &larr; Back to Committee Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <RefreshCw className="w-8 h-8 text-blue-600" /> System Recalculation Center
          </h1>
          <p className="text-gray-600 mt-1">
            Recalculate real player stats, category tournament standings, and fantasy points across the entire system.
          </p>
        </div>

        {/* Master Action Card */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl shadow-xl p-8 mb-8 border border-slate-800">
          <div className="flex items-start justify-between mb-6">
            <div>
              <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold rounded-full uppercase tracking-wider">
                Full Database Synchronization
              </span>
              <h2 className="text-2xl font-bold text-white mt-2">Recalculate ALL (Real Player Stats + Fantasy Points)</h2>
              <p className="text-slate-300 text-sm mt-1">
                Executes a complete 2-step recalculation of all real player match statistics and fantasy league points.
              </p>
            </div>
            <Zap className="w-10 h-10 text-amber-400 flex-shrink-0" />
          </div>

          <button
            onClick={handleRecalculateAll}
            disabled={isRecalculating}
            className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all shadow-xl ${
              isRecalculating && activeTask === 'all'
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 hover:shadow-2xl hover:scale-[1.01]'
            }`}
          >
            {isRecalculating && activeTask === 'all' ? (
              <span className="flex items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-950"></div>
                Recalculating ALL Stats & Fantasy Points...
              </span>
            ) : (
              '⚡ Recalculate ALL System Data (Both Real & Fantasy)'
            )}
          </button>
        </div>

        {/* Individual Recalculation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Real Player Stats Card */}
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-emerald-100 rounded-xl text-emerald-700">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">Real Player Stats</h3>
                  <p className="text-xs text-gray-500">Tournament Standings & Performance</p>
                </div>
              </div>
              <ul className="text-sm text-gray-600 space-y-1.5 mb-6">
                <li className="flex items-center gap-2">• Recalculates Matches Played (MP)</li>
                <li className="flex items-center gap-2">• Recalculates Wins, Draws, Losses</li>
                <li className="flex items-center gap-2">• Goals Scored & Goals Conceded</li>
                <li className="flex items-center gap-2">• Clean Sheets & MOTM Awards</li>
                <li className="flex items-center gap-2">• Category Outcome Points (Season 18+)</li>
              </ul>
            </div>
            <button
              onClick={handleRecalculateReal}
              disabled={isRecalculating}
              className={`w-full py-3 px-4 rounded-xl font-semibold transition-all ${
                isRecalculating
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md hover:shadow-lg'
              }`}
            >
              {isRecalculating && activeTask === 'real' ? 'Recalculating...' : 'Recalculate Real Player Stats'}
            </button>
          </div>

          {/* Fantasy Points Card */}
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl text-indigo-700">
                  <Trophy className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">Fantasy Points</h3>
                  <p className="text-xs text-gray-500">Fantasy League Standings & Squads</p>
                </div>
              </div>
              <ul className="text-sm text-gray-600 space-y-1.5 mb-6">
                <li className="flex items-center gap-2">• Drafted player performance points</li>
                <li className="flex items-center gap-2">• Captain (2x) & Vice-Captain (1.5x)</li>
                <li className="flex items-center gap-2">• Team passive outcome bonuses</li>
                <li className="flex items-center gap-2">• Squad total points update</li>
                <li className="flex items-center gap-2">• Fantasy League Rankings & Leaderboards</li>
              </ul>
            </div>
            <button
              onClick={handleRecalculateFantasy}
              disabled={isRecalculating}
              className={`w-full py-3 px-4 rounded-xl font-semibold transition-all ${
                isRecalculating
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg'
              }`}
            >
              {isRecalculating && activeTask === 'fantasy' ? 'Recalculating...' : 'Recalculate Fantasy Points'}
            </button>
          </div>
        </div>

        {/* Progress & Log Output */}
        {progress && (
          <div className={`rounded-xl p-5 mb-6 ${
            success ? 'bg-green-50 border-2 border-green-300' :
            error ? 'bg-red-50 border-2 border-red-300' :
            'bg-blue-50 border-2 border-blue-300'
          }`}>
            <div className="flex items-center gap-3">
              {success ? (
                <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
              ) : error ? (
                <ShieldAlert className="w-6 h-6 text-red-600 flex-shrink-0" />
              ) : (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 flex-shrink-0"></div>
              )}
              <p className={`font-semibold text-base ${
                success ? 'text-green-900' :
                error ? 'text-red-900' :
                'text-blue-900'
              }`}>
                {progress}
              </p>
            </div>
          </div>
        )}

        {/* Error Output */}
        {error && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5 mb-6">
            <p className="text-red-900 font-bold mb-1">Recalculation Error</p>
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Console Logs Output */}
        {logs.length > 0 && (
          <div className="bg-slate-950 rounded-2xl p-6 border border-slate-800 shadow-lg">
            <h3 className="text-slate-200 font-bold mb-3 text-sm flex items-center justify-between">
              <span>Recalculation Execution Log</span>
              <span className="text-xs text-slate-500 font-mono">{logs.length} line(s)</span>
            </h3>
            <div className="space-y-1.5 max-h-96 overflow-y-auto font-mono text-xs text-emerald-400 bg-slate-900 p-4 rounded-xl border border-slate-800">
              {logs.map((log, idx) => (
                <div key={idx} className="leading-relaxed">{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
