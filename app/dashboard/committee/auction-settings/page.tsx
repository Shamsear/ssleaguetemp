'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import { 
  ArrowLeft, 
  Save, 
  RefreshCw, 
  AlertTriangle, 
  TrendingUp, 
  Info,
  Calendar,
  DollarSign,
  Users,
  Clock,
  Layers,
  Settings,
  AlertCircle
} from 'lucide-react';

interface AuctionSettings {
  id: number;
  season_id: string;
  auction_window: string;
  max_rounds: number;
  min_balance_per_round: number;
  max_squad_size: number;
  contract_duration: number;
  phase_1_end_round: number;
  phase_1_min_balance: number;
  phase_2_end_round: number;
  phase_2_min_balance: number;
  phase_3_min_balance: number;
  created_at: string;
  updated_at: string;
}

interface AuctionStats {
  total_rounds: number;
  completed_rounds: number;
  remaining_rounds: number;
}

export default function AuctionSettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { alertState, showAlert, closeAlert } = useModal();
  const [settings, setSettings] = useState<AuctionSettings | null>(null);
  const [currentSeasonId, setCurrentSeasonId] = useState<string | null>(null);
  const [stats, setStats] = useState<AuctionStats>({
    total_rounds: 0,
    completed_rounds: 0,
    remaining_rounds: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [formData, setFormData] = useState({
    auction_window: 'season_start',
    max_rounds: 25,
    min_balance_per_round: 30,
    max_squad_size: 25,
    contract_duration: 2,
    phase_1_end_round: 18,
    phase_1_min_balance: 30,
    phase_2_end_round: 20,
    phase_2_min_balance: 30,
    phase_3_min_balance: 10,
  });

  const handleMaxRoundsChange = (newMaxRounds: number) => {
    const phase1Percent = 0.72;
    const phase2Percent = 0.80;
    
    const newPhase1 = Math.max(1, Math.floor(newMaxRounds * phase1Percent));
    const newPhase2 = Math.max(newPhase1 + 1, Math.floor(newMaxRounds * phase2Percent));
    
    setFormData(prev => ({
      ...prev,
      max_rounds: newMaxRounds,
      phase_1_end_round: Math.min(newPhase1, newMaxRounds - 2),
      phase_2_end_round: Math.min(newPhase2, newMaxRounds),
    }));
    setHasUnsavedChanges(true);
  };

  const handleFormChange = (updates: Partial<typeof formData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    setHasUnsavedChanges(true);
  };

  const fetchSettings = async () => {
    try {
      const response = await fetchWithTokenRefresh('/api/auction-settings');
      const { data, success } = await response.json();

      if (success) {
        setSettings(data.settings);
        setStats(data.stats);
        
        if (data.settings?.season_id) {
          setCurrentSeasonId(data.settings.season_id);
        }
        
        if (!hasUnsavedChanges && data.settings) {
          setFormData({
            auction_window: data.settings.auction_window || 'season_start',
            max_rounds: data.settings.max_rounds,
            min_balance_per_round: data.settings.min_balance_per_round,
            max_squad_size: data.settings.max_squad_size || 25,
            contract_duration: data.settings.contract_duration || 2,
            phase_1_end_round: data.settings.phase_1_end_round || 18,
            phase_1_min_balance: data.settings.phase_1_min_balance || 30,
            phase_2_end_round: data.settings.phase_2_end_round || 20,
            phase_2_min_balance: data.settings.phase_2_min_balance || 30,
            phase_3_min_balance: data.settings.phase_3_min_balance || 10,
          });
        }
      }
    } catch (err) {
      console.error('Error fetching auction settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveSeason = async () => {
    try {
      const seasonsQuery = query(
        collection(db, 'seasons'),
        where('isActive', '==', true)
      );
      const seasonsSnapshot = await getDocs(seasonsQuery);

      if (!seasonsSnapshot.empty) {
        const seasonDoc = seasonsSnapshot.docs[0];
        const seasonId = seasonDoc.id;
        setCurrentSeasonId(seasonId);
        fetchSettings();
      } else {
        console.error('No active season found');
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching active season:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
    if (!authLoading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user?.role === 'committee_admin') {
      fetchActiveSeason();
    }
  }, [user]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh && user?.role === 'committee_admin' && currentSeasonId) {
      interval = setInterval(fetchSettings, 15000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, user, hasUnsavedChanges, currentSeasonId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.phase_1_end_round >= formData.max_rounds) {
      showAlert({
        type: 'error',
        title: 'Validation Error',
        message: `Phase 1 End Round (${formData.phase_1_end_round}) must be less than Maximum Rounds (${formData.max_rounds}).`
      });
      return;
    }
    
    if (formData.phase_2_end_round > formData.max_rounds) {
      showAlert({
        type: 'error',
        title: 'Validation Error',
        message: `Phase 2 End Round (${formData.phase_2_end_round}) cannot exceed Maximum Rounds (${formData.max_rounds}).`
      });
      return;
    }
    
    if (formData.phase_1_end_round >= formData.phase_2_end_round) {
      showAlert({
        type: 'error',
        title: 'Validation Error',
        message: `Phase 1 End Round (${formData.phase_1_end_round}) must be less than Phase 2 End Round (${formData.phase_2_end_round}).`
      });
      return;
    }
    
    setSaving(true);

    try {
      if (!currentSeasonId) {
        showAlert({
          type: 'error',
          title: 'Season Error',
          message: 'No active season found. Please ensure a season is active.'
        });
        setSaving(false);
        return;
      }

      const response = await fetchWithTokenRefresh('/api/auction-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, season_id: currentSeasonId }),
      });

      const result = await response.json();

      if (result.success) {
        setHasUnsavedChanges(false);
        setSettings(result.data);
        showAlert({
          type: 'success',
          title: 'Settings Saved',
          message: 'Auction settings have been saved successfully.'
        });
        setTimeout(() => fetchSettings(), 100);
      } else {
        showAlert({
          type: 'error',
          title: 'Save Failed',
          message: `Error: ${result.error}`
        });
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      showAlert({
        type: 'error',
        title: 'Save Failed',
        message: 'An error occurred while saving the auction settings.'
      });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-slate-550 font-mono font-extrabold uppercase tracking-wider text-xs">Loading auction settings...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'committee_admin') {
    return null;
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-4xl mx-auto relative z-10 space-y-8">
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
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">COMMITTEE CONSOLE</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              Auction Settings
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Configure parameters, squad limits, and budget reserve rules for the active season.
            </p>
          </div>
          {currentSeasonId && (
            <div className="bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-xl border border-slate-700 shadow-sm shrink-0">
              Active Season: {currentSeasonId}
            </div>
          )}
        </div>

        {/* No Settings Warning Card */}
        {!settings && (
          <div className="console-card border-2 border-amber-500/20 bg-amber-50/40 p-5 rounded-3xl flex items-start gap-4">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="font-mono text-xs">
              <h3 className="font-extrabold text-amber-805 uppercase tracking-wider">No Auction Settings Found</h3>
              <p className="text-slate-500 mt-1">
                No auction settings have been configured yet for this season. Please complete the parameters form below and save to initialize.
              </p>
            </div>
          </div>
        )}

        {/* Auction Settings Overview Stats */}
        {settings && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">Total Rounds</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-2xl font-black text-amber-600">{stats.total_rounds}</span>
                  <span className="text-slate-400 text-xs">/ {formData.max_rounds}</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Rounds created in this auction</p>
            </div>

            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">Completed Rounds</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-2xl font-black text-green-600">{stats.completed_rounds}</span>
                  <span className="text-slate-400 text-xs">/ {formData.max_rounds}</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Rounds that have been finalized</p>
            </div>

            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">Remaining Rounds</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-2xl font-black text-blue-600">{stats.remaining_rounds}</span>
                  <span className="text-slate-400 text-xs">/ {formData.max_rounds}</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Rounds that can still be created</p>
            </div>
          </div>
        )}

        {/* Configuration Form Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          <h3 className="text-sm font-mono font-bold text-slate-900 uppercase tracking-wider mb-6 flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-500" />
            Configure Auction Settings
          </h3>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Window type select */}
              <div className="md:col-span-2">
                <label htmlFor="auction_window" className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Auction Window Type
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                    <Calendar className="w-4 h-4" />
                  </span>
                  <select
                    id="auction_window"
                    value={formData.auction_window}
                    onChange={(e) => handleFormChange({ auction_window: e.target.value })}
                    required
                    className="pl-10 w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-mono font-bold appearance-none cursor-pointer"
                  >
                    <option value="season_start">Season Start</option>
                    <option value="transfer_window">Transfer Window</option>
                    <option value="mid_season">⚡ Mid-Season</option>
                    <option value="winter_window">Winter Window</option>
                    <option value="summer_window">Summer Window</option>
                  </select>
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400 font-mono">Select the type of auction window these settings apply to</p>
              </div>

              {/* Max Rounds */}
              <div>
                <label htmlFor="max_rounds" className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Maximum Rounds
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                    <Layers className="w-4 h-4" />
                  </span>
                  <input
                    type="number"
                    id="max_rounds"
                    value={formData.max_rounds}
                    onChange={(e) => handleMaxRoundsChange(parseInt(e.target.value) || 1)}
                    min="1"
                    required
                    className="pl-10 w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-mono font-bold"
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400 font-mono">Max rounds in this auction. Phases will auto-adjust.</p>
              </div>

              {/* Min Balance */}
              <div>
                <label htmlFor="min_balance_per_round" className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Min Balance Per Round
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                    <DollarSign className="w-4 h-4" />
                  </span>
                  <input
                    type="number"
                    id="min_balance_per_round"
                    value={formData.min_balance_per_round}
                    onChange={(e) => handleFormChange({ min_balance_per_round: parseInt(e.target.value) || 0 })}
                    min="0"
                    required
                    className="pl-10 w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-mono font-bold"
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400 font-mono">Minimum balance required per remaining round (default: 30)</p>
              </div>

              {/* Max squad size */}
              <div>
                <label htmlFor="max_squad_size" className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Maximum Squad Size
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                    <Users className="w-4 h-4" />
                  </span>
                  <input
                    type="number"
                    id="max_squad_size"
                    value={formData.max_squad_size}
                    onChange={(e) => handleFormChange({ max_squad_size: parseInt(e.target.value) || 1 })}
                    min="1"
                    max="50"
                    required
                    className="pl-10 w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-mono font-bold"
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400 font-mono">Maximum number of players each team can have (default: 25)</p>
              </div>

              {/* Contract Duration */}
              <div>
                <label htmlFor="contract_duration" className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Contract Duration (years)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                    <Clock className="w-4 h-4" />
                  </span>
                  <input
                    type="number"
                    id="contract_duration"
                    value={formData.contract_duration}
                    onChange={(e) => handleFormChange({ contract_duration: parseInt(e.target.value) || 1 })}
                    min="1"
                    max="5"
                    required
                    className="pl-10 w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-mono font-bold"
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400 font-mono">Default contract duration for players (default: 2 years)</p>
              </div>
            </div>

            {/* Phase reserve configuration */}
            <div className="mt-8 pt-6 border-t border-slate-100">
              <h4 className="text-sm font-mono font-bold text-slate-900 uppercase tracking-wider mb-2">Budget Reserve Phases</h4>
              <p className="text-xs text-slate-450 font-mono mb-4">Configure the three-phase reserve system to ensure teams maintain enough balance throughout the auction.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Phase 1 End Round */}
                <div>
                  <label htmlFor="phase_1_end_round" className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Phase 1 End Round (Strict Reserve)
                  </label>
                  <input
                    type="number"
                    id="phase_1_end_round"
                    value={formData.phase_1_end_round}
                    onChange={(e) => handleFormChange({ phase_1_end_round: parseInt(e.target.value) || 1 })}
                    min="1"
                    max={formData.max_rounds - 1}
                    required
                    className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-mono font-bold ${
                      formData.phase_1_end_round >= formData.max_rounds ? 'border-red-300 bg-red-50/50' : 'border-slate-200'
                    }`}
                  />
                  <p className="mt-1.5 text-[10px] text-slate-405 font-mono">Last round of Phase 1 (bids exceeding reserve are rejected)</p>
                  {formData.phase_1_end_round >= formData.max_rounds && (
                    <p className="mt-1 text-[10px] text-red-650 font-mono flex items-center gap-1 font-bold"><AlertCircle className="w-3 h-3" /> Must be less than max rounds ({formData.max_rounds})</p>
                  )}
                </div>

                {/* Phase 1 Reserve Amount */}
                <div>
                  <label htmlFor="phase_1_min_balance" className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Phase 1 Reserve Amount (£)
                  </label>
                  <input
                    type="number"
                    id="phase_1_min_balance"
                    value={formData.phase_1_min_balance}
                    onChange={(e) => handleFormChange({ phase_1_min_balance: parseInt(e.target.value) || 0 })}
                    min="0"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-mono font-bold"
                  />
                  <p className="mt-1.5 text-[10px] text-slate-405 font-mono">Reserve amount per round in Phase 1 (default: £30)</p>
                </div>

                {/* Phase 2 End Round */}
                <div>
                  <label htmlFor="phase_2_end_round" className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Phase 2 End Round (Soft Reserve)
                  </label>
                  <input
                    type="number"
                    id="phase_2_end_round"
                    value={formData.phase_2_end_round}
                    onChange={(e) => handleFormChange({ phase_2_end_round: parseInt(e.target.value) || 1 })}
                    min="1"
                    max={formData.max_rounds}
                    required
                    className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-mono font-bold ${
                      formData.phase_2_end_round > formData.max_rounds || formData.phase_2_end_round <= formData.phase_1_end_round
                        ? 'border-red-300 bg-red-50/50'
                        : 'border-slate-200'
                    }`}
                  />
                  <p className="mt-1.5 text-[10px] text-slate-405 font-mono">Last round of Phase 2 (bids allowed with warnings)</p>
                  {formData.phase_2_end_round > formData.max_rounds && (
                    <p className="mt-1 text-[10px] text-red-650 font-mono flex items-center gap-1 font-bold"><AlertCircle className="w-3 h-3" /> Cannot exceed max rounds ({formData.max_rounds})</p>
                  )}
                  {formData.phase_2_end_round <= formData.phase_1_end_round && (
                    <p className="mt-1 text-[10px] text-red-650 font-mono flex items-center gap-1 font-bold"><AlertCircle className="w-3 h-3" /> Must be greater than Phase 1 ({formData.phase_1_end_round})</p>
                  )}
                </div>

                {/* Phase 2 Reserve Amount */}
                <div>
                  <label htmlFor="phase_2_min_balance" className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Phase 2 Reserve Amount (£)
                  </label>
                  <input
                    type="number"
                    id="phase_2_min_balance"
                    value={formData.phase_2_min_balance}
                    onChange={(e) => handleFormChange({ phase_2_min_balance: parseInt(e.target.value) || 0 })}
                    min="0"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-mono font-bold"
                  />
                  <p className="mt-1.5 text-[10px] text-slate-405 font-mono">Reserve amount per round in Phase 2 (default: £30)</p>
                </div>

                {/* Phase 3 Reserve Amount */}
                <div>
                  <label htmlFor="phase_3_min_balance" className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Phase 3 Reserve Amount (£)
                  </label>
                  <input
                    type="number"
                    id="phase_3_min_balance"
                    value={formData.phase_3_min_balance}
                    onChange={(e) => handleFormChange({ phase_3_min_balance: parseInt(e.target.value) || 0 })}
                    min="0"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-mono font-bold"
                  />
                  <p className="mt-1.5 text-[10px] text-slate-405 font-mono">Reserve amount per slot in Phase 3 (default: £10)</p>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl transition-all duration-200 font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm hover:scale-[1.01]"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>

        {/* Explanation Alert Section */}
        <div className="console-card bg-blue-50/50 border border-blue-100/50 rounded-3xl p-5 flex items-start gap-4">
          <Info className="w-5 h-5 text-blue-550 shrink-0 mt-0.5" />
          <div className="font-mono text-xs text-blue-800">
            <h3 className="font-extrabold uppercase tracking-wider mb-1">About Minimum Balance Requirements</h3>
            <p className="text-blue-700/95 leading-relaxed">
              The minimum balance requirement ensures teams can participate in all remaining rounds of the auction.
            </p>
            <p className="text-blue-700/95 mt-1.5 leading-relaxed">
              For example, if 15 rounds are completed and 10 remain, with a minimum balance requirement of 30 per round,
              each team must have at least 300 in their balance to start the next round.
            </p>
            <p className="text-blue-705 mt-1.5 font-bold uppercase tracking-wide">
              This helps ensure fair competition throughout the entire auction process.
            </p>
          </div>
        </div>

        {/* Auto-refresh Controls */}
        <div className="flex items-center justify-between bg-white/60 border border-slate-200/60 rounded-3xl p-5 shadow-sm font-mono text-xs">
          <div className="flex items-center">
            <label htmlFor="auto-refresh-toggle" className="flex items-center cursor-pointer select-none">
              <div className="relative">
                <input
                  type="checkbox"
                  id="auto-refresh-toggle"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="sr-only"
                />
                <div className={`block w-10 h-6 rounded-full transition-colors ${autoRefresh ? 'bg-amber-500' : 'bg-slate-350'}`}></div>
                <div
                  className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${
                    autoRefresh ? 'translate-x-4' : ''
                  }`}
                ></div>
              </div>
              <div className="ml-3 text-slate-705 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''} text-slate-400`} />
                Auto-refresh data{' '}
                <span className={autoRefresh ? 'text-green-600' : 'text-slate-400 font-normal'}>
                  ({autoRefresh ? 'enabled' : 'disabled'})
                </span>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Modal Component */}
      <AlertModal
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />
    </div>
  );
}
