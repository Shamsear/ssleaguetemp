'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getPendingUsers } from '@/lib/firebase/auth';
import { getPendingResetRequests } from '@/lib/firebase/passwordResetRequests';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { 
  Users, 
  Key, 
  Shield, 
  Activity, 
  ArrowRight, 
  KeyRound, 
  MailOpen, 
  ShieldAlert, 
  Calendar, 
  Settings, 
  PlusCircle, 
  History, 
  Database, 
  UserCheck, 
  Image, 
  Edit, 
  Award, 
  ListOrdered, 
  BarChart3 
} from 'lucide-react';

export default function SuperAdminDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [pendingUsers, setPendingUsers] = useState(0);
  const [pendingResets, setPendingResets] = useState(0);
  const [loadingPending, setLoadingPending] = useState(true);
  const [activeSeason, setActiveSeason] = useState<any>(null);
  const [teamsCount, setTeamsCount] = useState(0);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchPendingItems = async () => {
      if (!user || user.role !== 'super_admin') return;
      
      try {
        setLoadingPending(true);
        const [users, resets] = await Promise.all([
          getPendingUsers(),
          getPendingResetRequests()
        ]);
        setPendingUsers(users.length);
        setPendingResets(resets.length);
      } catch (error) {
        console.error('Error fetching pending items:', error);
      } finally {
        setLoadingPending(false);
      }
    };

    fetchPendingItems();
  }, [user]);

  useEffect(() => {
    const fetchActiveSeason = async () => {
      if (!user || user.role !== 'super_admin') return;
      
      try {
        // Fetch active season
        const seasonRes = await fetchWithTokenRefresh('/api/seasons/active');
        if (seasonRes.ok) {
          const seasonData = await seasonRes.json();
          if (seasonData.season) {
            setActiveSeason(seasonData.season);
            
            // Fetch teams count for active season
            const teamsRes = await fetchWithTokenRefresh(`/api/teams?seasonId=${seasonData.season.id}`);
            if (teamsRes.ok) {
              const teamsData = await teamsRes.json();
              setTeamsCount(teamsData.teams?.length || 0);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching active season:', error);
      }
    };

    fetchActiveSeason();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0066FF] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="min-h-screen py-6 sm:py-10 px-4 sm:px-6 bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-100">
      <div className="container mx-auto max-w-screen-2xl">
        
        {/* Header Section */}
        <header className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6 border-b border-white/10 pb-8">
          <div>
            <h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent mb-2">
              Super Admin Console
            </h1>
            <p className="text-slate-400 text-sm md:text-base font-mono">
              System-wide parameters, user roles, database cleanup & seasons setup
            </p>
          </div>
          
          {/* Active Season Info Card */}
          <div className="relative group overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-5 backdrop-blur-md min-w-[240px] shadow-lg">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Active Season Context
              </div>
              {activeSeason ? (
                <>
                  <div className="font-extrabold text-xl text-blue-400">{activeSeason.name || activeSeason.short_name || 'Active Season'}</div>
                  <div className="text-xs text-slate-400 mt-1 font-mono">
                    {teamsCount} {teamsCount === 1 ? 'Team' : 'Teams'} Registered
                  </div>
                </>
              ) : (
                <>
                  <div className="font-extrabold text-lg text-slate-500">No Active Season</div>
                  <div className="text-xs text-slate-400 mt-1 font-mono">
                    System is awaiting season setup
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Stats & Quick Metrics Overview */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {/* User approvals */}
          <div className="relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-5 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-300">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">User Approvals</p>
                <h3 className="text-3xl font-black text-slate-100">{pendingUsers}</h3>
              </div>
              <div className={`p-3 rounded-xl ${pendingUsers > 0 ? 'bg-amber-500/20 text-amber-400 animate-pulse' : 'bg-white/5 text-slate-400'}`}>
                <Users className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-mono">Awaiting verification</span>
              {pendingUsers > 0 && (
                <button 
                  onClick={() => router.push('/dashboard/superadmin/users?filter=pending')}
                  className="text-xs text-amber-400 font-bold hover:underline flex items-center gap-1"
                >
                  Manage <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Password resets */}
          <div className="relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-5 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-300">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Password Resets</p>
                <h3 className="text-3xl font-black text-slate-100">{pendingResets}</h3>
              </div>
              <div className={`p-3 rounded-xl ${pendingResets > 0 ? 'bg-rose-500/20 text-rose-400 animate-pulse' : 'bg-white/5 text-slate-400'}`}>
                <Key className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-mono">Pending verification</span>
              {pendingResets > 0 && (
                <button 
                  onClick={() => router.push('/dashboard/superadmin/password-requests')}
                  className="text-xs text-rose-400 font-bold hover:underline flex items-center gap-1"
                >
                  Manage <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Total teams */}
          <div className="relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-5 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-300">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Teams Enrolled</p>
                <h3 className="text-3xl font-black text-slate-100">{teamsCount}</h3>
              </div>
              <div className="p-3 rounded-xl bg-white/5 text-indigo-400">
                <Shield className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-mono">Current active season</span>
              <button 
                onClick={() => router.push('/dashboard/superadmin/teams')}
                className="text-xs text-indigo-400 font-bold hover:underline flex items-center gap-1"
              >
                View <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* System status */}
          <div className="relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-5 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-300">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">System Health</p>
                <h3 className="text-3xl font-black text-emerald-400">Healthy</h3>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-400">
                <Activity className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-mono">Monitoring sync live</span>
              <button 
                onClick={() => router.push('/dashboard/superadmin/monitoring')}
                className="text-xs text-emerald-400 font-bold hover:underline flex items-center gap-1"
              >
                Inspect <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </section>

        {/* Administration Domains Grid */}
        <section className="space-y-10">
          
          {/* Domain 1: Access Control & Security */}
          <div>
            <h2 className="text-lg font-black uppercase text-indigo-400 tracking-wider mb-5 flex items-center gap-2">
              <KeyRound className="w-5 h-5" /> Access Control & Security
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <button 
                onClick={() => router.push('/dashboard/superadmin/users')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 w-fit mb-4 transition-all">
                    <Users className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-indigo-400 transition-colors">Users Directory</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Manage system users, assign roles (Super Admin, Committee, Team), and verify credentials.</p>
                </div>
              </button>

              <button 
                onClick={() => router.push('/dashboard/superadmin/invites')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 w-fit mb-4 transition-all">
                    <MailOpen className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-indigo-400 transition-colors">Registration Invites</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Generate unique invitation links and activation codes for committee officials.</p>
                </div>
              </button>

              <button 
                onClick={() => router.push('/dashboard/superadmin/password-requests')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 w-fit mb-4 transition-all">
                    <Key className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-indigo-400 transition-colors">Password Resets</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Process account unlock requests and verify password reset tokens.</p>
                </div>
              </button>

              <button 
                onClick={() => router.push('/dashboard/superadmin/cleanup-player-users')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 w-fit mb-4 transition-all">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-indigo-400 transition-colors">Account Cleanup</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Run system maintenance scripts to purge orphaned user credentials and stale sessions.</p>
                </div>
              </button>
            </div>
          </div>

          {/* Domain 2: Seasons & League Setup */}
          <div>
            <h2 className="text-lg font-black uppercase text-blue-400 tracking-wider mb-5 flex items-center gap-2">
              <Calendar className="w-5 h-5" /> Seasons & League Setup
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <button 
                onClick={() => router.push('/dashboard/superadmin/seasons')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 w-fit mb-4 transition-all">
                    <Settings className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-blue-400 transition-colors">Seasons Manager</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Archive past seasons, lock transfer windows, and toggle active league statuses.</p>
                </div>
              </button>

              <button 
                onClick={() => router.push('/dashboard/superadmin/seasons/create')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 w-fit mb-4 transition-all">
                    <PlusCircle className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-blue-400 transition-colors">Initialize Season</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Configure starting eCoin/SSCoin budgets and deploy new league schedules.</p>
                </div>
              </button>

              <button 
                onClick={() => router.push('/dashboard/superadmin/historical-seasons')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 w-fit mb-4 transition-all">
                    <History className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-blue-400 transition-colors">Historical Archives</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Manage legacy season statistics, championship honors, and hall of fame rankings.</p>
                </div>
              </button>

              <button 
                onClick={() => router.push('/dashboard/superadmin/historical-seasons/import')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 w-fit mb-4 transition-all">
                    <Database className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-blue-400 transition-colors">Spreadsheet Import</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Bulk upload past tournament results and player tables via Excel sheets.</p>
                </div>
              </button>
            </div>
          </div>

          {/* Domain 3: Rosters & Players Setup */}
          <div>
            <h2 className="text-lg font-black uppercase text-indigo-400 tracking-wider mb-5 flex items-center gap-2">
              <UserCheck className="w-5 h-5" /> Rosters & Players Setup
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <button 
                onClick={() => router.push('/dashboard/superadmin/players')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 w-fit mb-4 transition-all">
                    <Database className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-indigo-400 transition-colors">Player Database</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Global player ledger. Edit ratings, import CSV profiles, and delete inactive profiles.</p>
                </div>
              </button>

              <button 
                onClick={() => router.push('/dashboard/superadmin/realplayers')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 w-fit mb-4 transition-all">
                    <Users className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-indigo-400 transition-colors">Real Members Ledger</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Direct view of SS members synced from Firebase authentication accounts.</p>
                </div>
              </button>

              <button 
                onClick={() => router.push('/dashboard/superadmin/player-photos')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 w-fit mb-4 transition-all">
                    <Image className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-indigo-400 transition-colors">Player Avatars</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Bulk upload and manage player avatars, with dynamic backdrop removal settings.</p>
                </div>
              </button>

              <button 
                onClick={() => router.push('/dashboard/superadmin/cleanup-realplayers')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 w-fit mb-4 transition-all">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-indigo-400 transition-colors">Purge Inactive Members</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Clean up orphaned member records and resolve data schema conflicts.</p>
                </div>
              </button>
            </div>
          </div>

          {/* Domain 4: Teams & Financial Settings */}
          <div>
            <h2 className="text-lg font-black uppercase text-blue-400 tracking-wider mb-5 flex items-center gap-2">
              <Shield className="w-5 h-5" /> Teams & Financial Settings
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <button 
                onClick={() => router.push('/dashboard/superadmin/teams')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 w-fit mb-4 transition-all">
                    <Shield className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-blue-400 transition-colors">Teams Directory</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Modify team details, edit active logos, and edit overall season standings.</p>
                </div>
              </button>

              <button 
                onClick={() => router.push('/dashboard/admin/team-seasons-editor')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 w-fit mb-4 transition-all">
                    <Edit className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-blue-400 transition-colors">Team Seasons Balance</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Directly modify team budget files (eCoin and SSCoin balances) and slot totals.</p>
                </div>
              </button>
            </div>
          </div>

          {/* Domain 5: Awards & Analytics */}
          <div>
            <h2 className="text-lg font-black uppercase text-indigo-400 tracking-wider mb-5 flex items-center gap-2">
              <Award className="w-5 h-5" /> Awards & Analytics
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <button 
                onClick={() => router.push('/dashboard/superadmin/upload-award-images')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 w-fit mb-4 transition-all">
                    <Image className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-indigo-400 transition-colors">Award Badges Gallery</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Upload award photos and honors badges displayed on public pages.</p>
                </div>
              </button>

              <button 
                onClick={() => router.push('/dashboard/admin/awards-order')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 w-fit mb-4 transition-all">
                    <ListOrdered className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-indigo-400 transition-colors">Awards Sort Sequence</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Reorder how awards (MVP, Golden Glove, etc.) are sequenced on public sheets.</p>
                </div>
              </button>

              <button 
                onClick={() => router.push('/dashboard/superadmin/season-player-stats')}
                className="relative group text-left rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/30 p-5 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 w-fit mb-4 transition-all">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm group-hover:text-indigo-400 transition-colors">Overall Player Analytics</h3>
                  <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">Detailed player analytics view and performance statistics logs.</p>
                </div>
              </button>
            </div>
          </div>

        </section>

      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(15px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
