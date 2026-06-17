'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TeamData } from '@/types/team';
import {
  createTeam,
  updateTeam,
  deleteTeam,
  toggleTeamStatus,
  getTeamStatistics,
} from '@/lib/firebase/teams';
import { getAllSeasons } from '@/lib/firebase/seasons';
import { useCachedTeams } from '@/hooks/useCachedData';
import { 
  PlusCircle, 
  Search, 
  Trash2, 
  Edit, 
  CheckCircle, 
  XCircle, 
  Users, 
  Shield, 
  DollarSign, 
  ArrowLeft,
  Mail,
  User,
  Info,
  Calendar,
  Lock,
  Layers,
  RefreshCw,
  Sparkles
} from 'lucide-react';

export default function TeamsManagement() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  // Use cached teams data (reduces Firebase reads)
  const { data: cachedTeams, isLoading: teamsLoading, refetch: refetchTeams } = useCachedTeams();
  const teams = cachedTeams || [];
  
  const [stats, setStats] = useState({
    totalTeams: 0,
    activeTeams: 0,
    inactiveTeams: 0,
    totalPlayers: 0,
  });
  const [seasons, setSeasons] = useState<Array<{ id: string; name: string }>>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeason, setFilterSeason] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [showEditTeamModal, setShowEditTeamModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<TeamData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form states for add/edit
  const [formData, setFormData] = useState({
    team_name: '',
    team_code: '',
    owner_name: '',
    owner_email: '',
    initial_balance: 10000000,
    season_id: '',
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
    if (!loading && user && user.role === 'super_admin') {
      loadData();
    }
  }, [user, loading, router]);

  const loadData = async () => {
    try {
      setLoadingData(true);
      setError(null);
      
      const [statsData, seasonsData] = await Promise.all([
        getTeamStatistics(),
        getAllSeasons(),
      ]);
      
      setStats(statsData);
      setSeasons(seasonsData.map(s => ({ id: s.id, name: s.name })));
      
      await refetchTeams();
    } catch (err) {
      console.error('Error loading data:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load data';
      setError(errorMessage);
    } finally {
      setLoadingData(false);
    }
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSubmitting(true);
      setError(null);
      
      await createTeam({
        team_name: formData.team_name,
        team_code: formData.team_code,
        owner_name: formData.owner_name || undefined,
        owner_email: formData.owner_email || undefined,
        initial_balance: formData.initial_balance,
        season_id: formData.season_id,
      });
      
      await loadData();
      
      setShowAddTeamModal(false);
      setFormData({
        team_name: '',
        team_code: '',
        owner_name: '',
        owner_email: '',
        initial_balance: 10000000,
        season_id: '',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create team';
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditTeam = (team: TeamData) => {
    setSelectedTeam(team);
    setFormData({
      team_name: team.team_name,
      team_code: team.team_code,
      owner_name: team.owner_name || '',
      owner_email: team.owner_email || '',
      initial_balance: team.initial_balance,
      season_id: team.season_id,
    });
    setShowEditTeamModal(true);
    setError(null);
  };

  const handleUpdateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedTeam) return;
    
    try {
      setSubmitting(true);
      setError(null);
      
      await updateTeam(selectedTeam.id, {
        team_name: formData.team_name,
        team_code: formData.team_code,
        owner_name: formData.owner_name || undefined,
        owner_email: formData.owner_email || undefined,
        initial_balance: formData.initial_balance,
        season_id: formData.season_id,
      });
      
      await loadData();
      
      setShowEditTeamModal(false);
      setSelectedTeam(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update team';
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTeam = async (team: TeamData) => {
    if (!confirm(`Are you sure you want to delete "${team.team_name}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      setError(null);
      await deleteTeam(team.id);
      await loadData();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete team';
      setError(errorMessage);
      alert(`Error: ${errorMessage}`);
    }
  };

  const handleToggleStatus = async (team: TeamData) => {
    try {
      setError(null);
      await toggleTeamStatus(team.id, !team.is_active);
      await loadData();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to toggle team status';
      setError(errorMessage);
      alert(`Error: ${errorMessage}`);
    }
  };

  const handleViewTeamDetails = (team: TeamData) => {
    router.push(`/dashboard/superadmin/teams/${team.id}`);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const filteredTeams = teams.filter(team => {
    const matchesSearch = team.team_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          team.team_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (team.owner_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeason = filterSeason === 'all' || team.season_id === filterSeason;
    const matchesStatus = filterStatus === 'all' || 
                          (filterStatus === 'active' && team.is_active) ||
                          (filterStatus === 'inactive' && !team.is_active);
    return matchesSearch && matchesSeason && matchesStatus;
  });

  if (loading || loadingData || teamsLoading) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-500 font-mono text-xs tracking-widest uppercase animate-pulse">Syncing League Rosters...</p>
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
            className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-650 hover:text-slate-950 transition-all flex-shrink-0 shadow-sm"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-2">
              <Shield className="w-6 h-6 text-slate-500" /> Team Hub
            </h1>
            <p className="text-xs text-slate-505 font-mono mt-1">
              Create, configure, status-toggle, and review registered league franchise operations.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-55 text-slate-700 transition-all flex-shrink-0 shadow-sm"
            title="Refresh Stats"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAddTeamModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-mono font-bold transition-all shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            Add Franchise
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-rose-705 font-mono text-xs flex items-center justify-between">
          <p className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-500" /> {error}
          </p>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800 font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">Total Teams</p>
              <p className="text-3xl font-extrabold text-slate-800">{stats.totalTeams}</p>
            </div>
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600">
              <Users className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-505 uppercase tracking-wider mb-1 font-mono">Active Teams</p>
              <p className="text-3xl font-extrabold text-emerald-600">{stats.activeTeams}</p>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-250 text-emerald-600">
              <CheckCircle className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-450 uppercase tracking-wider mb-1 font-mono">Inactive Teams</p>
              <p className="text-3xl font-extrabold text-slate-500">{stats.inactiveTeams}</p>
            </div>
            <div className="p-3 rounded-2xl bg-slate-100 border border-slate-200 text-slate-500">
              <XCircle className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Controls: Filter & Search */}
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1 w-full max-w-md">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search teams, codes, owners..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-450 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-800 font-mono text-xs transition-all placeholder-slate-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 font-mono text-xs">
          <select
            value={filterSeason}
            onChange={(e) => setFilterSeason(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-amber-400/50 outline-none"
          >
            <option value="all">All Seasons</option>
            {seasons.map(season => (
              <option key={season.id} value={season.id}>{season.name}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2.5 bg-slate-55 border border-slate-200 rounded-xl text-slate-700 focus:border-amber-400/50 outline-none"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

        {/* Teams Database List */}
      {/* Teams Database List */}
      <div className="console-card bg-white border border-slate-200/60 shadow-sm rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/60 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-sm font-mono font-extrabold text-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-500" /> League Franchises
          </h3>
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-50 text-amber-700 border border-amber-250">
            {filteredTeams.length} Matches
          </span>
        </div>

        {filteredTeams.length > 0 ? (
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200/60">
                <thead>
                  <tr className="font-mono text-left text-xs font-bold uppercase tracking-wider text-slate-505 bg-slate-50/50">
                    <th className="px-6 py-4">Team</th>
                    <th className="px-6 py-4">Owner Contact</th>
                    <th className="px-6 py-4">League Season</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 text-sm text-slate-700">
                  {filteredTeams.map((team) => (
                    <tr key={team.id} className="hover:bg-slate-50/40 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {team.logo_url ? (
                              <img 
                                src={team.logo_url} 
                                alt=""
                                className="max-w-full max-h-full object-contain p-1"
                                onError={(e) => {
                                  const target = e.target as HTMLElement;
                                  target.style.display = 'none';
                                  const parent = target.parentElement;
                                  if (parent) {
                                    parent.innerHTML = `<span class="text-amber-600 font-bold text-xs font-mono">${team.team_code}</span>`;
                                  }
                                }}
                              />
                            ) : (
                              <span className="text-amber-600 font-bold text-xs font-mono">{team.team_code}</span>
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800">{team.team_name}</div>
                            <div className="text-xs text-slate-400 font-mono">CODE: {team.team_code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs">
                        <div className="text-slate-850 font-semibold">{team.owner_name || 'No Owner'}</div>
                        <div className="text-slate-500">{team.owner_email || 'No Email'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-750 border border-purple-200">
                          {team.season_name}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs">
                        <button
                          onClick={() => handleToggleStatus(team)}
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all ${
                            team.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-650 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {team.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-mono">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewTeamDetails(team)}
                            className="p-2 border border-slate-200 text-slate-650 hover:text-slate-950 bg-white hover:bg-slate-50 rounded-xl transition-all shadow-sm"
                            title="Details"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEditTeam(team)}
                            className="p-2 border border-amber-200 text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-xl transition-all shadow-sm"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTeam(team)}
                            className="p-2 border border-rose-200 text-rose-600 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all shadow-sm"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden divide-y divide-slate-200/60">
              {filteredTeams.map((team) => (
                <div key={team.id} className="p-5 space-y-4 hover:bg-slate-50/40 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {team.logo_url ? (
                          <img 
                            src={team.logo_url} 
                            alt=""
                            className="max-w-full max-h-full object-contain p-1"
                            onError={(e) => {
                              const target = e.target as HTMLElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                parent.innerHTML = `<span class="text-amber-600 font-bold font-mono">${team.team_code}</span>`;
                              }
                            }}
                          />
                        ) : (
                          <span className="text-amber-600 font-bold font-mono">{team.team_code}</span>
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800">{team.team_name}</h4>
                        <p className="text-xs text-slate-400 font-mono">CODE: {team.team_code}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleStatus(team)}
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all ${
                        team.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-650 border-slate-200'
                      }`}
                    >
                      {team.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 font-mono text-xs bg-slate-50 p-3 rounded-2xl border border-slate-200">
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase block mb-0.5">Owner</span>
                      <span className="text-slate-700 font-semibold">{team.owner_name || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase block mb-0.5">Season</span>
                      <span className="text-slate-700 font-semibold">{team.season_name}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 text-xs font-mono">
                    <button
                      onClick={() => handleViewTeamDetails(team)}
                      className="flex-1 py-2 px-3 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Info className="w-4 h-4" /> View Details
                    </button>
                    <button
                      onClick={() => handleEditTeam(team)}
                      className="py-2 px-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 hover:bg-amber-100 transition-all flex items-center justify-center shadow-sm"
                      title="Edit Franchise"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteTeam(team)}
                      className="py-2 px-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 hover:bg-rose-100 transition-all flex items-center justify-center shadow-sm"
                      title="Delete Franchise"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="px-8 py-20 text-center">
            <div className="max-w-sm mx-auto space-y-4">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
                <Users className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">No teams registered</h3>
                <p className="text-xs text-slate-550 font-mono mt-1">
                  Try adjusting search queries or add your first franchise entry above.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Team Modal */}
      {showAddTeamModal && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={() => setShowAddTeamModal(false)}
        >
          <div 
            className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-200/85">
              <h2 className="text-base font-mono font-extrabold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600" /> Create Franchise Registry
              </h2>
              <button
                onClick={() => setShowAddTeamModal(false)}
                className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-all shadow-sm"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddTeam} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label htmlFor="team_name" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Team Name *
                  </label>
                  <input
                    type="text"
                    id="team_name"
                    required
                    value={formData.team_name}
                    onChange={(e) => setFormData({ ...formData, team_name: e.target.value })}
                    className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 text-xs font-mono transition-all"
                    placeholder="e.g., Manchester United FC"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="team_code" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Team Code *
                  </label>
                  <input
                    type="text"
                    id="team_code"
                    required
                    value={formData.team_code}
                    onChange={(e) => setFormData({ ...formData, team_code: e.target.value.toUpperCase() })}
                    className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 text-xs font-mono transition-all"
                    placeholder="e.g., MUN"
                    maxLength={5}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="owner_name" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Owner Name
                  </label>
                  <input
                    type="text"
                    id="owner_name"
                    value={formData.owner_name}
                    onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                    className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 text-xs font-mono transition-all"
                    placeholder="Owner display name"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="owner_email" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Owner Email
                  </label>
                  <input
                    type="email"
                    id="owner_email"
                    value={formData.owner_email}
                    onChange={(e) => setFormData({ ...formData, owner_email: e.target.value })}
                    className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 text-xs font-mono transition-all"
                    placeholder="Owner contact email"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="initial_balance" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Initial Balance (₹) *
                  </label>
                  <input
                    type="number"
                    id="initial_balance"
                    required
                    min="0"
                    value={formData.initial_balance}
                    onChange={(e) => setFormData({ ...formData, initial_balance: parseInt(e.target.value) || 0 })}
                    className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 text-xs font-mono transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="season_id" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Active League Season *
                  </label>
                  <select
                    id="season_id"
                    required
                    value={formData.season_id}
                    onChange={(e) => setFormData({ ...formData, season_id: e.target.value })}
                    className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 text-xs font-mono transition-all"
                  >
                    <option value="">Select Season</option>
                    {seasons.map(season => (
                      <option key={season.id} value={season.id}>{season.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/80 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setShowAddTeamModal(false)}
                  className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition-all shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl transition-all font-bold disabled:opacity-50 shadow-sm"
                >
                  {submitting ? 'Creating...' : 'Register Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Team Modal */}
      {showEditTeamModal && selectedTeam && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={() => {
            setShowEditTeamModal(false);
            setSelectedTeam(null);
          }}
        >
          <div 
            className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-200/85">
              <h2 className="text-base font-mono font-extrabold text-slate-800 flex items-center gap-2">
                <Edit className="w-4 h-4 text-amber-600" /> Modify Franchise Config
              </h2>
              <button
                onClick={() => {
                  setShowEditTeamModal(false);
                  setSelectedTeam(null);
                }}
                className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-all shadow-sm"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateTeam} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label htmlFor="edit_team_name" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Team Name *
                  </label>
                  <input
                    type="text"
                    id="edit_team_name"
                    required
                    value={formData.team_name}
                    onChange={(e) => setFormData({ ...formData, team_name: e.target.value })}
                    className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 text-xs font-mono transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="edit_team_code" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Team Code *
                  </label>
                  <input
                    type="text"
                    id="edit_team_code"
                    required
                    value={formData.team_code}
                    onChange={(e) => setFormData({ ...formData, team_code: e.target.value.toUpperCase() })}
                    className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 text-xs font-mono transition-all"
                    maxLength={5}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="edit_owner_name" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Owner Name
                  </label>
                  <input
                    type="text"
                    id="edit_owner_name"
                    value={formData.owner_name}
                    onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                    className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 text-xs font-mono transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="edit_owner_email" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Owner Email
                  </label>
                  <input
                    type="email"
                    id="edit_owner_email"
                    value={formData.owner_email}
                    onChange={(e) => setFormData({ ...formData, owner_email: e.target.value })}
                    className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 text-xs font-mono transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="edit_initial_balance" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Initial Balance (₹) *
                  </label>
                  <input
                    type="number"
                    id="edit_initial_balance"
                    required
                    min="0"
                    value={formData.initial_balance}
                    onChange={(e) => setFormData({ ...formData, initial_balance: parseInt(e.target.value) || 0 })}
                    className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 text-xs font-mono transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="edit_season_id" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Active League Season *
                  </label>
                  <select
                    id="edit_season_id"
                    required
                    value={formData.season_id}
                    onChange={(e) => setFormData({ ...formData, season_id: e.target.value })}
                    className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 text-xs font-mono transition-all"
                  >
                    <option value="">Select Season</option>
                    {seasons.map(season => (
                      <option key={season.id} value={season.id}>{season.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/80 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditTeamModal(false);
                    setSelectedTeam(null);
                  }}
                  className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition-all shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl transition-all font-bold disabled:opacity-50 shadow-sm"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
