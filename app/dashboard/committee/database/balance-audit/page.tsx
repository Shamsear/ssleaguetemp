'use client'

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { ArrowLeft, Database, RefreshCw, AlertTriangle, Info, Users, CheckCircle, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';

interface AuditPlayer {
  name: string;
  position: string;
  value: number;
}

interface TeamAudit {
  team_id: string;
  team_name: string;
  pg_squad_count: number;
  pg_cached_count: number;
  fb_count: number;
  pg_actual_spent: number;
  pg_cached_spent: number;
  fb_spent: number;
  pg_budget: number;
  fb_budget: number;
  expected_budget: number;
  mismatch: boolean;
  players: AuditPlayer[];
}

export default function BalanceAuditPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingTeamId, setSyncingTeamId] = useState<string | null>(null);
  const [auditData, setAuditData] = useState<TeamAudit[]>([]);
  const [seasonId] = useState('SSPSLS18');
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  // Authenticate user
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
    if (!authLoading && user && user.role !== 'committee_admin' && user.role !== 'admin') {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  const loadAudit = async () => {
    setLoading(true);
    try {
      const res = await fetchWithTokenRefresh(`/api/admin/database/balance-audit?season_id=${seasonId}`);
      const data = await res.json();
      if (data.success) {
        setAuditData(data.audit || []);
      } else {
        alert(data.error || 'Failed to fetch audit data');
      }
    } catch (e) {
      console.error('Error loading balance audit:', e);
      alert('Failed to load audit diagnostic');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && (user.role === 'committee_admin' || user.role === 'admin')) {
      loadAudit();
    }
  }, [user, seasonId]);

  const handleSyncAll = async () => {
    if (syncingAll) return;
    if (!window.confirm('Are you sure you want to recalculate and synchronize balances for ALL teams in this season? This will write squad allocations and true budgets to Postgres and Firestore.')) {
      return;
    }

    setSyncingAll(true);
    try {
      const res = await fetchWithTokenRefresh('/api/admin/database/balance-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season_id: seasonId })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Successfully synchronized all teams');
        loadAudit();
      } else {
        alert(data.error || 'Sync failed');
      }
    } catch (e) {
      console.error('Error syncing balances:', e);
      alert('Network error, sync failed');
    } finally {
      setSyncingAll(false);
    }
  };

  const handleSyncTeam = async (teamId: string, teamName: string) => {
    if (syncingTeamId) return;
    if (!window.confirm(`Recalculate and synchronize database records for team "${teamName}"?`)) {
      return;
    }

    setSyncingTeamId(teamId);
    try {
      const res = await fetchWithTokenRefresh('/api/admin/database/balance-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season_id: seasonId, team_id: teamId })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || `Successfully synchronized ${teamName}`);
        loadAudit();
      } else {
        alert(data.error || 'Sync failed');
      }
    } catch (e) {
      console.error('Error syncing team balance:', e);
      alert('Network error, sync failed');
    } finally {
      setSyncingTeamId(null);
    }
  };

  const toggleExpandTeam = (teamId: string) => {
    setExpandedTeamId(prev => (prev === teamId ? null : teamId));
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-amber-500 mb-4"></div>
        <p className="font-mono text-xs uppercase tracking-wider text-slate-500">Verifying Admin Session...</p>
      </div>
    );
  }

  const mismatchCount = auditData.filter(t => t.mismatch).length;

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/committee/database"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Database
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Database className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">COMMITTEE CONSOLE</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Squad Balance Diagnostics
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Audit and synchronize team squad balances, budgets, and sizes between Postgres and Firebase.
              </p>
            </div>
          </div>
          <div className="bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-xl border border-slate-700 shadow-sm shrink-0">
            Mismatches: {mismatchCount}
          </div>
        </div>

        {/* Diagnostic Control Board */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <h2 className="text-sm font-extrabold uppercase text-slate-800 tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4.5 h-4.5 text-amber-500" />
                Diagnostic Dashboard & Repair Engine
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed font-mono">
                This tool compares each team's actual allocated players (Postgres <code className="text-amber-700 bg-slate-100 px-1 py-0.5 rounded">footballplayers</code> squad table) against the cached spent amounts, budgets, and counts in Postgres <code className="text-amber-700 bg-slate-100 px-1 py-0.5 rounded">teams</code> and Firebase <code className="text-amber-700 bg-slate-100 px-1 py-0.5 rounded">team_seasons</code>. 
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={loadAudit}
                disabled={loading}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
                Re-Run Audit
              </button>

              <button
                onClick={handleSyncAll}
                disabled={loading || syncingAll || auditData.length === 0}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-black text-xs uppercase tracking-widest shadow-md hover:shadow-amber-500/10 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {syncingAll ? 'Correcting all...' : 'Correct & Sync All'}
              </button>
            </div>
          </div>

          {/* Audit Alert Message */}
          {!loading && auditData.length > 0 && (
            <div className={`mt-6 p-4 rounded-2xl border flex items-center gap-3 font-mono text-xs ${
              mismatchCount > 0 
                ? 'bg-rose-50 border-rose-250 text-rose-700' 
                : 'bg-emerald-50 border-emerald-250 text-emerald-700'
            }`}>
              {mismatchCount > 0 ? (
                <>
                  <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 animate-pulse" />
                  <div>
                    <span className="font-extrabold uppercase">Audit Failed:</span> Found {mismatchCount} team(s) with balance, budget, or squad count cache mismatches. Recommended to click "Correct & Sync All".
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-extrabold uppercase">Audit Passed:</span> All team caches are fully aligned and in sync with actual allocations.
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Audit Details Table */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200/60 flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-slate-600 tracking-wider">
              Diagnostic Table — Season {seasonId}
            </span>
            <span className="text-[10px] font-mono font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md shadow-sm">
              BASE BUDGET: £10,000
            </span>
          </div>

          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
              <p className="font-mono text-xs uppercase tracking-wider text-slate-500">Executing Diagnostic Suite...</p>
            </div>
          ) : auditData.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-mono text-xs">
              No team data found for season {seasonId}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 font-mono font-extrabold text-[10px] text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3">Team Name</th>
                    <th className="px-4 py-3 text-center">Squad size (True/PG/FB)</th>
                    <th className="px-4 py-3 text-center">Spent Balance (True/PG/FB)</th>
                    <th className="px-4 py-3 text-center">Budget (True/PG/FB)</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditData.map((team) => {
                    const isExpanded = expandedTeamId === team.team_id;
                    const squadMismatch = (team.pg_squad_count !== team.pg_cached_count) || (team.pg_squad_count !== team.fb_count);
                    const spentMismatch = (team.pg_actual_spent !== team.pg_cached_spent) || (team.pg_actual_spent !== team.fb_spent);
                    const budgetMismatch = (team.expected_budget !== team.pg_budget) || (team.expected_budget !== team.fb_budget);

                    return (
                      <React.Fragment key={team.team_id}>
                        <tr className={`hover:bg-slate-55/50 transition-colors ${team.mismatch ? 'bg-rose-500/[0.02]' : ''}`}>
                          {/* Team Name */}
                          <td className="px-5 py-4 font-bold text-slate-800">
                            <button
                              onClick={() => toggleExpandTeam(team.team_id)}
                              className="flex items-center gap-1.5 text-left hover:text-amber-600 transition-colors cursor-pointer"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                              <span className="font-extrabold uppercase">{team.team_name}</span>
                            </button>
                          </td>

                          {/* Squad Size */}
                          <td className="px-4 py-4 text-center font-mono font-bold">
                            <span className={squadMismatch ? 'text-rose-600 font-black' : 'text-emerald-600'}>
                              {team.pg_squad_count}
                            </span>
                            <span className="text-slate-300 mx-1">/</span>
                            <span className={squadMismatch ? 'text-rose-550' : 'text-slate-500'}>
                              {team.pg_cached_count}
                            </span>
                            <span className="text-slate-300 mx-1">/</span>
                            <span className={squadMismatch ? 'text-rose-550' : 'text-slate-500'}>
                              {team.fb_count}
                            </span>
                            {squadMismatch && <span className="ml-1 text-rose-550 animate-pulse" title="Mismatch detected">⚠️</span>}
                          </td>

                          {/* Spent Balance */}
                          <td className="px-4 py-4 text-center font-mono font-bold">
                            <span className={spentMismatch ? 'text-rose-600 font-black' : 'text-emerald-600'}>
                              £{team.pg_actual_spent.toLocaleString()}
                            </span>
                            <span className="text-slate-300 mx-1">/</span>
                            <span className={spentMismatch ? 'text-rose-550' : 'text-slate-500'}>
                              £{team.pg_cached_spent.toLocaleString()}
                            </span>
                            <span className="text-slate-300 mx-1">/</span>
                            <span className={spentMismatch ? 'text-rose-550' : 'text-slate-500'}>
                              £{team.fb_spent.toLocaleString()}
                            </span>
                            {spentMismatch && <span className="ml-1 text-rose-550 animate-pulse" title="Mismatch detected">⚠️</span>}
                          </td>

                          {/* Budget */}
                          <td className="px-4 py-4 text-center font-mono font-bold">
                            <span className={budgetMismatch ? 'text-rose-600 font-black' : 'text-emerald-600'}>
                              £{team.expected_budget.toLocaleString()}
                            </span>
                            <span className="text-slate-300 mx-1">/</span>
                            <span className={budgetMismatch ? 'text-rose-550' : 'text-slate-500'}>
                              £{team.pg_budget.toLocaleString()}
                            </span>
                            <span className="text-slate-300 mx-1">/</span>
                            <span className={budgetMismatch ? 'text-rose-550' : 'text-slate-500'}>
                              £{team.fb_budget.toLocaleString()}
                            </span>
                            {budgetMismatch && <span className="ml-1 text-rose-550 animate-pulse" title="Mismatch detected">⚠️</span>}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
                              team.mismatch
                                ? 'bg-rose-55/10 border-rose-200 text-rose-600 animate-pulse'
                                : 'bg-emerald-55/10 border-emerald-250 text-emerald-650'
                            }`}>
                              {team.mismatch ? 'Out of Sync' : 'In Sync'}
                            </span>
                          </td>

                          {/* Action */}
                          <td className="px-5 py-4 text-right">
                            <button
                              onClick={() => handleSyncTeam(team.team_id, team.team_name)}
                              disabled={syncingTeamId !== null || syncingAll}
                              className={`px-3 py-1.5 rounded-xl border font-bold text-[9px] uppercase tracking-wider transition-all cursor-pointer ${
                                team.mismatch
                                  ? 'bg-amber-50 hover:bg-amber-500 border-amber-300 text-amber-700 hover:text-slate-950 font-black'
                                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 shadow-sm'
                              }`}
                            >
                              {syncingTeamId === team.team_id ? 'Syncing...' : 'Force Sync'}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Player Squad List */}
                        {isExpanded && (
                          <tr className="bg-slate-50/30">
                            <td colSpan={6} className="px-5 py-4 border-b border-slate-200/60">
                              <div className="max-w-3xl space-y-3 font-mono">
                                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
                                  <Users className="w-3.5 h-3.5 text-amber-500" />
                                  True Postgres Squad List ({team.pg_squad_count} players)
                                </h4>
                                
                                {team.players.length === 0 ? (
                                  <p className="text-[10px] text-slate-450 italic">No players allocated to this team.</p>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5 text-[10px] text-slate-600">
                                    {team.players.map((p, idx) => (
                                      <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-100/60">
                                        <span className="font-bold truncate pr-2 text-slate-700">{p.name}</span>
                                        <span className="shrink-0 font-bold text-slate-400 uppercase">
                                          {p.position} • <code className="text-amber-600 font-extrabold">£{p.value}</code>
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Instructions Alert */}
        <div className="flex gap-3 p-5 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-slate-600 font-mono text-xs leading-relaxed max-w-4xl shadow-sm">
          <Info className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="space-y-1">
            <span className="font-extrabold uppercase text-amber-600">How Cache Drifts Happen:</span>
            <p>
              When rounds are finalized, players are allocated to rosters and purchase costs are deducted from team eCoin budgets. If the finalization process crashes mid-way, or is manually altered/reverted without database triggers, the cached counters on Postgres `teams` and Firestore `team_seasons` can fall out of alignment with the actual list of owned players. 
            </p>
            <p className="pt-1.5">
              Clicking <strong className="text-amber-600">Force Sync</strong> or <strong className="text-amber-600">Correct & Sync All Teams</strong> parses the raw player roster records, counts how many sold players each team holds, calculates the spent sum, and overwrites the cached values back to Postgres and Firebase, restoring 100% database alignment.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
