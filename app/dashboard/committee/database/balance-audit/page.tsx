'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { ArrowLeft, Database, RefreshCw, AlertTriangle, Info, Users, CheckCircle, ShieldAlert, ChevronDown, ChevronUp, Coins, Trash2 } from 'lucide-react';

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
  const [seasonId, setSeasonId] = useState('SSPSLS18');
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
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-300">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-amber-500 mb-4"></div>
        <p className="font-mono text-xs uppercase tracking-wider">Verifying Admin Session...</p>
      </div>
    );
  }

  const mismatchCount = auditData.filter(t => t.mismatch).length;

  return (
    <div className="min-h-screen bg-[#070b13] bg-gradient-to-b from-[#0d1424] via-[#070b13] to-[#04060b] text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Breadcrumbs */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-500 uppercase tracking-widest">
              <Link href="/dashboard/committee" className="hover:text-amber-500 transition-colors">Committee</Link>
              <span>/</span>
              <Link href="/dashboard/committee/database" className="hover:text-amber-500 transition-colors">Database</Link>
              <span>/</span>
              <span className="text-slate-300">Balance Audit</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black uppercase text-slate-100 tracking-wider flex items-center gap-2.5">
              <Database className="w-6 h-6 text-amber-500" />
              Squad Balance Diagnostics
            </h1>
          </div>
          
          <Link
            href="/dashboard/committee/database"
            className="px-3.5 py-1.5 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-xl transition-all text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 self-start sm:self-center"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Database
          </Link>
        </div>

        {/* Diagnostic Control Board */}
        <div className="console-card bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 shadow-xl relative overflow-hidden backdrop-blur-md">
          <div className="absolute top-0 right-0 p-3 bg-amber-500/10 text-amber-500 text-[10px] font-mono font-bold uppercase rounded-bl-2xl border-l border-b border-slate-800">
            System Utility
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <h2 className="text-sm font-extrabold uppercase text-slate-200 tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                Diagnostic Dashboard & Repair Engine
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed font-mono">
                This tool compares each team's actual allocated players (Postgres <code className="text-amber-400 bg-slate-950 px-1 py-0.5 rounded">footballplayers</code> squad table) against the cached spent amounts, budgets, and counts in Postgres <code className="text-amber-400 bg-slate-950 px-1 py-0.5 rounded">teams</code> and Firebase <code className="text-amber-400 bg-slate-950 px-1 py-0.5 rounded">team_seasons</code>. 
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={loadAudit}
                disabled={loading}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border border-slate-700"
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
                {syncingAll ? 'Correcting all...' : 'Correct & Sync All Teams'}
              </button>
            </div>
          </div>

          {/* Audit Alert Message */}
          {!loading && auditData.length > 0 && (
            <div className={`mt-6 p-4 rounded-2xl border flex items-center gap-3 font-mono text-xs ${
              mismatchCount > 0 
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-350' 
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            }`}>
              {mismatchCount > 0 ? (
                <>
                  <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 animate-pulse" />
                  <div>
                    <span className="font-extrabold uppercase">Audit Failed:</span> Found {mismatchCount} team(s) with balance, budget, or squad count cache mismatches. Recommended to click "Correct & Sync All Teams".
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div>
                    <span className="font-extrabold uppercase">Audit Passed:</span> All team caches are fully aligned and in sync with actual allocations.
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Audit Details Table */}
        <div className="console-card bg-slate-900/20 border border-slate-800/60 rounded-3xl overflow-hidden shadow-lg">
          <div className="px-6 py-4 bg-slate-900/60 border-b border-slate-800/60 flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-slate-300 tracking-wider">
              Diagnostic Table — Season {seasonId}
            </span>
            <span className="text-[10px] font-mono font-bold text-slate-500">
              BASE BUDGET: £10,000
            </span>
          </div>

          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
              <p className="font-mono text-xs uppercase tracking-wider">Executing Diagnostic Suite...</p>
            </div>
          ) : auditData.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-mono text-xs">
              No team data found for season {seasonId}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-950/40 font-mono font-extrabold text-[10px] text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3">Team Name</th>
                    <th className="px-4 py-3 text-center">Squad size (True/PG/FB)</th>
                    <th className="px-4 py-3 text-center">Spent Balance (True/PG/FB)</th>
                    <th className="px-4 py-3 text-center">Budget (True/PG/FB)</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {auditData.map((team) => {
                    const isExpanded = expandedTeamId === team.team_id;
                    const squadMismatch = (team.pg_squad_count !== team.pg_cached_count) || (team.pg_squad_count !== team.fb_count);
                    const spentMismatch = (team.pg_actual_spent !== team.pg_cached_spent) || (team.pg_actual_spent !== team.fb_spent);
                    const budgetMismatch = (team.expected_budget !== team.pg_budget) || (team.expected_budget !== team.fb_budget);

                    return (
                      <React.Fragment key={team.team_id}>
                        <tr className={`hover:bg-slate-800/10 transition-colors ${team.mismatch ? 'bg-rose-500/[0.02]' : ''}`}>
                          {/* Team Name */}
                          <td className="px-5 py-4 font-bold text-slate-200">
                            <button
                              onClick={() => toggleExpandTeam(team.team_id)}
                              className="flex items-center gap-1.5 text-left hover:text-amber-500 transition-colors cursor-pointer"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                              <span>{team.team_name}</span>
                            </button>
                          </td>

                          {/* Squad Size */}
                          <td className="px-4 py-4 text-center font-mono font-bold">
                            <span className={squadMismatch ? 'text-rose-500 font-black' : 'text-emerald-500'}>
                              {team.pg_squad_count}
                            </span>
                            <span className="text-slate-600 mx-1">/</span>
                            <span className={squadMismatch ? 'text-rose-450' : 'text-slate-400'}>
                              {team.pg_cached_count}
                            </span>
                            <span className="text-slate-600 mx-1">/</span>
                            <span className={squadMismatch ? 'text-rose-450' : 'text-slate-400'}>
                              {team.fb_count}
                            </span>
                            {squadMismatch && <span className="ml-1 text-rose-500" title="Mismatch detected">⚠️</span>}
                          </td>

                          {/* Spent Balance */}
                          <td className="px-4 py-4 text-center font-mono font-bold">
                            <span className={spentMismatch ? 'text-rose-500 font-black' : 'text-emerald-500'}>
                              £{team.pg_actual_spent.toLocaleString()}
                            </span>
                            <span className="text-slate-600 mx-1">/</span>
                            <span className={spentMismatch ? 'text-rose-450' : 'text-slate-400'}>
                              £{team.pg_cached_spent.toLocaleString()}
                            </span>
                            <span className="text-slate-600 mx-1">/</span>
                            <span className={spentMismatch ? 'text-rose-450' : 'text-slate-400'}>
                              £{team.fb_spent.toLocaleString()}
                            </span>
                            {spentMismatch && <span className="ml-1 text-rose-500" title="Mismatch detected">⚠️</span>}
                          </td>

                          {/* Budget */}
                          <td className="px-4 py-4 text-center font-mono font-bold">
                            <span className={budgetMismatch ? 'text-rose-500 font-black' : 'text-emerald-500'}>
                              £{team.expected_budget.toLocaleString()}
                            </span>
                            <span className="text-slate-600 mx-1">/</span>
                            <span className={budgetMismatch ? 'text-rose-450' : 'text-slate-400'}>
                              £{team.pg_budget.toLocaleString()}
                            </span>
                            <span className="text-slate-600 mx-1">/</span>
                            <span className={budgetMismatch ? 'text-rose-450' : 'text-slate-400'}>
                              £{team.fb_budget.toLocaleString()}
                            </span>
                            {budgetMismatch && <span className="ml-1 text-rose-500" title="Mismatch detected">⚠️</span>}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
                              team.mismatch
                                ? 'bg-rose-500/10 border-rose-550 text-rose-400 animate-pulse'
                                : 'bg-emerald-500/10 border-emerald-550 text-emerald-400'
                            }`}>
                              {team.mismatch ? 'Out of Sync' : 'In Sync'}
                            </span>
                          </td>

                          {/* Action */}
                          <td className="px-5 py-4 text-right">
                            <button
                              onClick={() => handleSyncTeam(team.team_id, team.team_name)}
                              disabled={syncingTeamId !== null || syncingAll}
                              className={`px-3 py-1.5 rounded-lg border font-bold text-[9px] uppercase tracking-wider transition-all cursor-pointer ${
                                team.mismatch
                                  ? 'bg-amber-500/10 hover:bg-amber-500 border-amber-500/30 text-amber-400 hover:text-slate-950 font-black'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
                              }`}
                            >
                              {syncingTeamId === team.team_id ? 'Syncing...' : 'Force Sync'}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Player Squad List */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} className="px-5 py-4 bg-slate-950/40 border-b border-slate-800/80">
                              <div className="max-w-3xl space-y-3 font-mono">
                                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-1.5 flex items-center gap-1.5">
                                  <Users className="w-3.5 h-3.5 text-amber-500" />
                                  True Postgres Squad List ({team.pg_squad_count} players)
                                </h4>
                                
                                {team.players.length === 0 ? (
                                  <p className="text-[10px] text-slate-500 italic">No players allocated to this team.</p>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5 text-[10px] text-slate-350">
                                    {team.players.map((p, idx) => (
                                      <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-900">
                                        <span className="font-bold truncate pr-2">{p.name}</span>
                                        <span className="shrink-0 font-bold text-slate-500 uppercase">
                                          {p.position} • <code className="text-amber-500 font-extrabold">£{p.value}</code>
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
        <div className="flex gap-3 p-5 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-amber-450/80 font-mono text-xs leading-relaxed max-w-4xl">
          <Info className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="space-y-1">
            <span className="font-extrabold uppercase text-amber-500">How Cache Drifts Happen:</span>
            <p>
              When rounds are finalized, players are allocated to rosters and purchase costs are deducted from team eCoin budgets. If the finalization process crashes mid-way, or is manually altered/reverted without database triggers, the cached counters on Postgres `teams` and Firestore `team_seasons` can fall out of alignment with the actual list of owned players. 
            </p>
            <p className="pt-1.5">
              Clicking <strong className="text-amber-400">Force Sync</strong> or <strong className="text-amber-400">Correct & Sync All Teams</strong> parses the raw player roster records, counts how many sold players each team holds, calculates the spent sum, and overwrites the cached values back to Postgres and Firebase, restoring 100% database alignment.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

// Inline import helper to prevent React Fragment build issue
import React from 'react';
