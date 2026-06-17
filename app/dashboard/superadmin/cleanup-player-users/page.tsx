'use client';

import React from 'react';
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
  Activity, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw,
  Info,
  UserX,
  FileCode
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
      <div className="flex items-center justify-center pt-32 font-mono">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-550 font-mono text-xs tracking-widest uppercase animate-pulse">Initializing Maintenance Console...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="space-y-6 animate-fade-in font-mono text-slate-800">
      
      {/* Page Header */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/superadmin"
              className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-600 hover:text-slate-950 transition-all flex-shrink-0 shadow-sm"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Account Maintenance
              </h1>
              <p className="text-xs text-slate-500 font-mono mt-1">
                Purge orphaned user logins and reconcile mismatched schema roles.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleScan}
              disabled={scanning}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
            >
              {scanning ? (
                <>
                  <RefreshCw className="animate-spin w-4 h-4" />
                  Running Clean Scan...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Scan User Accounts
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Notices Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Warning Banner */}
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 flex gap-4 text-rose-700">
          <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h3 className="text-xs font-mono font-bold text-rose-800 uppercase tracking-wider">⚠️ Critical Warning: Irreversible Deletion</h3>
            <ul className="text-[11px] text-rose-600/90 space-y-1 font-mono leading-relaxed">
              <li>• Purges records from Firebase Authentication registry and Firestore collection.</li>
              <li>• Real players do not require dashboard logins (handled by committee admins).</li>
              <li>• Team owners, managers, and committee staff accounts are preserved.</li>
              <li>• Verify names and payload values carefully before clicking delete.</li>
            </ul>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-slate-55 border border-slate-200/60 rounded-3xl p-5 flex gap-4 text-slate-700">
          <Database className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h3 className="text-xs font-mono font-bold text-slate-800 uppercase tracking-wider">Information: Database Integrity</h3>
            <ul className="text-[11px] text-slate-600 space-y-1 font-mono leading-relaxed">
              <li>• Identifies accounts linked to physical players using the <code className="bg-slate-200/60 px-1 py-0.2 rounded text-slate-800">registered_user_id</code> field.</li>
              <li>• Mismatches typically occur during erroneous team roster updates.</li>
              <li>• Purging redundant logins will NOT damage active matchday ratings.</li>
            </ul>
          </div>
        </div>

      </div>

      {/* Status Messages */}
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

      {/* Scan Results Panel */}
      {scanResults && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Stats Summary Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
              <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Total Database Profiles</div>
              <div className="text-2xl font-extrabold text-slate-800 mt-1 font-mono">{scanResults.total_users}</div>
            </div>
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
              <div className="text-[10px] font-mono font-bold text-rose-600 uppercase tracking-wider">Orphaned Player Accounts</div>
              <div className="text-2xl font-extrabold text-rose-600 mt-1 font-mono">{scanResults.player_users_count}</div>
            </div>
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
              <div className="text-[10px] font-mono font-bold text-emerald-600 uppercase tracking-wider">Valid Console Users</div>
              <div className="text-2xl font-extrabold text-emerald-600 mt-1 font-mono">
                {scanResults.total_users - scanResults.player_users_count}
              </div>
            </div>
          </div>

          {scanResults.player_users_count > 0 && (
            <div className="space-y-4">
              
              {/* Bulk Actions Panel */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50 border border-slate-200/60 rounded-2xl p-5">
                <div className="flex items-center gap-4">
                  <button
                    onClick={toggleSelectAll}
                    className="text-xs font-mono font-bold uppercase tracking-wider text-slate-600 hover:text-slate-800 transition-colors"
                  >
                    {selectedUsers.size === scanResults.player_users.length ? 'Deselect All' : 'Select All'}
                  </button>
                  {selectedUsers.size > 0 && (
                    <span className="text-xs text-slate-500 font-mono">
                      [{selectedUsers.size}] designated for deletion
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {selectedUsers.size > 0 && (
                    <button
                      onClick={() => handleDelete(Array.from(selectedUsers))}
                      disabled={deleting}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl transition-all text-xs font-mono font-bold uppercase tracking-wider shadow-sm flex items-center gap-1.5"
                    >
                      <UserX className="w-4 h-4" />
                      Delete Selected ({selectedUsers.size})
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete()}
                    disabled={deleting}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl transition-all text-xs font-mono font-bold uppercase tracking-wider shadow-sm flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete All ({scanResults.player_users.length})
                  </button>
                </div>
              </div>

              {/* Users List Table */}
              <div className="console-card bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-xs font-bold text-slate-650 uppercase tracking-wider font-mono">
                        <th className="px-6 py-4 w-12">
                          <input
                            type="checkbox"
                            checked={selectedUsers.size === scanResults.player_users.length}
                            onChange={toggleSelectAll}
                            className="rounded border-slate-200 bg-slate-50 text-slate-800 focus:ring-amber-400/20"
                          />
                        </th>
                        <th className="px-6 py-4">UID</th>
                        <th className="px-6 py-4">Email</th>
                        <th className="px-6 py-4">Profile Name</th>
                        <th className="px-6 py-4">Assigned Role</th>
                        <th className="px-6 py-4">Created Date</th>
                        <th className="px-6 py-4 text-right">Raw Payload</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {scanResults.player_users.map((playerUser: PlayerUser) => (
                        <React.Fragment key={playerUser.uid}>
                          <tr className="hover:bg-slate-55/40 transition-all duration-200">
                            <td className="px-6 py-4">
                              <input
                                type="checkbox"
                                checked={selectedUsers.has(playerUser.uid)}
                                onChange={() => toggleUserSelection(playerUser.uid)}
                                className="rounded border-slate-200 bg-slate-50 text-slate-800 focus:ring-amber-400/20"
                              />
                            </td>
                            <td className="px-6 py-4 text-xs font-mono text-slate-600">
                              {playerUser.uid}
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-600 font-mono">
                              {playerUser.email}
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-800 font-bold">
                              {playerUser.displayName || <span className="text-slate-400 font-mono italic">None</span>}
                            </td>
                            <td className="px-6 py-4 text-xs">
                              <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded font-mono text-[10px] font-bold uppercase">
                                {playerUser.role}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500 font-mono">
                              {playerUser.createdAt ? new Date(playerUser.createdAt).toLocaleDateString() : '-'}
                            </td>
                            <td className="px-6 py-4 text-xs text-right">
                              <button
                                onClick={() => toggleUserExpand(playerUser.uid)}
                                className="text-slate-500 hover:text-slate-850 font-mono text-xs font-bold transition-colors inline-flex items-center gap-1"
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
                            <tr className="bg-slate-50/50">
                              <td colSpan={7} className="px-6 py-4 border-l-2 border-amber-500/35">
                                <div className="console-card bg-white border border-slate-200/60 rounded-xl p-4 shadow-inner space-y-3">
                                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                                    <FileCode className="w-4 h-4 text-slate-400" />
                                    Firestore Document Properties
                                  </div>
                                  <pre className="text-xs bg-slate-50 p-4 rounded-xl border border-slate-200/60 overflow-x-auto max-h-96 text-slate-700 font-mono select-all shadow-inner">
                                    {JSON.stringify(playerUser.allFields, null, 2)}
                                  </pre>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {scanResults.player_users_count === 0 && (
            <div className="text-center py-20 console-card bg-white border border-slate-200/60 rounded-3xl shadow-sm">
              <div className="text-emerald-500 mb-5 animate-pulse">
                <CheckCircle className="w-16 h-16 mx-auto" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">No maintenance actions required</h3>
              <p className="text-slate-500 text-xs font-mono">
                Database users list matches auth registries perfectly.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
