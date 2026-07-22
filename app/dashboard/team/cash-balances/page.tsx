'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  DollarSign, 
  Coins, 
  ArrowLeft, 
  History, 
  Calendar, 
  AlertCircle, 
  User, 
  CheckCircle,
  HelpCircle,
  Search
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

export default function TeamCashBalances() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [balances, setBalances] = useState<TeamCashBalance[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [activeModalTeam, setActiveModalTeam] = useState<TeamCashBalance | null>(null);
  const [modalType, setModalType] = useState<'history' | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 1. Authenticate user
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'team' && user.role !== 'superadmin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // 2. Load all seasons from Firestore
  useEffect(() => {
    if (!user || (user.role !== 'team' && user.role !== 'superadmin')) return;

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

  const loadBalances = async () => {
    try {
      setLoadingData(true);
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
      setLoadingData(false);
    }
  };

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

  if (loading || !user || user.role !== 'team') {
    return null;
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 pt-5 lg:pt-24 pb-12 px-4 sm:px-6 relative font-mono">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation & Title */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <Link 
              href="/dashboard" 
              className="inline-flex items-center gap-2 text-xs uppercase font-extrabold text-slate-500 hover:text-amber-500 transition-colors mb-2"
            >
              <ArrowLeft className="w-3 h-3" /> Back to Dashboard
            </Link>
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-slate-800">
              Season Cash Balances
            </h1>
            <p className="text-[10px] text-slate-550 font-bold uppercase mt-1">League Payments Directory</p>
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
            <p className="text-[8px] text-slate-400 uppercase font-semibold mt-3">Paid 500 cash upfront for 5 seasons</p>
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

        {/* Cash Balances Directory Table */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase text-slate-800 tracking-wider mb-5 flex items-center gap-2">
            <Coins className="w-4 h-4 text-[#D4AF37]" /> Team Cash Balances
          </h2>

          {/* Search Bar */}
          {balances.length > 0 && (
            <div className="mb-4 relative">
              <input
                type="text"
                placeholder="Search team name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full max-w-md px-3.5 py-2 pl-9 bg-slate-50/60 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-amber-400 focus:bg-white transition-all font-sans"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
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
              <p className="text-[10px] font-bold uppercase mt-1">No data available for this season</p>
            </div>
          ) : balances.filter(t => t.team_name.toLowerCase().includes(searchQuery.toLowerCase()) || t.team_id.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <HelpCircle className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-xs uppercase font-extrabold">No Teams Found</p>
              <p className="text-[10px] font-bold uppercase mt-1">No results matching "{searchQuery}"</p>
            </div>
          ) : (
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
                  {balances
                    .filter(t => t.team_name.toLowerCase().includes(searchQuery.toLowerCase()) || t.team_id.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((team) => {
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
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] uppercase tracking-wider font-extrabold border ${
                              (selectedSeasonId === 'all' ? team.payment_type : currentPlan) === 'upfront'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            }`}>
                              {(selectedSeasonId === 'all' ? team.payment_type : currentPlan) === 'upfront' ? 'Upfront' : 'Seasonal'}
                            </span>
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
                          <button
                            onClick={() => {
                              setActiveModalTeam(team);
                              setModalType('history');
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-lg text-[9px] uppercase font-black tracking-wider transition-all flex items-center gap-1 inline-flex"
                          >
                            <History className="w-3 h-3" /> Audit Log
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {mounted && modalType === 'history' && activeModalTeam && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-2xl w-full shadow-2xl relative font-mono text-slate-850 max-h-[85vh] flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider mb-2 border-b border-slate-100 pb-3 flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-500" /> Cash Transaction History
              </h3>
              <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase mb-4">
                <span>Team: <strong className="text-slate-850">{activeModalTeam.team_name}</strong></span>
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
    </div>
  );
}
