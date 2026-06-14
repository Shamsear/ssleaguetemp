'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAllSeasons } from '@/lib/firebase/seasons';
import { 
  createAdminInvite, 
  getAllAdminInvites, 
  deleteAdminInvite,
  getCommitteeAdminsBySeason 
} from '@/lib/firebase/invites';
import { AdminInvite } from '@/types/invite';
import { Season } from '@/types/season';
import { collection, query, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { 
  PlusCircle, 
  Link2, 
  Trash2, 
  Calendar, 
  User, 
  Check, 
  ExternalLink, 
  Eye, 
  Settings, 
  ArrowLeft, 
  Clock, 
  UserCheck, 
  Users, 
  CheckCircle2, 
  KeyRound, 
  Copy, 
  X, 
  Activity,
  RefreshCw 
} from 'lucide-react';

interface SeasonAdmin {
  seasonId: string;
  seasonName: string;
  seasonYear: string;
  isActive: boolean;
  activeInvites: number;
  usedInvites: number;
  admins: {
    uid: string;
    username: string;
    email: string;
    isActive: boolean;
    createdAt: Date;
  }[];
}

export default function AdminInvites() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Data state
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [seasonAdmins, setSeasonAdmins] = useState<SeasonAdmin[]>([]);
  
  // Form state
  const [formData, setFormData] = useState({
    seasonId: '',
    description: '',
    maxUses: 1,
    expiresInHours: 24,
  });
  const [isCreating, setIsCreating] = useState(false);

  // Load data
  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Fetch seasons and invites
      const [seasonsData, invitesData] = await Promise.all([
        getAllSeasons(),
        getAllAdminInvites(),
      ]);
      
      setSeasons(seasonsData);
      setInvites(invitesData);
      
      // Build season admin data
      const seasonAdminData: SeasonAdmin[] = [];
      
      for (const season of seasonsData) {
        const admins = await getCommitteeAdminsBySeason(season.id);
        const seasonInvites = invitesData.filter(inv => inv.seasonId === season.id);
        
        seasonAdminData.push({
          seasonId: season.id,
          seasonName: season.name,
          seasonYear: season.year,
          isActive: season.isActive,
          activeInvites: seasonInvites.filter(inv => inv.isActive && inv.usedCount < inv.maxUses).length,
          usedInvites: seasonInvites.reduce((sum, inv) => sum + inv.usedCount, 0),
          admins: admins.map(admin => ({
            uid: admin.uid,
            username: admin.username,
            email: admin.email,
            isActive: admin.isActive,
            createdAt: admin.createdAt,
          })),
        });
      }
      
      setSeasonAdmins(seasonAdminData);
      
      // Set default season for form
      if (seasonsData.length > 0 && !formData.seasonId) {
        const activeSeason = seasonsData.find(s => s.isActive);
        setFormData(prev => ({
          ...prev,
          seasonId: activeSeason?.id || seasonsData[0].id,
        }));
      }
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
      return;
    }
    if (!loading && user && user.role === 'super_admin') {
      loadData();
      setupRealTimeListeners();
    }
  }, [user, loading, router]);
  
  // Setup real-time listeners for live updates
  const setupRealTimeListeners = () => {
    let latestInvites: AdminInvite[] = [];
    
    // Listen to invites collection
    const invitesQuery = query(
      collection(db, 'invites'),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribeInvites = onSnapshot(invitesQuery, (snapshot) => {
      const updatedInvites: AdminInvite[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        updatedInvites.push({
          id: doc.id,
          ...data,
          expiresAt: data.expiresAt instanceof Timestamp ? data.expiresAt.toDate() : new Date(data.expiresAt),
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt),
        } as AdminInvite);
      });
      latestInvites = updatedInvites;
      setInvites(updatedInvites);
      
      // Update season admins data when invites change
      updateSeasonAdminsData(updatedInvites);
    }, (error) => {
      console.error('Error listening to invites:', error);
    });
    
    // Listen to users collection for committee admins
    const usersQuery = query(
      collection(db, 'users'),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribeUsers = onSnapshot(usersQuery, () => {
      // Reload season admins when users change, using latest invites
      updateSeasonAdminsData(latestInvites);
    }, (error) => {
      console.error('Error listening to users:', error);
    });
    
    // Cleanup on unmount
    return () => {
      unsubscribeInvites();
      unsubscribeUsers();
    };
  };
  
  // Update season admins data
  const updateSeasonAdminsData = async (currentInvites: AdminInvite[]) => {
    if (seasons.length === 0) return;
    
    const seasonAdminData: SeasonAdmin[] = [];
    
    for (const season of seasons) {
      const admins = await getCommitteeAdminsBySeason(season.id);
      const seasonInvites = currentInvites.filter(inv => inv.seasonId === season.id);
      
      seasonAdminData.push({
        seasonId: season.id,
        seasonName: season.name,
        seasonYear: season.year,
        isActive: season.isActive,
        activeInvites: seasonInvites.filter(inv => inv.isActive && inv.usedCount < inv.maxUses).length,
        usedInvites: seasonInvites.reduce((sum, inv) => sum + inv.usedCount, 0),
        admins: admins.map(admin => ({
          uid: admin.uid,
          username: admin.username,
          email: admin.email,
          isActive: admin.isActive,
          createdAt: admin.createdAt,
        })),
      });
    }
    
    setSeasonAdmins(seasonAdminData);
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.seasonId) {
      alert('Please select a season');
      return;
    }
    
    if (!user) return;
    
    try {
      setIsCreating(true);
      setError(null);
      
      await createAdminInvite(
        formData,
        user.uid,
        user.username
      );
      
      // Reset form and close form (no reload needed - real-time listeners will update)
      setFormData({
        seasonId: formData.seasonId,
        description: '',
        maxUses: 1,
        expiresInHours: 24,
      });
      setShowCreateForm(false);
      
      alert('Admin invite created successfully!');
    } catch (err: any) {
      console.error('Error creating invite:', err);
      alert(`Failed to create invite: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteInvite = async (inviteCode: string, description: string, seasonName: string) => {
    const confirmed = confirm(
      `Are you sure you want to delete the admin invite "${description}" for ${seasonName}?\n\nThis action cannot be undone. Any unused invitation links will stop working immediately.`
    );
    
    if (!confirmed) return;
    
    try {
      setError(null);
      await deleteAdminInvite(inviteCode);
      
      // No reload needed - real-time listeners will update
      alert('Invite deleted successfully!');
    } catch (err: any) {
      console.error('Error deleting invite:', err);
      alert(`Failed to delete invite: ${err.message}`);
    }
  };

  const copyToClipboard = async (text: string, inviteId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUrl(inviteId);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (err) {
      alert('Could not copy link. Please copy manually.');
    }
  };

  const getInviteUrl = (code: string, seasonId: string) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/register?invite=${code}`;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-100 animate-pulse">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-slate-400 font-mono text-sm">Loading...</p>
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
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shadow-inner hidden sm:flex">
                <Link2 className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent mb-2">
                  Admin Invitations
                </h1>
                <p className="text-slate-400 text-sm font-mono">Create and manage committee admin invitation links</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-semibold rounded-2xl text-white bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 group w-full md:w-auto justify-center"
          >
            <PlusCircle className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform duration-200" />
            {showCreateForm ? 'Cancel' : 'Create Invite'}
          </button>
        </header>

        {/* Season-Based Admin Overview */}
        <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-xl mb-8">
          <div className="px-6 py-5 bg-white/5 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                Season Administrators
              </h3>
              {seasonAdmins.length > 0 && (
                <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                  {seasonAdmins.length} Seasons
                </span>
              )}
            </div>
          </div>
          
          {seasonAdmins.length > 0 ? (
            <div className="divide-y divide-white/5">
              {seasonAdmins.map((season) => (
                <div key={season.seasonId}>
                  {/* Season Header */}
                  <div className="px-6 py-4 bg-white/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mr-3">
                          <Calendar className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-200">{season.seasonName} ({season.seasonYear})</h4>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
                            {season.isActive ? (
                              <span className="flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                                Active Season
                              </span>
                            ) : (
                              <span className="flex items-center px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20 text-[10px] font-bold">
                                Previous Season
                              </span>
                            )}
                            <span>{season.activeInvites} Active Invites</span>
                            <span>{season.usedInvites} Used Invites</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Admins List */}
                  {season.admins.map((admin, idx) => (
                    <div key={idx} className="px-6 py-3 pl-16 border-l-2 border-indigo-500/20 ml-6 hover:bg-white/5 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mr-3">
                            <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-200 text-sm">{admin.username}</span>
                            <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-mono mt-0.5">
                              <span>{admin.email}</span>
                              {admin.isActive ? (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
                              ) : (
                                <span className="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">Inactive</span>
                              )}
                              <span>Joined: {formatDate(admin.createdAt).split(',')[0]}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-8 py-20 text-center">
              <div className="max-w-sm mx-auto">
                <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <Settings className="w-10 h-10 text-indigo-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-200 mb-2">No Season Data Found</h3>
                <p className="text-slate-400 text-xs font-sans mb-6">Create seasons and invite administrators to get started.</p>
              </div>
            </div>
          )}
        </div>

        {/* Active Invites */}
        <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-xl">
          <div className="px-6 py-5 bg-white/5 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <Link2 className="w-5 h-5 text-indigo-400" />
                Active Invitations
              </h3>
              {invites.filter(inv => inv.isActive && inv.usedCount < inv.maxUses).length > 0 && (
                <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                  {invites.filter(inv => inv.isActive && inv.usedCount < inv.maxUses).length} Active
                </span>
              )}
            </div>
          </div>
          
          {/* Create Invite Form */}
          {showCreateForm && (
            <div className="border-b border-white/10 animate-fade-in">
              <form onSubmit={handleCreateInvite} className="p-6 space-y-4 bg-white/5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="group">
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                      Season *
                    </label>
                    <select
                      value={formData.seasonId}
                      onChange={(e) => setFormData({ ...formData, seasonId: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-white/10 bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-200 transition-all font-sans"
                      required
                    >
                      <option value="">Select season</option>
                      {seasons.map((season) => (
                        <option key={season.id} value={season.id}>
                          {season.name} ({season.year}) {season.isActive ? '✓' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="group">
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                      Description
                    </label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-white/10 bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-200 transition-all font-sans placeholder-slate-600"
                      placeholder="Brief description"
                    />
                  </div>
                  
                  <div className="group">
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                      Max Uses
                    </label>
                    <input
                      type="number"
                      value={formData.maxUses}
                      onChange={(e) => setFormData({ ...formData, maxUses: parseInt(e.target.value) || 1 })}
                      min="1"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-white/10 bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-200 transition-all font-mono"
                    />
                  </div>
                  
                  <div className="group">
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                      Expires (Hours)
                    </label>
                    <input
                      type="number"
                      value={formData.expiresInHours}
                      onChange={(e) => setFormData({ ...formData, expiresInHours: parseInt(e.target.value) || 24 })}
                      min="1"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-white/10 bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-200 transition-all font-mono"
                    />
                  </div>
                </div>
                
                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 border border-white/10 text-xs font-semibold uppercase tracking-wider rounded-xl text-slate-300 bg-white/5 hover:bg-white/10 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating || !formData.seasonId}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl text-white bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                  >
                    {isCreating ? (
                      <>
                        <RefreshCw className="animate-spin w-3.5 h-3.5 mr-1.5" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
                        Create
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
          
          {invites.filter(inv => inv.isActive && inv.usedCount < inv.maxUses).length > 0 || showCreateForm ? (
            <div className="divide-y divide-white/5">
              {invites.filter(inv => inv.isActive && inv.usedCount < inv.maxUses).map((invite) => (
                <div key={invite.id} className="px-6 py-5 hover:bg-white/5 transition-all duration-200 group">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mr-3 shadow-inner animate-pulse">
                          <Link2 className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-lg font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">
                            {invite.description || 'Admin Invitation'}
                            {invite.seasonName && <span className="text-xs font-normal text-slate-400 ml-2">for {invite.seasonName}</span>}
                          </h4>
                          <div className="flex flex-wrap items-center gap-4 text-xs mt-1">
                            <span className={`flex items-center px-3 py-1 rounded-full border ${seasons.find(s => s.id === invite.seasonId)?.isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                              <Calendar className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                              <span className="font-bold">{invite.seasonName}</span>
                              {invite.seasonYear && <span className="ml-1 opacity-75 font-mono">({invite.seasonYear})</span>}
                              {seasons.find(s => s.id === invite.seasonId)?.isActive && (
                                <span className="ml-2 inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-500 text-white uppercase tracking-wider">
                                  Active
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-400 font-mono mt-3">
                            <span className="flex items-center">
                              <User className="w-3.5 h-3.5 mr-1 text-slate-500" />
                              Created by: {invite.createdByUsername}
                            </span>
                            <span className="flex items-center">
                              <Clock className="w-3.5 h-3.5 mr-1 text-slate-500" />
                              Expires: {formatDate(invite.expiresAt)}
                            </span>
                            <span className="flex items-center">
                              <Settings className="w-3.5 h-3.5 mr-1 text-slate-500" />
                              Uses: {invite.usedCount}/{invite.maxUses}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Invite URL Display */}
                      <div className="bg-white/5 rounded-2xl p-4 border border-white/10 mt-3 shadow-inner">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Invitation URL</label>
                        <div className="flex items-center space-x-2 flex-wrap gap-2">
                          <input
                            type="text"
                            readOnly
                            value={getInviteUrl(invite.code, invite.seasonId)}
                            onClick={(e) => e.currentTarget.select()}
                            className="flex-1 min-w-0 text-xs bg-slate-900 border border-white/10 rounded-xl px-3 py-2 font-mono text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                          {invite.usedCount < invite.maxUses && (
                            <button
                              onClick={() => copyToClipboard(getInviteUrl(invite.code, invite.seasonId), invite.id)}
                              className="inline-flex items-center px-3 py-2 text-xs font-bold rounded-xl text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
                            >
                              <Copy className="w-3.5 h-3.5 mr-1" />
                              {copiedUrl === invite.id ? 'Copied!' : 'Copy'}
                            </button>
                          )}
                          <a
                            href={getInviteUrl(invite.code, invite.seasonId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-3 py-2 text-xs font-bold rounded-xl text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5 mr-1" />
                            Test
                          </a>
                          <button
                            onClick={() => handleDeleteInvite(invite.code, invite.description || 'Unnamed invite', invite.seasonName || 'Unknown Season')}
                            className="inline-flex items-center px-3 py-2 text-xs font-bold rounded-xl text-white bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 transition-all duration-200 shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-8 py-20 text-center animate-fade-in">
              <div className="max-w-sm mx-auto">
                <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center animate-pulse">
                  <Link2 className="w-10 h-10 text-indigo-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-200 mb-2">No Active Invitations</h3>
                <p className="text-slate-400 text-xs font-sans mb-6">Create invitation codes to allow new administrators to join the system.</p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="inline-flex items-center px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider hover:bg-indigo-500/20 transition-all duration-200"
                >
                  <PlusCircle className="w-4 h-4 mr-2" />
                  Create First Invite
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
