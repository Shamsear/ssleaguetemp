'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

type PlayerType = 'football' | 'real';

interface PlayerEstimate {
  id: string;
  position: string;
  stars?: number; // For real players (3-10)
  estimatedCost: string;
  minCost: number;
  maxCost: number;
  avgCost: number;
  customMatches?: string;
}

interface BudgetData {
  footballBudget: number;
  footballSpent: number;
  realPlayerBudget: number;
  realPlayerSpent: number;
  matchesPerSeason: number;
  midSeasonMatches: number;
  requiredRealPlayers: number; // Exact count required
  maxFootballPlayers: number;
  footballTotalSlots: number;
}

const FOOTBALL_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'AMF', 'LMF', 'RMF', 'LWF', 'RWF', 'SS', 'CF'];
const STAR_RATINGS = [3, 4, 5, 6, 7, 8, 9, 10];

export default function BudgetPlannerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PlayerType>('football');
  const [isLoadingBudget, setIsLoadingBudget] = useState(true);
  
  const [budgetData, setBudgetData] = useState<BudgetData>({
    footballBudget: 10000,
    footballSpent: 0,
    realPlayerBudget: 1000,
    realPlayerSpent: 0,
    matchesPerSeason: 38,
    midSeasonMatches: 19,
    requiredRealPlayers: 5, // Exact count
    maxFootballPlayers: 25,
    footballTotalSlots: 25,
  });

  const [footballPlayers, setFootballPlayers] = useState<PlayerEstimate[]>([]);
  const [realPlayers, setRealPlayers] = useState<PlayerEstimate[]>([]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch team's actual budget from team_seasons
  useEffect(() => {
    const fetchBudget = async () => {
      if (!user) return;
      
      try {
        setIsLoadingBudget(true);
        const response = await fetchWithTokenRefresh('/api/team/dashboard');
        const data = await response.json();
        
        if (data.success && data.data) {
          // Use season settings for initial budgets, team_seasons for spent amounts
          const seasonSettings = data.data.seasonSettings || {};
          const team = data.data.team || {};
          const stats = data.data.stats || {};
          
          setBudgetData({
            footballBudget: seasonSettings.euro_budget || 10000,
            footballSpent: team.football_spent || 0,
            realPlayerBudget: seasonSettings.dollar_budget || 1000,
            realPlayerSpent: team.real_player_spent || 0,
            matchesPerSeason: 38,
            midSeasonMatches: 19,
            requiredRealPlayers: seasonSettings.required_real_players || seasonSettings.min_real_players || 5, // Backward compatible
            maxFootballPlayers: seasonSettings.max_football_players || 25,
            footballTotalSlots: stats.football_total_slots || seasonSettings.max_football_players || 25,
          });
        }
      } catch (error) {
        console.error('Error fetching budget:', error);
        // Keep default values on error
      } finally {
        setIsLoadingBudget(false);
      }
    };
    
    fetchBudget();
  }, [user]);

  // Add new player estimate
  const addPlayerEstimate = (type: PlayerType) => {
    const newPlayer: PlayerEstimate = {
      id: Date.now().toString(),
      position: type === 'football' ? 'GK' : '',
      stars: type === 'real' ? 5 : undefined,
      estimatedCost: '',
      minCost: 0,
      maxCost: 0,
      avgCost: 0,
    };
    if (type === 'football') {
      setFootballPlayers([...footballPlayers, newPlayer]);
    } else {
      setRealPlayers([...realPlayers, newPlayer]);
    }
  };

  // Update player estimate
  const updatePlayerEstimate = (type: PlayerType, id: string, field: keyof PlayerEstimate, value: string) => {
    const updatePlayer = (player: PlayerEstimate) => {
      if (player.id !== id) return player;
      
      const updated = { ...player, [field]: value };
      
      // Parse cost range if estimatedCost is updated
      if (field === 'estimatedCost' && value) {
        const match = value.match(/(\d+)\s*-\s*(\d+)/);
        if (match) {
          const min = parseInt(match[1]);
          const max = parseInt(match[2]);
          updated.minCost = min;
          updated.maxCost = max;
          updated.avgCost = (min + max) / 2;
        } else {
          const single = parseInt(value);
          if (!isNaN(single)) {
            updated.minCost = single;
            updated.maxCost = single;
            updated.avgCost = single;
          }
        }
      }
      
      return updated;
    };

    if (type === 'football') {
      setFootballPlayers(footballPlayers.map(updatePlayer));
    } else {
      setRealPlayers(realPlayers.map(updatePlayer));
    }
  };

  // Remove player estimate
  const removePlayerEstimate = (type: PlayerType, id: string) => {
    if (type === 'football') {
      setFootballPlayers(footballPlayers.filter(p => p.id !== id));
    } else {
      setRealPlayers(realPlayers.filter(p => p.id !== id));
    }
  };

  // Calculate totals
  const calculateTotals = (players: PlayerEstimate[]) => {
    const total = players.reduce((sum, p) => sum + p.avgCost, 0);
    const min = players.reduce((sum, p) => sum + p.minCost, 0);
    const max = players.reduce((sum, p) => sum + p.maxCost, 0);
    return { total, min, max };
  };

  const footballTotals = calculateTotals(footballPlayers);
  const realPlayerTotals = calculateTotals(realPlayers);

  if (loading || isLoadingBudget) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Budget Planner...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team') {
    return null;
  }

  const currentPlayers = activeTab === 'football' ? footballPlayers : realPlayers;

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
                  Budget Planner
                </h1>
                <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                  Estimate player costs and calculate salaries
                </p>
              </div>
            </div>
          </div>
        </div>

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
              ⚽ Virtual Players (eCoin)
            </button>
            <button
              onClick={() => setActiveTab('real')}
              className={`p-3 rounded-xl font-extrabold uppercase tracking-wider text-xs transition-all cursor-pointer ${
                activeTab === 'real'
                  ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
              }`}
            >
              🎮 Real Players (SSCoin)
            </button>
          </div>
        </div>

        {/* Budget Overview Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {activeTab === 'football' ? (
            <>
              {/* Card 1: Available */}
              <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-sky-500 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Available Budget</p>
                  <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200/50 rounded-lg text-[9px] font-black uppercase">eCoin Budget</span>
                </div>
                <p className="text-2xl font-black text-slate-800">{budgetData.footballBudget.toLocaleString()} eCoin</p>
                <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                  Spent: <span className="text-slate-700">{budgetData.footballSpent.toLocaleString()} eCoin</span>
                </div>
              </div>

              {/* Card 2: Planned */}
              <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-purple-500 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Planned Spending</p>
                  <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200/50 rounded-lg text-[9px] font-black uppercase">Estimated</span>
                </div>
                <p className="text-2xl font-black text-purple-700">{footballTotals.total.toLocaleString()} eCoin</p>
                <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                  Range: <span className="text-slate-700">{footballTotals.min.toLocaleString()} - {footballTotals.max.toLocaleString()} eCoin</span>
                </div>
              </div>

              {/* Card 3: Remaining */}
              {(() => {
                const remaining = budgetData.footballBudget - footballTotals.total;
                const isOverBudget = remaining < 0;
                return (
                  <div className={`console-card bg-white border border-slate-200/60 border-l-4 rounded-2xl p-5 shadow-sm ${isOverBudget ? 'border-l-rose-500' : 'border-l-emerald-500'}`}>
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">After Estimates</p>
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${isOverBudget ? 'bg-rose-50 text-rose-700 border-rose-200/50' : 'bg-emerald-50 text-emerald-700 border-emerald-200/50'}`}>
                        {isOverBudget ? 'Over Budget' : 'Remaining'}
                      </span>
                    </div>
                    <p className={`text-2xl font-black ${isOverBudget ? 'text-rose-650' : 'text-emerald-700'}`}>
                      {remaining.toLocaleString()} eCoin
                    </p>
                    <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                      For <span className="text-slate-700">{budgetData.footballTotalSlots} Player Slots Max</span>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <>
              {/* Card 1: Available SSCoin */}
              <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-emerald-500 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Available Budget</p>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/50 rounded-lg text-[9px] font-black uppercase">SSCoin Budget</span>
                </div>
                <p className="text-2xl font-black text-slate-800">{budgetData.realPlayerBudget.toLocaleString()} SSCoin</p>
                <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                  Spent: <span className="text-slate-700">{budgetData.realPlayerSpent.toLocaleString()} SSCoin</span>
                </div>
              </div>

              {/* Card 2: Planned SSCoin */}
              <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-purple-500 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Planned Spending</p>
                  <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200/50 rounded-lg text-[9px] font-black uppercase">Estimated</span>
                </div>
                <p className="text-2xl font-black text-purple-700">{realPlayerTotals.total.toLocaleString()} SSCoin</p>
                <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                  Range: <span className="text-slate-700">{realPlayerTotals.min.toLocaleString()} - {realPlayerTotals.max.toLocaleString()} SSCoin</span>
                </div>
              </div>

              {/* Card 3: Remaining SSCoin */}
              {(() => {
                const remaining = budgetData.realPlayerBudget - realPlayerTotals.total;
                const isOverBudget = remaining < 0;
                return (
                  <div className={`console-card bg-white border border-slate-200/60 border-l-4 rounded-2xl p-5 shadow-sm ${isOverBudget ? 'border-l-rose-500' : 'border-l-sky-500'}`}>
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">After Estimates</p>
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${isOverBudget ? 'bg-rose-50 text-rose-700 border-rose-200/50' : 'bg-sky-50 text-sky-700 border-sky-200/50'}`}>
                        {isOverBudget ? 'Over Budget' : 'Remaining'}
                      </span>
                    </div>
                    <p className={`text-2xl font-black ${isOverBudget ? 'text-rose-650' : 'text-sky-700'}`}>
                      {remaining.toLocaleString()} SSCoin
                    </p>
                    <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                      Must Have Exactly <span className="text-slate-700">{budgetData.requiredRealPlayers} SS Members</span>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* Player Estimates List Panel */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-black text-slate-800 uppercase tracking-wider">
                {activeTab === 'football' ? '⚽ Virtual Player Cost Estimates' : '🎮 Real Member Cost Estimates'}
              </h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                Set estimates and analyze overall salary impact
              </p>
            </div>
            <button
              onClick={() => addPlayerEstimate(activeTab)}
              className="px-4 py-2 bg-slate-800 text-amber-400 border border-slate-900 rounded-xl hover:bg-slate-700 hover:shadow-md transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit cursor-pointer"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              Add Player
            </button>
          </div>

          {currentPlayers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <span className="text-4xl mb-3 block">📋</span>
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">No Estimates Added Yet</h3>
              <p className="text-[10px] text-slate-400 uppercase font-semibold">Click "Add Player" to start plotting your roster budget</p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentPlayers.map((player) => (
                <div key={player.id} className="bg-slate-50/50 hover:bg-slate-50/80 border border-slate-200/40 rounded-xl p-4 transition-all duration-200">
                  {activeTab === 'football' ? (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                      {/* Position */}
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Position</label>
                        <select
                          value={player.position}
                          onChange={(e) => updatePlayerEstimate(activeTab, player.id, 'position', e.target.value)}
                          className="w-full py-2 px-3 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono cursor-pointer"
                        >
                          {FOOTBALL_POSITIONS.map(pos => (
                            <option key={pos} value={pos}>{pos}</option>
                          ))}
                        </select>
                      </div>

                      {/* Estimated Cost */}
                      <div className="md:col-span-2">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Estimated Bid (eCoin)</label>
                        <input
                          type="text"
                          value={player.estimatedCost}
                          onChange={(e) => updatePlayerEstimate(activeTab, player.id, 'estimatedCost', e.target.value)}
                          placeholder="e.g., 100-150 or 120"
                          className="w-full py-2 px-3 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                        />
                        <span className="text-[8px] text-slate-400 font-bold block mt-1 uppercase tracking-wide">Min bid: eCoin 100, increment +eCoin 10</span>
                      </div>

                      {/* Actions */}
                      <div className="flex justify-end items-center pt-2 md:pt-4">
                        <button
                          onClick={() => removePlayerEstimate(activeTab, player.id)}
                          className="p-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-750 border border-transparent hover:border-rose-200/40 rounded-lg transition-all cursor-pointer"
                          title="Remove player estimate"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                      {/* Star Rating */}
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Star Rating</label>
                        <select
                          value={player.stars || 5}
                          onChange={(e) => updatePlayerEstimate(activeTab, player.id, 'stars', e.target.value)}
                          className="w-full py-2 px-3 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono cursor-pointer"
                        >
                          {STAR_RATINGS.map(star => (
                            <option key={star} value={star}>{star}★</option>
                          ))}
                        </select>
                      </div>

                      {/* Estimated Cost SSCoin */}
                      <div className="md:col-span-2">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Estimated Bid (SSCoin)</label>
                        <input
                          type="text"
                          value={player.estimatedCost}
                          onChange={(e) => updatePlayerEstimate(activeTab, player.id, 'estimatedCost', e.target.value)}
                          placeholder="e.g., 100-200 or 150"
                          className="w-full py-2 px-3 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                        />
                        <span className="text-[8px] text-slate-400 font-bold block mt-1 uppercase tracking-wide">Min bid: SSCoin 100, increment +SSCoin 10</span>
                      </div>

                      {/* Actions */}
                      <div className="flex justify-end items-center pt-2 md:pt-4">
                        <button
                          onClick={() => removePlayerEstimate(activeTab, player.id)}
                          className="p-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-750 border border-transparent hover:border-rose-200/40 rounded-lg transition-all cursor-pointer"
                          title="Remove player estimate"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info & Tips Callout Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Tips */}
          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-amber-500 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">💡</span>
              <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Pro Budget Tips</h4>
            </div>
            <ul className="text-xs text-slate-650 space-y-2 leading-relaxed font-semibold">
              <li className="flex items-start gap-1">
                <span>•</span>
                <span>Enter cost estimates as ranges (e.g., "100-150") or single values.</span>
              </li>
              <li className="flex items-start gap-1">
                <span>•</span>
                <span>The midpoint of ranges will be used to calculate planned spending.</span>
              </li>
              <li className="flex items-start gap-1">
                <span>•</span>
                <span>Keep some budget reserve for unexpected opportunities during auction bids.</span>
              </li>
            </ul>
          </div>

          {/* Card 2: Slots & Contracts Guidelines */}
          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-sky-500 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">📋</span>
              <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Slot & Contract Guidelines</h4>
            </div>
            <ul className="text-xs text-slate-650 space-y-2 leading-relaxed font-semibold">
              <li className="flex justify-between py-0.5 border-b border-slate-100">
                <span className="uppercase text-slate-400">Virtual Player Slots Max</span>
                <span className="text-slate-800 font-extrabold">{budgetData.maxFootballPlayers} Slots Max</span>
              </li>
              <li className="flex justify-between py-0.5 border-b border-slate-100">
                <span className="uppercase text-slate-400">SS Members (Real) Required</span>
                <span className="text-slate-800 font-extrabold">{budgetData.requiredRealPlayers} Members</span>
              </li>
              <li className="flex justify-between py-0.5 border-b border-slate-100">
                <span className="uppercase text-slate-400">Min Bid Floor / Increment</span>
                <span className="text-slate-800 font-extrabold">100 / +10</span>
              </li>
              <li className="flex justify-between py-0.5">
                <span className="uppercase text-slate-400">Season Schedule</span>
                <span className="text-slate-800 font-extrabold">38 Rounds (19 Mid-Season)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
