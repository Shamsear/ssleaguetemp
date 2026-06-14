'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { History, Download, Filter } from 'lucide-react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { usePermissions } from '@/hooks/usePermissions';

interface TransferTransaction {
  id: string;
  transaction_type: 'transfer' | 'swap' | 'release';
  season_id: string;
  processed_by: string;
  processed_by_name: string;
  created_at: string;
  // Release specific fields
  player_name?: string;
  player_type?: 'real' | 'football';
  team_id?: string;
  team_name?: string;
  auction_value?: number;
  refund_amount?: number;
  refund_percentage?: number;
  release_timing?: string;
  release_season?: string;
  original_contract_start?: string;
  original_contract_end?: string;
  // Transfer specific
  player?: {
    id: string;
    name: string;
    type: 'real' | 'football';
  };
  old_team_id?: string;
  new_team_id?: string;
  values?: {
    old_value: number;
    new_value: number;
  };
  star_rating?: {
    old: number;
    new: number;
    points_added: number;
  };
  financial?: {
    committee_fee?: number;
    buying_team_paid?: number;
    selling_team_received?: number;
    refund_amount?: number;
    team_a_fee?: number;
    team_b_fee?: number;
    total_committee_fees?: number;
    cash_amount?: number;
    cash_direction?: 'A_to_B' | 'B_to_A' | 'none';
  };
  new_salary?: number;
  // Swap specific
  player_a?: {
    id: string;
    name: string;
    type: 'real' | 'football';
    old_value: number;
    new_value: number;
    old_star: number;
    new_star: number;
    points_added: number;
    new_salary: number;
  };
  player_b?: {
    id: string;
    name: string;
    type: 'real' | 'football';
    old_value: number;
    new_value: number;
    old_star: number;
    new_star: number;
    points_added: number;
    new_salary: number;
  };
  teams?: {
    team_a_id: string;
    team_b_id: string;
    team_a_pays: number;
    team_b_pays: number;
  };
}

export default function TransferHistoryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { userSeasonId } = usePermissions();
  
  const [transactions, setTransactions] = useState<TransferTransaction[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [availableSeasons, setAvailableSeasons] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedPlayerType, setSelectedPlayerType] = useState<string>('');
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(0);
  const [limit] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && user.role === 'committee_admin' && userSeasonId) {
      loadInitialData();
    }
  }, [user, userSeasonId]);

  useEffect(() => {
    if (userSeasonId) {
      loadTransactions();
    }
  }, [userSeasonId, selectedTeamId, selectedType, selectedPlayerType, selectedSeason, currentPage]);

  const loadInitialData = async () => {
    if (!userSeasonId) return;
    
    try {
      const teamsRes = await fetchWithTokenRefresh(`/api/team/all?season_id=${userSeasonId}`);
      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        if (teamsData.success && teamsData.data?.teams) {
          setTeams(teamsData.data.teams);
        }
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  };

  const loadTransactions = async () => {
    if (!userSeasonId) return;

    try {
      setIsLoading(true);
      
      const params = new URLSearchParams({
        season_id: selectedSeason || userSeasonId,
        page: currentPage.toString(),
        limit: limit.toString(),
      });

      if (selectedTeamId) params.append('team_id', selectedTeamId);
      if (selectedType) params.append('type', selectedType);
      if (selectedPlayerType) params.append('player_type', selectedPlayerType);

      const response = await fetchWithTokenRefresh(`/api/transfers/history?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch transfer history');
      }

      const result = await response.json();
      
      if (result.success) {
        setTransactions(result.data.transactions);
        setTotalCount(result.data.totalCount);
        setHasMore(result.data.hasMore);
        setAvailableSeasons(result.data.availableSeasons);
      } else {
        throw new Error(result.error || 'Failed to fetch transfer history');
      }
      
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const exportToCSV = () => {
    if (transactions.length === 0) return;

    const headers = ['Date', 'Type', 'Player(s)', 'Teams', 'Values', 'Fees', 'Star Changes', 'Processed By'];
    const rows = transactions.map(tx => {
      const date = new Date(tx.created_at).toLocaleDateString();
      const type = tx.transaction_type.toUpperCase();
      
      let players = '';
      let teamsList = '';
      let valuesStr = '';
      let feesStr = '';
      let starChanges = '';
      
      if (tx.transaction_type === 'transfer') {
        players = tx.player?.name || '';
        teamsList = `${tx.old_team_id} → ${tx.new_team_id}`;
        valuesStr = `${tx.values?.old_value} → ${tx.values?.new_value}`;
        feesStr = tx.financial?.committee_fee?.toFixed(2) || '';
        starChanges = `${tx.star_rating?.old}⭐ → ${tx.star_rating?.new}⭐`;
      } else if (tx.transaction_type === 'swap') {
        players = `${tx.player_a?.name} ↔ ${tx.player_b?.name}`;
        teamsList = `${tx.teams?.team_a_id} ↔ ${tx.teams?.team_b_id}`;
        valuesStr = `${tx.player_a?.old_value}/${tx.player_b?.old_value} → ${tx.player_a?.new_value}/${tx.player_b?.new_value}`;
        feesStr = tx.financial?.total_committee_fees?.toFixed(2) || '';
        starChanges = `${tx.player_a?.old_star}⭐→${tx.player_a?.new_star}⭐ / ${tx.player_b?.old_star}⭐→${tx.player_b?.new_star}⭐`;
      }
      
      return [date, type, players, teamsList, valuesStr, feesStr, starChanges, tx.processed_by_name];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transfer-history-${userSeasonId}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit',
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-400 font-bold uppercase tracking-wider">Loading history data...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'committee_admin') return null;

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Decorative glowing overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-5xl mx-auto relative z-10 space-y-8">
        {/* Back Link */}
        <div className="flex justify-between items-center">
          <Link
            href="/dashboard/committee/players/transfers"
            className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            ← Back to Transfers
          </Link>
          
          <div className="bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm shrink-0">
            LOGS: SYSTEM_TRANSFERS
          </div>
        </div>

        {/* Header Title Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-slate-800 shadow-sm shrink-0">
                <History className="w-5 h-5 text-white" />
              </div>
              <div className="font-mono">
                <h1 className="text-xl font-extrabold text-slate-900 tracking-tight leading-none uppercase">Transfer History</h1>
                <p className="text-xs text-slate-400 mt-1">View all player transfers, swaps, and releases</p>
              </div>
            </div>
            <button
              onClick={exportToCSV}
              disabled={transactions.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Filters Panel */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm font-mono text-xs">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-amber-500" />
            <h2 className="text-xs font-bold text-slate-850 uppercase tracking-wider">Search Filters</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Season</label>
              <select
                value={selectedSeason}
                onChange={(e) => {
                  setSelectedSeason(e.target.value);
                  setCurrentPage(0);
                }}
                className="w-full px-3 py-2 border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
              >
                <option value="">Current Season ({userSeasonId})</option>
                {availableSeasons.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Team</label>
              <select
                value={selectedTeamId}
                onChange={(e) => {
                  setSelectedTeamId(e.target.value);
                  setCurrentPage(0);
                }}
                className="w-full px-3 py-2 border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
              >
                <option value="">All Teams</option>
                {teams.map((teamData) => (
                  <option key={teamData.team?.id} value={teamData.team?.id}>
                    {teamData.team?.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Transaction Type</label>
              <select
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  setCurrentPage(0);
                }}
                className="w-full px-3 py-2 border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
              >
                <option value="">All Types</option>
                <option value="release">Player Releases</option>
                <option value="transfer">Player Transfers</option>
                <option value="player_transfer">Player Transfers (Old)</option>
                <option value="swap">Player Swaps</option>
                <option value="player_swap">Player Swaps (Old)</option>
                <option value="football_swap">Football Swaps</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Player Type</label>
              <select
                value={selectedPlayerType}
                onChange={(e) => {
                  setSelectedPlayerType(e.target.value);
                  setCurrentPage(0);
                }}
                className="w-full px-3 py-2 border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
              >
                <option value="">All Player Types</option>
                <option value="real">👤 Real Players</option>
                <option value="football">⚽ eFootball Players</option>
              </select>
            </div>
          </div>
        </div>

        {/* Transactions list */}
        {transactions.length === 0 ? (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center shadow-sm">
            <History className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <h3 className="text-base font-extrabold text-slate-800 uppercase tracking-wide">No Transactions Found</h3>
            <p className="text-xs text-slate-400 font-mono mt-1 max-w-sm mx-auto">No transfer transactions found matching selected filters</p>
          </div>
        ) : (
          <div className="space-y-6">
            {transactions.map((tx) => (
              <div key={tx.id} className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
                {/* Header bar */}
                <div className="bg-slate-800 text-white px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        tx.transaction_type === 'release' 
                          ? 'bg-red-100 text-red-800' 
                          : tx.transaction_type === 'swap' 
                          ? 'bg-purple-100 text-purple-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {tx.transaction_type}
                      </span>
                      <span className="text-slate-350">{formatDate(tx.created_at)}</span>
                    </div>
                    <span className="text-slate-400">Processed By: {tx.processed_by_name}</span>
                  </div>
                </div>

                {/* Details content */}
                <div className="p-5 font-mono text-xs text-slate-650">
                  {tx.transaction_type === 'release' && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Player Released</p>
                          <p className="text-base font-extrabold text-slate-900 mt-0.5">{tx.player_name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 leading-none">
                            {tx.player_type === 'real' ? '👤 Real Player' : '⚽ Football Player'}
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Team roster</p>
                          <p className="text-sm font-extrabold text-slate-850 mt-0.5">{tx.team_name}</p>
                          <p className="text-[9px] text-slate-350 font-bold uppercase tracking-wider">{tx.team_id}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 shadow-inner">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Original Value</p>
                          <p className="text-sm font-extrabold text-slate-800">£{tx.auction_value?.toLocaleString()}</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 shadow-inner">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Refund Amount</p>
                          <p className="text-sm font-extrabold text-emerald-605">£{tx.refund_amount?.toLocaleString()}</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 shadow-inner">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Refund Percentage</p>
                          <p className="text-sm font-extrabold text-blue-600">{tx.refund_percentage}%</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 shadow-inner">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Release Timing</p>
                          <p className="text-sm font-extrabold text-purple-650 capitalize">{tx.release_timing}</p>
                        </div>
                      </div>
                      {tx.release_season && (
                        <div className="pt-3 border-t border-slate-100 text-[10px] text-slate-400 flex flex-col sm:flex-row sm:justify-between gap-1 leading-none">
                          <span>Release Season: <strong className="text-slate-700">{tx.release_season}</strong></span>
                          <span>Contract Timeline: <strong className="text-slate-700">{tx.original_contract_start} - {tx.original_contract_end}</strong></span>
                        </div>
                      )}
                    </div>
                  )}

                  {tx.transaction_type === 'transfer' && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Transferred Player</p>
                          <p className="text-base font-extrabold text-slate-900 mt-0.5">{tx.player?.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 leading-none">
                            {tx.player?.type === 'real' ? '👤 Real Player' : '⚽ Football Player'}
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Transfer Path</p>
                          <p className="text-sm font-extrabold text-slate-850 mt-0.5">
                            {tx.old_team_id} → {tx.new_team_id}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 shadow-inner">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Old Value</p>
                          <p className="text-sm font-extrabold text-slate-800">£{tx.values?.old_value?.toLocaleString()}</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 shadow-inner">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">New Value</p>
                          <p className="text-sm font-extrabold text-emerald-605">£{tx.values?.new_value?.toLocaleString()}</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 shadow-inner">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Committee Fee</p>
                          <p className="text-sm font-extrabold text-purple-605">£{tx.financial?.committee_fee?.toLocaleString()}</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 shadow-inner">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Star Rating</p>
                          <p className="text-sm font-extrabold text-yellow-600">
                            {tx.star_rating?.old}⭐ → {tx.star_rating?.new}⭐
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {tx.transaction_type === 'swap' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-inner">
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[9px] font-bold rounded">PLAYER A</span>
                          <p className="font-extrabold text-slate-900 text-sm mt-2 mb-1">{tx.player_a?.name}</p>
                          <div className="text-[10px] space-y-1 text-slate-500 mt-2">
                            {tx.player_a?.old_value > 0 && (
                              <p>Value: £{tx.player_a?.old_value?.toLocaleString()} → £{tx.player_a?.new_value?.toLocaleString()}</p>
                            )}
                            {tx.player_a?.old_star > 0 && (
                              <p>Stars: {tx.player_a?.old_star}⭐ → {tx.player_a?.new_star}⭐</p>
                            )}
                            <p>Team: {tx.teams?.team_a_id}</p>
                            {tx.teams?.team_a_pays > 0 && (
                              <p className="text-red-650 font-bold">Swap Fee: £{tx.teams.team_a_pays?.toLocaleString()}</p>
                            )}
                          </div>
                        </div>

                        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-inner">
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[9px] font-bold rounded">PLAYER B</span>
                          <p className="font-extrabold text-slate-900 text-sm mt-2 mb-1">{tx.player_b?.name}</p>
                          <div className="text-[10px] space-y-1 text-slate-500 mt-2">
                            {tx.player_b?.old_value > 0 && (
                              <p>Value: £{tx.player_b?.old_value?.toLocaleString()} → £{tx.player_b?.new_value?.toLocaleString()}</p>
                            )}
                            {tx.player_b?.old_star > 0 && (
                              <p>Stars: {tx.player_b?.old_star}⭐ → {tx.player_b?.new_star}⭐</p>
                            )}
                            <p>Team: {tx.teams?.team_b_id}</p>
                            {tx.teams?.team_b_pays > 0 && (
                              <p className="text-red-650 font-bold">Swap Fee: £{tx.teams.team_b_pays?.toLocaleString()}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-center py-2">
                        <span className="px-4 py-1.5 bg-slate-800 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider shadow-sm">
                          {tx.player_a?.name} ↔ {tx.player_b?.name}
                        </span>
                      </div>

                      {(tx.financial?.total_committee_fees || tx.financial?.cash_amount) && (
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 text-center">
                          {tx.financial?.total_committee_fees !== undefined && tx.financial.total_committee_fees > 0 && (
                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 shadow-inner">
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Total Swap Fees</p>
                              <p className="text-sm font-extrabold text-purple-650">£{tx.financial.total_committee_fees?.toLocaleString()}</p>
                            </div>
                          )}
                          {tx.financial?.cash_amount !== undefined && tx.financial.cash_amount > 0 && (
                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 shadow-inner">
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Cash Addition</p>
                              <p className="text-sm font-extrabold text-green-600">£{tx.financial.cash_amount?.toLocaleString()}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Panel */}
        {totalCount > limit && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-4 shadow-sm flex items-center justify-between font-mono text-xs">
            <button
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold uppercase tracking-wider rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              Previous
            </button>
            <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              Page {currentPage + 1} of {Math.ceil(totalCount / limit)} ({totalCount} total)
            </span>
            <button
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={!hasMore}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold uppercase tracking-wider rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
