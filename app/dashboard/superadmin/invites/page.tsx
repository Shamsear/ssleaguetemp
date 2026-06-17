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
  ArrowLeft, 
  Clock, 
  UserCheck, 
  Users, 
  Copy, 
  X, 
  RefreshCw,
  CopyCheck,
  ShieldCheck,
  CalendarCheck,
  Send,
  AlertCircle
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
      const unsubscribe = setupRealTimeListeners();
      return () => {
        if (unsubscribe) unsubscribe();
      };
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
      
      // Reset form and close form
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
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono text-slate-800">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Syncing Invite Registry...</p>
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
              Admin Invitations
            </h1>
            <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
              Generate secure onboarding links for incoming season committee members.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-mono font-bold transition-all border cursor-pointer ${
            showCreateForm
              ? 'bg-rose-50 border-rose-250 text-rose-700 hover:bg-rose-100 shadow-sm'
              : 'bg-slate-800 hover:bg-slate-900 text-white border-slate-950 shadow-sm'
          }`}
        >
          {showCreateForm ? (
            <>
              <X className="w-4 h-4" />
              Cancel Form
            </>
          ) : (
            <>
              <PlusCircle className="w-4 h-4" />
              Generate New Link
            </>
          )}
        </button>
      </div>

      {/* Error Notification */}
      {error && (
        <div className="console-card bg-white border border-rose-200/60 rounded-2xl p-4 text-rose-700 font-mono text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Create Invite Form Banner */}
      {showCreateForm && (
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm animate-fade-in space-y-4">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-mono font-bold text-slate-800 uppercase tracking-wider">Invitation Code Parameters</h3>
          </div>
          
          <form onSubmit={handleCreateInvite} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-mono font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Target Season *</label>
              <select
                value={formData.seasonId}
                onChange={(e) => setFormData({ ...formData, seasonId: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/20 text-slate-800 font-mono text-xs transition-all font-bold"
                required
              >
                <option value="">Select season...</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name} ({season.year}) {season.isActive ? '• Active' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Reference Label / Name</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/20 text-slate-800 font-mono text-xs transition-all font-bold placeholder-slate-400"
                placeholder="e.g. Finance Officer Invite"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Maximum Uses</label>
              <input
                type="number"
                value={formData.maxUses}
                onChange={(e) => setFormData({ ...formData, maxUses: parseInt(e.target.value) || 1 })}
                min="1"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/20 text-slate-800 font-mono text-xs transition-all font-bold"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Expiration Lifetime (Hours)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={formData.expiresInHours}
                  onChange={(e) => setFormData({ ...formData, expiresInHours: parseInt(e.target.value) || 24 })}
                  min="1"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/20 text-slate-800 font-mono text-xs transition-all font-bold"
                />
                <button
                  type="submit"
                  disabled={isCreating || !formData.seasonId}
                  className="px-5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-mono text-xs font-bold rounded-xl transition-all flex items-center justify-center flex-shrink-0 gap-1.5 shadow-sm cursor-pointer"
                >
                  {isCreating ? (
                    <RefreshCw className="animate-spin w-3.5 h-3.5" />
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Generate
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Dashboard Content Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Panel: Active Invite Code Registry (col-span-7) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 bg-slate-50/55 border-b border-slate-200/60 flex items-center justify-between">
              <h3 className="text-sm font-mono font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Link2 className="w-4 h-4 text-amber-500" />
                Active Link Registry
              </h3>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200/60 text-slate-700 text-xs font-mono font-semibold">
                {invites.filter(inv => inv.isActive && inv.usedCount < inv.maxUses).length} Unused Codes
              </span>
            </div>

            {invites.filter(inv => inv.isActive && inv.usedCount < inv.maxUses).length > 0 ? (
              <div className="divide-y divide-slate-100">
                {invites.filter(inv => inv.isActive && inv.usedCount < inv.maxUses).map((invite) => (
                  <div key={invite.id} className="p-6 hover:bg-slate-50/30 transition-all duration-200 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-slate-800 font-mono">
                          {invite.description || 'Committee Admin Invite'}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-550 font-mono">
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />
                            By: {invite.createdByUsername}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-slate-200" />
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            Expires: {formatDate(invite.expiresAt)}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-slate-200" />
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3 h-3 text-slate-400" />
                            Uses: {invite.usedCount}/{invite.maxUses}
                          </span>
                        </div>
                      </div>

                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border ${
                        seasons.find(s => s.id === invite.seasonId)?.isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {invite.seasonName}
                      </span>
                    </div>

                    {/* URL Actions Row */}
                    <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={getInviteUrl(invite.code, invite.seasonId)}
                        onClick={(e) => e.currentTarget.select()}
                        className="flex-1 min-w-0 bg-transparent border-none outline-none font-mono text-[11px] text-slate-650 px-2 py-1 select-all font-bold"
                      />
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => copyToClipboard(getInviteUrl(invite.code, invite.seasonId), invite.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-semibold transition-all shadow-sm cursor-pointer"
                        >
                          {copiedUrl === invite.id ? (
                            <>
                              <CopyCheck className="w-3.5 h-3.5" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Copy
                            </>
                          )}
                        </button>
                        <a
                          href={getInviteUrl(invite.code, invite.seasonId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-all shadow-sm"
                          title="Test Link"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => handleDeleteInvite(invite.code, invite.description || 'Unnamed invite', invite.seasonName || 'Unknown Season')}
                          className="p-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 hover:text-rose-700 transition-all cursor-pointer"
                          title="Revoke / Delete Link"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center space-y-4 bg-slate-50/50">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200/60 flex items-center justify-center mx-auto shadow-sm">
                  <Link2 className="w-6 h-6 text-slate-400" />
                </div>
                <div>
                  <h4 className="text-slate-800 font-bold">No active links found</h4>
                  <p className="text-xs text-slate-500 font-mono mt-1 uppercase">
                    Start by generating a secure invite URL for this season's administrators.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Season Administrators Directory (col-span-5) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 bg-slate-50/55 border-b border-slate-200/60 flex items-center justify-between">
              <h3 className="text-sm font-mono font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-500" />
                Season Committee Members
              </h3>
            </div>

            {seasonAdmins.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {seasonAdmins.map((season) => (
                  <div key={season.seasonId} className="p-4 space-y-3">
                    {/* Season Identity Card */}
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <CalendarCheck className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-bold text-slate-800 font-mono">
                          {season.seasonName} ({season.seasonYear})
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${
                        season.isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        {season.isActive ? 'Active' : 'Archived'}
                      </span>
                    </div>

                    {/* Admins Nested List */}
                    {season.admins.length > 0 ? (
                      <div className="space-y-2 pl-3">
                        {season.admins.map((admin, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 hover:bg-slate-50/40 rounded-xl transition-all">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                                <UserCheck className="w-3.5 h-3.5 text-slate-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">{admin.username}</p>
                                <p className="text-[10px] text-slate-550 font-mono truncate">{admin.email}</p>
                              </div>
                            </div>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold border ${
                              admin.isActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : 'bg-rose-50 text-rose-700 border-rose-100'
                            }`}>
                              {admin.isActive ? 'Active' : 'Banned'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 font-mono italic pl-3 uppercase">No committee administrators enrolled.</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center space-y-4 bg-slate-50/50">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200/60 flex items-center justify-center mx-auto shadow-sm">
                  <ShieldCheck className="w-6 h-6 text-slate-400" />
                </div>
                <div>
                  <h4 className="text-slate-800 font-bold">No Admin Assignments</h4>
                  <p className="text-xs text-slate-550 font-mono mt-1 uppercase">
                    Once administrators register with codes, they'll appear listed here by season.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
