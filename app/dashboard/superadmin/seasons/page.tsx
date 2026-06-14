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
  TrendingUp
} from 'lucide-react';

export default function SeasonsManagement() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  // Real-time seasons data - only start listening when user is authenticated
  const { seasons, loading: loadingSeasons, error } = useRealtimeSeasons(user, loading);

  // Debug logging
  useEffect(() => {
    if (seasons.length > 0) {
      console.log('Seasons data:', seasons);
    }
  }, [seasons]);

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
      // No need to fetch - real-time listener will update automatically
    } catch (err: any) {
      alert(err.message || 'Failed to activate season');
    }
  };

  const handleCompleteSeason = async (seasonId: string) => {
    if (!confirm('Are you sure you want to mark this season as completed? This action cannot be undone.')) return;
    
    try {
      await completeSeason(seasonId);
      // No need to fetch - real-time listener will update automatically
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
      // No need to fetch - real-time listener will update automatically
    } catch (err: any) {
      alert(err.message || 'Failed to delete season');
    }
  };

  const handleToggleRegistration = async (seasonId: string, currentStatus: boolean) => {
    try {
      await toggleRegistration(seasonId, !currentStatus);
      // No need to fetch - real-time listener will update automatically
    } catch (err: any) {
      alert(err.message || 'Failed to toggle registration');
    }
  };

  const getStatusBadgeClasses = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
      case 'active':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'ongoing':
        return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
      default:
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    }
  };

  const formatDate = (date?: Date) => {
    if (!date) return 'Not set';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading || loadingSeasons) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-100 animate-pulse">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-slate-400 font-mono text-sm">Loading seasons...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="min-h-screen py-6 sm:py-10 px-4 sm:px-6 bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-100 animate-fade-in font-sans">
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
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shadow-inner hidden sm:flex">
                <Calendar className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent mb-2">
                  Season Management
                </h1>
                <p className="text-slate-400 text-sm font-mono">Create and configure auction seasons with complete controls</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => router.push('/dashboard/superadmin/seasons/create')}
            className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-semibold rounded-2xl text-white bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 group w-full md:w-auto justify-center"
          >
            <PlusCircle className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform duration-200" />
            Create Season
          </button>
        </header>

        {/* Error Message */}
        {error && (
          <div className="rounded-2xl p-4 mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-200 font-mono text-sm">
            <p>⚠️ {error}</p>
          </div>
        )}

        {/* Seasons List Container */}
        <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-xl">
          <div className="px-6 py-5 bg-white/5 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-400" />
                All Seasons Database
              </h3>
              {seasons.length > 0 && (
                <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                  {seasons.length} Total
                </span>
              )}
            </div>
          </div>

          {seasons.length > 0 ? (
            <div className="divide-y divide-white/5">
              {seasons.map((season) => (
                <div key={season.id} className="px-6 py-5 hover:bg-white/5 transition-all duration-200 group">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1 flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                        <Calendar className="w-6 h-6 text-indigo-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                          <h3 className="text-lg font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">
                            {season.name}
                          </h3>
                          <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${getStatusBadgeClasses(season.status)}`}>
                            {season.status}
                          </span>
                          {season.isActive && (
                            <span className="inline-flex items-center px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Active
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400 font-mono">
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4 text-slate-500" />
                            {season.totalTeams || 0} teams
                          </span>
                          <span className="flex items-center gap-1">
                            <FileText className="w-4 h-4 text-slate-500" />
                            {season.totalRounds || 0} rounds
                          </span>
                          <span className="flex items-center gap-1">
                            {season.registrationOpen ? (
                              <span className="flex items-center gap-1 text-emerald-400">
                                <Unlock className="w-4 h-4" /> Registration Open
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-slate-500">
                                <Lock className="w-4 h-4" /> Registration Closed
                              </span>
                            )}
                          </span>
                        </div>

                        {(season.startDate || season.endDate) && (
                          <div className="flex items-center text-xs text-slate-500 font-mono mt-2 gap-1.5">
                            <Clock className="w-4 h-4 text-slate-600" />
                            {formatDate(season.startDate)} - {formatDate(season.endDate)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 sm:opacity-0 group-hover:opacity-100 transition-opacity duration-200 self-end sm:self-center">
                      {!season.isActive && season.status !== 'completed' && (
                        <button
                          onClick={() => handleActivateSeason(season.id)}
                          className="inline-flex items-center px-3 py-2 border border-transparent text-xs font-bold uppercase tracking-wider rounded-xl text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
                        >
                          Activate
                        </button>
                      )}

                      {season.isActive && season.status !== 'completed' && (
                        <button
                          onClick={() => handleCompleteSeason(season.id)}
                          className="inline-flex items-center px-3 py-2 border border-transparent text-xs font-bold uppercase tracking-wider rounded-xl text-white bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 transition-all duration-200 shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
                        >
                          Complete
                        </button>
                      )}

                      <button
                        onClick={() => router.push(`/dashboard/superadmin/seasons/${season.id}`)}
                        className="inline-flex items-center px-3 py-2 border border-white/10 text-xs font-bold uppercase tracking-wider rounded-xl text-slate-300 bg-white/5 hover:bg-white/10 transition-all duration-200"
                      >
                        Details
                      </button>

                      <button
                        onClick={() => handleDeleteSeason(season.id, season.name)}
                        className="p-2 border border-rose-500/20 text-rose-400 bg-rose-500/5 hover:bg-rose-500/10 rounded-xl transition-all duration-200"
                        title="Delete Season"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-8 py-20 text-center animate-fade-in">
              <div className="max-w-sm mx-auto">
                <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center animate-pulse">
                  <Calendar className="w-10 h-10 text-indigo-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-200 mb-2">No Seasons Found</h3>
                <p className="text-slate-400 text-xs font-sans mb-6">Create your first season to start managing auction tournaments.</p>
                <button
                  onClick={() => router.push('/dashboard/superadmin/seasons/create')}
                  className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-semibold rounded-2xl text-white bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 group"
                >
                  <PlusCircle className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform duration-200" />
                  Create First Season
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
