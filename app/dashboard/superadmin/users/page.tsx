'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { getAllUsers, updateUserRole, toggleUserStatus, deleteUser, approveUser, rejectUser } from '@/lib/firebase/auth';
import { User, UserRole } from '@/types/user';
import { 
  Users, 
  Shield, 
  Trash2, 
  UserCheck, 
  XCircle, 
  ArrowLeft, 
  CheckCircle2, 
  Mail, 
  Clock, 
  UserPlus, 
  UserMinus 
} from 'lucide-react';

function UsersManagementContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterParam = searchParams.get('filter');
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && user.role === 'super_admin') {
      fetchUsers();
    }
  }, [user]);

  // Handle filter param from URL
  useEffect(() => {
    if (filterParam === 'pending') {
      setFilter('pending');
    }
  }, [filterParam]);

  // Filter users based on selected filter
  useEffect(() => {
    let filtered = users;
    
    if (filter === 'pending') {
      filtered = users.filter(u => !u.isApproved);
    } else if (filter === 'approved') {
      filtered = users.filter(u => u.isApproved);
    }
    
    setFilteredUsers(filtered);
  }, [users, filter]);

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const allUsers = await getAllUsers();
      // Sort users: pending first, then by role, then by username
      const sortedUsers = allUsers.sort((a, b) => {
        if (!a.isActive && b.isActive) return -1;
        if (a.isActive && !b.isActive) return 1;
        if (a.role !== b.role) {
          const roleOrder = { super_admin: 0, committee_admin: 1, team: 2 };
          return roleOrder[a.role] - roleOrder[b.role];
        }
        // Handle undefined/null usernames
        const usernameA = a.username || '';
        const usernameB = b.username || '';
        return usernameA.localeCompare(usernameB);
      });
      setUsers(sortedUsers);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users');
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleApproveUser = async (uid: string) => {
    if (!user || !uid) return;
    if (!confirm('Are you sure you want to approve this user? They will be able to log in.')) return;
    
    try {
      await approveUser(uid, user.uid);
      alert('User approved successfully!');
      await fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to approve user');
    }
  };

  const handleRejectUser = async (uid: string, username: string) => {
    if (!uid) {
      alert('Invalid user ID');
      return;
    }
    if (!confirm(`Are you sure you want to reject and delete user "${username || 'Unknown User'}"? This action cannot be undone.`)) return;
    
    try {
      await rejectUser(uid);
      alert('User rejected and removed successfully.');
      await fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to reject user');
    }
  };

  const handlePromoteUser = async (uid: string) => {
    if (!uid) return;
    try {
      await updateUserRole(uid, 'committee_admin');
      await fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to promote user');
    }
  };

  const handleDemoteUser = async (uid: string) => {
    if (!uid) return;
    try {
      await updateUserRole(uid, 'team');
      await fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to demote user');
    }
  };

  const handleDeleteUser = async (uid: string, username: string) => {
    if (!uid) {
      alert('Invalid user ID');
      return;
    }
    const confirmed = confirm(
      `⚠️ PERMANENT DELETION WARNING\n\nThis will permanently delete:\n• User account: ${username || 'Unknown User'}\n• Associated team and all data\n• All bids and auction history\n• Player acquisitions\n\nThis action CANNOT be undone!\n\nAre you absolutely sure you want to proceed?`
    );
    
    if (!confirmed) return;
    
    try {
      await deleteUser(uid);
      await fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to delete user');
    }
  };

  const getRoleBadgeClasses = (role: UserRole) => {
    switch (role) {
      case 'super_admin':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'committee_admin':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default:
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
  };

  const getRoleIcon = (role: UserRole) => {
    if (role === 'super_admin') {
      return <Shield className="w-3.5 h-3.5 mr-1" />;
    } else if (role === 'committee_admin') {
      return <UserCheck className="w-3.5 h-3.5 mr-1" />;
    }
    return <Users className="w-3.5 h-3.5 mr-1" />;
  };

  if (loading || loadingUsers) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-100">
        <div className="text-center animate-pulse">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-slate-400 font-mono text-sm">Loading users...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="min-h-screen py-6 sm:py-10 px-4 sm:px-6 bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-100 animate-fade-in">
      <div className="container mx-auto max-w-screen-2xl">
        
        {/* Page Header */}
        <header className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6 border-b border-white/10 pb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard/superadmin')}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 transition-all duration-300 hover:scale-105"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent mb-2">
                User Management
              </h1>
              <p className="text-slate-400 text-sm font-mono">
                Manage user roles and permissions across the system
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center">
            <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shadow-inner">
              <Users className="w-8 h-8" />
            </div>
          </div>
        </header>

        {/* Error Message */}
        {error && (
          <div className="rounded-2xl p-4 mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-200 font-mono text-sm">
            <p>{error}</p>
          </div>
        )}

        {/* Users Table */}
        <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-xl">
          <div className="px-6 py-5 bg-white/5 border-b border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-400" />
                Active Directory
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wider uppercase transition-all ${
                    filter === 'all'
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                      : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  All ({users.length})
                </button>
                <button
                  onClick={() => setFilter('pending')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wider uppercase transition-all ${
                    filter === 'pending'
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25'
                      : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  Pending ({users.filter(u => !u.isApproved).length})
                </button>
                <button
                  onClick={() => setFilter('approved')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wider uppercase transition-all ${
                    filter === 'approved'
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                      : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  Approved ({users.filter(u => u.isApproved).length})
                </button>
              </div>
            </div>
          </div>

          {filteredUsers.length > 0 ? (
            <div className="divide-y divide-white/5">
              {filteredUsers.map((u, index) => (
                <div key={u.uid || `user-${index}`} className="px-6 py-5 hover:bg-white/5 transition-all duration-200 group">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center mb-3">
                        <div className="flex items-center space-x-3">
                          {/* User Avatar */}
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-inner animate-pulse">
                            <span className="text-indigo-400 font-black text-lg">
                              {u.username?.[0]?.toUpperCase() || '?'}
                            </span>
                          </div>

                          <div>
                            <h3 className="text-lg font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">
                              {u.username || 'Unknown User'}
                            </h3>
                            <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full border transition-all duration-200 ${getRoleBadgeClasses(u.role)}`}>
                              {getRoleIcon(u.role)}
                              {u.role?.replace('_', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || 'Unknown Role'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 font-mono">
                        {/* Approval Status */}
                        <div className="flex items-center">
                          <CheckCircle2 className="w-4 h-4 mr-2 text-slate-500" />
                          Status: <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${u.isApproved ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'}`}>
                            {u.isApproved ? 'Approved' : 'Pending Approval'}
                          </span>
                        </div>

                        {/* Email */}
                        {u.email && (
                          <div className="flex items-center">
                            <Mail className="w-4 h-4 mr-2 text-slate-500" />
                            {u.email}
                          </div>
                        )}

                        {/* Team Name for team role */}
                        {u.role === 'team' && 'teamName' in u && u.teamName && (
                          <div className="flex items-center">
                            <Shield className="w-4 h-4 mr-2 text-slate-500" />
                            Team: <span className="font-bold text-slate-300">{u.teamName}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {user.uid !== u.uid && (
                      <div className="flex flex-wrap items-center gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        {!u.isApproved ? (
                          // Pending Approval Actions
                          <>
                            <button
                              onClick={() => handleApproveUser(u.uid)}
                              className="inline-flex items-center px-4 py-2 border border-transparent text-xs font-bold rounded-xl text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 shadow-md hover:shadow-xl transform hover:-translate-y-0.5"
                            >
                              <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectUser(u.uid, u.username)}
                              className="inline-flex items-center px-4 py-2 border border-transparent text-xs font-bold rounded-xl text-white bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 transition-all duration-200 shadow-md hover:shadow-xl transform hover:-translate-y-0.5"
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1.5" />
                              Reject
                            </button>
                          </>
                        ) : (
                          // Approved User Actions
                          <>
                            {u.role === 'team' && (
                              <button
                                onClick={() => handlePromoteUser(u.uid)}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-xs font-bold rounded-xl text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 transition-all duration-200 shadow-md hover:shadow-xl transform hover:-translate-y-0.5"
                              >
                                <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                                Promote
                              </button>
                            )}
                            {u.role === 'committee_admin' && (
                              <button
                                onClick={() => handleDemoteUser(u.uid)}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-xs font-bold rounded-xl text-white bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 transition-all duration-200 shadow-md hover:shadow-xl transform hover:-translate-y-0.5"
                              >
                                <UserMinus className="w-3.5 h-3.5 mr-1.5" />
                                Demote
                              </button>
                            )}

                            {u.role !== 'super_admin' ? (
                              <button
                                onClick={() => handleDeleteUser(u.uid, u.username)}
                                className="inline-flex items-center px-3 py-2 border border-transparent text-xs font-bold rounded-xl text-white bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 transition-all duration-200 shadow-md hover:shadow-xl transform hover:-translate-y-0.5"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                Delete
                              </button>
                            ) : (
                              <div className="inline-flex items-center px-3 py-2 rounded-xl bg-indigo-500/10 text-indigo-400 text-xs font-bold border border-indigo-500/20">
                                <Shield className="w-3.5 h-3.5 mr-1.5" />
                                Protected
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-8 py-20 text-center animate-fade-in">
              <div className="max-w-sm mx-auto">
                <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center animate-pulse">
                  <Users className="w-10 h-10 text-indigo-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-200 mb-2">No Users Found</h3>
                <p className="text-slate-400 text-xs font-sans mb-6">There are currently no users matching the active filter settings.</p>
                <div className="inline-flex items-center px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold font-mono">
                  <Clock className="w-4 h-4 mr-2 text-indigo-400" />
                  Check back later
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UsersManagement() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-slate-400 font-mono text-sm">Loading users...</p>
        </div>
      </div>
    }>
      <UsersManagementContent />
    </Suspense>
  );
}
