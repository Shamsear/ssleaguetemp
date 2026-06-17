'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { 
  ArrowLeft, 
  Download, 
  Upload, 
  Calendar, 
  Trash2, 
  Eye, 
  AlertCircle, 
  CheckCircle, 
  Sparkles,
  Info,
  Clock,
  Users,
  Award,
  Layers,
  Database
} from 'lucide-react';

interface Season {
  id: string;
  season_number: number | null;
  status: 'active' | 'completed' | 'archived';
  is_active: boolean;
  is_historical: boolean;
  created_at: string; // ISO string from API
  teams_count: number;
  awards_count: number;
  description?: string;
  start_date?: string;
  end_date?: string;
}

export default function HistoricalSeasons() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonsLoading, setSeasonsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Fetch seasons data from API
  useEffect(() => {
    const fetchSeasons = async () => {
      try {
        setSeasonsLoading(true);
        const response = await fetchWithTokenRefresh('/api/seasons/list');
        const data = await response.json();
        
        if (data.success) {
          setSeasons(data.seasons);
        } else {
          setError(data.error || 'Failed to fetch seasons');
        }
      } catch (error) {
        console.error('Error fetching seasons:', error);
        setError('Failed to load seasons data');
      } finally {
        setSeasonsLoading(false);
      }
    };

    // Only fetch if user is authenticated and is super admin
    if (!loading && user && user.role === 'super_admin') {
      fetchSeasons();
    }
  }, [user, loading]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'completed':
        return 'bg-slate-100 text-slate-600 border border-slate-200/60';
      default:
        return 'bg-slate-100 text-slate-600 border border-slate-200/60';
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetchWithTokenRefresh('/api/seasons/historical/template');
      
      if (!response.ok) {
        throw new Error('Failed to download template');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'SS_League_Historical_Season_Template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading template:', error);
      alert('Failed to download template');
    }
  };

  const handleDeleteSeason = async (seasonId: string) => {
    if (deleteConfirm !== seasonId) {
      setDeleteConfirm(seasonId);
      // Reset confirmation after 5 seconds if not clicked again
      setTimeout(() => {
        setDeleteConfirm(prev => prev === seasonId ? null : prev);
      }, 5000);
      return;
    }

    try {
      setDeleting(seasonId);
      setError(null);
      
      const response = await fetchWithTokenRefresh(`/api/seasons/historical/delete?season_id=${seasonId}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSeasons(prev => prev.filter(s => s.id !== seasonId));
        setDeleteConfirm(null);
      } else {
        setError(data.error || 'Failed to delete season');
      }
    } catch (error) {
      console.error('Error deleting season:', error);
      setError('An error occurred while deleting the season');
    } finally {
      setDeleting(null);
    }
  };

  if (loading || (seasonsLoading && seasons.length === 0)) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-550 font-mono text-xs tracking-widest uppercase animate-pulse">Syncing Historical records...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="space-y-8 animate-fade-in font-mono">
      
      {/* Info Banner about new structure */}
      <div className="console-card bg-amber-500/5 border border-amber-200/60 p-5 shadow-sm rounded-2xl flex items-start gap-3.5">
        <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Database Schema Isolation</h3>
          <p className="text-[11px] text-slate-550 leading-relaxed">
            Player records are partitioned into static credentials (<code className="font-bold">realplayers</code>) and season-specific performance coefficients (<code className="font-bold">realplayerstats</code>). 
            This structural separation prevents seasonal overwrites and preserves history.
          </p>
          <div className="flex flex-wrap gap-2 pt-1 font-mono text-[9px] font-bold uppercase">
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 border border-amber-500/20">
              Preserved Identity
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 border border-amber-500/20">
              Isolate Seasons
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 border border-amber-500/20">
              Zero Overwrite Risk
            </span>
          </div>
        </div>
      </div>
      
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
              Historical Seasons
            </h1>
            <p className="text-xs text-slate-505 font-mono mt-1">
              Configure previous season index tables, download spreadsheets, and audit historical performance databases.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-700 text-xs font-mono font-bold rounded-xl transition-all shadow-sm"
          >
            <Download className="w-4 h-4" />
            Download Template
          </button>
          <button
            onClick={() => router.push('/dashboard/superadmin/historical-seasons/import')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-mono font-bold rounded-xl transition-all shadow-sm"
          >
            <Upload className="w-4 h-4" />
            Import Season
          </button>
        </div>
      </div>

      {/* Errors display */}
      {error && (
        <div className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-rose-700 font-mono text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
          <p className="flex-1">{error}</p>
        </div>
      )}

      {/* Seasons Card List */}
      <div className="console-card bg-white border border-slate-200/60 shadow-sm rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/60 bg-slate-50/50 flex items-center justify-between">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-500" />
            League Archival Registry
          </span>
          {!seasonsLoading && seasons.length > 0 && (
            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-mono font-bold uppercase">
              {seasons.length} Seasons
            </span>
          )}
        </div>

        {!seasonsLoading && seasons.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {seasons.map((season) => (
              <div key={season.id} className="px-6 py-5 hover:bg-slate-50/50 transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3.5 mb-2.5">
                    {/* Season Symbol */}
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-5 h-5" />
                    </div>

                    <div className="min-w-0">
                      <h3 
                        className="text-sm font-extrabold text-slate-900 hover:text-amber-600 hover:underline cursor-pointer transition-colors"
                        onClick={() => router.push(`/dashboard/superadmin/historical-seasons/${season.id}`)}
                      >
                        Season {season.season_number || 'N/A'}
                      </h3>
                      <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono mt-0.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded font-bold uppercase text-[9px] ${getStatusBadge(season.status)}`}>
                          {season.status}
                        </span>
                        <span className="text-slate-400">ID: {season.id}</span>
                        {season.is_active && (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9px] font-mono font-bold uppercase animate-pulse">
                            Active Context
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-slate-500 font-mono pl-0 md:pl-14">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Created: {formatDate(season.created_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {season.teams_count} Franchises
                    </span>
                    <span className="flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-slate-400" />
                      {season.awards_count} Awards
                    </span>
                  </div>
                </div>

                <div className="flex items-center flex-wrap gap-2 self-start md:self-center pl-0 md:pl-14">
                  {season.status === 'completed' && (
                    <div className="inline-flex items-center px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200">
                      Archived
                    </div>
                  )}
                  {season.is_active && (
                    <div className="inline-flex items-center px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                      Active
                    </div>
                  )}
                  <button
                    onClick={() => router.push(`/dashboard/superadmin/historical-seasons/${season.id}`)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-bold transition-all shadow-sm"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Details
                  </button>
                  {season.is_historical && (
                    <button
                      onClick={() => handleDeleteSeason(season.id)}
                      disabled={deleting === season.id}
                      className={
                        deleteConfirm === season.id
                          ? "inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700 transition-all shadow-sm"
                          : "inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-250 hover:bg-rose-100 hover:border-rose-300 text-rose-700 text-[11px] font-bold transition-all"
                      }
                    >
                      {deleting === season.id ? (
                        <>
                          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          Deleting
                        </>
                      ) : deleteConfirm === season.id ? (
                        <>
                          <AlertCircle className="w-3.5 h-3.5 animate-pulse" />
                          Confirm Delete
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3.5 h-3.5 text-rose-455" />
                          Delete
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-16 text-center text-slate-500 font-mono">
            <Calendar className="w-12 h-12 mx-auto text-slate-300 mb-4 animate-pulse" />
            <h4 className="font-extrabold text-slate-805 mb-1 text-sm">No Historical Records Found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
              No historical data packages have been initialized in the database yet.
            </p>
            <button
              onClick={() => router.push('/dashboard/superadmin/historical-seasons/import')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Import First Season
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
