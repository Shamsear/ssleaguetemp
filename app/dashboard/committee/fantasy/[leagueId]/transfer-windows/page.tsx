'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Edit2, Trash2, Clock, CheckCircle, Lock, Unlock, Target } from 'lucide-react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

interface TransferWindow {
  window_id: string;
  window_name: string;
  opens_at: string;
  closes_at: string;
  is_active: boolean;
  status: 'upcoming' | 'active' | 'closed';
  start_round: number | null;
  end_round: number | null;
  window_type?: 'all' | 'release' | 'draft' | 'swap';
  max_releases?: number | null;
  max_swaps?: number | null;
}

// ── IST Timezone Helpers ──────────────────────────────────────────────────

/**
 * Convert ISO string or DB timestamp string to datetime-local input string in IST (Asia/Kolkata)
 */
function isoToIstInput(isoString: string): string {
  if (!isoString) return '';
  try {
    const str = isoString.includes('T') ? isoString : isoString.replace(' ', 'T');
    const zStr = str.endsWith('Z') || str.includes('+') ? str : str + 'Z';
    const date = new Date(zStr);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}`;
  } catch (e) {
    return '';
  }
}

/**
 * Convert datetime-local input value (e.g. "2026-09-08T18:00") entered as IST to UTC ISO string for DB storage
 */
function istInputToIso(inputString: string): string {
  if (!inputString) return '';
  try {
    const cleanInput = inputString.substring(0, 16);
    const istDateString = `${cleanInput}:00+05:30`;
    return new Date(istDateString).toISOString();
  } catch (e) {
    return new Date(inputString).toISOString();
  }
}

/**
 * Format ISO string or DB timestamp string into readable IST time (Asia/Kolkata)
 */
function formatInIst(isoString: string): string {
  if (!isoString) return 'N/A';
  try {
    const str = isoString.includes('T') ? isoString : isoString.replace(' ', 'T');
    const zStr = str.endsWith('Z') || str.includes('+') ? str : str + 'Z';
    return (
      new Date(zStr).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }) + ' IST'
    );
  } catch (e) {
    return new Date(isoString).toLocaleString() + ' IST';
  }
}

export default function TransferWindowsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [windows, setWindows] = useState<TransferWindow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Create state
  const [newWindowName, setNewWindowName] = useState('');
  const [newOpensAt, setNewOpensAt] = useState('');
  const [newClosesAt, setNewClosesAt] = useState('');
  const [newStartRound, setNewStartRound] = useState('');
  const [newEndRound, setNewEndRound] = useState('');
  const [newWindowType, setNewWindowType] = useState<'all' | 'release' | 'draft' | 'swap'>('all');
  const [newMaxReleases, setNewMaxReleases] = useState('1');
  const [newMaxSwaps, setNewMaxSwaps] = useState('1');

  // Edit modal state
  const [editingWindow, setEditingWindow] = useState<TransferWindow | null>(null);
  const [editName, setEditName] = useState('');
  const [editOpensAt, setEditOpensAt] = useState('');
  const [editClosesAt, setEditClosesAt] = useState('');
  const [editStartRound, setEditStartRound] = useState('');
  const [editEndRound, setEditEndRound] = useState('');
  const [editWindowType, setEditWindowType] = useState<'all' | 'release' | 'draft' | 'swap'>('all');
  const [editMaxReleases, setEditMaxReleases] = useState('1');
  const [editMaxSwaps, setEditMaxSwaps] = useState('1');

  useEffect(() => {
    if (user && leagueId) {
      loadWindows();
    }
  }, [user, leagueId]);

  const loadWindows = async () => {
    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/transfer-windows?league_id=${leagueId}`);
      if (!response.ok) throw new Error('Failed to load windows');

      const data = await response.json();
      setWindows(data.windows || []);
    } catch (error: any) {
      console.error('Error loading windows:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createWindow = async () => {
    if (!newWindowName || !newOpensAt || !newClosesAt) {
      alert('Please fill in Window Name, Opens At, and Closes At fields');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/transfer-windows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: leagueId,
          window_name: newWindowName,
          opens_at: istInputToIso(newOpensAt),
          closes_at: istInputToIso(newClosesAt),
          start_round: newStartRound ? parseInt(newStartRound) : null,
          end_round: newEndRound ? parseInt(newEndRound) : null,
          window_type: newWindowType,
          max_releases: newMaxReleases ? parseInt(newMaxReleases) : 1,
          max_swaps: newMaxSwaps ? parseInt(newMaxSwaps) : 1,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create window');
      }

      alert('Transfer window created successfully (IST time saved)!');
      setNewWindowName('');
      setNewOpensAt('');
      setNewClosesAt('');
      setNewStartRound('');
      setNewEndRound('');
      setNewWindowType('all');
      setNewMaxReleases('1');
      setNewMaxSwaps('1');
      loadWindows();
    } catch (error: any) {
      console.error('Error creating window:', error);
      alert(error instanceof Error ? error.message : 'Failed to create window');
    } finally {
      setIsCreating(false);
    }
  };

  const openEditModal = (window: TransferWindow) => {
    setEditingWindow(window);
    setEditName(window.window_name);
    setEditOpensAt(isoToIstInput(window.opens_at));
    setEditClosesAt(isoToIstInput(window.closes_at));
    setEditStartRound(window.start_round !== null ? String(window.start_round) : '');
    setEditEndRound(window.end_round !== null ? String(window.end_round) : '');
    setEditWindowType(window.window_type || 'all');
    setEditMaxReleases(window.max_releases !== undefined && window.max_releases !== null ? String(window.max_releases) : '1');
    setEditMaxSwaps(window.max_swaps !== undefined && window.max_swaps !== null ? String(window.max_swaps) : '1');
  };

  const saveEditWindow = async () => {
    if (!editingWindow || !editName || !editOpensAt || !editClosesAt) {
      alert('Please fill in required fields');
      return;
    }

    setIsUpdating(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/transfer-windows/${editingWindow.window_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          window_name: editName,
          opens_at: istInputToIso(editOpensAt),
          closes_at: istInputToIso(editClosesAt),
          start_round: editStartRound ? parseInt(editStartRound) : null,
          end_round: editEndRound ? parseInt(editEndRound) : null,
          window_type: editWindowType,
          max_releases: editMaxReleases ? parseInt(editMaxReleases) : 1,
          max_swaps: editMaxSwaps ? parseInt(editMaxSwaps) : 1,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update window');
      }

      alert('Transfer window updated successfully!');
      setEditingWindow(null);
      loadWindows();
    } catch (error: any) {
      console.error('Error updating window:', error);
      alert(error instanceof Error ? error.message : 'Failed to update window');
    } finally {
      setIsUpdating(false);
    }
  };

  const deleteWindow = async (windowId: string, windowName: string) => {
    if (!confirm(`Are you sure you want to delete "${windowName}"?`)) return;

    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/transfer-windows/${windowId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete window');
      }

      alert('Transfer window deleted');
      loadWindows();
    } catch (error: any) {
      console.error('Error deleting window:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete window');
    }
  };

  const toggleWindow = async (windowId: string) => {
    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/transfer-windows/${windowId}/toggle`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to toggle window');
      }

      loadWindows();
    } catch (error: any) {
      console.error('Error toggling window:', error);
      alert(error instanceof Error ? error.message : 'Failed to toggle window');
    }
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold">Loading transfer windows...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <AuthGuard requiredRole="committee_admin">
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
        <div className="max-w-5xl mx-auto relative z-10 space-y-6">
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
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">FANTASY CONSOLE</span>
                <span className="px-2 py-0.5 bg-amber-100 border border-amber-300 text-amber-800 text-[9px] font-black rounded-md">
                  IST TIMEZONE (UTC+5:30)
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1 uppercase">
                Transfer Windows
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Configure open/close times in IST, set round limits & allowed transfer types
              </p>
            </div>
            <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center text-amber-400 shadow-sm shrink-0">
              <Calendar className="w-8 h-8" />
            </div>
          </div>

          {/* Create Form */}
          <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
            <h2 className="text-xs font-black text-slate-850 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" /> Create New Transfer Window (IST)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mb-2">
                  Window Name
                </label>
                <input
                  type="text"
                  value={newWindowName}
                  onChange={(e) => setNewWindowName(e.target.value)}
                  placeholder="e.g., Round 7-11 Transfers"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none text-xs font-bold uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mb-2">
                  Allowed Transfer Types
                </label>
                <select
                  value={newWindowType}
                  onChange={(e) => setNewWindowType(e.target.value as any)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none text-xs font-bold uppercase cursor-pointer"
                >
                  <option value="all">⚡ All Types (Draft, Release, Swap)</option>
                  <option value="release">🚪 Release Player Only</option>
                  <option value="draft">🎯 Draft / Pick Only</option>
                  <option value="swap">🔁 Swap / Trade Only</option>
                </select>
              </div>

              {(newWindowType === 'all' || newWindowType === 'release') && (
                <div>
                  <label className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mb-2">
                    Max Releases Count
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newMaxReleases}
                    onChange={(e) => setNewMaxReleases(e.target.value)}
                    placeholder="e.g. 1"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400 outline-none text-xs font-bold uppercase"
                  />
                </div>
              )}

              {(newWindowType === 'all' || newWindowType === 'swap') && (
                <div>
                  <label className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mb-2">
                    Max Swaps Count
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newMaxSwaps}
                    onChange={(e) => setNewMaxSwaps(e.target.value)}
                    placeholder="e.g. 1"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400 outline-none text-xs font-bold uppercase"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mb-2">
                  Rounds Allowed (Start - End)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={newStartRound}
                    onChange={(e) => setNewStartRound(e.target.value)}
                    placeholder="Start (e.g. 7)"
                    className="w-1/2 px-3 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl outline-none text-xs font-bold uppercase"
                  />
                  <span className="text-slate-400 font-bold">-</span>
                  <input
                    type="number"
                    value={newEndRound}
                    onChange={(e) => setNewEndRound(e.target.value)}
                    placeholder="End (e.g. 11)"
                    className="w-1/2 px-3 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl outline-none text-xs font-bold uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Opens At (IST)</span>
                  <span className="text-[9px] text-amber-600 font-black">UTC+5:30</span>
                </label>
                <input
                  type="datetime-local"
                  value={newOpensAt}
                  onChange={(e) => setNewOpensAt(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none text-xs font-bold uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Closes At (IST)</span>
                  <span className="text-[9px] text-amber-600 font-black">UTC+5:30</span>
                </label>
                <input
                  type="datetime-local"
                  value={newClosesAt}
                  onChange={(e) => setNewClosesAt(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none text-xs font-bold uppercase"
                />
              </div>
            </div>

            <button
              onClick={createWindow}
              disabled={isCreating}
              className="w-full py-3 px-6 bg-slate-800 border border-slate-900 hover:bg-slate-700 text-amber-400 font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all disabled:opacity-50 cursor-pointer mt-2"
            >
              {isCreating ? 'Creating Window in IST...' : 'Create Transfer Window (IST)'}
            </button>
          </div>

          {/* Configured Windows List */}
          <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
            <h2 className="text-xs font-black text-slate-850 uppercase tracking-wider flex items-center justify-between">
              <span>Configured Windows ({windows.length})</span>
              <span className="text-[10px] text-slate-400 font-normal">All dates displayed in IST</span>
            </h2>

            {windows.length === 0 ? (
              <p className="text-center text-slate-400 py-12 text-xs font-bold uppercase italic">
                No transfer windows created yet
              </p>
            ) : (
              <div className="space-y-3">
                {windows.map((window) => {
                  const typeLabel =
                    window.window_type === 'release' ? 'RELEASE ONLY' :
                    window.window_type === 'draft' ? 'DRAFT ONLY' :
                    window.window_type === 'swap' ? 'SWAP ONLY' : 'ALL TYPES';

                  const typeColor =
                    window.window_type === 'release' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                    window.window_type === 'draft' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                    window.window_type === 'swap' ? 'bg-purple-50 border-purple-200 text-purple-700' :
                    'bg-blue-50 border-blue-200 text-blue-700';

                  return (
                    <div
                      key={window.window_id}
                      className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-2xl gap-4"
                    >
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-sm uppercase text-slate-900">{window.window_name}</h3>

                          {/* Status Badge */}
                          <span
                            className={`px-2.5 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-wider ${
                              window.is_active || window.status === 'active'
                                ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                : window.status === 'upcoming'
                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                : 'bg-slate-100 border-slate-200 text-slate-600'
                            }`}
                          >
                            {window.is_active ? '● ACTIVE (FORCED)' : window.status.toUpperCase()}
                          </span>

                          {/* Window Type Badge */}
                          <span className={`px-2.5 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-wider ${typeColor}`}>
                            {typeLabel}
                          </span>

                          {/* Max Release Count Badge */}
                          {(window.window_type === 'all' || window.window_type === 'release') && (
                            <span className="px-2 py-0.5 rounded-lg border border-rose-200 bg-rose-50/50 text-rose-800 text-[9px] font-bold uppercase">
                              Max Releases: {window.max_releases ?? 1}
                            </span>
                          )}

                          {/* Max Swap Count Badge */}
                          {(window.window_type === 'all' || window.window_type === 'swap') && (
                            <span className="px-2 py-0.5 rounded-lg border border-purple-200 bg-purple-50/50 text-purple-800 text-[9px] font-bold uppercase">
                              Max Swaps: {window.max_swaps ?? 1}
                            </span>
                          )}
                        </div>

                        {/* Details */}
                        <div className="text-[10px] font-bold text-slate-500 uppercase flex flex-wrap items-center gap-2">
                          <span>
                            Rounds: {window.start_round !== null && window.end_round !== null ? `${window.start_round}-${window.end_round}` : 'All'}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span>Opens: <strong className="text-slate-700">{formatInIst(window.opens_at)}</strong></span>
                          <span className="text-slate-300">•</span>
                          <span>Closes: <strong className="text-slate-700">{formatInIst(window.closes_at)}</strong></span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {/* Launch Post-Release Draft Shortcut */}
                        <button
                          onClick={() => {
                            if (window.is_active) {
                              alert('The Release Window is currently ACTIVE. Please Force Close the Release Window first before starting the Post-Release Draft!');
                              return;
                            }
                            router.push(`/dashboard/committee/fantasy/${leagueId}/draft/process?window_id=${window.window_id}`);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-black text-xs uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                        >
                          <Target className="w-3.5 h-3.5" /> Post-Release Draft
                        </button>

                        {/* Force Open / Close Toggle */}
                        <button
                          onClick={() => toggleWindow(window.window_id)}
                          className={`px-4 py-2 rounded-xl font-mono font-bold text-xs uppercase tracking-wider border cursor-pointer transition-all shadow-sm flex items-center gap-1.5 ${
                            window.is_active
                              ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {window.is_active ? (
                            <>
                              <Lock className="w-3.5 h-3.5" /> Force Close
                            </>
                          ) : (
                            <>
                              <Unlock className="w-3.5 h-3.5" /> Force Open
                            </>
                          )}
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => openEditModal(window)}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-900 font-mono font-bold text-xs uppercase tracking-wider cursor-pointer transition-all flex items-center gap-1"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Edit
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => deleteWindow(window.window_id, window.window_name)}
                          className="p-2 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 border border-slate-200 transition-all cursor-pointer"
                          title="Delete Window"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Edit Window Modal */}
          {editingWindow && (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md overflow-y-auto">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5 font-mono">
                <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                  <h3 className="font-extrabold text-sm uppercase text-slate-900 flex items-center gap-2">
                    <Edit2 className="w-4 h-4 text-amber-500" /> Edit Transfer Window
                  </h3>
                  <button
                    onClick={() => setEditingWindow(null)}
                    className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block text-[10px] text-slate-450 font-bold uppercase mb-1">
                      Window Name
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold uppercase outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-450 font-bold uppercase mb-1">
                      Allowed Transfer Type
                    </label>
                    <select
                      value={editWindowType}
                      onChange={(e) => setEditWindowType(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold uppercase outline-none cursor-pointer"
                    >
                      <option value="all">⚡ All Types (Draft, Release, Swap)</option>
                      <option value="release">🚪 Release Player Only</option>
                      <option value="draft">🎯 Draft / Pick Only</option>
                      <option value="swap">🔁 Swap / Trade Only</option>
                    </select>
                  </div>

                  {(editWindowType === 'all' || editWindowType === 'release') && (
                    <div>
                      <label className="block text-[10px] text-slate-450 font-bold uppercase mb-1">
                        Max Releases Count
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={editMaxReleases}
                        onChange={(e) => setEditMaxReleases(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-amber-400"
                      />
                    </div>
                  )}

                  {(editWindowType === 'all' || editWindowType === 'swap') && (
                    <div>
                      <label className="block text-[10px] text-slate-450 font-bold uppercase mb-1">
                        Max Swaps Count
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={editMaxSwaps}
                        onChange={(e) => setEditMaxSwaps(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-amber-400"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-450 font-bold uppercase mb-1">
                        Start Round
                      </label>
                      <input
                        type="number"
                        value={editStartRound}
                        onChange={(e) => setEditStartRound(e.target.value)}
                        placeholder="e.g. 7"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-450 font-bold uppercase mb-1">
                        End Round
                      </label>
                      <input
                        type="number"
                        value={editEndRound}
                        onChange={(e) => setEditEndRound(e.target.value)}
                        placeholder="e.g. 11"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-450 font-bold uppercase mb-1 flex items-center justify-between">
                      <span>Opens At (IST)</span>
                      <span className="text-[9px] text-amber-600 font-bold">UTC+5:30</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={editOpensAt}
                      onChange={(e) => setEditOpensAt(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-450 font-bold uppercase mb-1 flex items-center justify-between">
                      <span>Closes At (IST)</span>
                      <span className="text-[9px] text-amber-600 font-bold">UTC+5:30</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={editClosesAt}
                      onChange={(e) => setEditClosesAt(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-3">
                  <button
                    onClick={() => setEditingWindow(null)}
                    className="w-1/2 py-2.5 rounded-xl border border-slate-200 font-bold text-xs uppercase hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEditWindow}
                    disabled={isUpdating}
                    className="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs uppercase rounded-xl border border-slate-900 cursor-pointer disabled:opacity-50"
                  >
                    {isUpdating ? 'Saving...' : 'Save Changes (IST)'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="console-card bg-slate-50 border border-slate-200/60 p-5 rounded-3xl shadow-sm text-slate-800 space-y-2">
            <h4 className="font-bold text-slate-905 text-xs uppercase tracking-wider">How Transfer Windows Work:</h4>
            <ul className="text-[10px] uppercase font-bold text-slate-500 space-y-1 ml-1">
              <li>• All dates are set, created, edited, and displayed in <strong>IST (UTC+5:30)</strong>.</li>
              <li>• <strong>Force Open</strong> allows opening a window anytime regardless of the scheduled dates.</li>
              <li>• <strong>Allowed Transfer Types</strong> let you restrict a window to <em>Release Only</em>, <em>Draft Only</em>, <em>Swap Only</em>, or <em>All Types</em>.</li>
              <li>• Edit existing windows to update dates, round ranges, or allowed transfer types anytime.</li>
            </ul>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}