'use client';

import { SoccerBallIcon } from '@/components/ui/CustomIcons';
import { ClipboardList, Lightbulb, Tag, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

type PlayerType = 'football' | 'real';

const CATEGORIES = ['Legend', 'Icon', 'Star', 'Rising'];
const CATEGORY_COLORS: Record<string, string> = {
  legend: 'bg-amber-100 text-amber-800 border-amber-300',
  icon:   'bg-violet-100 text-violet-800 border-violet-300',
  star:   'bg-blue-100 text-blue-800 border-blue-300',
  rising: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};
const getCategoryStyle = (cat?: string) =>
  CATEGORY_COLORS[cat?.toLowerCase() ?? ''] ?? 'bg-slate-100 text-slate-600 border-slate-200';

interface PlayerEstimate {
  id: string;
  position: string;
  category?: string; // For real players (S18+)
  estimatedCost: string;
  minCost: number;
  maxCost: number;
  avgCost: number;
}

interface BudgetData {
  footballBudget: number;
  footballSpent: number;
  realPlayerBudget: number;
  realPlayerSpent: number;
  requiredRealPlayers: number;
  maxFootballPlayers: number;
  footballTotalSlots: number;
}

const FOOTBALL_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'AMF', 'LMF', 'RMF', 'LWF', 'RWF', 'SS', 'CF'];

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
    requiredRealPlayers: 5,
    maxFootballPlayers: 25,
    footballTotalSlots: 25,
  });

  const [footballPlayers, setFootballPlayers] = useState<PlayerEstimate[]>([]);
  const [realPlayers, setRealPlayers] = useState<PlayerEstimate[]>([]);

  useEffect(() => {
    const fetchBudget = async () => {
      if (!user) return;
      try {
        setIsLoadingBudget(true);
        const res = await fetchWithTokenRefresh('/api/team/dashboard');
        const data = await res.json();
        if (data.success && data.data) {
          const ss = data.data.seasonSettings || {};
          const team = data.data.team || {};
          const stats = data.data.stats || {};
          setBudgetData({
            footballBudget: ss.euro_budget || 10000,
            footballSpent: team.football_spent || 0,
            realPlayerBudget: ss.dollar_budget || 1000,
            realPlayerSpent: team.real_player_spent || 0,
            requiredRealPlayers: ss.required_real_players || ss.min_real_players || 5,
            maxFootballPlayers: ss.max_football_players || 25,
            footballTotalSlots: stats.football_total_slots || ss.max_football_players || 25,
          });
        }
      } catch (err: any) {
        console.error('Error fetching budget:', err);
      } finally {
        setIsLoadingBudget(false);
      }
    };
    fetchBudget();
  }, [user]);

  const addPlayerEstimate = (type: PlayerType) => {
    const newPlayer: PlayerEstimate = {
      id: Date.now().toString(),
      position: type === 'football' ? 'GK' : '',
      category: type === 'real' ? 'Star' : undefined,
      estimatedCost: '',
      minCost: 0,
      maxCost: 0,
      avgCost: 0,
    };
    if (type === 'football') setFootballPlayers((p) => [...p, newPlayer]);
    else setRealPlayers((p) => [...p, newPlayer]);
  };

  const updatePlayerEstimate = (type: PlayerType, id: string, field: keyof PlayerEstimate, value: string) => {
    const update = (player: PlayerEstimate): PlayerEstimate => {
      if (player.id !== id) return player;
      const updated = { ...player, [field]: value };
      if (field === 'estimatedCost' && value) {
        const range = value.match(/(\d+)\s*-\s*(\d+)/);
        if (range) {
          const min = parseInt(range[1]);
          const max = parseInt(range[2]);
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
    if (type === 'football') setFootballPlayers((p) => p.map(update));
    else setRealPlayers((p) => p.map(update));
  };

  const removePlayerEstimate = (type: PlayerType, id: string) => {
    if (type === 'football') setFootballPlayers((p) => p.filter((x) => x.id !== id));
    else setRealPlayers((p) => p.filter((x) => x.id !== id));
  };

  const calcTotals = (players: PlayerEstimate[]) => ({
    total: players.reduce((s, p) => s + p.avgCost, 0),
    min: players.reduce((s, p) => s + p.minCost, 0),
    max: players.reduce((s, p) => s + p.maxCost, 0),
  });

  const footballTotals = calcTotals(footballPlayers);
  const realPlayerTotals = calcTotals(realPlayers);
  const currentPlayers = activeTab === 'football' ? footballPlayers : realPlayers;

  if (loading || isLoadingBudget) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto" />
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Budget Planner...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team') return null;

  return (
    <AuthGuard requiredRole="team">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Back */}
        <Link
          href="/dashboard"
          className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit mb-4"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Dashboard
        </Link>

        {/* Header */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/10 flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800">Budget Planner</h1>
              <p className="text-xs text-slate-500 uppercase font-semibold mt-1">Estimate player costs and plan your auction bids</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setActiveTab('football')}
              className={`p-3 rounded-xl font-extrabold uppercase tracking-wider text-xs transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'football'
                  ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
              }`}
            >
              <SoccerBallIcon className="w-4 h-4" /> Virtual Players (eCoin)
            </button>
            <button
              onClick={() => setActiveTab('real')}
              className={`p-3 rounded-xl font-extrabold uppercase tracking-wider text-xs transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'real'
                  ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
              }`}
            >
              <Users className="w-4 h-4" /> Real Members (COINS)
            </button>
          </div>
        </div>

        {/* Budget Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {activeTab === 'football' ? (
            <>
              <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-sky-500 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Available Budget</p>
                  <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200/50 rounded-lg text-[9px] font-black uppercase">eCoin</span>
                </div>
                <p className="text-2xl font-black text-slate-800">{budgetData.footballBudget.toLocaleString()} eCoin</p>
                <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                  Spent: <span className="text-slate-700">{budgetData.footballSpent.toLocaleString()} eCoin</span>
                </div>
              </div>

              <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-violet-500 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Planned Spending</p>
                  <span className="px-2 py-0.5 bg-violet-50 text-violet-700 border border-violet-200/50 rounded-lg text-[9px] font-black uppercase">Estimated</span>
                </div>
                <p className="text-2xl font-black text-violet-700">{footballTotals.total.toLocaleString()} eCoin</p>
                <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                  Range: <span className="text-slate-700">{footballTotals.min.toLocaleString()} – {footballTotals.max.toLocaleString()} eCoin</span>
                </div>
              </div>

              {(() => {
                const remaining = budgetData.footballBudget - footballTotals.total;
                const over = remaining < 0;
                return (
                  <div className={`console-card bg-white border border-slate-200/60 border-l-4 rounded-2xl p-5 shadow-sm ${over ? 'border-l-rose-500' : 'border-l-emerald-500'}`}>
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">After Estimates</p>
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${over ? 'bg-rose-50 text-rose-700 border-rose-200/50' : 'bg-emerald-50 text-emerald-700 border-emerald-200/50'}`}>
                        {over ? 'Over Budget' : 'Remaining'}
                      </span>
                    </div>
                    <p className={`text-2xl font-black ${over ? 'text-rose-600' : 'text-emerald-700'}`}>{remaining.toLocaleString()} eCoin</p>
                    <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                      For <span className="text-slate-700">{budgetData.footballTotalSlots} Player Slots Max</span>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <>
              <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-sky-500 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Available Budget</p>
                  <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200/50 rounded-lg text-[9px] font-black uppercase">COINS</span>
                </div>
                <p className="text-2xl font-black text-slate-800">{budgetData.realPlayerBudget.toLocaleString()} COINS</p>
                <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                  Spent: <span className="text-slate-700">{budgetData.realPlayerSpent.toLocaleString()} COINS</span>
                </div>
              </div>

              <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-violet-500 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Planned Spending</p>
                  <span className="px-2 py-0.5 bg-violet-50 text-violet-700 border border-violet-200/50 rounded-lg text-[9px] font-black uppercase">Estimated</span>
                </div>
                <p className="text-2xl font-black text-violet-700">{realPlayerTotals.total.toLocaleString()} COINS</p>
                <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                  Range: <span className="text-slate-700">{realPlayerTotals.min.toLocaleString()} – {realPlayerTotals.max.toLocaleString()} COINS</span>
                </div>
              </div>

              {(() => {
                const remaining = budgetData.realPlayerBudget - realPlayerTotals.total;
                const over = remaining < 0;
                return (

                  <div className={`console-card bg-white border border-slate-200/60 border-l-4 rounded-2xl p-5 shadow-sm ${over ? 'border-l-rose-500' : 'border-l-emerald-500'}`}>
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">After Estimates</p>
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${over ? 'bg-rose-50 text-rose-700 border-rose-200/50' : 'bg-emerald-50 text-emerald-700 border-emerald-200/50'}`}>
                        {over ? 'Over Budget' : 'Remaining'}
                      </span>
                    </div>
                    <p className={`text-2xl font-black ${over ? 'text-rose-600' : 'text-emerald-700'}`}>{remaining.toLocaleString()} COINS</p>
                    <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                      Must have exactly <span className="text-slate-700">{budgetData.requiredRealPlayers} SS Members</span>
                    </div>
                  </div>

  );
              })()}
            </>
          )}
        </div>

        {/* Estimates Panel */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                {activeTab === 'football'
                  ? <><SoccerBallIcon className="w-4 h-4" /> Virtual Player Cost Estimates</>
                  : <><Tag className="w-4 h-4 text-violet-500" /> Real Member Cost Estimates</>
                }
              </h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                {activeTab === 'football'
                  ? 'Set bid estimates for virtual players in eCoin'
                  : 'Plan bids for SS Members by category in COINS'}
              </p>
            </div>
            <button
              onClick={() => addPlayerEstimate(activeTab)}
              className="px-4 py-2 bg-slate-800 text-amber-400 border border-slate-900 rounded-xl hover:bg-slate-700 hover:shadow-md transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              Add {activeTab === 'football' ? 'Player' : 'Member'}
            </button>
          </div>

          {currentPlayers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <span className="flex justify-center mb-3">
                <ClipboardList className="w-8 h-8 text-slate-300" />
              </span>
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">No Estimates Added Yet</h3>
              <p className="text-[10px] text-slate-400 uppercase font-semibold">
                Click &quot;Add {activeTab === 'football' ? 'Player' : 'Member'}&quot; to start planning your roster budget
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {currentPlayers.map((player) => (
                <div key={player.id} className="bg-slate-50/50 hover:bg-slate-50/80 border border-slate-200/40 rounded-xl p-4 transition-all duration-200">
                  {activeTab === 'football' ? (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Position</label>
                        <select
                          value={player.position}
                          onChange={(e) => updatePlayerEstimate(activeTab, player.id, 'position', e.target.value)}
                          className="w-full py-2 px-3 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono cursor-pointer"
                        >
                          {FOOTBALL_POSITIONS.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Estimated Bid (eCoin)</label>
                        <input
                          type="text"
                          value={player.estimatedCost}
                          onChange={(e) => updatePlayerEstimate(activeTab, player.id, 'estimatedCost', e.target.value)}
                          placeholder="e.g., 100-150 or 120"
                          className="w-full py-2 px-3 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                        />
                        <span className="text-[8px] text-slate-400 font-bold block mt-1 uppercase">Min: eCoin 100 · Increment: +10</span>
                      </div>
                      <div className="flex justify-end">
                        <button onClick={() => removePlayerEstimate(activeTab, player.id)} className="p-1.5 hover:bg-rose-50 text-rose-400 hover:text-rose-600 border border-transparent hover:border-rose-200/40 rounded-lg transition-all cursor-pointer">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      {/* Category */}
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Category</label>
                        <select
                          value={player.category || 'Star'}
                          onChange={(e) => updatePlayerEstimate(activeTab, player.id, 'category', e.target.value)}
                          className="w-full py-2 px-3 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono cursor-pointer"
                        >
                          {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                        {player.category && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase border mt-1 ${getCategoryStyle(player.category)}`}>
                            {player.category}
                          </span>
                        )}
                      </div>

                      {/* Bid */}
                      <div className="md:col-span-2">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Estimated Bid (COINS)</label>
                        <input
                          type="text"
                          value={player.estimatedCost}
                          onChange={(e) => updatePlayerEstimate(activeTab, player.id, 'estimatedCost', e.target.value)}
                          placeholder="e.g., 100-200 or 150"
                          className="w-full py-2 px-3 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                        />
                        <span className="text-[8px] text-slate-400 font-bold block mt-1 uppercase">Bid at or above the player&apos;s base price floor</span>
                      </div>

                      {/* Delete */}
                      <div className="flex justify-end">
                        <button onClick={() => removePlayerEstimate(activeTab, player.id)} className="p-1.5 hover:bg-rose-50 text-rose-400 hover:text-rose-600 border border-transparent hover:border-rose-200/40 rounded-lg transition-all cursor-pointer">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Totals row */}
              <div className="mt-4 pt-4 border-t border-slate-200/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  {currentPlayers.length} estimate(s) added
                </p>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Min</p>
                    <p className="text-sm font-black text-slate-700">
                      {(activeTab === 'football' ? footballTotals.min : realPlayerTotals.min).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Avg</p>
                    <p className="text-sm font-black text-violet-700">
                      {(activeTab === 'football' ? footballTotals.total : realPlayerTotals.total).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Max</p>
                    <p className="text-sm font-black text-slate-700">
                      {(activeTab === 'football' ? footballTotals.max : realPlayerTotals.max).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tips + Guidelines */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-amber-500 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Pro Budget Tips</h4>
            </div>
            <ul className="text-xs text-slate-600 space-y-2 leading-relaxed font-semibold">
              <li className="flex items-start gap-1.5"><span>•</span><span>Enter cost estimates as ranges (e.g., &quot;100-150&quot;) or single values.</span></li>
              <li className="flex items-start gap-1.5"><span>•</span><span>The midpoint of ranges is used to calculate planned spending totals.</span></li>
              <li className="flex items-start gap-1.5"><span>•</span><span>Keep a budget reserve for competitive bids during the live auction.</span></li>
              <li className="flex items-start gap-1.5"><span>•</span><span>For Real Members, check the base price floor before entering a bid estimate.</span></li>
            </ul>
          </div>

          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-sky-500 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4 text-sky-500" />
              <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Season Guidelines</h4>
            </div>
            <ul className="text-xs text-slate-600 space-y-2 font-semibold divide-y divide-slate-100">
              <li className="flex justify-between py-1">
                <span className="uppercase text-slate-400">Virtual Player Slots Max</span>
                <span className="text-slate-800 font-extrabold">{budgetData.maxFootballPlayers} Slots</span>
              </li>
              <li className="flex justify-between py-1">
                <span className="uppercase text-slate-400">SS Members Required</span>
                <span className="text-slate-800 font-extrabold">{budgetData.requiredRealPlayers} Members</span>
              </li>
              <li className="flex justify-between py-1">
                <span className="uppercase text-slate-400">SS Member Categories</span>
                <span className="text-slate-800 font-extrabold">Legend · Icon · Star · Rising</span>
              </li>
              <li className="flex justify-between py-1">
                <span className="uppercase text-slate-400">Min Bid / Increment</span>
                <span className="text-slate-800 font-extrabold">Base Price / +10</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  
    </AuthGuard>
  );
}
