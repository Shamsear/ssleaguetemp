'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  ShieldAlert, 
  Trash2, 
  Search, 
  Database, 
  AlertTriangle, 
  CheckCircle, 
  ArrowLeft, 
  Clock, 
  Activity, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw 
} from 'lucide-react';

interface PlayerUser {
  uid: string;
  email: string;
  displayName?: string;
  role: string;
  createdAt?: string;
  matchedBy?: string;
  allFields?: any;
}

export default function CleanupPlayerUsersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scanResults, setScanResults] = useState<any>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
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
      const response = await fetch('/api/admin/cleanup-player-users');
      const result = await response.json();

      if (result.success) {
        setScanResults(result.data);
      } else {
        setError(result.error || 'Failed to scan users');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to scan users');
    } finally {
      setScanning(false);
    }
  };

  const handleDelete = async (userIds?: string[]) => {
    const count = userIds ? userIds.length : scanResults?.player_users.length || 0;
    if (!confirm(`Are you sure you want to DELETE ${count} user account(s)? This will permanently remove them from Firebase Auth and the users collection. This CANNOT be undone!`)) {
      return;
    }

    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/admin/cleanup-player-users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          user_ids: userIds
        })
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(result.message);
        // Refresh scan results
        await handleScan();
        setSelectedUsers(new Set());
      } else {
        setError(result.error || 'Failed to delete users');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete users');
    } finally {
      setDeleting(false);
    }
  };

  const toggleUserSelection = (uid: string) => {
    const newSelection = new Set(selectedUsers);
    if (newSelection.has(uid)) {
      newSelection.delete(uid);
    } else {
      newSelection.add(uid);
    }
    setSelectedUsers(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === scanResults?.player_users.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(scanResults?.player_users.map((u: PlayerUser) => u.uid)));
    }
  };

  const toggleUserExpand = (uid: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(uid)) {
      newExpanded.delete(uid);
    } else {
      newExpanded.add(uid);
    }
    setExpandedUsers(newExpanded);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-100 animate-pulse">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-slate-400 font-mono text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="min-h-screen py-6 sm:py-10 px-4 sm:px-6 bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-100 animate-fade-in font-sans">
      <div className="container mx-auto max-w-7xl">
        
        {/* Page Header */}
        <header className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6 border-b border-white/10 pb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/superadmin"
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 transition-all duration-300 hover:scale-105"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shadow-inner hidden sm:flex">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent mb-2">
                  Account Cleanup
                </h1>
                <p className="text-slate-400 text-sm font-mono">Purge orphaned user credentials and resolve schema conflicts</p>
              </div>
            </div>
          </div>
        </header>

        {/* Warning Box */}
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-5 mb-6 animate-fade-in">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-rose-400 text-sm uppercase tracking-wider mb-2">⚠️ DANGER ZONE - Permanent Deletion</h3>
              <ul className="text-xs text-rose-300 space-y-1 font-mono leading-relaxed">
                <li>• This tool DELETES user accounts from Firebase Auth AND Firestore</li>
                <li>• Real players should NOT have user accounts - they don't need to log in</li>
                <li>• Only team owners, managers, and committee members need user accounts</li>
                <li>• Deletion is PERMANENT and CANNOT be undone</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-5 mb-8">
          <div className="flex items-start gap-3">
            <Database className="w-6 h-6 text-indigo-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-indigo-400 text-sm uppercase tracking-wider mb-2">Database Schema Context</h3>
              <ul className="text-xs text-indigo-300 space-y-1 font-mono leading-relaxed">
                <li>• Finds user accounts linked to real players via <code className="bg-white/5 px-1.5 py-0.5 rounded text-indigo-300 border border-white/5 font-semibold">registered_user_id</code></li>
                <li>• These are user accounts that were mistakenly created when registering real players</li>
                <li>• Real players should only exist in the <code className="bg-white/5 px-1.5 py-0.5 rounded text-indigo-300 border border-white/5 font-semibold">realplayers</code> collection, not <code className="bg-white/5 px-1.5 py-0.5 rounded text-indigo-300 border border-white/5 font-semibold">users</code></li>
                <li>• Deleting these accounts will NOT affect player stats or team rosters</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="rounded-2xl p-4 mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-200 font-mono text-sm">
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="rounded-2xl p-4 mb-6 bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 font-mono text-sm">
            <p>{success}</p>
          </div>
        )}

        {/* Scan Action */}
        <div className="mb-8">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-6 py-3.5 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white rounded-2xl transition-all duration-300 font-bold text-sm shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5 flex items-center gap-2"
          >
            {scanning ? (
              <>
                <RefreshCw className="animate-spin w-4 h-4" />
                Scanning System...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Scan User Accounts
              </>
            )}
          </button>
        </div>

        {/* Scan Results */}
        {scanResults && (
          <div className="space-y-8 animate-fade-in font-sans">
            {/* Summary Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 font-sans">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md shadow-md">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Users</div>
                <div className="text-3xl font-black text-slate-100">{scanResults.total_users}</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md shadow-md">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Player User Accounts</div>
                <div className="text-3xl font-black text-rose-400">{scanResults.player_users_count}</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md shadow-md">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Valid Users</div>
                <div className="text-3xl font-black text-emerald-400">
                  {scanResults.total_users - scanResults.player_users_count}
                </div>
              </div>
            </div>

            {scanResults.player_users_count > 0 && (
              <>
                {/* Bulk Actions Panel */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs font-bold uppercase tracking-wider text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      {selectedUsers.size === scanResults.player_users.length ? 'Deselect All' : 'Select All'}
                    </button>
                    {selectedUsers.size > 0 && (
                      <span className="text-xs text-slate-400 font-mono">
                        {selectedUsers.size} selected for purging
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {selectedUsers.size > 0 && (
                      <button
                        onClick={() => handleDelete(Array.from(selectedUsers))}
                        disabled={deleting}
                        className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-bold uppercase tracking-wider shadow-md transform hover:-translate-y-0.5"
                      >
                        {deleting ? 'Deleting...' : `Delete Selected (${selectedUsers.size})`}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete()}
                      disabled={deleting}
                      className="px-4 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-bold uppercase tracking-wider shadow-md transform hover:-translate-y-0.5"
                    >
                      {deleting ? 'Deleting...' : 'Delete All'}
                    </button>
                  </div>
                </div>

                {/* Users List Table */}
                <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-white/5">
                      <thead className="bg-white/5">
                        <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">
                          <th className="px-5 py-4 w-12">
                            <input
                              type="checkbox"
                              checked={selectedUsers.size === scanResults.player_users.length}
                              onChange={toggleSelectAll}
                              className="rounded border-white/10 bg-slate-900 text-indigo-600 focus:ring-indigo-500/20"
                            />
                          </th>
                          <th className="px-5 py-4">UID</th>
                          <th className="px-5 py-4">Email</th>
                          <th className="px-5 py-4">Display Name</th>
                          <th className="px-5 py-4">Role</th>
                          <th className="px-5 py-4">Matched By</th>
                          <th className="px-5 py-4">Created</th>
                          <th className="px-5 py-4 text-right">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {scanResults.player_users.map((playerUser: PlayerUser) => (
                          <>
                            <tr key={playerUser.uid} className="hover:bg-white/5 transition-all duration-200">
                              <td className="px-5 py-4">
                                <input
                                  type="checkbox"
                                  checked={selectedUsers.has(playerUser.uid)}
                                  onChange={() => toggleUserSelection(playerUser.uid)}
                                  className="rounded border-white/10 bg-slate-900 text-indigo-600 focus:ring-indigo-500/20"
                                />
                              </td>
                              <td className="px-5 py-4 text-xs font-mono text-slate-300">{playerUser.uid}</td>
                              <td className="px-5 py-4 text-xs text-slate-300 font-mono">{playerUser.email}</td>
                              <td className="px-5 py-4 text-xs text-slate-300 font-bold">{playerUser.displayName || '-'}</td>
                              <td className="px-5 py-4 text-xs">
                                <span className="px-2.5 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono">
                                  {playerUser.role}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-xs">
                                <span className="px-2.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono">
                                  {playerUser.matchedBy || 'uid'}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-xs text-slate-400 font-mono">
                                {playerUser.createdAt ? new Date(playerUser.createdAt).toLocaleDateString() : '-'}
                              </td>
                              <td className="px-5 py-4 text-xs text-right">
                                <button
                                  onClick={() => toggleUserExpand(playerUser.uid)}
                                  className="text-indigo-400 hover:text-indigo-300 font-bold transition-colors inline-flex items-center gap-1"
                                >
                                  {expandedUsers.has(playerUser.uid) ? (
                                    <>Hide <ChevronUp className="w-3.5 h-3.5" /></>
                                  ) : (
                                    <>Inspect <ChevronDown className="w-3.5 h-3.5" /></>
                                  )}
                                </button>
                              </td>
                            </tr>
                            {expandedUsers.has(playerUser.uid) && playerUser.allFields && (
                              <tr key={`${playerUser.uid}-details`} className="bg-slate-950/45">
                                <td colSpan={8} className="px-6 py-6 border-l-2 border-indigo-500/30">
                                  <div className="bg-slate-900 border border-white/10 rounded-2xl p-5 shadow-inner">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 font-mono flex items-center gap-1.5">
                                      <Activity className="w-4 h-4 text-indigo-400 animate-pulse" /> Document Payload Fields
                                    </h4>
                                    <pre className="text-xs bg-slate-950 p-4 rounded-xl border border-white/5 overflow-x-auto max-h-96 overflow-y-auto text-slate-300 font-mono scrollbar-thin">
                                      {JSON.stringify(playerUser.allFields, null, 2)}
                                    </pre>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {scanResults.player_users_count === 0 && (
              <div className="text-center py-20 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md">
                <div className="text-emerald-400 mb-5 animate-pulse">
                  <CheckCircle className="w-16 h-16 mx-auto" />
                </div>
                <h3 className="text-2xl font-black text-slate-200 mb-2">All Clean!</h3>
                <p className="text-slate-400 text-xs font-mono">No player user accounts found in the users database collection.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
