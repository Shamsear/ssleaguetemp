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
  UserMinus,
  Search,
  Sparkles,
  ShieldAlert,
  Key,
  ShieldCheck,
  Check,
  UserX
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
  const [searchQuery, setSearchQuery] = useState('');

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

  // Filter users based on selected filter and search query
  useEffect(() => {
    let filtered = users;
    
    if (filter === 'pending') {
      filtered = users.filter(u => !u.isApproved);
    } else if (filter === 'approved') {
      filtered = users.filter(u => u.isApproved);
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(u => 
        (u.username || '').toLowerCase().includes(q) || 
        (u.email || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q) ||
        (u.role === 'team' && 'teamName' in u && (u.teamName || '').toLowerCase().includes(q))
      );
    }
    
    setFilteredUsers(filtered);
  }, [users, filter, searchQuery]);

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
        return 'bg-rose-50 text-rose-700 border-rose-200/60';
      case 'committee_admin':
        return 'bg-amber-50 text-amber-700 border-amber-200/60';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200/60';
    }
  };

  const getRoleIcon = (role: UserRole) => {
    if (role === 'super_admin') {
      return <Shield className="w-3.5 h-3.5 mr-1 text-rose-600" />;
    } else if (role === 'committee_admin') {
      return <ShieldCheck className="w-3.5 h-3.5 mr-1 text-amber-600" />;
    }
    return <Users className="w-3.5 h-3.5 mr-1 text-slate-600" />;
  };

  if (loading || loadingUsers) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono text-slate-800">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Initializing Directory...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="space-y-8 animate-fade-in font-mono">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/60">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/superadmin')}
            className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-all flex-shrink-0 shadow-sm"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-850 uppercase tracking-wider">
              User Directory & Roles
            </h1>
            <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
              Approve pending requests, promote committee administrators, and audit profiles.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white border border-slate-200/60 text-slate-700 text-xs font-mono font-bold shadow-sm">
            <Users className="w-4 h-4 text-amber-500" />
            {users.length} Registered Accounts
          </span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="console-card bg-white border border-rose-200/60 rounded-2xl p-4 text-rose-700 font-mono text-xs flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Controls: Filters + Search */}
      <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'all', label: `All Users (${users.length})` },
            { id: 'pending', label: `Pending Approval (${users.filter(u => !u.isApproved).length})` },
            { id: 'approved', label: `Approved (${users.filter(u => u.isApproved).length})` }
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setFilter(btn.id as any)}
              className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all border ${
                filter === btn.id
                  ? 'bg-slate-800 text-white shadow-sm border-slate-900 font-extrabold'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/60'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="relative max-w-md w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Filter by name, email, role or team..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/20 text-xs font-bold transition-all placeholder-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-700 font-mono"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Directory Listing */}
      <div className="console-card bg-white border border-slate-200/60 shadow-sm rounded-3xl overflow-hidden">
        {filteredUsers.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {filteredUsers.map((u, index) => (
              <div 
                key={u.uid || `user-${index}`} 
                className="px-6 py-5 hover:bg-slate-50/40 transition-all duration-200 group flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  {/* User Avatar */}
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200/60 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <span className="text-slate-700 font-extrabold text-lg font-mono">
                      {u.username?.[0]?.toUpperCase() || '?'}
                    </span>
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-base font-bold text-slate-900 truncate">
                        {u.username || 'Anonymous User'}
                      </h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${getRoleBadgeClasses(u.role)}`}>
                        {getRoleIcon(u.role)}
                        {u.role?.replace('_', ' ').toUpperCase() || 'UNKNOWN ROLE'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 font-mono">
                      {/* Approval status badge */}
                      <div className="flex items-center gap-1.5">
                         <Clock className="w-3.5 h-3.5 text-slate-400" />
                         <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase ${
                           u.isApproved 
                             ? 'text-emerald-600' 
                             : 'text-amber-600 animate-pulse'
                         }`}>
                           <span className={`w-1.5 h-1.5 rounded-full ${u.isApproved ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                           {u.isApproved ? 'Approved' : 'Pending Authorization'}
                         </span>
                      </div>

                      {/* Email address */}
                      {u.email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate">{u.email}</span>
                        </div>
                      )}

                      {/* Team name association */}
                      {u.role === 'team' && 'teamName' in u && u.teamName && (
                        <div className="flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-slate-400" />
                          <span>Team: <strong className="text-amber-600 font-semibold">{u.teamName}</strong></span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions (Always visible for clarity/accessibility) */}
                {user.uid !== u.uid && (
                  <div className="flex flex-wrap items-center gap-2">
                    {!u.isApproved ? (
                      <>
                        <button
                          onClick={() => handleApproveUser(u.uid)}
                          className="inline-flex items-center gap-1 px-4 py-2 border border-emerald-250 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-mono font-bold rounded-xl transition-all shadow-sm cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectUser(u.uid, u.username)}
                          className="inline-flex items-center gap-1 px-4 py-2 border border-rose-250 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-mono font-bold rounded-xl transition-all shadow-sm cursor-pointer"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </>
                    ) : (
                      <>
                        {u.role === 'team' && (
                          <button
                            onClick={() => handlePromoteUser(u.uid)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-mono font-semibold rounded-xl transition-all shadow-sm cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Promote to Comm.
                          </button>
                        )}
                        {u.role === 'committee_admin' && (
                          <button
                            onClick={() => handleDemoteUser(u.uid)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-rose-700 text-xs font-mono font-semibold rounded-xl transition-all cursor-pointer"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                            Demote to Team
                          </button>
                        )}

                        {u.role !== 'super_admin' ? (
                          <button
                            onClick={() => handleDeleteUser(u.uid, u.username)}
                            className="p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200/60 text-rose-600 hover:text-rose-700 transition-all cursor-pointer"
                            title="Delete Account"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-xs font-mono font-bold">
                            <Shield className="w-3.5 h-3.5" />
                            System Owner
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-8 py-20 text-center bg-slate-50/50">
            <div className="max-w-sm mx-auto space-y-4">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-white border border-slate-200/60 flex items-center justify-center shadow-sm">
                <Users className="w-8 h-8 text-slate-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">No matching accounts</h3>
                <p className="text-xs text-slate-500 font-mono mt-1 uppercase">
                  Try adjusting the search query or applying a different filter.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function UsersManagement() {
  return (
    <Suspense fallback={
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono text-slate-800">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">LOADING DIRECTORY...</p>
        </div>
      </div>
    }>
      <UsersManagementContent />
    </Suspense>
  );
}
