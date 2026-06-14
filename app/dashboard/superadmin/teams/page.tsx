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
import { useCachedTeams, useRefreshCache } from '@/hooks/useCachedData';
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
  Layers
} from 'lucide-react';

export default function TeamsManagement() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  // Use cached teams data (reduces Firebase reads from 20+ to 0 per user!)
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
      
      // Load stats and seasons (teams come from cached hook)
      // This reduces Firebase reads - teams are now cached!
      const [statsData, seasonsData] = await Promise.all([
        getTeamStatistics(),
        getAllSeasons(),
      ]);
      
      setStats(statsData);
      setSeasons(seasonsData.map(s => ({ id: s.id, name: s.name })));
      
      // Refresh cached teams data
      await refetchTeams();
    } catch (err) {
      console.error('Error loading data:', err);
      console.error('Error stack:', (err as Error)?.stack);
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
      
      // Reload data
      await loadData();
      
      // Reset form and close modal
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
      
      // Reload data
      await loadData();
      
      // Close modal and reset
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
      
      // Reload data
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
      
      // Reload data
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
                         team.owner_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeason = filterSeason === 'all' || team.season_id === filterSeason;
    const matchesStatus = filterStatus === 'all' || 
                         (filterStatus === 'active' && team.is_active) ||
                         (filterStatus === 'inactive' && !team.is_active);
    return matchesSearch && matchesSeason && matchesStatus;
  });

  if (loading || loadingData || teamsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-100 animate-pulse">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-slate-400 font-mono text-sm">Loading teams management...</p>
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
                <Shield className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent mb-2">
                  Team Management
                </h1>
                <p className="text-slate-400 text-sm font-mono">Create, configure, and review registered league teams</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowAddTeamModal(true)}
            className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-semibold rounded-2xl text-white bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 group w-full md:w-auto justify-center"
          >
            <PlusCircle className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform duration-200" />
            Add Team
          </button>
        </header>

        {/* Error Message */}
        {error && (
          <div className="rounded-2xl p-4 mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-200 font-mono text-sm flex items-center justify-between">
            <p>⚠️ {error}</p>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-300 transition-colors">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Statistics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8 font-mono">
          <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md p-6 shadow-xl hover:bg-white/10 transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Teams</p>
                <p className="text-3xl font-black text-slate-100">{stats.totalTeams}</p>
              </div>
              <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Users className="w-8 h-8" />
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md p-6 shadow-xl hover:bg-white/10 transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Active Teams</p>
                <p className="text-3xl font-black text-emerald-400">{stats.activeTeams}</p>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <CheckCircle className="w-8 h-8" />
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md p-6 shadow-xl hover:bg-white/10 transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Inactive Teams</p>
                <p className="text-3xl font-black text-slate-400">{stats.inactiveTeams}</p>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400">
                <XCircle className="w-8 h-8" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Actions */}
        <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md p-6 mb-8 shadow-xl">
          <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
            {/* Search */}
            <div className="flex-1 w-full lg:max-w-md">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search teams, codes, or owners..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-white/10 bg-slate-900/60 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 sm:text-sm font-mono"
                />
                <Search className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 transform -translate-y-1/2" />
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 font-mono">
              <select
                value={filterSeason}
                onChange={(e) => setFilterSeason(e.target.value)}
                className="px-4 py-2 border border-white/10 bg-slate-900 text-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 sm:text-xs"
              >
                <option value="all">All Seasons</option>
                {seasons.map(season => (
                  <option key={season.id} value={season.id}>{season.name}</option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border border-white/10 bg-slate-900 text-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 sm:text-xs"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Teams List */}
        <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-xl">
          <div className="px-6 py-5 bg-white/5 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                All Teams Database
              </h3>
              {filteredTeams.length > 0 && (
                <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                  {filteredTeams.length} Total
                </span>
              )}
            </div>
          </div>

          {filteredTeams.length > 0 ? (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="min-w-full divide-y divide-white/5">
                  <thead className="bg-white/5">
                    <tr className="font-mono text-left text-xs font-bold uppercase tracking-wider text-slate-400">
                      <th className="px-6 py-3.5">Team</th>
                      <th className="px-6 py-3.5">Owner</th>
                      <th className="px-6 py-3.5">Season</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm text-slate-300">
                    {filteredTeams.map((team) => (
                      <tr key={team.id} className="hover:bg-white/5 transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center overflow-hidden">
                              {team.logo_url ? (
                                <img 
                                  src={team.logo_url} 
                                  alt={`${team.team_name} logo`}
                                  className="max-w-full max-h-full object-contain p-1"
                                  onError={(e) => {
                                    const target = e.target as HTMLElement;
                                    target.style.display = 'none';
                                    const parent = target.parentElement;
                                    if (parent) {
                                      parent.innerHTML = `<span class="text-indigo-400 font-bold text-xs font-mono">${team.team_code}</span>`;
                                    }
                                  }}
                                />
                              ) : (
                                <span className="text-indigo-400 font-bold text-xs font-mono">{team.team_code}</span>
                              )}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">{team.team_name}</div>
                              <div className="text-xs text-slate-500 font-mono">Code: {team.team_code}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-semibold text-slate-300">{team.owner_name || 'N/A'}</div>
                          <div className="text-xs text-slate-500 font-mono">{team.owner_email || 'N/A'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-mono">
                          <span className="inline-flex items-center px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full">
                            {team.season_name}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-mono">
                          <button
                            onClick={() => handleToggleStatus(team)}
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors ${
                              team.is_active
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                                : 'bg-slate-500/10 text-slate-400 border border-slate-500/20 hover:bg-slate-500/20'
                            }`}
                          >
                            {team.is_active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs font-mono">
                          <div className="flex items-center gap-2 lg:opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <button
                              onClick={() => handleViewTeamDetails(team)}
                              className="p-2 border border-white/10 text-slate-300 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                              title="View Details"
                            >
                              <Info className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleEditTeam(team)}
                              className="p-2 border border-indigo-500/20 text-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10 rounded-xl transition-all"
                              title="Edit Team"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteTeam(team)}
                              className="p-2 border border-rose-500/20 text-rose-400 bg-rose-500/5 hover:bg-rose-500/10 rounded-xl transition-all"
                              title="Delete Team"
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

              {/* Mobile Cards */}
              <div className="lg:hidden divide-y divide-white/5">
                {filteredTeams.map((team) => (
                  <div key={team.id} className="p-6 hover:bg-white/5 transition-colors">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center overflow-hidden mr-3">
                          {team.logo_url ? (
                            <img 
                              src={team.logo_url} 
                              alt={`${team.team_name} logo`}
                              className="max-w-full max-h-full object-contain p-1"
                              onError={(e) => {
                                const target = e.target as HTMLElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent) {
                                  parent.innerHTML = `<span class="text-indigo-400 font-bold font-mono">${team.team_code}</span>`;
                                }
                              }}
                            />
                          ) : (
                            <span className="text-indigo-400 font-bold font-mono">{team.team_code}</span>
                          )}
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-200">{team.team_name}</h3>
                          <p className="text-xs text-slate-400 font-mono">{team.owner_name}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggleStatus(team)}
                        className={`inline-flex items-center px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full font-mono ${
                          team.is_active 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                        }`}
                      >
                        {team.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4 font-mono text-xs">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Season</p>
                        <p className="font-semibold text-slate-300">{team.season_name}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Created</p>
                        <p className="font-semibold text-slate-300">{formatDate(team.created_at)}</p>
                      </div>
                    </div>

                    <div className="flex gap-2 font-mono text-xs">
                      <button
                        onClick={() => handleViewTeamDetails(team)}
                        className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-white/10 rounded-xl text-slate-300 bg-white/5 hover:bg-white/10 transition-all"
                      >
                        <Info className="w-4 h-4 mr-1.5" />
                        View
                      </button>
                      <button
                        onClick={() => handleEditTeam(team)}
                        className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-indigo-500/20 rounded-xl text-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10 transition-all"
                      >
                        <Edit className="w-4 h-4 mr-1.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTeam(team)}
                        className="px-3 py-2 border border-rose-500/20 rounded-xl text-rose-400 bg-rose-500/5 hover:bg-rose-500/10 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="px-8 py-20 text-center animate-fade-in">
              <div className="max-w-sm mx-auto">
                <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center animate-pulse text-indigo-400">
                  <Users className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-slate-200 mb-2">No Teams Found</h3>
                <p className="text-slate-400 text-xs font-sans mb-6">
                  {searchQuery || filterSeason !== 'all' || filterStatus !== 'all'
                    ? 'No teams match your search criteria. Try adjusting your filters.'
                    : 'No teams have been created yet. Start by adding your first team.'}
                </p>
                {!searchQuery && filterSeason === 'all' && filterStatus === 'all' && (
                  <button
                    onClick={() => setShowAddTeamModal(true)}
                    className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-semibold rounded-2xl text-white bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 group"
                  >
                    <PlusCircle className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform duration-200" />
                    Add First Team
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Add Team Modal */}
        {showAddTeamModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-white/10 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                <h2 className="text-xl font-bold text-slate-200">Add New Team</h2>
                <button
                  onClick={() => setShowAddTeamModal(false)}
                  className="p-2 hover:bg-white/5 rounded-xl transition-colors text-slate-400 hover:text-slate-200"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleAddTeam} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="group">
                    <label htmlFor="team_name" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 group-focus-within:text-indigo-400 transition-colors font-mono">
                      Team Name *
                    </label>
                    <input
                      type="text"
                      id="team_name"
                      required
                      value={formData.team_name}
                      onChange={(e) => setFormData({ ...formData, team_name: e.target.value })}
                      className="block w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-850 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-sm font-mono"
                      placeholder="e.g., Manchester United FC"
                    />
                  </div>

                  <div className="group">
                    <label htmlFor="team_code" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 group-focus-within:text-indigo-400 transition-colors font-mono">
                      Team Code *
                    </label>
                    <input
                      type="text"
                      id="team_code"
                      required
                      value={formData.team_code}
                      onChange={(e) => setFormData({ ...formData, team_code: e.target.value.toUpperCase() })}
                      className="block w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-850 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-sm font-mono"
                      placeholder="e.g., MUN"
                      maxLength={5}
                    />
                  </div>

                  <div className="group">
                    <label htmlFor="owner_name" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 group-focus-within:text-indigo-400 transition-colors font-mono">
                      Owner Name
                    </label>
                    <input
                      type="text"
                      id="owner_name"
                      value={formData.owner_name}
                      onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                      className="block w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-850 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-sm font-mono"
                      placeholder="e.g., John Doe"
                    />
                  </div>

                  <div className="group">
                    <label htmlFor="owner_email" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 group-focus-within:text-indigo-400 transition-colors font-mono">
                      Owner Email
                    </label>
                    <input
                      type="email"
                      id="owner_email"
                      value={formData.owner_email}
                      onChange={(e) => setFormData({ ...formData, owner_email: e.target.value })}
                      className="block w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-850 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-sm font-mono"
                      placeholder="e.g., john@example.com"
                    />
                  </div>

                  <div className="group">
                    <label htmlFor="initial_balance" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 group-focus-within:text-indigo-400 transition-colors font-mono">
                      Initial Balance (₹) *
                    </label>
                    <input
                      type="number"
                      id="initial_balance"
                      required
                      min="0"
                      value={formData.initial_balance}
                      onChange={(e) => setFormData({ ...formData, initial_balance: parseInt(e.target.value) || 0 })}
                      className="block w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-855 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-sm font-mono"
                      placeholder="10000000"
                    />
                  </div>

                  <div className="group">
                    <label htmlFor="season_id" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 group-focus-within:text-indigo-400 transition-colors font-mono">
                      Season *
                    </label>
                    <select
                      id="season_id"
                      required
                      value={formData.season_id}
                      onChange={(e) => setFormData({ ...formData, season_id: e.target.value })}
                      className="block w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-sm font-mono"
                    >
                      <option value="">Select Season</option>
                      {seasons.map(season => (
                        <option key={season.id} value={season.id}>{season.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/10 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => setShowAddTeamModal(false)}
                    className="inline-flex items-center px-6 py-3 border border-white/10 rounded-xl text-slate-300 bg-white/5 hover:bg-white/10 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-semibold rounded-xl text-white bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Adding...' : 'Add Team'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Team Modal */}
        {showEditTeamModal && selectedTeam && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-white/10 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                <h2 className="text-xl font-bold text-slate-200">Edit Team</h2>
                <button
                  onClick={() => {
                    setShowEditTeamModal(false);
                    setSelectedTeam(null);
                  }}
                  className="p-2 hover:bg-white/5 rounded-xl transition-colors text-slate-400 hover:text-slate-200"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleUpdateTeam} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="group">
                    <label htmlFor="edit_team_name" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 group-focus-within:text-indigo-400 transition-colors font-mono">
                      Team Name *
                    </label>
                    <input
                      type="text"
                      id="edit_team_name"
                      required
                      value={formData.team_name}
                      onChange={(e) => setFormData({ ...formData, team_name: e.target.value })}
                      className="block w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-850 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-sm font-mono"
                    />
                  </div>

                  <div className="group">
                    <label htmlFor="edit_team_code" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 group-focus-within:text-indigo-400 transition-colors font-mono">
                      Team Code *
                    </label>
                    <input
                      type="text"
                      id="edit_team_code"
                      required
                      value={formData.team_code}
                      onChange={(e) => setFormData({ ...formData, team_code: e.target.value.toUpperCase() })}
                      className="block w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-850 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-sm font-mono"
                      maxLength={5}
                    />
                  </div>

                  <div className="group">
                    <label htmlFor="edit_owner_name" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 group-focus-within:text-indigo-400 transition-colors font-mono">
                      Owner Name
                    </label>
                    <input
                      type="text"
                      id="edit_owner_name"
                      value={formData.owner_name}
                      onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                      className="block w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-850 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-sm font-mono"
                    />
                  </div>

                  <div className="group">
                    <label htmlFor="edit_owner_email" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 group-focus-within:text-indigo-400 transition-colors font-mono">
                      Owner Email
                    </label>
                    <input
                      type="email"
                      id="edit_owner_email"
                      value={formData.owner_email}
                      onChange={(e) => setFormData({ ...formData, owner_email: e.target.value })}
                      className="block w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-850 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-sm font-mono"
                    />
                  </div>

                  <div className="group">
                    <label htmlFor="edit_initial_balance" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 group-focus-within:text-indigo-400 transition-colors font-mono">
                      Initial Balance (₹) *
                    </label>
                    <input
                      type="number"
                      id="edit_initial_balance"
                      required
                      min="0"
                      value={formData.initial_balance}
                      onChange={(e) => setFormData({ ...formData, initial_balance: parseInt(e.target.value) || 0 })}
                      className="block w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-855 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-sm font-mono"
                    />
                  </div>

                  <div className="group">
                    <label htmlFor="edit_season_id" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 group-focus-within:text-indigo-400 transition-colors font-mono">
                      Season *
                    </label>
                    <select
                      id="edit_season_id"
                      required
                      value={formData.season_id}
                      onChange={(e) => setFormData({ ...formData, season_id: e.target.value })}
                      className="block w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-sm font-mono"
                    >
                      <option value="">Select Season</option>
                      {seasons.map(season => (
                        <option key={season.id} value={season.id}>{season.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/10 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditTeamModal(false);
                      setSelectedTeam(null);
                    }}
                    className="inline-flex items-center px-6 py-3 border border-white/10 rounded-xl text-slate-300 bg-white/5 hover:bg-white/10 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-semibold rounded-xl text-white bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Updating...' : 'Update Team'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
