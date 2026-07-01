'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import {
  ArrowLeft,
  Clock,
  DollarSign,
  Users,
  Check,
  Calendar,
  ChevronRight,
  Info,
  Sparkles,
  Plus,
  Play,
  Layers
} from 'lucide-react';

interface BulkRound {
  id: number;
  season_id: string;
  round_number: number;
  status: string;
  base_price: number;
  start_time?: string;
  end_time?: string;
  duration_seconds: number;
  player_count: number;
  sold_count: number;
  created_at: string;
}

export default function BulkRoundsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [bulkRounds, setBulkRounds] = useState<BulkRound[]>([]);
  const [currentSeasonId, setCurrentSeasonId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [auctionSettings, setAuctionSettings] = useState<any[]>([]);
  const [selectedAuctionSettingsId, setSelectedAuctionSettingsId] = useState<string>('');

  // Form state
  const [formData, setFormData] = useState({
    base_price: '10',
    duration_hours: '0',
    duration_minutes: '5',
    duration_seconds: '0',
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch current season
  useEffect(() => {
    const fetchCurrentSeason = async () => {
      if (!user || user.role !== 'committee_admin') return;

      try {
        const seasonsQuery = query(
          collection(db, 'seasons'),
          where('isActive', '==', true),
          limit(1)
        );
        const seasonsSnapshot = await getDocs(seasonsQuery);

        if (!seasonsSnapshot.empty) {
          const seasonId = seasonsSnapshot.docs[0].id;
          setCurrentSeasonId(seasonId);
          
          // Fetch auction settings for this season
          try {
            const settingsResponse = await fetchWithTokenRefresh(
              `/api/auction-settings/all?season_id=${seasonId}`
            );
            const settingsData = await settingsResponse.json();
            if (settingsData.success && settingsData.data) {
              setAuctionSettings(settingsData.data);
              // Auto-select first setting if none selected
              if (!selectedAuctionSettingsId && settingsData.data.length > 0) {
                setSelectedAuctionSettingsId(String(settingsData.data[0].id));
              }
            }
          } catch (err) {
            console.error('Error fetching auction settings:', err);
          }
        }
      } catch (err) {
        console.error('Error fetching season:', err);
      }
    };

    fetchCurrentSeason();
  }, [user]);

  // Fetch bulk rounds
  useEffect(() => {
    const fetchBulkRounds = async () => {
      if (!currentSeasonId) return;

      setIsLoading(true);
      try {
        const params = new URLSearchParams({ 
          season_id: currentSeasonId,
          round_type: 'bulk'
        });
        if (filterStatus !== 'all') {
          params.append('status', filterStatus);
        }

        const response = await fetchWithTokenRefresh(`/api/rounds?${params}`);
        const { success, data } = await response.json();

        if (success) {
          setBulkRounds(data);
        }
      } catch (err) {
        console.error('Error fetching bulk rounds:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBulkRounds();
  }, [currentSeasonId, filterStatus]);

  const [isCreating, setIsCreating] = useState(false);

  const handleCreateBulkRound = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentSeasonId) {
      alert('No active season found');
      return;
    }

    if (!selectedAuctionSettingsId) {
      alert('Please select auction settings');
      return;
    }

    // Get next round number
    const nextRoundNumber = bulkRounds.length > 0 
      ? Math.max(...bulkRounds.map(r => r.round_number)) + 1 
      : 1;

    setIsCreating(true);
    try {
      const response = await fetchWithTokenRefresh('/api/admin/bulk-rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auction_settings_id: parseInt(selectedAuctionSettingsId),
          base_price: parseInt(formData.base_price),
          duration_hours: parseInt(formData.duration_hours),
          duration_minutes: parseInt(formData.duration_minutes),
          duration_seconds: parseInt(formData.duration_seconds),
        }),
      });

      const { success, data, error } = await response.json();

      if (success) {
        alert(`Bulk round created successfully with ${data.player_count || 0} players!`);
        setShowCreateForm(false);
        setFormData({
          base_price: '10',
          duration_hours: '0',
          duration_minutes: '5',
          duration_seconds: '0',
        });
        // Refresh rounds
        const params = new URLSearchParams({ 
          season_id: currentSeasonId,
          round_type: 'bulk'
        });
        const refreshResponse = await fetchWithTokenRefresh(`/api/rounds?${params}`);
        const refreshData = await refreshResponse.json();
        if (refreshData.success) {
          setBulkRounds(refreshData.data);
        }
      } else {
        alert(`Error: ${error}`);
      }
    } catch (err) {
      console.error('Error creating bulk round:', err);
      alert('Failed to create bulk round');
    } finally {
      setIsCreating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-700';
      case 'scheduled': return 'bg-blue-100 text-blue-700';
      case 'active': return 'bg-green-100 text-green-700 animate-pulse';
      case 'completed': return 'bg-purple-100 text-purple-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getActiveRound = () => {
    return bulkRounds.find(r => r.status === 'active');
  };

  if (loading || !user || user.role !== 'committee_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono font-mono">Initializing Console...</p>
        </div>
      </div>
    );
  }

  const activeRound = getActiveRound();

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Layers className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">SYSTEM CONTROL</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5 animate-duration-500">
                Bulk Bidding Rounds
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Manage bulk bidding rounds where teams can bid on multiple players simultaneously.
              </p>
            </div>
          </div>
          {activeRound && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold uppercase font-mono shadow-sm">
                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
                <span>Active Round Open</span>
              </span>
            </div>
          )}
        </div>

        {/* Active Round Alert */}
        {activeRound && (
          <div className="console-card bg-emerald-50 border border-emerald-200/60 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-emerald-600 border border-emerald-700 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                <Sparkles className="w-5 h-5 text-emerald-100 animate-pulse" />
              </div>
              <div>
                <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider font-mono">ACTIVE BULK ROUND</span>
                <h3 className="text-sm sm:text-base font-extrabold text-emerald-900 mt-0.5">Round {activeRound.round_number} is currently active</h3>
                <p className="text-xs text-emerald-705 font-mono mt-0.5">
                  Active with {activeRound.player_count} players. Bidding is open.
                </p>
              </div>
            </div>
            <Link
              href={`/dashboard/committee/bulk-rounds/${activeRound.id}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              <Play className="w-3.5 h-3.5 text-emerald-105" /> Manage Round
            </Link>
          </div>
        )}

        {/* Info Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          <h2 className="text-sm sm:text-base font-extrabold mb-4 uppercase text-slate-900 tracking-wide flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-500" />
            How Bulk Bidding Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-amber-600 font-mono uppercase bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Step 1</span>
              <h4 className="text-xs font-bold text-slate-900 mt-1">Fixed Price Bidding</h4>
              <p className="text-xs text-slate-500 font-mono leading-relaxed">
                Teams can bid on multiple players at a fixed base price during the round duration.
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-amber-600 font-mono uppercase bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Step 2</span>
              <h4 className="text-xs font-bold text-slate-900 mt-1">Conflict Resolution</h4>
              <p className="text-xs text-slate-500 font-mono leading-relaxed">
                If multiple teams bid for the same player, a tiebreaker auction will be held to resolve it.
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-amber-600 font-mono uppercase bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Step 3</span>
              <h4 className="text-xs font-bold text-slate-900 mt-1">Quick Assignment</h4>
              <p className="text-xs text-slate-500 font-mono leading-relaxed">
                This helps teams fill remaining slots efficiently and ensures all remaining eligible players get assigned.
              </p>
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mr-2">Filter:</span>
            {['all', 'draft', 'scheduled', 'active', 'completed'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all duration-200 border cursor-pointer ${
                  filterStatus === status
                    ? 'bg-slate-800 border-slate-900 text-white shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            disabled={!!activeRound}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title={activeRound ? 'Cannot create while a round is active' : 'Create new bulk round'}
          >
            <Plus className="w-3.5 h-3.5 text-emerald-100" /> Create Bulk Round
          </button>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm animate-in fade-in slide-in-from-top-4 duration-200">
            <h2 className="text-sm sm:text-base font-extrabold mb-6 uppercase text-slate-900 tracking-wide flex items-center gap-2">
              <Plus className="w-4 h-4 text-amber-500" />
              Create New Bulk Bidding Round
            </h2>
            <form onSubmit={handleCreateBulkRound} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Auction Settings Selector */}
                <div className="md:col-span-2">
                  <label htmlFor="auction_settings" className="block text-xs font-bold text-slate-700 uppercase font-mono mb-2">
                    Auction Settings <span className="text-[10px] text-slate-400 font-normal">(Window Type)</span>
                  </label>
                  <select
                    id="auction_settings"
                    value={selectedAuctionSettingsId}
                    onChange={(e) => setSelectedAuctionSettingsId(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono text-sm"
                  >
                    <option value="">Select auction settings...</option>
                    {auctionSettings.map(setting => {
                      const windowLabel = setting.auction_window
                        .split('_')
                        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ');
                      return (
                        <option key={setting.id} value={setting.id}>
                          {windowLabel} (Max {setting.max_rounds} rounds, {setting.max_squad_size} players)
                        </option>
                      );
                    })}
                  </select>
                  <p className="mt-1.5 text-xs text-slate-400 font-mono">
                    Choose settings based on auction type.
                    {auctionSettings.length === 0 && (
                      <Link href="/dashboard/committee/auction-settings" className="text-blue-600 hover:underline ml-1.5">
                        Create settings first  &rarr; 
                      </Link>
                    )}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase font-mono mb-2">Base Price</label>
                  <div className="relative rounded-xl shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <span className="text-slate-400 font-mono text-xs">£</span>
                    </div>
                    <input
                      type="number"
                      required
                      value={formData.base_price}
                      onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                      className="w-full pl-8 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono text-sm"
                      min="1"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400 font-mono">Fixed price for all players in this round</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase font-mono mb-2 flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-slate-400" />
                    Round Duration
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 mb-1 text-center uppercase">Hours</label>
                      <input
                        type="number"
                        value={formData.duration_hours}
                        onChange={(e) => setFormData({ ...formData, duration_hours: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-2 py-3 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-center font-mono text-sm"
                        min="0"
                        max="72"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 mb-1 text-center uppercase">Mins</label>
                      <input
                        type="number"
                        value={formData.duration_minutes}
                        onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-2 py-3 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-center font-mono text-sm"
                        min="0"
                        max="59"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 mb-1 text-center uppercase">Secs</label>
                      <input
                        type="number"
                        value={formData.duration_seconds}
                        onChange={(e) => setFormData({ ...formData, duration_seconds: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-2 py-3 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-center font-mono text-sm"
                        min="0"
                        max="59"
                      />
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 bg-slate-50 border border-slate-100 p-3 rounded-xl font-mono text-xs text-slate-500">
                    <p>
                      Total: <span className="font-bold text-slate-700">{parseInt(formData.duration_hours) * 3600 + parseInt(formData.duration_minutes) * 60 + parseInt(formData.duration_seconds)}</span> seconds
                      ({parseInt(formData.duration_hours)}h {parseInt(formData.duration_minutes)}m {parseInt(formData.duration_seconds)}s)
                    </p>
                    <p className="text-amber-600 font-bold flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      Timer ends: {(() => {
                        const totalSeconds = parseInt(formData.duration_hours) * 3600 + parseInt(formData.duration_minutes) * 60 + parseInt(formData.duration_seconds);
                        const endTime = new Date(Date.now() + totalSeconds * 1000);
                        return endTime.toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        });
                      })()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-all font-mono text-xs uppercase tracking-wider font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all font-mono text-xs uppercase tracking-wider font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                >
                  {isCreating ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>
                      Creating...
                    </>
                  ) : (
                    'Create Bulk Round'
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Rounds List */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            <h2 className="text-sm sm:text-base font-extrabold uppercase text-slate-900 tracking-wide flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-500" />
              All Bulk Rounds
            </h2>
            <span className="bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-mono px-2.5 py-1 rounded-full uppercase tracking-wider font-bold">
              {bulkRounds.length} Total
            </span>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
              <p className="mt-4 text-xs text-slate-400 uppercase tracking-wider font-bold font-mono">Loading bulk rounds...</p>
            </div>
          ) : bulkRounds.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <Layers className="w-10 h-10 mx-auto text-slate-300 mb-3" />
              <h3 className="text-sm font-bold text-slate-400 font-mono uppercase tracking-wider mb-1">No bulk rounds found</h3>
              <p className="text-slate-400 text-xs font-mono">Create your first bulk bidding round to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {bulkRounds.map((round) => (
                <Link
                  key={round.id}
                  href={`/dashboard/committee/bulk-rounds/${round.id}`}
                  className="block bg-slate-50/40 hover:bg-slate-50/90 border border-slate-200 hover:border-amber-500/30 rounded-2xl p-5 transition-all duration-200 group hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2.5">
                        <h3 className="text-sm font-extrabold text-slate-800 font-mono uppercase tracking-wide group-hover:text-amber-600 transition-colors">
                          Bulk Round {round.round_number}
                        </h3>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${
                          round.status === 'active'
                            ? 'bg-green-50 text-green-700 border-green-200 animate-pulse'
                            : round.status === 'completed'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : round.status === 'scheduled'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : round.status === 'cancelled'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}>
                          {round.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500 font-mono">
                        <span className="flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                          £{round.base_price}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {round.duration_seconds}s
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          {round.player_count} players
                        </span>
                        {round.sold_count > 0 && (
                          <span className="flex items-center gap-1.5 text-green-700 font-bold">
                            <Check className="w-3.5 h-3.5 text-green-500" />
                            {round.sold_count} sold
                          </span>
                        )}
                        {round.start_time && (
                          <span className="flex items-center gap-1.5 text-slate-400">
                            <Calendar className="w-3.5 h-3.5 text-slate-300" />
                            {new Date(round.start_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
