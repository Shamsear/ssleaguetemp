'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  DollarSign, 
  Coins, 
  TrendingUp, 
  ArrowLeft, 
  History, 
  Plus, 
  Settings, 
  Calendar, 
  AlertCircle, 
  User, 
  CheckCircle,
  HelpCircle,
  X,
  Search,
  Trash2
} from 'lucide-react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { createPortal } from 'react-dom';

interface CashPayment {
  payment_id: string;
  amount: number;
  season_id: string;
  date: any;
  notes: string;
  recorded_by: string;
}

interface CashDeduction {
  deduction_id: string;
  amount: number;
  season_id: string;
  date: any;
}

interface TeamCashBalance {
  team_id: string;
  team_name: string;
  team_logo?: string;
  payment_type: 'upfront' | 'seasonal';
  season_plans?: Record<string, 'upfront' | 'seasonal'>;
  remaining_balance: number;
  seasons_played: string[];
  payments: CashPayment[];
  deductions: CashDeduction[];
}

interface Season {
  id: string;
  name: string;
  isActive: boolean;
  status: string;
}

export default function SuperAdminCashBalances() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [balances, setBalances] = useState<TeamCashBalance[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [activeModalTeam, setActiveModalTeam] = useState<TeamCashBalance | null>(null);
  const [modalType, setModalType] = useState<'payment' | 'history' | 'subscription' | 'bulk' | 'bulk_plans' | 'bulk_delete' | null>(null);
  
  // Payment Form state
  const [paymentAmount, setPaymentAmount] = useState<string>('500');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Bulk Credit Form state
  const [bulkNotes, setBulkNotes] = useState<string>('Bulk Season Credit');
  const [bulkPlanType, setBulkPlanType] = useState<'upfront' | 'seasonal'>('seasonal');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'missing' | 'paid'>('all');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 1. Authenticate user
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // 2. Load all seasons from Firestore
  useEffect(() => {
    if (!user || user.role !== 'super_admin') return;

    const loadSeasons = async () => {
      try {
        const seasonsQuery = query(collection(db, 'seasons'), orderBy('created_at', 'desc'));
        const seasonsSnapshot = await getDocs(seasonsQuery);
        
        const loadedSeasons: Season[] = [];
        seasonsSnapshot.forEach(doc => {
          const data = doc.data();
          loadedSeasons.push({
            id: doc.id,
            name: data.name || doc.id,
            isActive: data.isActive || false,
            status: data.status || 'active',
          });
        });

        const getSeasonNum = (id: string) => parseInt(id.replace(/\D/g, '')) || 0;
        loadedSeasons.sort((a, b) => getSeasonNum(a.id) - getSeasonNum(b.id));
        setSeasons(loadedSeasons);

        // Select the active season by default, or the first season
        const activeSeason = loadedSeasons.find(s => s.isActive);
        if (activeSeason) {
          setSelectedSeasonId(activeSeason.id);
        } else if (loadedSeasons.length > 0) {
          setSelectedSeasonId(loadedSeasons[0].id);
        }
      } catch (err) {
        console.error('Error loading seasons:', err);
        setError('Failed to load seasons');
      }
    };

    loadSeasons();
  }, [user]);

  // 3. Load cash balances when seasonId changes
  useEffect(() => {
    if (!selectedSeasonId) return;

    loadBalances();
  }, [selectedSeasonId]);

  const loadBalances = async (silent = false) => {
    try {
      if (!silent) {
        setLoadingData(true);
      }
      setError(null);

      const res = await fetchWithTokenRefresh(`/api/reports/cash-balances?season_id=${selectedSeasonId}`);
      const data = await res.json();

      if (data.success) {
        setBalances(data.balances || []);
      } else {
        setError(data.error || 'Failed to load cash balances');
      }
    } catch (err) {
      console.error('Error loading cash balances:', err);
      setError('An error occurred while loading cash balances');
    } finally {
      if (!silent) {
        setLoadingData(false);
      }
    }
  };

  // 4. Handle subscription change instantly
  const toggleSubscriptionPlan = async (team: TeamCashBalance, currentPlan: 'upfront' | 'seasonal') => {
    const nextType = currentPlan === 'upfront' ? 'seasonal' : 'upfront';

    try {
      setSubmittingAction(true);
      const res = await fetchWithTokenRefresh('/api/reports/cash-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_type',
          teamId: team.team_id,
          teamName: team.team_name,
          paymentType: nextType,
          seasonId: selectedSeasonId,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        alert(docErrorMsg(data.error));
      } else {
        loadBalances(true); // Silent Refresh
      }
    } catch (err) {
      console.error('Error updating subscription type:', err);
      alert('Failed to update subscription');
    } finally {
      setSubmittingAction(false);
    }
  };

  // 5. Handle recording cash payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModalTeam) return;

    const amountNum = Number(paymentAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }

    try {
      setSubmittingAction(true);
      const res = await fetchWithTokenRefresh('/api/reports/cash-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_payment',
          teamId: activeModalTeam.team_id,
          teamName: activeModalTeam.team_name,
          amount: amountNum,
          seasonId: selectedSeasonId,
          notes: paymentNotes,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message);
        // Reset form
        setPaymentAmount('500');
        setPaymentNotes('');
        setActiveModalTeam(null);
        setModalType(null);
        loadBalances(true); // Silent Refresh
      } else {
        alert(docErrorMsg(data.error));
      }
    } catch (err) {
      console.error('Error recording cash payment:', err);
      alert('Failed to record payment');
    } finally {
      setSubmittingAction(false);
    }
  };
 
  // 5b. Handle recording bulk cash payment
  const handleBulkPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeasonId) return;

    try {
      setSubmittingAction(true);
      const res = await fetchWithTokenRefresh('/api/reports/cash-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_payment',
          seasonId: selectedSeasonId,
          notes: bulkNotes,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setBulkNotes('Bulk Season Credit');
        setModalType(null);
        loadBalances(true); // Silent Refresh
      } else {
        alert(docErrorMsg(data.error));
      }
    } catch (err) {
      console.error('Error recording bulk cash payment:', err);
      alert('Failed to record bulk payment');
    } finally {
      setSubmittingAction(false);
    }
  };

  // 5c. Handle deleting a cash payment log entry
  const handleDeletePayment = async (paymentId: string, amount: number) => {
    if (!activeModalTeam) return;
    if (!confirm(`Are you sure you want to delete this payment of ₹${amount.toLocaleString()}?`)) {
      return;
    }

    try {
      setSubmittingAction(true);
      const res = await fetchWithTokenRefresh('/api/reports/cash-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_payment',
          teamId: activeModalTeam.team_id,
          teamName: activeModalTeam.team_name,
          paymentId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message);
        // Instantly update local state of the opened history modal list
        setActiveModalTeam(prev => {
          if (!prev) return null;
          return {
            ...prev,
            payments: prev.payments.filter(p => p.payment_id !== paymentId),
          };
        });
        loadBalances(true); // Silent Refresh
      } else {
        alert(docErrorMsg(data.error));
      }
    } catch (err) {
      console.error('Error deleting payment:', err);
      alert('Failed to delete payment');
    } finally {
      setSubmittingAction(false);
    }
  };

  // 5d. Handle bulk update payment plans for all teams
  const handleBulkPlanUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeasonId) return;

    const seasonName = seasons.find(s => s.id === selectedSeasonId)?.name || selectedSeasonId;
    if (!confirm(`Are you sure you want to change ALL teams in ${seasonName} (${selectedSeasonId}) to be ${bulkPlanType === 'upfront' ? 'Upfront Subscribers' : 'Seasonal Payers'}?`)) {
      return;
    }

    try {
      setSubmittingAction(true);
      const res = await fetchWithTokenRefresh('/api/reports/cash-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_update_type',
          paymentType: bulkPlanType,
          seasonId: selectedSeasonId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setModalType(null);
        loadBalances(true); // Silent Refresh
      } else {
        alert(docErrorMsg(data.error));
      }
    } catch (err) {
      console.error('Error updating bulk plans:', err);
      alert('Failed to update plans');
    } finally {
      setSubmittingAction(false);
    }
  };

  // 5e. Handle bulk delete payments for all teams for the selected season
  const handleBulkDeletePayments = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeasonId) return;

    const seasonName = seasons.find(s => s.id === selectedSeasonId)?.name || selectedSeasonId;
    if (!confirm(`WARNING: Are you sure you want to delete ALL logged payments for ${seasonName} (${selectedSeasonId})? This will recalculate balances for every team and CANNOT be undone.`)) {
      return;
    }

    try {
      setSubmittingAction(true);
      const res = await fetchWithTokenRefresh('/api/reports/cash-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_delete_payments',
          seasonId: selectedSeasonId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setModalType(null);
        loadBalances(true); // Silent Refresh
      } else {
        alert(docErrorMsg(data.error));
      }
    } catch (err) {
      console.error('Error in bulk delete payments:', err);
      alert('Failed to delete payments');
    } finally {
      setSubmittingAction(false);
    }
  };

  const docErrorMsg = (err: any) => typeof err === 'string' ? err : 'Operation failed';

  // Calculations for summary cards
  const totalCollected = balances.reduce((sum, b) => {
    const paymentSum = b.payments?.reduce((pSum, p) => pSum + p.amount, 0) || 0;
    return sum + paymentSum;
  }, 0);

  const activeUpfrontCount = balances.filter(b => {
    const plan = selectedSeasonId === 'all' ? b.payment_type : (b.season_plans?.[selectedSeasonId] || b.payment_type || 'seasonal');
    return plan === 'upfront';
  }).length;

  const totalOwed = balances.reduce((sum, b) => {
    if (b.remaining_balance < 0) {
      return sum + Math.abs(b.remaining_balance);
    }
    return sum;
  }, 0);

  // Calculate preview counts for bulk credit modal dynamically
  const bulkCreditPreview = (() => {
    let upfrontCount = 0;
    let seasonalCount = 0;
    let skippedCount = 0;

    balances.forEach((team) => {
      const currentPlan = team.season_plans?.[selectedSeasonId] || team.payment_type || 'seasonal';
      
      // Chronological season-wise calculation and filtering out future seasons
      const getSeasonNum = (id: string) => parseInt(id.replace(/\D/g, '')) || 0;
      let seasonsToProcess = [...(team.seasons_played || [])];
      if (selectedSeasonId && selectedSeasonId !== 'all') {
        seasonsToProcess = seasonsToProcess.filter(sid => getSeasonNum(sid) <= getSeasonNum(selectedSeasonId));
        if (!seasonsToProcess.includes(selectedSeasonId)) {
          seasonsToProcess.push(selectedSeasonId);
        }
      }
      const sortedSeasons = seasonsToProcess.sort((a, b) => getSeasonNum(a) - getSeasonNum(b));
      
      let carryover = 0;
      const seasonStates: Record<string, { status: 'paid' | 'unpaid' | 'prepaid', debt: number }> = {};
      
      sortedSeasons.forEach((seasonId) => {
        const fee = 100;
        const paymentsThisSeason = team.payments?.filter((p: any) => p.season_id === seasonId).reduce((sum: number, p: any) => sum + p.amount, 0) || 0;
        const netBeforePayments = carryover - fee;
        const netAfterPayments = netBeforePayments + paymentsThisSeason;
        
        if (netAfterPayments >= 0) {
          const isPrepaid = paymentsThisSeason === 0 && carryover >= fee;
          seasonStates[seasonId] = {
            status: isPrepaid ? 'prepaid' : 'paid',
            debt: 0
          };
          carryover = netAfterPayments;
        } else {
          seasonStates[seasonId] = {
            status: 'unpaid',
            debt: Math.abs(netAfterPayments)
          };
          carryover = 0;
        }
      });
      
      const currentSeasonState = seasonStates[selectedSeasonId];
      const isPrepaidCovered = currentSeasonState ? currentSeasonState.status === 'prepaid' : (carryover >= 100);
      const hasPaid = team.payments?.some(p => p.season_id === selectedSeasonId) || isPrepaidCovered;

      if (hasPaid) {
        skippedCount++;
      } else {
        if (currentPlan === 'upfront') {
          upfrontCount++;
        } else {
          seasonalCount++;
        }
      }
    });

    return { upfrontCount, seasonalCount, skippedCount };
  })();

  const formatDate = (dateVal: any) => {
    if (!dateVal) return 'N/A';
    if (dateVal.seconds) {
      return new Date(dateVal.seconds * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    return new Date(dateVal).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading || !user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 pt-6 pb-12 px-4 sm:px-6 relative font-mono">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation & Title */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <Link 
              href="/dashboard/superadmin" 
              className="inline-flex items-center gap-2 text-xs uppercase font-extrabold text-slate-500 hover:text-amber-500 transition-colors mb-2"
            >
              <ArrowLeft className="w-3 h-3" /> Back to Dashboard
            </Link>
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-slate-800">
              Season Cash Balances <span className="text-amber-500">Editor</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Super Admin Panel</p>
          </div>

          {/* Season Selector */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase text-slate-500">Season:</span>
            <select
              value={selectedSeasonId}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl text-xs uppercase tracking-wider font-extrabold focus:outline-none focus:border-amber-400 shadow-sm"
            >
              <option value="all">All Seasons</option>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name} ({season.id}) {season.isActive ? '(Active)' : ''}
                </option>
              ))}
            </select>
            {selectedSeasonId !== 'all' && (
              <>
                <button
                  onClick={() => {
                    setModalType('bulk');
                    setBulkNotes('Bulk Season Credit');
                  }}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs uppercase tracking-wider font-extrabold rounded-xl shadow-md shadow-amber-500/10 hover:shadow-lg transition-all duration-200 flex items-center gap-1.5"
                >
                  <Coins className="w-3.5 h-3.5" /> Bulk Credit
                </button>
                <button
                  onClick={() => {
                    setModalType('bulk_plans');
                    setBulkPlanType('seasonal');
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-750 text-white text-xs uppercase tracking-wider font-extrabold rounded-xl shadow-md shadow-indigo-600/10 hover:shadow-lg transition-all duration-200 flex items-center gap-1.5"
                >
                  <Settings className="w-3.5 h-3.5" /> Bulk Plans
                </button>
                <button
                  onClick={() => {
                    setModalType('bulk_delete');
                  }}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-750 text-white text-xs uppercase tracking-wider font-extrabold rounded-xl shadow-md shadow-rose-600/10 hover:shadow-lg transition-all duration-200 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Bulk Delete
                </button>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
            <div>
              <p className="font-bold text-xs uppercase">Error Loading Data</p>
              <p className="text-[11px] font-sans mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Summary Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Card 1: Total Cash Collected */}
          <div className="console-card bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm hover:border-amber-400/40 transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Cash Collected</p>
                <h3 className="text-2xl font-black text-amber-500">₹{totalCollected.toLocaleString()}</h3>
              </div>
              <div className="p-2 bg-amber-50 text-amber-600 border border-amber-100 rounded-lg">
                <Coins className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[8px] text-slate-400 uppercase font-semibold mt-3">Sum of all team offline cash payments</p>
          </div>

          {/* Card 2: Upfront Subscribers */}
          <div className="console-card bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm hover:border-green-400/40 transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Upfront Subscribers</p>
                <h3 className="text-2xl font-black text-emerald-600">{activeUpfrontCount} Teams</h3>
              </div>
              <div className="p-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[8px] text-slate-400 uppercase font-semibold mt-3">Paid 500 cash for 5 seasons</p>
          </div>

          {/* Card 3: Total Outstanding Balance */}
          <div className="console-card bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm hover:border-rose-400/40 transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Outstanding Balance (Owed)</p>
                <h3 className="text-2xl font-black text-rose-600">₹{totalOwed.toLocaleString()}</h3>
              </div>
              <div className="p-2 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[8px] text-slate-400 uppercase font-semibold mt-3">Negative balances from seasonal players</p>
          </div>
        </div>

        {/* Cash Balances Management Table */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase text-slate-800 tracking-wider mb-5 flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-500" /> Cash Registration Statuses
          </h2>

          {/* Search & Status Filters */}
          {balances.length > 0 && (
            <div className="mb-5 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="relative w-full max-w-md">
                <input
                  type="text"
                  placeholder="Search team name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 pl-9 bg-slate-50/60 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-amber-400 focus:bg-white transition-all font-sans"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>

              {selectedSeasonId !== 'all' && (
                <div className="flex bg-slate-50 border border-slate-150 p-1 rounded-2xl w-full sm:w-auto text-[10px] font-black uppercase tracking-wider">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-3 py-1.5 rounded-xl transition-all duration-200 flex-1 sm:flex-none ${
                      statusFilter === 'all'
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-550 hover:bg-slate-100/80'
                    }`}
                  >
                    All ({balances.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('missing')}
                    className={`px-3 py-1.5 rounded-xl transition-all duration-200 flex-1 sm:flex-none flex items-center justify-center gap-1.5 ${
                      statusFilter === 'missing'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-rose-600 hover:bg-rose-50/50'
                    }`}
                  >
                    No Log ({balances.length - bulkCreditPreview.skippedCount})
                  </button>
                  <button
                    onClick={() => setStatusFilter('paid')}
                    className={`px-3 py-1.5 rounded-xl transition-all duration-200 flex-1 sm:flex-none flex items-center justify-center gap-1.5 ${
                      statusFilter === 'paid'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-emerald-600 hover:bg-emerald-50/50'
                    }`}
                  >
                    Paid/Prepaid ({bulkCreditPreview.skippedCount})
                  </button>
                </div>
              )}
            </div>
          )}

          {loadingData ? (
            <div className="py-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
              <p className="mt-4 text-xs text-slate-400 uppercase font-bold tracking-wider">Syncing Cash balances...</p>
            </div>
          ) : balances.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <HelpCircle className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-xs uppercase font-extrabold">No Teams Registered</p>
              <p className="text-[10px] font-bold uppercase mt-1">Register teams for this season first</p>
            </div>
          ) : ( (() => {
            const filteredBalances = balances
              .filter(t => t.team_name.toLowerCase().includes(searchQuery.toLowerCase()) || t.team_id.toLowerCase().includes(searchQuery.toLowerCase()))
              .filter(team => {
                if (selectedSeasonId === 'all' || statusFilter === 'all') return true;

                // Carryover and prepaid verification logic inside filter loop
                const getSeasonNum = (id: string) => parseInt(id.replace(/\D/g, '')) || 0;
                let seasonsToProcess = [...(team.seasons_played || [])];
                if (selectedSeasonId && selectedSeasonId !== 'all') {
                  seasonsToProcess = seasonsToProcess.filter(sid => getSeasonNum(sid) <= getSeasonNum(selectedSeasonId));
                  if (!seasonsToProcess.includes(selectedSeasonId)) {
                    seasonsToProcess.push(selectedSeasonId);
                  }
                }
                const sortedSeasons = seasonsToProcess.sort((a, b) => getSeasonNum(a) - getSeasonNum(b));

                let carryover = 0;
                const seasonStates: Record<string, { status: 'paid' | 'unpaid' | 'prepaid', debt: number }> = {};

                sortedSeasons.forEach((seasonId) => {
                  const fee = 100;
                  const paymentsThisSeason = team.payments?.filter((p: any) => p.season_id === seasonId).reduce((sum: number, p: any) => sum + p.amount, 0) || 0;
                  const netBeforePayments = carryover - fee;
                  const netAfterPayments = netBeforePayments + paymentsThisSeason;

                  if (netAfterPayments >= 0) {
                    const isPrepaid = paymentsThisSeason === 0 && carryover >= fee;
                    seasonStates[seasonId] = {
                      status: isPrepaid ? 'prepaid' : 'paid',
                      debt: 0
                    };
                    carryover = netAfterPayments;
                  } else {
                    seasonStates[seasonId] = {
                      status: 'unpaid',
                      debt: Math.abs(netAfterPayments)
                    };
                    carryover = 0;
                  }
                });

                const currentSeasonState = seasonStates[selectedSeasonId];
                const isPrepaidCovered = currentSeasonState ? currentSeasonState.status === 'prepaid' : (carryover >= 100);
                const hasPaymentLoggedThisSeason = team.payments?.some(p => p.season_id === selectedSeasonId) || false;
                const hasPaidThisSeason = hasPaymentLoggedThisSeason || isPrepaidCovered;

                if (statusFilter === 'missing') {
                  return !hasPaidThisSeason;
                } else if (statusFilter === 'paid') {
                  return hasPaidThisSeason;
                }
                return true;
              });

            if (filteredBalances.length === 0) {
              return (
                <div className="py-12 text-center text-slate-400">
                  <HelpCircle className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                  <p className="text-xs uppercase font-extrabold">No Teams Found</p>
                  <p className="text-[10px] font-bold uppercase mt-1">No results matching filters or search queries</p>
                </div>
              );
            }

            return (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 uppercase font-extrabold text-[10px] tracking-wider">
                      <th className="pb-3 pr-4 font-black">Team Details</th>
                      {selectedSeasonId !== 'all' && (
                        <th className="pb-3 px-4 font-black">Subscription Type</th>
                      )}
                      <th className="pb-3 px-4 font-black text-right">
                        {selectedSeasonId === 'all' ? 'Total Deductions' : 'Season Deduction'}
                      </th>
                      <th className="pb-3 px-4 font-black text-right">
                        {selectedSeasonId === 'all' ? 'Total Payments' : 'Season Payment'}
                      </th>
                      <th className="pb-3 px-4 font-black text-right">Remaining Balance</th>
                      <th className="pb-3 px-4 font-black">Seasons Played</th>
                      <th className="pb-3 pl-4 font-black text-right">Settings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBalances.map((team) => {
                      const totalPaymentsSum = team.payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
                      const seasonPaymentsSum = team.payments?.filter(p => p.season_id === selectedSeasonId).reduce((sum, p) => sum + p.amount, 0) || 0;
                      const currentPlan = team.season_plans?.[selectedSeasonId] || team.payment_type || 'seasonal';

                      // Chronological season-wise calculation and filtering out future seasons
                      const getSeasonNum = (id: string) => parseInt(id.replace(/\D/g, '')) || 0;
                      let seasonsToProcess = [...(team.seasons_played || [])];
                      if (selectedSeasonId && selectedSeasonId !== 'all') {
                        seasonsToProcess = seasonsToProcess.filter(sid => getSeasonNum(sid) <= getSeasonNum(selectedSeasonId));
                        if (!seasonsToProcess.includes(selectedSeasonId)) {
                          seasonsToProcess.push(selectedSeasonId);
                        }
                      }
                      const sortedSeasons = seasonsToProcess.sort((a, b) => getSeasonNum(a) - getSeasonNum(b));

                      let carryover = 0;
                      const seasonStates: Record<string, { status: 'paid' | 'unpaid' | 'prepaid', debt: number }> = {};

                      sortedSeasons.forEach((seasonId) => {
                        const fee = 100;
                        const paymentsThisSeason = team.payments?.filter((p: any) => p.season_id === seasonId).reduce((sum: number, p: any) => sum + p.amount, 0) || 0;
                        const netBeforePayments = carryover - fee;
                        const netAfterPayments = netBeforePayments + paymentsThisSeason;

                        if (netAfterPayments >= 0) {
                          const isPrepaid = paymentsThisSeason === 0 && carryover >= fee;
                          seasonStates[seasonId] = {
                            status: isPrepaid ? 'prepaid' : 'paid',
                            debt: 0
                          };
                          carryover = netAfterPayments;
                        } else {
                          seasonStates[seasonId] = {
                            status: 'unpaid',
                            debt: Math.abs(netAfterPayments)
                          };
                          carryover = 0;
                        }
                      });

                      const currentSeasonState = seasonStates[selectedSeasonId];
                      const isPrepaidCovered = currentSeasonState ? currentSeasonState.status === 'prepaid' : (carryover >= 100);
                      const hasPaymentLoggedThisSeason = team.payments?.some(p => p.season_id === selectedSeasonId) || false;
                      const hasPaidThisSeason = hasPaymentLoggedThisSeason || isPrepaidCovered;
                    
                    return (
                      <tr key={team.team_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                        {/* Team Name */}
                        <td className="py-3.5 pr-4 font-bold">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-150 p-1 flex items-center justify-center relative overflow-hidden flex-shrink-0">
                              {team.team_logo ? (
                                <Image 
                                  src={team.team_logo} 
                                  alt={team.team_name} 
                                  width={32}
                                  height={32}
                                  className="object-contain w-full h-full"
                                />
                              ) : (
                                <User className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-slate-800 text-xs tracking-wide uppercase font-extrabold">{team.team_name}</span>
                              <span className="text-[9px] text-slate-400 font-mono mt-0.5">{team.team_id}</span>
                            </div>
                          </div>
                        </td>

                        {/* Subscription Type */}
                        {selectedSeasonId !== 'all' && (
                          <td className="py-3.5 px-4 font-bold">
                            <button
                              onClick={() => toggleSubscriptionPlan(team, currentPlan as 'upfront' | 'seasonal')}
                              disabled={submittingAction}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] uppercase tracking-wider font-extrabold border transition-all ${
                                currentPlan === 'upfront'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                              }`}
                            >
                              {currentPlan === 'upfront' ? 'Upfront Subscriber' : 'Seasonal Payer'}
                            </button>
                          </td>
                        )}
                        {/* Season Deduction */}
                        <td className="py-3.5 px-4 font-mono text-xs text-right text-rose-600 font-extrabold">
                          {selectedSeasonId === 'all' ? (
                            `-₹${((team.seasons_played?.length || 0) * 100).toLocaleString()}`
                          ) : team.seasons_played?.includes(selectedSeasonId) ? (
                            `-₹100`
                          ) : (
                            <span className="text-slate-400 font-normal">—</span>
                          )}
                        </td>

                        {/* Season Payment */}
                        <td className="py-3.5 px-4 font-mono text-xs text-right">
                          <div className="font-extrabold">
                            {selectedSeasonId === 'all' ? (
                              <span className="text-slate-800">₹{totalPaymentsSum.toLocaleString()}</span>
                            ) : seasonPaymentsSum > 0 ? (
                              <span className="text-emerald-600">+₹{seasonPaymentsSum.toLocaleString()}</span>
                            ) : isPrepaidCovered ? (
                              <span className="text-[9px] text-emerald-600 font-extrabold uppercase tracking-wider bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">Prepaid</span>
                            ) : (
                              <span className="text-rose-600">₹0</span>
                            )}
                          </div>
                          {selectedSeasonId !== 'all' && (
                            <div className="text-[9px] text-slate-450 font-bold uppercase mt-0.5">
                              ₹{totalPaymentsSum.toLocaleString()} total
                            </div>
                          )}
                        </td>

                        {/* Remaining Balance */}
                        <td className={`py-3.5 px-4 font-extrabold text-right font-mono text-xs ${
                          team.remaining_balance > 0 
                            ? 'text-emerald-600' 
                            : team.remaining_balance < 0 
                              ? 'text-rose-600' 
                              : 'text-slate-500'
                        }`}>
                          {team.remaining_balance > 0 ? '+' : ''}₹{team.remaining_balance.toLocaleString()}
                        </td>

                        {/* Seasons Played Badges */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {team.seasons_played?.length > 0 ? (
                              team.seasons_played.map((sid) => (
                                <span 
                                  key={sid}
                                  className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[8px] font-black uppercase text-slate-600"
                                >
                                  {sid.replace('SSPSLS', 'S')}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-slate-400 font-bold uppercase italic">None</span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 pl-4 text-right">
                          <div className="inline-flex gap-2">
                            {selectedSeasonId === 'all' ? (
                              <span className="text-[9px] text-slate-400 font-bold uppercase italic mr-2">Select season to log</span>
                            ) : (
                              <>
                                {(!hasPaymentLoggedThisSeason && (currentPlan === 'upfront' || !isPrepaidCovered)) && (
                                  <button
                                    onClick={() => {
                                      setActiveModalTeam(team);
                                      setModalType('payment');
                                      setPaymentAmount(currentPlan === 'upfront' ? '500' : '100');
                                    }}
                                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-[9px] uppercase font-black tracking-wider transition-all flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" /> Log Payment
                                  </button>
                                )}
                              </>
                            )}
                            <button
                              onClick={() => {
                                setActiveModalTeam(team);
                                setModalType('history');
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-lg text-[9px] uppercase font-black tracking-wider transition-all flex items-center gap-1"
                            >
                              <History className="w-3 h-3" /> Audit
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                 </tbody>
               </table>
             </div>
            );
          })() )}
        </div>
      </div>

      {mounted && modalType === 'payment' && activeModalTeam && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl relative font-mono text-slate-850">
            <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider mb-2 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-500" /> Log Cash Payment
            </h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase mb-4">
              Team: <span className="text-slate-800 font-extrabold">{activeModalTeam.team_name}</span> <span className="text-slate-450 font-mono text-[9px]">({activeModalTeam.team_id})</span>
            </p>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Payment Amount (₹)</label>
                <input
                  type="number"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Payment Notes</label>
                <textarea
                  placeholder="e.g. Paid 500 upfront via UPI, reference 284729"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 text-[10px] font-black uppercase tracking-wider">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModalTeam(null);
                    setModalType(null);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl border border-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white border border-amber-600 rounded-xl shadow-sm transition-all"
                >
                  {submittingAction ? 'Submitting...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {mounted && modalType === 'history' && activeModalTeam && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-2xl w-full shadow-2xl relative font-mono text-slate-850 max-h-[85vh] flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider mb-2 border-b border-slate-100 pb-3 flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-500" /> Cash Transaction History
              </h3>
              <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase mb-4">
                <span>Team: <strong className="text-slate-850">{activeModalTeam.team_name}</strong> <span className="text-slate-450 font-mono text-[9px]">({activeModalTeam.team_id})</span></span>
                <span>Type: <strong className="text-indigo-600">{activeModalTeam.payment_type === 'upfront' ? 'Upfront (5 Seasons)' : 'Seasonal'}</strong></span>
              </div>
            </div>

            {/* Logs List Container */}
            <div className="flex-1 overflow-y-auto space-y-4 my-2 pr-1 text-[11px] font-sans">
              
              {/* Payments Section */}
              <div>
                <h4 className="font-bold font-mono text-[9px] uppercase tracking-wider text-slate-400 mb-2 border-b border-slate-100 pb-1">Payments Log (Credits)</h4>
                {activeModalTeam.payments && activeModalTeam.payments.length > 0 ? (
                  <div className="space-y-2">
                    {activeModalTeam.payments.map((p) => (
                      <div key={p.payment_id} className="p-2.5 bg-emerald-50/50 border border-emerald-100 rounded-xl flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-emerald-800 font-mono text-xs">₹{p.amount.toLocaleString()}</p>
                          <p className="text-[10px] text-slate-600 mt-0.5">Notes: {p.notes || 'None'}</p>
                          <p className="text-[9px] text-slate-400 uppercase font-semibold font-mono mt-1">Recorded by: {p.recorded_by}</p>
                          <button
                            type="button"
                            onClick={() => handleDeletePayment(p.payment_id, p.amount)}
                            disabled={submittingAction}
                            className="text-[9px] text-rose-500 hover:text-rose-700 font-extrabold uppercase mt-2 flex items-center gap-1 transition-colors disabled:opacity-50"
                          >
                            Delete Payment
                          </button>
                        </div>
                        <div className="text-right font-mono text-[9px] text-slate-450 uppercase font-semibold flex-shrink-0">
                          <p>{p.season_id}</p>
                          <p className="mt-0.5">{formatDate(p.date)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="italic text-slate-400 py-2">No cash payments recorded.</p>
                )}
              </div>

              {/* Deductions Section */}
              <div>
                <h4 className="font-bold font-mono text-[9px] uppercase tracking-wider text-slate-400 mb-2 border-b border-slate-100 pb-1">Deductions Log (Debits)</h4>
                {activeModalTeam.deductions && activeModalTeam.deductions.length > 0 ? (
                  <div className="space-y-2">
                    {activeModalTeam.deductions.map((d) => (
                      <div key={d.deduction_id} className="p-2.5 bg-rose-50/40 border border-rose-100/60 rounded-xl flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-rose-800 font-mono text-xs">-₹{d.amount.toLocaleString()}</p>
                          <p className="text-[10px] text-slate-600 mt-0.5 font-mono uppercase">Season Registration Fee</p>
                        </div>
                        <div className="text-right font-mono text-[9px] text-slate-450 uppercase font-semibold flex-shrink-0">
                          <p>{d.season_id}</p>
                          <p className="mt-0.5">{formatDate(d.date)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="italic text-slate-400 py-2">No deductions recorded.</p>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setActiveModalTeam(null);
                  setModalType(null);
                }}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
              >
                Close Audit Log
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {mounted && modalType === 'bulk' && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-white border border-[#D4AF37]/25 w-full max-w-md rounded-3xl shadow-2xl p-6 relative animate-slide-up space-y-4">
            
            {/* Close Button */}
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-amber-500">
              <Coins className="w-6 h-6" />
              <h2 className="text-base font-black uppercase tracking-wider">Bulk Season Credit</h2>
            </div>
            
            <p className="text-[10px] text-slate-500 uppercase font-bold leading-normal">
              Distribute cash payment credits to all registered teams for this season. 
              Teams marked as <strong className="text-emerald-600">Upfront Subscriber</strong> will receive <strong className="text-emerald-600">₹500</strong> credit, 
              and <strong className="text-indigo-600">Seasonal Payers</strong> will receive <strong className="text-indigo-600">₹100</strong> credit.
            </p>

            <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-2xl space-y-1.5 text-[10px] font-bold uppercase text-slate-650 font-mono">
              <p className="text-slate-400 text-[9px] font-bold tracking-wider mb-1">Bulk Credit Preview:</p>
              <div className="flex justify-between">
                <span>Seasonal Payers (₹100):</span>
                <span className="text-indigo-600 font-extrabold">{bulkCreditPreview.seasonalCount} Teams</span>
              </div>
              <div className="flex justify-between">
                <span>Upfront Subscribers (₹500):</span>
                <span className="text-emerald-600 font-extrabold">{bulkCreditPreview.upfrontCount} Teams</span>
              </div>
              <div className="flex justify-between border-t border-slate-200/60 pt-1.5 mt-1">
                <span>Skipped (Paid/Covered):</span>
                <span className="text-slate-500 font-extrabold">{bulkCreditPreview.skippedCount} Teams</span>
              </div>
            </div>

            <form onSubmit={handleBulkPayment} className="space-y-4 pt-2">

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Payment Notes</label>
                <textarea
                  value={bulkNotes}
                  onChange={(e) => setBulkNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200/60 rounded-xl text-xs font-bold focus:outline-none focus:border-amber-400"
                  placeholder="Reason / Reference (e.g. UPI Bulk Credit)"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 text-slate-500 hover:text-slate-700 text-[10px] font-black uppercase tracking-wider transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md shadow-amber-500/10 hover:shadow-lg disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {submittingAction ? 'Processing...' : 'Confirm Bulk Credit'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {mounted && modalType === 'bulk_plans' && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in font-mono text-slate-850">
          <div className="bg-white border border-[#D4AF37]/25 w-full max-w-md rounded-3xl shadow-2xl p-6 relative animate-slide-up space-y-4">
            
            {/* Close Button */}
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-indigo-600">
              <Settings className="w-6 h-6 animate-spin-slow" />
              <h2 className="text-base font-black uppercase tracking-wider">Bulk Plan Update</h2>
            </div>
            
            <p className="text-[10px] text-slate-500 uppercase font-bold leading-normal">
              Change the payment plan for ALL registered teams in this season to a single type.
            </p>

            <form onSubmit={handleBulkPlanUpdate} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Select Plan Type</label>
                <select
                  value={bulkPlanType}
                  onChange={(e) => setBulkPlanType(e.target.value as 'upfront' | 'seasonal')}
                  className="w-full px-3 py-2 border border-slate-200/60 rounded-xl text-xs font-black focus:outline-none focus:border-indigo-400"
                >
                  <option value="seasonal">Seasonal Payer (₹100/season played)</option>
                  <option value="upfront">Upfront Subscriber (₹500 upfront fee)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 text-slate-500 hover:text-slate-700 text-[10px] font-black uppercase tracking-wider transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md shadow-indigo-600/10 hover:shadow-lg disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {submittingAction ? 'Processing...' : 'Confirm Bulk Update'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {mounted && modalType === 'bulk_delete' && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in font-mono text-slate-850">
          <div className="bg-white border border-rose-200 w-full max-w-md rounded-3xl shadow-2xl p-6 relative animate-slide-up space-y-4">
            
            {/* Close Button */}
            <button
              onClick={() => setModalType(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-rose-600">
              <Trash2 className="w-6 h-6 animate-pulse" />
              <h2 className="text-base font-black uppercase tracking-wider">Bulk Delete Payments</h2>
            </div>
            
            <p className="text-[10px] text-slate-500 uppercase font-bold leading-normal">
              Delete ALL cash payments logged for this season. This will restore team balances as if no payments were made this season.
            </p>

            <form onSubmit={handleBulkDeletePayments} className="space-y-4 pt-2">
              <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-2xl">
                <p className="text-[9px] text-rose-800 font-extrabold uppercase leading-normal">
                  ⚠️ WARNING: This action cannot be undone. It will delete the season payment record for all teams.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 text-slate-500 hover:text-slate-700 text-[10px] font-black uppercase tracking-wider transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-705 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md shadow-rose-600/10 hover:shadow-lg disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {submittingAction ? 'Processing...' : 'Confirm Bulk Delete'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
