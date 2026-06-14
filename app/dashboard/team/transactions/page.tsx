'use client';

import { SoccerBallIcon } from '@/components/ui/CustomIcons';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, DollarSign, Download, Gavel, Gift, TrendingDown, TrendingUp, Trophy, User } from 'lucide-react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface Transaction {
  id: string;
  date: string;
  type: string;
  amount: number;
  reason: string;
  balance_after: number;
  metadata?: any;
}

interface CurrencyData {
  current_balance: number;
  starting_balance: number;
  total_spent: number;
  total_earned: number;
  transactions: Transaction[];
}

export default function TransactionsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<'football' | 'real_player'>('football');
  const [footballData, setFootballData] = useState<CurrencyData | null>(null);
  const [realPlayerData, setRealPlayerData] = useState<CurrencyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [seasonId, setSeasonId] = useState<string>('');
  const [seasons, setSeasons] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      loadSeasons();
    }
  }, [user]);

  useEffect(() => {
    if (selectedSeason) {
      loadTransactions();
    }
  }, [selectedSeason]);

  const loadSeasons = async () => {
    try {
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase/config');
      
      const seasonsQuery = query(collection(db, 'seasons'));
      const seasonsSnapshot = await getDocs(seasonsQuery);
      
      const seasonsList = seasonsSnapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || `Season ${data.season_number || 'Unknown'}`,
            season_number: data.season_number || 0,
          };
        })
        .filter((season: any) => {
          // Only show SSPSLS16 and later
          const seasonNum = parseInt(season.id.replace('SSPSLS', ''));
          return !isNaN(seasonNum) && seasonNum >= 16;
        })
        .sort((a: any, b: any) => b.season_number - a.season_number);
      
      setSeasons(seasonsList);
      
      // Set default to first season (most recent)
      if (seasonsList.length > 0) {
        setSelectedSeason(seasonsList[0].id);
      }
    } catch (error) {
      console.error('Error loading seasons:', error);
    }
  };

  const loadTransactions = async () => {
    if (!selectedSeason) return;
    
    try {
      setIsLoading(true);
      setErrorMessage(null);
      
      // Fetch transactions for the selected season (API expects season_id with underscore)
      const response = await fetchWithTokenRefresh(`/api/team/transactions?season_id=${selectedSeason}`);
      
      if (!response.ok) {
        let errorData;
        const contentType = response.headers.get('content-type');
        
        try {
          if (contentType && contentType.includes('application/json')) {
            errorData = await response.json();
          } else {
            const text = await response.text();
            console.error('Non-JSON error response:', text);
            errorData = { error: `Server error (${response.status}): ${text || 'No response'}` };
          }
        } catch (parseError) {
          console.error('Error parsing response:', parseError);
          errorData = { error: `Server error (${response.status})` };
        }
        
        console.error('Transaction API error:', errorData);
        
        // Special handling for "not registered" error
        if (errorData.error?.includes('not registered') || errorData.error === 'Season ID is required') {
          setErrorMessage('You are not registered for any season yet. Please register to view transactions.');
        } else {
          setErrorMessage(errorData.error || `Failed to load transactions (${response.status})`);
        }
        throw new Error(errorData.error || 'Failed to load transactions');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setFootballData(data.football);
        setRealPlayerData(data.real_player);
      } else {
        throw new Error(data.error || 'Failed to load transactions');
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
      // Set empty data instead of mock data
      setFootballData({
        current_balance: 0,
        starting_balance: 0,
        total_spent: 0,
        total_earned: 0,
        transactions: [],
      });
      setRealPlayerData({
        current_balance: 0,
        starting_balance: 0,
        total_spent: 0,
        total_earned: 0,
        transactions: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'salary': return '💰';
      case 'fine': return '⚠️';
      case 'auction': return '<Gavel className="w-4 h-4 text-amber-500" />';
      case 'real_player_fee': return '<User className="w-4 h-4 text-slate-500" />';
      case 'bonus': return '<Gift className="w-4 h-4 text-rose-500" />';
      case 'match_reward': return '<Trophy className="w-4 h-4 text-amber-500 fill-amber-500" />'; // Match reward for Win/Draw/Loss
      case 'position_reward': return '<Trophy className="w-4 h-4 text-amber-500 fill-amber-500" />'; // League position reward
      case 'completion_bonus': return '🎉'; // Tournament completion bonus
      case 'adjustment': return '🔧';
      case 'transfer_payment': return '➡️';
      case 'transfer_compensation': return '⬅️';
      case 'swap_fee_paid': return '🔄';
      case 'swap_fee_received': return '🔁';
      case 'player_release_refund': return '↩️';
      case 'initial_balance': return '<Store className="w-4 h-4 text-slate-500" />';
      default: return '📝';
    }
  };


  const getTransactionColor = (amount: number) => {
    return amount < 0 ? 'text-rose-650' : 'text-emerald-700';
  };

  const formatTransactionType = (type: string) => {
    // Special formatting for specific types
    const typeMap: Record<string, string> = {
      'match_reward': 'Match Reward',
      'position_reward': 'Position Reward',
      'completion_bonus': 'Completion Bonus',
      'real_player_fee': 'Real Player Fee',
      'initial_balance': 'Initial Balance',
      'transfer_payment': 'Transfer Payment',
      'transfer_compensation': 'Transfer Compensation',
      'swap_fee_paid': 'Swap Fee Paid',
      'swap_fee_received': 'Swap Fee Received',
      'player_release_refund': 'Player Release Refund'
    };
    
    return typeMap[type] || type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const exportTransactions = (currency: 'football' | 'real_player') => {
    const data = currency === 'football' ? footballData : realPlayerData;
    if (!data) return;

    const csv = [
      ['Date', 'Type', 'Amount', 'Reason', 'Balance After'],
      ...data.transactions.map(t => [
        formatDate(t.date),
        t.type,
        t.amount.toString(),
        t.reason,
        t.balance_after.toString()
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currency}_transactions.csv`;
    a.click();
    
    // Cleanup blob URL
    window.URL.revokeObjectURL(url);
  };

  const renderCurrencySection = (data: CurrencyData | null, currencyName: string, currencyType: 'football' | 'real_player') => {
    if (!data) {
      return (
        <div className="text-center py-12 text-slate-400 font-mono font-bold uppercase text-xs">
          <p>No transaction data available</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 font-mono">
          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-sky-500 rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Current Balance</span>
              <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200/50 rounded-lg text-[9px] font-black uppercase">Active</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-sky-700">{data.current_balance.toLocaleString()} {currencyType === 'football' ? 'eCoin' : 'SSCoin'}</p>
          </div>

          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-slate-400 rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Starting Balance</span>
              <span className="px-2 py-0.5 bg-slate-50 text-slate-655 border border-slate-200/50 rounded-lg text-[9px] font-black uppercase">Initial</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-800">{data.starting_balance.toLocaleString()} {currencyType === 'football' ? 'eCoin' : 'SSCoin'}</p>
          </div>

          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-rose-500 rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Spent</span>
              <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200/50 rounded-lg text-[9px] font-black uppercase">Expenses</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-rose-600">{data.total_spent.toLocaleString()} {currencyType === 'football' ? 'eCoin' : 'SSCoin'}</p>
          </div>

          {data.total_earned > 0 && (
            <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-emerald-500 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Earned</span>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/50 rounded-lg text-[9px] font-black uppercase">Earnings</span>
              </div>
              <p className="text-xl sm:text-2xl font-black text-emerald-700">+{data.total_earned.toLocaleString()} {currencyType === 'football' ? 'eCoin' : 'SSCoin'}</p>
            </div>
          )}
        </div>

        {/* Export Bar */}
        <div className="flex justify-end font-mono">
          <button
            onClick={() => exportTransactions(currencyType)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200/60 rounded-xl hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold cursor-pointer shadow-sm w-full sm:w-auto"
          >
            <Download className="w-4.5 h-4.5" />
            <span>Export CSV</span>
          </button>
        </div>

        {/* Transactions - Mobile Cards (hidden on lg+) */}
        <div className="lg:hidden space-y-3 font-mono">
          {data.transactions.length === 0 ? (
            <div className="console-card bg-white rounded-2xl border border-slate-200/60 p-8 text-center text-slate-400 text-xs font-bold uppercase">
              No transactions yet
            </div>
          ) : (
            data.transactions.map((transaction) => (
              <div key={transaction.id} className="console-card bg-white rounded-2xl border border-slate-200/60 p-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getTransactionIcon(transaction.type)}</span>
                    <div>
                      <div className="text-xs font-extrabold text-slate-800">
                        {formatTransactionType(transaction.type)}
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                        {formatDate(transaction.date)}
                      </div>
                    </div>
                  </div>
                  <div className={`text-sm font-black ${getTransactionColor(transaction.amount)}`}>
                    {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString()}
                  </div>
                </div>
                <div className="text-xs font-semibold text-slate-650 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                  {transaction.reason}
                </div>
                <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Balance After</span>
                  <span className="text-xs font-extrabold text-slate-700">
                    {transaction.balance_after.toLocaleString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Transactions Table - Desktop (hidden on mobile) */}
        <div className="hidden lg:block console-card bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden font-mono">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100 font-mono">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Balance After
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-xs font-bold uppercase">
                      No transactions yet
                    </td>
                  </tr>
                ) : (
                  data.transactions.map((transaction) => (
                    <tr key={transaction.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-500">
                        {formatDate(transaction.date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="flex items-center gap-2">
                          <span className="text-xl">{getTransactionIcon(transaction.type)}</span>
                          <span className="text-xs font-extrabold text-slate-800">
                            {formatTransactionType(transaction.type)}
                          </span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-650">
                        {transaction.reason}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-right text-xs font-black ${getTransactionColor(transaction.amount)}`}>
                        {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-extrabold text-slate-700">
                        {transaction.balance_after.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Transactions...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Back Link */}
        <Link
          href="/dashboard"
          className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit mb-4"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Dashboard
        </Link>

        {/* Header Title Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono relative overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/10 flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800">
                  Transaction History
                </h1>
                <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                  View all your financial transactions and budget breakdown
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Season Filter */}
        {seasons.length > 0 && (
          <div className="mb-6">
            <div className="flex flex-wrap gap-2">
              {seasons.map((season) => (
                <button
                  key={season.id}
                  onClick={() => setSelectedSeason(season.id)}
                  className={`px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider font-extrabold transition-all duration-200 cursor-pointer ${
                    selectedSeason === season.id
                      ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md transform scale-102'
                      : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200/80 shadow-sm'
                  }`}
                >
                  {season.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="console-card bg-amber-50/60 border border-amber-200/60 p-4 rounded-xl flex gap-3 items-center mb-6">
            <span className="text-lg flex-shrink-0">⚠️</span>
            <div>
              <span className="font-extrabold text-amber-800 text-[10px] uppercase tracking-wider block mb-0.5">Unable to Load Transactions</span>
              <p className="text-xs sm:text-sm text-amber-900 leading-relaxed font-semibold">
                {errorMessage}
              </p>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setActiveTab('football')}
              className={`p-3 rounded-xl font-extrabold uppercase tracking-wider text-xs transition-all cursor-pointer ${
                activeTab === 'football'
                  ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
              }`}
            >
              <SoccerBallIcon className="w-4 h-4" /> eCoin Budget
            </button>
            <button
              onClick={() => setActiveTab('real_player')}
              className={`p-3 rounded-xl font-extrabold uppercase tracking-wider text-xs transition-all cursor-pointer ${
                activeTab === 'real_player'
                  ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
              }`}
            >
              💎 SSCoin Budget
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'football' && renderCurrencySection(footballData, 'eCoin Budget', 'football')}
          {activeTab === 'real_player' && renderCurrencySection(realPlayerData, 'SSCoin Budget', 'real_player')}
        </div>

        {/* Info Box */}
        <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-indigo-500 rounded-2xl p-5 shadow-sm font-mono mt-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">📝</span>
            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">About Your Budgets</h4>
          </div>
          <ul className="text-xs text-slate-655 space-y-2 leading-relaxed font-semibold">
            <li className="flex items-start gap-1">
              <span>•</span>
              <span><strong>eCoin Budget:</strong> Used for player auctions, salaries, and match-related expenses.</span>
            </li>
            <li className="flex items-start gap-1">
              <span>•</span>
              <span><strong>SSCoin Budget:</strong> Used for registering real players and special fees.</span>
            </li>
            <li className="flex items-start gap-1">
              <span>•</span>
              <span><strong><Trophy className="w-4 h-4 text-amber-500 fill-amber-500" /> Match Rewards:</strong> Earned automatically after each match based on result (Win/Draw/Loss).</span>
            </li>
            <li className="flex items-start gap-1">
              <span>•</span>
              <span>Negative amounts (in rose) are deductions from your balance.</span>
            </li>
            <li className="flex items-start gap-1">
              <span>•</span>
              <span>Positive amounts (in emerald) are additions to your balance.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
