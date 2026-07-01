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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Header Section */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 border-b border-slate-200/60 pb-8 font-mono">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 uppercase tracking-wider">
            Super Admin Console
          </h1>
          <p className="text-slate-500 text-xs uppercase font-semibold mt-1">
            System-wide parameters, user roles, database cleanup & seasons setup
          </p>
        </div>
        
        {/* Active Season Info Card */}
        <div className="console-card bg-white border border-slate-200/60 p-5 shadow-sm rounded-2xl min-w-[240px]">
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Active Season Context
          </div>
          {activeSeason ? (
            <>
              <div className="font-extrabold text-lg text-amber-600">{activeSeason.name || activeSeason.short_name || 'Active Season'}</div>
              <div className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">
                {teamsCount} {teamsCount === 1 ? 'Team' : 'Teams'} Registered
              </div>
            </>
          ) : (
            <>
              <div className="font-extrabold text-base text-slate-400">No Active Season</div>
              <div className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">
                System is awaiting season setup
              </div>
            </>
          )}
        </div>
      </header>

      {/* Stats & Quick Metrics Overview */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 font-mono">
        {/* User approvals */}
        <div className="console-card bg-white border border-slate-200/60 p-5 shadow-sm rounded-2xl hover:border-amber-400/40 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">User Approvals</p>
              <h3 className="text-2xl font-black text-slate-800">{pendingUsers}</h3>
            </div>
            <div className={`p-2.5 rounded-xl border ${pendingUsers > 0 ? 'bg-amber-50 text-amber-600 border-amber-200 animate-pulse' : 'bg-slate-50 text-slate-400 border-slate-200/60'}`}>
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100">
            <span className="text-[9px] text-slate-400 uppercase font-semibold">Awaiting verification</span>
            {pendingUsers > 0 && (
              <button 
                onClick={() => router.push('/dashboard/superadmin/users?filter=pending')}
                className="text-[10px] text-amber-600 font-bold hover:underline flex items-center gap-1 uppercase tracking-wider"
              >
                Manage <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Password resets */}
        <div className="console-card bg-white border border-slate-200/60 p-5 shadow-sm rounded-2xl hover:border-rose-400/40 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Password Resets</p>
              <h3 className="text-2xl font-black text-slate-800">{pendingResets}</h3>
            </div>
            <div className={`p-2.5 rounded-xl border ${pendingResets > 0 ? 'bg-rose-50 text-rose-600 border-rose-200 animate-pulse' : 'bg-slate-50 text-slate-400 border-slate-200/60'}`}>
              <Key className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100">
            <span className="text-[9px] text-slate-400 uppercase font-semibold">Pending verification</span>
            {pendingResets > 0 && (
              <button 
                onClick={() => router.push('/dashboard/superadmin/password-requests')}
                className="text-[10px] text-rose-600 font-bold hover:underline flex items-center gap-1 uppercase tracking-wider"
              >
                Manage <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Total teams */}
        <div className="console-card bg-white border border-slate-200/60 p-5 shadow-sm rounded-2xl hover:border-indigo-400/40 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Teams Enrolled</p>
              <h3 className="text-2xl font-black text-slate-800">{teamsCount}</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex-shrink-0">
              <Shield className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100">
            <span className="text-[9px] text-slate-400 uppercase font-semibold">Current active season</span>
            <button 
              onClick={() => router.push('/dashboard/superadmin/teams')}
              className="text-[10px] text-indigo-600 font-bold hover:underline flex items-center gap-1 uppercase tracking-wider"
            >
              View <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* System status */}
        <div className="console-card bg-white border border-slate-200/60 p-5 shadow-sm rounded-2xl hover:border-emerald-400/40 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">System Health</p>
              <h3 className="text-2xl font-black text-emerald-600">Healthy</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex-shrink-0">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100">
            <span className="text-[9px] text-slate-400 uppercase font-semibold">Monitoring sync live</span>
            <button 
              onClick={() => router.push('/dashboard/superadmin/monitoring')}
              className="text-[10px] text-emerald-600 font-bold hover:underline flex items-center gap-1 uppercase tracking-wider"
            >
              Inspect <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </section>

      {/* Administration Domains Grid */}
      <section className="space-y-10 font-mono">
        
        {/* Domain 1: Access Control & Security */}
        <div>
          <h2 className="text-sm font-bold uppercase text-slate-700 tracking-wider mb-5 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-rose-500" /> Access Control & Security
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            <button 
              onClick={() => router.push('/dashboard/superadmin/users')}
              className="console-card bg-white border border-slate-200/60 hover:border-rose-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 w-fit mb-4 border border-rose-100">
                  <Users className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Users Directory</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Manage system users, assign roles (Super Admin, Committee, Team), and verify credentials.</p>
              </div>
            </button>

            <button 
              onClick={() => router.push('/dashboard/superadmin/invites')}
              className="console-card bg-white border border-slate-200/60 hover:border-rose-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 w-fit mb-4 border border-rose-100">
                  <MailOpen className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Registration Invites</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Generate unique invitation links and activation codes for committee officials.</p>
              </div>
            </button>

            <button 
              onClick={() => router.push('/dashboard/superadmin/password-requests')}
              className="console-card bg-white border border-slate-200/60 hover:border-rose-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 w-fit mb-4 border border-rose-100">
                  <Key className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Password Resets</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Process account unlock requests and verify password reset tokens.</p>
              </div>
            </button>

            <button 
              onClick={() => router.push('/dashboard/superadmin/cleanup-player-users')}
              className="console-card bg-white border border-slate-200/60 hover:border-rose-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 w-fit mb-4 border border-rose-100">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Account Cleanup</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Run system maintenance scripts to purge orphaned user credentials and stale sessions.</p>
              </div>
            </button>
          </div>
        </div>

        {/* Domain 2: Seasons & League Setup */}
        <div>
          <h2 className="text-sm font-bold uppercase text-slate-700 tracking-wider mb-5 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-500" /> Seasons & League Setup
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            <button 
              onClick={() => router.push('/dashboard/superadmin/seasons')}
              className="console-card bg-white border border-slate-200/60 hover:border-amber-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 w-fit mb-4 border border-amber-100">
                  <Settings className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Seasons Manager</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Archive past seasons, lock transfer windows, and toggle active league statuses.</p>
              </div>
            </button>

            <button 
              onClick={() => router.push('/dashboard/superadmin/seasons/create')}
              className="console-card bg-white border border-slate-200/60 hover:border-amber-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 w-fit mb-4 border border-amber-100">
                  <PlusCircle className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Initialize Season</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Configure starting eCoin/SSCoin budgets and deploy new league schedules.</p>
              </div>
            </button>

            <button 
              onClick={() => router.push('/dashboard/superadmin/historical-seasons')}
              className="console-card bg-white border border-slate-200/60 hover:border-amber-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 w-fit mb-4 border border-amber-100">
                  <History className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Historical Archives</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Manage legacy season statistics, championship honors, and hall of fame rankings.</p>
              </div>
            </button>

            <button 
              onClick={() => router.push('/dashboard/superadmin/historical-seasons/import')}
              className="console-card bg-white border border-slate-200/60 hover:border-amber-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 w-fit mb-4 border border-amber-100">
                  <Database className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Spreadsheet Import</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Bulk upload past tournament results and player tables via Excel sheets.</p>
              </div>
            </button>
          </div>
        </div>

        {/* Domain 3: Rosters & Players Setup */}
        <div>
          <h2 className="text-sm font-bold uppercase text-slate-700 tracking-wider mb-5 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-blue-500" /> Rosters & Players Setup
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            <button 
              onClick={() => router.push('/dashboard/superadmin/players')}
              className="console-card bg-white border border-slate-200/60 hover:border-blue-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 w-fit mb-4 border border-blue-100">
                  <Database className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Player Database</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Global player ledger. Edit ratings, import CSV profiles, and delete inactive profiles.</p>
              </div>
            </button>

            <button 
              onClick={() => router.push('/dashboard/superadmin/realplayers')}
              className="console-card bg-white border border-slate-200/60 hover:border-blue-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 w-fit mb-4 border border-blue-100">
                  <Users className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Real Members Ledger</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Direct view of SS members synced from Firebase authentication accounts.</p>
              </div>
            </button>

            <button 
              onClick={() => router.push('/dashboard/superadmin/player-photos')}
              className="console-card bg-white border border-slate-200/60 hover:border-blue-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 w-fit mb-4 border border-blue-100">
                  <Image className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Player Avatars</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Bulk upload and manage player avatars, with dynamic backdrop removal settings.</p>
              </div>
            </button>

            <button 
              onClick={() => router.push('/dashboard/superadmin/cleanup-realplayers')}
              className="console-card bg-white border border-slate-200/60 hover:border-blue-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 w-fit mb-4 border border-blue-100">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Purge Inactive Members</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Clean up orphaned member records and resolve data schema conflicts.</p>
              </div>
            </button>
          </div>
        </div>

        {/* Domain 4: Teams & Financial Settings */}
        <div>
          <h2 className="text-sm font-bold uppercase text-slate-700 tracking-wider mb-5 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-500" /> Teams & Financial Settings
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            <button 
              onClick={() => router.push('/dashboard/superadmin/teams')}
              className="console-card bg-white border border-slate-200/60 hover:border-emerald-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 w-fit mb-4 border border-emerald-100">
                  <Shield className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Teams Directory</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Modify team details, edit active logos, and edit overall season standings.</p>
              </div>
            </button>

            <button 
              onClick={() => router.push('/dashboard/admin/team-seasons-editor')}
              className="console-card bg-white border border-slate-200/60 hover:border-emerald-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 w-fit mb-4 border border-emerald-100">
                  <Edit className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Team Seasons Balance</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Directly modify team budget files (eCoin and SSCoin balances) and slot totals.</p>
              </div>
            </button>
          </div>
        </div>

        {/* Domain 5: Awards & Analytics */}
        <div>
          <h2 className="text-sm font-bold uppercase text-slate-700 tracking-wider mb-5 flex items-center gap-2">
            <Award className="w-4 h-4 text-purple-500" /> Awards & Analytics
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            <button 
              onClick={() => router.push('/dashboard/superadmin/upload-award-images')}
              className="console-card bg-white border border-slate-200/60 hover:border-purple-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 w-fit mb-4 border border-purple-100">
                  <Image className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Award Badges Gallery</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Upload award photos and honors badges displayed on public pages.</p>
              </div>
            </button>

            <button 
              onClick={() => router.push('/dashboard/admin/awards-order')}
              className="console-card bg-white border border-slate-200/60 hover:border-purple-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 w-fit mb-4 border border-purple-100">
                  <ListOrdered className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Awards Sort Sequence</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Reorder how awards (MVP, Golden Glove, etc.) are sequenced on public sheets.</p>
              </div>
            </button>

            <button 
              onClick={() => router.push('/dashboard/superadmin/season-player-stats')}
              className="console-card bg-white border border-slate-200/60 hover:border-purple-400/40 p-5 shadow-sm transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px] text-left"
            >
              <div>
                <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 w-fit mb-4 border border-purple-100">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Overall Player Analytics</h3>
                <p className="text-[11px] text-slate-550 mt-1.5 font-sans leading-relaxed">Detailed player analytics view and performance statistics logs.</p>
              </div>
            </button>
          </div>
        </div>

      </section>

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
