'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getTeamById } from '@/lib/firebase/teams';
import { TeamData } from '@/types/team';
import { 
  ArrowLeft,
  Shield,
  Edit,
  Trash2,
  Users,
  CheckCircle,
  XCircle,
  Info,
  DollarSign,
  TrendingUp,
  Settings,
  Layers,
  ArrowRightLeft,
  Mail,
  User,
  PlusCircle,
  Camera,
  AlertTriangle
} from 'lucide-react';

interface Player {
  id: string;
  player_id: string;
  name: string;
  position: string;
  overall_rating: number;
  price_paid?: number;
  acquired_at?: Date;
}

interface Transaction {
  id: string;
  type: 'bid_won' | 'bid_lost' | 'balance_adjustment';
  amount: number;
  description: string;
  player_name?: string;
  timestamp: Date;
}

export default function TeamDetailsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const teamId = params.id as string;

  const [team, setTeam] = useState<TeamData | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'players' | 'transactions' | 'settings'>('overview');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAdjustBalanceModal, setShowAdjustBalanceModal] = useState(false);
  const [balanceAdjustment, setBalanceAdjustment] = useState({ amount: 0, reason: '' });
  const [editForm, setEditForm] = useState({ teamName: '', logoUrl: '' });
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
    if (!loading && user && user.role === 'super_admin') {
      loadTeamData();
    }
  }, [user, loading, router]);

  const loadTeamData = async () => {
    try {
      setLoadingData(true);
      setError(null);
      
      const teamData = await getTeamById(teamId);
      if (!teamData) {
        setError('Team not found');
        return;
      }
      
      setTeam(teamData);
      
      // TODO: Load actual players and transactions from database
      // For now, we'll leave them empty as the structure might be different
      setPlayers([]);
      setTransactions([]);
      
    } catch (err) {
      console.error('Error loading team data:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load team data';
      setError(errorMessage);
    } finally {
      setLoadingData(false);
    }
  };

  const formatCurrency = (amount: number, currency: 'euro' | 'dollar' | 'rupee' | 'none' = 'rupee') => {
    if (currency === 'euro') return `€${amount.toLocaleString('en-US')}`;
    if (currency === 'dollar') return `$${amount.toLocaleString('en-US')}`;
    if (currency === 'rupee') {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
      }).format(amount);
    }
    return amount.toLocaleString('en-US');
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleAdjustBalance = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement API call to adjust balance
    alert(`Adjust balance by ${formatCurrency(balanceAdjustment.amount)} - Backend to be implemented`);
    setShowAdjustBalanceModal(false);
    setBalanceAdjustment({ amount: 0, reason: '' });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    try {
      setUploadingLogo(true);

      // Get ImageKit auth parameters
      const authRes = await fetch('/api/imagekit/auth');
      if (!authRes.ok) {
        throw new Error('Failed to get upload authentication');
      }
      const authData = await authRes.json();

      // Upload to ImageKit
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileName', `team-logo-${teamId}-${Date.now()}`);
      formData.append('folder', '/team-logos');
      formData.append('publicKey', authData.publicKey);
      formData.append('signature', authData.signature);
      formData.append('expire', authData.expire);
      formData.append('token', authData.token);

      const uploadRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const errorData = await uploadRes.json();
        throw new Error(errorData.message || 'Failed to upload image');
      }

      const uploadData = await uploadRes.json();
      setEditForm({ ...editForm, logoUrl: uploadData.url });
      alert('Logo uploaded successfully!');
    } catch (error) {
      console.error('Error uploading logo:', error);
      alert('Failed to upload logo. Please try again.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleUpdateTeam = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await fetch(`/api/superadmin/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName: editForm.teamName || undefined,
          logoUrl: editForm.logoUrl || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update team');
      }

      alert('Team updated successfully!');
      setShowEditModal(false);
      loadTeamData();
    } catch (error) {
      console.error('Error updating team:', error);
      alert('Failed to update team. Please try again.');
    }
  };

  const handleToggleStatus = () => {
    // TODO: Implement API call to toggle status
    alert(`Toggle team status - Backend to be implemented`);
  };

  const handleRemovePlayer = (player: Player) => {
    if (confirm(`Remove ${player.name} from the team?`)) {
      // TODO: Implement API call to remove player
      alert(`Remove player - Backend to be implemented`);
    }
  };

  if (loading || loadingData) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-500 font-mono text-xs tracking-wider uppercase animate-pulse">Loading team statistics & rosters...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center pt-32 px-4 text-slate-700 font-mono">
        <div className="text-center max-w-md p-8 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-500">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Error Loading Team</h2>
          <p className="text-slate-550 font-mono text-xs mb-6">{error}</p>
          <div className="flex gap-3 justify-center font-mono text-xs">
            <button
              onClick={() => loadTeamData()}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-semibold transition-all shadow-sm"
            >
              Try Again
            </button>
            <button
              onClick={() => router.push('/dashboard/superadmin/teams')}
              className="px-5 py-2.5 border border-slate-200 rounded-xl text-slate-700 bg-white hover:bg-slate-50 transition-all shadow-sm"
            >
              Back to Teams
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!team) {
    return null;
  }

  const spendingPercentage = (team.total_spent / team.initial_balance) * 100;
  const balancePercentage = (team.balance / team.initial_balance) * 100;

  return (
    <div className="space-y-8 animate-fade-in font-mono">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/60">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/superadmin/teams')}
            className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-55 text-slate-650 hover:text-slate-950 transition-all flex-shrink-0 shadow-sm"
            title="Back to Teams"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0 group overflow-hidden shadow-sm">
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
                      parent.innerHTML = `<span class="text-amber-600 font-bold text-2xl font-mono">${team.team_code}</span>`;
                    }
                  }}
                />
              ) : (
                <span className="text-amber-600 font-bold text-2xl font-mono">{team.team_code}</span>
              )}
              {/* Edit Logo Overlay */}
              <button
                onClick={() => setShowEditModal(true)}
                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-slate-200"
                title="Upload Logo"
              >
                <Camera className="w-5 h-5" />
              </button>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 truncate">
                  {team.team_name}
                </h1>
                <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-100 border border-slate-250 text-slate-600 uppercase">
                  {team.team_code}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500 font-mono">
                <span>{team.season_name}</span>
                <span>•</span>
                <span className={`inline-flex items-center gap-1 font-semibold ${
                  team.is_active ? 'text-emerald-700' : 'text-slate-500'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${team.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                  {team.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setEditForm({ teamName: team.team_name, logoUrl: team.logo_url || '' });
              setShowEditModal(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200/60 rounded-xl text-sm font-semibold text-slate-700 transition-all font-mono shadow-sm"
          >
            <Edit className="w-4 h-4" />
            Edit Team
          </button>
          <button
            onClick={handleToggleStatus}
            className={`inline-flex items-center gap-2 px-5 py-2.5 border rounded-xl text-sm font-semibold transition-all font-mono ${
              team.is_active
                ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 shadow-sm'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 shadow-sm'
            }`}
          >
            {team.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            {team.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      {team.currency_system === 'dual' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm relative overflow-hidden group hover:border-slate-350 transition-all">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform text-blue-600">
              <span className="text-8xl font-black font-serif">€</span>
            </div>
            <p className="text-xs font-mono uppercase tracking-wider text-slate-400">eCoin Balance (Football)</p>
            <h3 className="text-3xl font-extrabold text-blue-600 mt-2 font-mono">{formatCurrency(team.football_budget || 0, 'euro')}</h3>
            <p className="text-xs text-slate-500 mt-4 font-mono">Spent: {formatCurrency(team.football_spent || 0, 'euro')}</p>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm relative overflow-hidden group hover:border-slate-350 transition-all">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform text-emerald-600">
              <span className="text-8xl font-black font-serif">$</span>
            </div>
            <p className="text-xs font-mono uppercase tracking-wider text-slate-400">SSCoin Balance (Real)</p>
            <h3 className="text-3xl font-extrabold text-emerald-600 mt-2 font-mono">{formatCurrency(team.real_player_budget || 0, 'dollar')}</h3>
            <p className="text-xs text-slate-500 mt-4 font-mono">Spent: {formatCurrency(team.real_player_spent || 0, 'dollar')}</p>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm relative overflow-hidden group hover:border-slate-350 transition-all">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform text-slate-300">
              <Users className="w-24 h-24" />
            </div>
            <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Squad Size</p>
            <h3 className="text-3xl font-extrabold text-purple-650 mt-2 font-mono">{team.players_count}</h3>
            <p className="text-xs text-slate-500 mt-4 font-mono">Football: {team.football_players?.length || 0} | Real: {team.real_players?.length || 0}</p>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm relative overflow-hidden group hover:border-slate-350 transition-all flex flex-col justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Total Budgets</p>
              <div className="mt-2 space-y-1 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Football:</span>
                  <span className="font-semibold text-slate-700">{formatCurrency((team.football_budget || 0) + (team.football_spent || 0), 'euro')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Real:</span>
                  <span className="font-semibold text-slate-700">{formatCurrency((team.real_player_budget || 0) + (team.real_player_spent || 0), 'dollar')}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowAdjustBalanceModal(true)}
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-800 font-mono transition-all group/btn"
            >
              Adjust Balance <TrendingUp className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm hover:border-slate-350 transition-all">
            <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Current Balance</p>
            <h3 className="text-3xl font-extrabold text-amber-600 mt-2 font-mono">{formatCurrency(team.balance)}</h3>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-4 overflow-hidden border border-slate-200">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(balancePercentage, 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-2 font-mono">{balancePercentage.toFixed(1)}% remaining</p>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm hover:border-slate-350 transition-all">
            <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Total Spent</p>
            <h3 className="text-3xl font-extrabold text-rose-700 mt-2 font-mono">{formatCurrency(team.total_spent)}</h3>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-4 overflow-hidden border border-slate-200">
              <div
                className="bg-rose-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(spendingPercentage, 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-2 font-mono">{spendingPercentage.toFixed(1)}% of initial</p>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm hover:border-slate-350 transition-all">
            <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Squad Size</p>
            <h3 className="text-3xl font-extrabold text-emerald-600 mt-2 font-mono">{team.players_count}</h3>
            <p className="text-xs text-slate-500 mt-4 font-mono">Registered squad players</p>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm hover:border-slate-350 transition-all flex flex-col justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Initial Budget</p>
              <h3 className="text-3xl font-extrabold text-purple-650 mt-2 font-mono">{formatCurrency(team.initial_balance)}</h3>
            </div>
            <button
              onClick={() => setShowAdjustBalanceModal(true)}
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-800 font-mono transition-all group/btn"
            >
              Adjust Balance <TrendingUp className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      )}

      {/* Owner Information */}
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
          <User className="w-5 h-5 text-slate-605" />
          Owner Details
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all">
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-600">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 font-mono">Owner Name</p>
              <p className="text-sm font-semibold text-slate-700 truncate mt-0.5">{team.owner_name || 'Not assigned'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600">
              <Mail className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 font-mono">Email Address</p>
              <p className="text-sm font-semibold text-slate-700 truncate mt-0.5">{team.owner_email || 'Not assigned'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all">
            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-600">
              <Info className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 font-mono">Phone Number</p>
              <p className="text-sm font-semibold text-slate-700 truncate mt-0.5">{team.owner_phone || 'Not assigned'}</p>
            </div>
          </div>
        </div>
        {team.description && (
          <div className="mt-6 pt-5 border-t border-slate-200/60">
            <p className="text-sm text-slate-500 leading-relaxed font-mono">{team.description}</p>
          </div>
        )}
      </div>

        {/* Tabbed Console layout */}
        <div className="space-y-4">
          <div className="p-1 bg-slate-100 border border-slate-200/60 rounded-xl flex gap-1 overflow-x-auto scrollbar-none max-w-max">
            {[
              { id: 'overview', label: 'Overview', icon: Layers },
              { id: 'players', label: `Squad Players (${players.length})`, icon: Users },
              { id: 'transactions', label: 'Transactions', icon: ArrowRightLeft },
              { id: 'settings', label: 'Settings', icon: Settings },
            ].map((tab) => {
              const IconComp = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-semibold transition-all whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-slate-800 text-white shadow-sm border border-slate-700/30'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="console-card bg-white border border-slate-200/60 shadow-sm rounded-2xl overflow-hidden min-h-[350px]">
            {/* Overview Tab Content */}
            {activeTab === 'overview' && (
              <div className="p-6 sm:p-8 space-y-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-500" />
                  Team Summary
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 font-mono text-sm">
                  <div className="space-y-4">
                    <div className="flex justify-between py-3 border-b border-slate-100">
                      <span className="text-slate-500">Team Code:</span>
                      <span className="font-semibold text-slate-850">{team.team_code}</span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-slate-100">
                      <span className="text-slate-500">League Season:</span>
                      <span className="font-semibold text-slate-850">{team.season_name}</span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-slate-100">
                      <span className="text-slate-500">Registration Date:</span>
                      <span className="font-semibold text-slate-850">{formatDate(team.created_at)}</span>
                    </div>
                    <div className="flex justify-between py-3">
                      <span className="text-slate-500">Status:</span>
                      <span className={`font-semibold ${team.is_active ? 'text-emerald-700' : 'text-slate-550'}`}>
                        {team.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {team.currency_system === 'dual' ? (
                      <>
                        <div className="flex justify-between py-3 border-b border-slate-100">
                          <span className="text-slate-500">eCoin Initial / Current:</span>
                          <span className="font-semibold text-slate-850">
                            {formatCurrency((team.football_budget || 0) + (team.football_spent || 0), 'euro')} / {formatCurrency(team.football_budget || 0, 'euro')}
                          </span>
                        </div>
                        <div className="flex justify-between py-3 border-b border-slate-100">
                          <span className="text-slate-500">SSCoin Initial / Current:</span>
                          <span className="font-semibold text-slate-850">
                            {formatCurrency((team.real_player_budget || 0) + (team.real_player_spent || 0), 'dollar')} / {formatCurrency(team.real_player_budget || 0, 'dollar')}
                          </span>
                        </div>
                        <div className="flex justify-between py-3 border-b border-slate-100">
                          <span className="text-slate-500">Spent (Football / Real):</span>
                          <span className="font-semibold text-rose-600">
                            {formatCurrency(team.football_spent || 0, 'euro')} / {formatCurrency(team.real_player_spent || 0, 'dollar')}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between py-3 border-b border-slate-100">
                          <span className="text-slate-500">Initial Balance:</span>
                          <span className="font-semibold text-slate-850">{formatCurrency(team.initial_balance)}</span>
                        </div>
                        <div className="flex justify-between py-3 border-b border-slate-100">
                          <span className="text-slate-500">Current Balance:</span>
                          <span className="font-semibold text-amber-600">{formatCurrency(team.balance)}</span>
                        </div>
                        <div className="flex justify-between py-3 border-b border-slate-100">
                          <span className="text-slate-505">Total Spent:</span>
                          <span className="font-semibold text-rose-600">{formatCurrency(team.spent_amount || team.total_spent)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between py-3">
                      <span className="text-slate-500">Squad Count:</span>
                      <span className="font-semibold text-slate-850">{team.players_count} active players</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Players Tab Content */}
            {activeTab === 'players' && (
              <div className="p-6 sm:p-8 space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-500" />
                    Squad Roster
                  </h3>
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-semibold bg-amber-50 border border-amber-200 text-amber-700">
                    {players.length} Players Registered
                  </span>
                </div>

                {players.length > 0 ? (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200/60 bg-white shadow-sm">
                    <table className="min-w-full divide-y divide-slate-100 text-sm font-mono">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Player ID</th>
                          <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Name</th>
                          <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Position</th>
                          <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Overall</th>
                          <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Price Paid</th>
                          <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Acquired</th>
                          <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {players.map((player) => (
                          <tr key={player.id} className="hover:bg-slate-50/50 transition-all">
                            <td className="px-6 py-4 whitespace-nowrap text-slate-600 font-semibold">{player.player_id}</td>
                            <td className="px-6 py-4 whitespace-nowrap font-bold text-slate-900">{player.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 border border-slate-200 text-slate-700 uppercase">
                                {player.position}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-1 font-bold text-slate-800">
                                {player.overall_rating}
                                <svg className="w-3.5 h-3.5 text-amber-400 fill-amber-400" viewBox="0 0 20 20">
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-slate-800 font-semibold">
                              {player.price_paid ? formatCurrency(player.price_paid) : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-slate-500 text-xs">
                              {player.acquired_at ? formatDate(player.acquired_at) : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <button
                                onClick={() => handleRemovePlayer(player)}
                                className="p-2 rounded-xl bg-rose-50 border border-rose-200/60 text-rose-600 hover:bg-rose-100 transition-all"
                                title="Remove Player"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-16 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                    <Users className="w-10 h-10 mx-auto text-slate-400 mb-3" />
                    <h4 className="text-base font-bold text-slate-800">No Roster Configured</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 font-mono">
                      Players will appear in the squad once they are successfully drafted or bought in live auctions.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Transactions Tab Content */}
            {activeTab === 'transactions' && (
              <div className="p-6 sm:p-8 space-y-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-amber-500" />
                  Transaction Log
                </h3>

                {transactions.length > 0 ? (
                  <div className="space-y-3 font-mono">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200/60 hover:border-slate-350 transition-all gap-4">
                        <div className="flex items-start gap-4">
                          <div className={`p-2.5 rounded-xl border flex-shrink-0 ${
                            tx.type === 'bid_won' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                            tx.type === 'bid_lost' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                            'bg-blue-50 border-blue-200 text-blue-750'
                          }`}>
                            <Info className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{tx.description}</p>
                            {tx.player_name && (
                              <p className="text-xs text-slate-500 mt-0.5">Player: {tx.player_name}</p>
                            )}
                            <p className="text-[10px] text-slate-400 mt-1">{formatDateTime(tx.timestamp)}</p>
                          </div>
                        </div>
                        <div className="text-right sm:ml-auto">
                          <span className={`text-lg font-extrabold ${
                            tx.amount < 0 ? 'text-rose-600' : 
                            tx.amount > 0 ? 'text-emerald-600' : 
                            'text-slate-500'
                          }`}>
                            {tx.amount > 0 ? '+' : ''}{tx.amount !== 0 ? formatCurrency(tx.amount) : '-'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                    <ArrowRightLeft className="w-10 h-10 mx-auto text-slate-400 mb-3" />
                    <h4 className="text-base font-bold text-slate-800">Transaction History Clear</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 font-mono">
                      No monetary or budget operations have been recorded for this squad during the active season.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Settings Tab Content */}
            {activeTab === 'settings' && (
              <div className="p-6 sm:p-8 space-y-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-amber-500" />
                  Management Console
                </h3>

                <div className="grid grid-cols-1 gap-4 font-mono text-sm">
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-slate-800">Deactivate / Activate Squad</h4>
                      <p className="text-xs text-slate-500 mt-1">
                        Temporarily suspend team roster from placing bids or participating in operations.
                      </p>
                    </div>
                    <button
                      onClick={handleToggleStatus}
                      className={`px-5 py-2.5 rounded-xl font-bold transition-all text-xs border ${
                        team.is_active
                          ? 'bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100'
                          : 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {team.is_active ? 'Deactivate Team' : 'Activate Team'}
                    </button>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-slate-800">Manual Balance Adjustment</h4>
                      <p className="text-xs text-slate-500 mt-1">
                        Inject currency or dock budget points manually. This will generate a transaction log.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowAdjustBalanceModal(true)}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
                    >
                      Adjust Balance
                    </button>
                  </div>

                  <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-rose-800">Danger Zone: Purge Squad</h4>
                      <p className="text-xs text-rose-600/80 mt-1">
                        Permanently delete this squad roster, reset all balances, and delete associated history.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this team? This action cannot be undone.')) {
                          alert('Delete team - Backend to be implemented');
                          router.push('/dashboard/superadmin/teams');
                        }
                      }}
                      className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all text-xs shadow-sm"
                    >
                      Delete Team
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Edit Team Modal */}
        {showEditModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="console-card bg-white border border-slate-200 shadow-lg rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Edit className="w-5 h-5 text-amber-500" />
                  Edit Squad
                </h2>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditForm({ teamName: '', logoUrl: '' });
                  }}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-650 transition-all"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateTeam} className="space-y-4 font-mono text-sm">
                <div>
                  <label className="block text-xs text-slate-500 mb-2 uppercase tracking-wider font-semibold">Current Logo</label>
                  <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto overflow-hidden shadow-inner">
                    {(editForm.logoUrl || team.logo_url) ? (
                      <img 
                        src={editForm.logoUrl || team.logo_url} 
                        alt="Team logo preview"
                        className="max-w-full max-h-full object-contain p-2"
                      />
                    ) : (
                      <span className="text-amber-600 font-bold text-xl">{team.team_code}</span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-2 uppercase tracking-wider font-semibold">Upload Logo Asset</label>
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-200 border-dashed rounded-2xl cursor-pointer bg-slate-50 hover:bg-slate-100/70 hover:border-amber-400/40 transition-all">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
                        {uploadingLogo ? (
                          <>
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mb-2" />
                            <p className="text-xs text-slate-500">Uploading to storage server...</p>
                          </>
                        ) : (
                          <>
                            <Camera className="w-8 h-8 mb-2 text-slate-400" />
                            <p className="text-xs text-slate-550 font-semibold mb-0.5">Click to browse asset</p>
                            <p className="text-[10px] text-slate-400">PNG, JPG or SVG (Max 5MB)</p>
                          </>
                        )}
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        disabled={uploadingLogo}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label htmlFor="logo_url_input" className="block text-xs text-slate-500 mb-1.5 uppercase tracking-wider font-semibold">Or logo URL link</label>
                  <input
                    type="url"
                    id="logo_url_input"
                    value={editForm.logoUrl}
                    onChange={(e) => setEditForm({ ...editForm, logoUrl: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-800 transition-all"
                    placeholder="https://example.com/logo.png"
                  />
                </div>

                <div>
                  <label htmlFor="team_name_input" className="block text-xs text-slate-500 mb-1.5 uppercase tracking-wider font-semibold">Squad Name</label>
                  <input
                    type="text"
                    id="team_name_input"
                    value={editForm.teamName}
                    onChange={(e) => setEditForm({ ...editForm, teamName: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-800 transition-all font-semibold"
                    placeholder={team.team_name}
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditModal(false);
                      setEditForm({ teamName: '', logoUrl: '' });
                    }}
                    className="flex-1 py-3 border border-slate-200/60 rounded-xl text-slate-700 bg-white hover:bg-slate-50 transition-all font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploadingLogo}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Adjust Balance Modal */}
        {showAdjustBalanceModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="console-card bg-white border border-slate-200 shadow-lg rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-amber-500" />
                  Adjust Balance
                </h2>
                <button
                  onClick={() => setShowAdjustBalanceModal(false)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-650 transition-all"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAdjustBalance} className="space-y-4 font-mono text-sm">
                <div>
                  <label htmlFor="adjust_amount_input" className="block text-xs text-slate-500 mb-1.5 uppercase tracking-wider font-semibold">Adjustment Amount (₹)</label>
                  <input
                    type="number"
                    id="adjust_amount_input"
                    required
                    value={balanceAdjustment.amount}
                    onChange={(e) => setBalanceAdjustment({ ...balanceAdjustment, amount: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-800 transition-all font-semibold"
                    placeholder="E.g. 5000 or -2000"
                  />
                  <div className="flex justify-between mt-3 text-xs text-slate-500">
                    <span>Current: {formatCurrency(team.balance)}</span>
                    {balanceAdjustment.amount !== 0 && (
                      <span className="font-bold text-slate-700">
                        Target: {formatCurrency(team.balance + balanceAdjustment.amount)}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="adjust_reason_input" className="block text-xs text-slate-500 mb-1.5 uppercase tracking-wider font-semibold">Adjustment Reason</label>
                  <textarea
                    id="adjust_reason_input"
                    required
                    rows={3}
                    value={balanceAdjustment.reason}
                    onChange={(e) => setBalanceAdjustment({ ...balanceAdjustment, reason: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-800 transition-all resize-none"
                    placeholder="Explain the purpose of this manual credit or debit..."
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAdjustBalanceModal(false)}
                    className="flex-1 py-3 border border-slate-200/60 rounded-xl text-slate-700 bg-white hover:bg-slate-50 transition-all font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold transition-all shadow-sm"
                  >
                    Apply Adjustment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
  );
}
