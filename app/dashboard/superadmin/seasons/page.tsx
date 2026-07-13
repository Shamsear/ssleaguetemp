'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { 
  activateSeason, 
  completeSeason, 
  deleteSeason,
  toggleRegistration 
} from '@/lib/firebase/seasons';
import { useRealtimeSeasons } from '@/hooks/useRealtimeData';
import { 
  PlusCircle, 
  Calendar, 
  Users, 
  CheckCircle2, 
  Trash2, 
  ArrowLeft, 
  Settings, 
  Activity, 
  FileText, 
  Lock, 
  Unlock, 
  Clock, 
  ArrowRight,
  Sparkles,
  AlertCircle
} from 'lucide-react';

export default function SeasonsManagement() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  // Real-time seasons data
  const { seasons, loading: loadingSeasons, error } = useRealtimeSeasons(user, loading);

  // Sort seasons by season_number descending (high to low)
  const sortedSeasons = [...seasons].sort((a, b) => {
    const numA = a.season_number || 0;
    const numB = b.season_number || 0;
    return numB - numA;
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const handleActivateSeason = async (seasonId: string) => {
    if (!confirm('Are you sure you want to activate this season? This will deactivate the current active season.')) return;
    
    try {
      await activateSeason(seasonId);
    } catch (err: any) {
      alert(err.message || 'Failed to activate season');
    }
  };

  const handleCompleteSeason = async (seasonId: string) => {
    if (!confirm('Are you sure you want to mark this season as completed? This action cannot be undone.')) return;
    
    try {
      await completeSeason(seasonId);
    } catch (err: any) {
      alert(err.message || 'Failed to complete season');
    }
  };

  const handleDeleteSeason = async (seasonId: string, seasonName: string) => {
    const confirmed = confirm(
      `⚠️ WARNING\n\nAre you sure you want to delete "${seasonName}"?\n\nThis will permanently delete:\n• Season data\n• All associated teams\n• All rounds and auctions\n• All player data for this season\n\nThis action CANNOT be undone!`
    );
    
    if (!confirmed) return;
    
    try {
      await deleteSeason(seasonId);
    } catch (err: any) {
      alert(err.message || 'Failed to delete season');
    }
  };

  const handleToggleRegistration = async (seasonId: string, currentStatus: boolean) => {
    try {
      await toggleRegistration(seasonId, !currentStatus);
    } catch (err: any) {
      alert(err.message || 'Failed to toggle registration');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-slate-100 text-slate-600 border border-slate-200';
      case 'active':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'ongoing':
        return 'bg-amber-50 text-amber-700 border border-amber-200';
      default:
        return 'bg-amber-50 text-amber-700 border border-amber-200';
    }
  };

  const formatDate = (date?: any) => {
    if (!date) return 'Not set';
    const parsedDate = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    return parsedDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading || loadingSeasons) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-500 font-mono text-xs tracking-widest uppercase animate-pulse">Syncing Seasons Schema...</p>
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
            className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-600 hover:text-slate-950 transition-all flex-shrink-0 shadow-sm"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Season Management
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-1">
              Configure leagues, adjust registration settings, and manage tournament parameters.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/dashboard/superadmin/seasons/create')}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm group"
          >
            <PlusCircle className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
            Create Season
          </button>
        </div>
      </div>

      {/* Errors display */}
      {error && (
        <div className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-rose-700 font-mono text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Stats Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <div className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider">Total Seasons</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1 font-mono">{seasons.length}</div>
        </div>
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <div className="text-[10px] font-mono font-semibold text-emerald-600 uppercase tracking-wider">Active Season</div>
          <div className="text-2xl font-extrabold text-emerald-600 mt-1 font-mono">
            {seasons.find(s => s.isActive)?.name || 'None'}
          </div>
        </div>
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <div className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-wider">Archived Seasons</div>
          <div className="text-2xl font-extrabold text-slate-600 mt-1 font-mono">
            {seasons.filter(s => s.status === 'completed').length}
          </div>
        </div>
      </div>

      {/* Seasons Grid */}
      <div className="console-card bg-white border border-slate-200/60 shadow-sm rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/60 bg-slate-50/50 flex items-center justify-between">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-500" />
            Active and Archived Season Configurations
          </span>
        </div>

        {seasons.length > 0 ? (
          <div className="divide-y divide-slate-200/60">
            {sortedSeasons.map((season) => (
              <div 
                key={season.id} 
                className="p-6 hover:bg-slate-50/40 transition-all duration-200 group flex flex-col lg:flex-row lg:items-center justify-between gap-6"
              >
                <div className="flex-1 space-y-4">
                  <div className="flex items-start gap-4">
                    {/* Icon Container */}
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Calendar className="w-5 h-5 text-amber-600" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-base font-bold text-slate-800 group-hover:text-amber-600 transition-colors">
                          {season.name}
                        </h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getStatusBadge(season.status)}`}>
                          {season.status.toUpperCase()}
                        </span>
                        {season.isActive && (
                          <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-mono font-bold uppercase">
                            <Sparkles className="w-3 h-3 mr-1 text-amber-600 animate-pulse" />
                            Active Season Context
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 font-mono">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span>{season.totalTeams || 0} Registered Teams</span>
                        </div>


                        <button
                          onClick={() => handleToggleRegistration(season.id, season.registrationOpen)}
                          className="flex items-center gap-1.5 hover:text-slate-900 transition-all cursor-pointer"
                        >
                          {season.registrationOpen ? (
                            <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                              <Unlock className="w-3.5 h-3.5" /> Open to Managers
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-slate-400">
                              <Lock className="w-3.5 h-3.5" /> Managers Closed
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Timeline dates */}
                  {(season.startDate || season.endDate) && (
                    <div className="flex items-center text-xs text-slate-500 font-mono gap-1.5 pl-16">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Timeline:</span>
                      <span className="text-slate-600">{formatDate(season.startDate)}</span>
                      <span className="text-slate-300">—</span>
                      <span className="text-slate-600">{formatDate(season.endDate)}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity duration-200 pl-16 lg:pl-0">
                  {!season.isActive && season.status !== 'completed' && (
                    <button
                      onClick={() => handleActivateSeason(season.id)}
                      className="inline-flex items-center px-4 py-2 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 text-xs font-mono font-bold rounded-xl transition-all shadow-sm"
                    >
                      Activate
                    </button>
                  )}

                  {season.isActive && season.status !== 'completed' && (
                    <button
                      onClick={() => handleCompleteSeason(season.id)}
                      className="inline-flex items-center px-4 py-2 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 text-xs font-mono font-bold rounded-xl transition-all shadow-sm"
                    >
                      Mark Completed
                    </button>
                  )}

                  <button
                    onClick={() => router.push(`/dashboard/superadmin/seasons/${season.id}`)}
                    className="inline-flex items-center px-4 py-2 bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-700 text-xs font-mono font-bold rounded-xl transition-all shadow-sm"
                  >
                    Details & Rules
                  </button>

                  <button
                    onClick={() => handleDeleteSeason(season.id, season.name)}
                    className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 transition-all shadow-sm"
                    title="Delete Season"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-8 py-20 text-center">
            <div className="max-w-sm mx-auto space-y-4">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-slate-50 border border-slate-200 flex items-center justify-center shadow-inner animate-pulse">
                <Calendar className="w-8 h-8 text-slate-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">No seasons defined</h3>
                <p className="text-xs text-slate-500 font-mono mt-1 mb-5">
                  Start by instantiating an active tournament season.
                </p>
                <button
                  onClick={() => router.push('/dashboard/superadmin/seasons/create')}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
                >
                  <PlusCircle className="w-4 h-4" />
                  Create First Season
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
