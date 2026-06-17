'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Database, 
  Search, 
  RefreshCw, 
  Trash2, 
  UserX, 
  CheckCircle, 
  AlertTriangle, 
  FileCode 
} from 'lucide-react';

interface PlayerIssue {
  player_id: string;
  name: string;
  unnecessary_fields: string[];
  field_values: { [key: string]: any };
}

export default function CleanupRealPlayersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [scanResults, setScanResults] = useState<any>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    setScanResults(null);

    try {
      const response = await fetch('/api/admin/cleanup-realplayers');
      const result = await response.json();

      if (result.success) {
        setScanResults(result.data);
      } else {
        setError(result.error || 'Failed to scan players');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to scan players');
    } finally {
      setScanning(false);
    }
  };

  const handleCleanup = async (playerIds?: string[]) => {
    if (!confirm(`Are you sure you want to remove unnecessary fields from ${playerIds ? playerIds.length : 'all'} players? This cannot be undone.`)) {
      return;
    }

    setCleaning(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/admin/cleanup-realplayers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          player_ids: playerIds
        })
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(result.message);
        // Refresh scan results
        await handleScan();
        setSelectedPlayers(new Set());
      } else {
        setError(result.error || 'Failed to clean up players');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to clean up players');
    } finally {
      setCleaning(false);
    }
  };

  const togglePlayerSelection = (playerId: string) => {
    const newSelection = new Set(selectedPlayers);
    if (newSelection.has(playerId)) {
      newSelection.delete(playerId);
    } else {
      newSelection.add(playerId);
    }
    setSelectedPlayers(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedPlayers.size === scanResults?.players.length) {
      setSelectedPlayers(new Set());
    } else {
      setSelectedPlayers(new Set(scanResults?.players.map((p: PlayerIssue) => p.player_id)));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center pt-32 font-mono">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-550 font-mono text-xs tracking-widest uppercase animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="space-y-6 animate-fade-in font-mono text-slate-800">
      
      {/* Header */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link 
              href="/dashboard/superadmin" 
              className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-650 hover:text-slate-950 transition-all flex-shrink-0 shadow-sm"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Cleanup Real Players</h1>
              <p className="text-sm text-slate-500 mt-1 font-mono">
                Remove unnecessary user fields from real player documents
              </p>
            </div>
          </div>
          <div>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
            >
              {scanning ? (
                <>
                  <RefreshCw className="animate-spin w-4 h-4" />
                  Scanning...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Scan Real Players
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-slate-50 border border-slate-200/60 rounded-3xl p-5 flex gap-4 text-slate-700">
        <Database className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-2">
          <h3 className="text-xs font-mono font-bold text-slate-850 uppercase tracking-wider mb-2">What this tool does:</h3>
          <ul className="text-[11px] text-slate-600 space-y-1 font-mono leading-relaxed">
            <li>• Scans all real players for unnecessary fields: <code className="bg-slate-200/60 px-1 rounded text-slate-800">user_id</code>, <code className="bg-slate-200/60 px-1 rounded text-slate-800">registered_user_id</code>, <code className="bg-slate-200/60 px-1 rounded text-slate-800">isActive</code>, <code className="bg-slate-200/60 px-1 rounded text-slate-800">createdAt</code>, <code className="bg-slate-200/60 px-1 rounded text-slate-800">updatedAt</code></li>
            <li>• These fields are from the users collection and don't belong on real players.</li>
            <li>• Removing them won't affect any functionality (player stats, team rosters remain intact).</li>
          </ul>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="rounded-2xl p-4 bg-rose-50 border border-rose-250 text-rose-700 font-mono text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0" />
          <p className="font-semibold">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-2xl p-4 bg-emerald-50 border border-emerald-250 text-emerald-700 font-mono text-xs flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          <p className="font-semibold">{success}</p>
        </div>
      )}

      {/* Scan Results */}
      {scanResults && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
              <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Total Players</div>
              <div className="text-2xl font-bold text-slate-800 mt-1">{scanResults.total_players}</div>
            </div>
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
              <div className="text-[10px] font-mono font-bold text-rose-600 uppercase tracking-wider">Players with Issues</div>
              <div className="text-2xl font-bold text-rose-650 mt-1">{scanResults.players_with_issues}</div>
            </div>
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
              <div className="text-[10px] font-mono font-bold text-emerald-600 uppercase tracking-wider">Clean Players</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1">
                {scanResults.total_players - scanResults.players_with_issues}
              </div>
            </div>
          </div>

          {scanResults.players_with_issues > 0 && (
            <>
              <div className="console-card bg-slate-50 border border-slate-200/60 rounded-2xl p-5 shadow-sm">
                <h3 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-3">Field Occurrences:</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {Object.entries(scanResults.field_counts).map(([field, count]: [string, any]) => (
                    <div key={field} className="text-xs font-mono text-slate-600">
                      <code className="bg-slate-200/60 px-2 py-1 rounded text-slate-800">{field}</code>
                      <span className="ml-2 text-slate-500 font-bold">({count})</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bulk Actions */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200/60 rounded-2xl p-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={toggleSelectAll}
                    className="text-xs font-mono font-bold uppercase tracking-wider text-slate-600 hover:text-slate-800 transition-colors"
                  >
                    {selectedPlayers.size === scanResults.players.length ? 'Deselect All' : 'Select All'}
                  </button>
                  {selectedPlayers.size > 0 && (
                    <span className="text-xs text-slate-500 font-mono">
                      [{selectedPlayers.size}] selected
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {selectedPlayers.size > 0 && (
                    <button
                      onClick={() => handleCleanup(Array.from(selectedPlayers))}
                      disabled={cleaning}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all text-xs font-mono font-bold uppercase tracking-wider shadow-sm disabled:opacity-50"
                    >
                      {cleaning ? 'Cleaning...' : `Clean Selected (${selectedPlayers.size})`}
                    </button>
                  )}
                  <button
                    onClick={() => handleCleanup()}
                    disabled={cleaning}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-all text-xs font-mono font-bold uppercase tracking-wider shadow-sm disabled:opacity-50"
                  >
                    {cleaning ? 'Cleaning...' : 'Clean All'}
                  </button>
                </div>
              </div>

              {/* Players List */}
              <div className="console-card bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-xs font-bold text-slate-650 uppercase tracking-wider font-mono">
                        <th className="px-6 py-4 w-12">
                          <input
                            type="checkbox"
                            checked={selectedPlayers.size === scanResults.players.length}
                            onChange={toggleSelectAll}
                            className="rounded border-slate-200 bg-slate-50 text-slate-800 focus:ring-amber-400/20"
                          />
                        </th>
                        <th className="px-6 py-4">Player ID</th>
                        <th className="px-6 py-4">Name</th>
                        <th className="px-6 py-4">Unnecessary Fields</th>
                        <th className="px-6 py-4">Values</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {scanResults.players.map((player: PlayerIssue) => (
                        <tr key={player.player_id} className="hover:bg-slate-55/40 transition-all duration-200">
                          <td className="px-6 py-4">
                            <input
                              type="checkbox"
                              checked={selectedPlayers.has(player.player_id)}
                              onChange={() => togglePlayerSelection(player.player_id)}
                              className="rounded border-slate-200 bg-slate-50 text-slate-800 focus:ring-amber-400/20"
                            />
                          </td>
                          <td className="px-6 py-4 text-xs font-mono text-slate-850 font-bold">{player.player_id}</td>
                          <td className="px-6 py-4 text-xs text-slate-700 font-bold">{player.name}</td>
                          <td className="px-6 py-4 text-xs">
                            <div className="flex flex-wrap gap-1">
                              {player.unnecessary_fields.map(field => (
                                <code key={field} className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase">
                                  {field}
                                </code>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs">
                            <details className="cursor-pointer">
                              <summary className="text-slate-500 hover:text-slate-850 font-mono text-xs font-bold transition-colors inline-flex items-center gap-1">View values</summary>
                              <pre className="mt-2 text-xs bg-slate-55 p-4 rounded-xl border border-slate-200/60 overflow-x-auto text-slate-700 font-mono select-all shadow-inner">
                                {JSON.stringify(player.field_values, null, 2)}
                              </pre>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {scanResults.players_with_issues === 0 && (
            <div className="text-center py-20 console-card bg-white border border-slate-200/60 rounded-3xl shadow-sm">
              <div className="text-emerald-500 mb-5 animate-pulse">
                <CheckCircle className="w-16 h-16 mx-auto" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">All Clean!</h3>
              <p className="text-slate-500 text-xs font-mono">No real players have unnecessary fields.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
