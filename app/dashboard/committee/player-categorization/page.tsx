'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { 
  ArrowLeft, 
  Layers, 
  Sparkles, 
  Download, 
  Save, 
  Users, 
  AlertTriangle, 
  CheckCircle, 
  HelpCircle, 
  Info,
  ChevronDown
} from 'lucide-react';

interface Player {
  id: string;
  player_id: string;
  player_name: string;
  category: string;
  points: number;
  matches_played: number;
}

interface HistoricalStat {
  player_id: string;
  season_id: string;
  points: number;
  matches_played: number;
  goals_scored: number;
  clean_sheets: number;
  assists: number;
  wins: number;
  draws: number;
  losses: number;
}

interface Category {
  id: string;
  name: string;
  priority: number;
}

export default function PlayerCategorizationPage() {
  const { user, loading: authLoading } = useAuth();
  const { isCommitteeAdmin, userSeasonId } = usePermissions();
  const router = useRouter();

  // Data states
  const [categories, setCategories] = useState<Category[]>([]);
  const [activePlayers, setActivePlayers] = useState<Player[]>([]);
  const [historicalStats, setHistoricalStats] = useState<HistoricalStat[]>([]);
  
  // Loading & UI states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Admin configuration states
  const [categoryTargets, setCategoryTargets] = useState<{ [key: string]: number }>({});
  const [hasCalculated, setHasCalculated] = useState(false);
  
  // Results & overrides
  const [proposedCategories, setProposedCategories] = useState<Map<string, string>>(new Map());
  const [manualOverrides, setManualOverrides] = useState<Map<string, string>>(new Map());

  // Redirect if unauthorized
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
    if (!authLoading && user && !isCommitteeAdmin) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router, isCommitteeAdmin]);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      if (!userSeasonId) return;
      setLoading(true);
      setError(null);
      
      try {
        // 1. Fetch categories
        const catRes = await fetchWithTokenRefresh('/api/categories');
        const catData = await catRes.json();
        if (catData.success) {
          const sortedCats = (catData.data || []).sort((a: Category, b: Category) => a.priority - b.priority);
          setCategories(sortedCats);
        }

        // 2. Fetch players & historical stats
        const dataRes = await fetchWithTokenRefresh(`/api/committee/player-categorization?seasonId=${userSeasonId}`);
        const dataResult = await dataRes.json();
        
        if (dataResult.success) {
          setActivePlayers(dataResult.activePlayers || []);
          setHistoricalStats(dataResult.historicalStats || []);
        } else {
          throw new Error(dataResult.error || 'Failed to fetch player stats');
        }
      } catch (err: any) {
        console.error('Error loading categorization data:', err);
        setError(err.message || 'Failed to load player stats data');
      } finally {
        setLoading(false);
      }
    };

    if (isCommitteeAdmin && userSeasonId) {
      loadData();
    }
  }, [isCommitteeAdmin, userSeasonId]);

  // Extract current season number
  const currentSeasonNum = useMemo(() => {
    if (!userSeasonId) return 0;
    return parseInt(userSeasonId.replace(/\D/g, '')) || 0;
  }, [userSeasonId]);

  // Group historical stats by player_id
  const historicalByPlayer = useMemo(() => {
    const map = new Map<string, HistoricalStat[]>();
    historicalStats.forEach(stat => {
      if (!map.has(stat.player_id)) {
        map.set(stat.player_id, []);
      }
      map.get(stat.player_id)!.push(stat);
    });
    return map;
  }, [historicalStats]);

  // Extract unique past seasons present in historical stats (sorted descending, e.g. S17, S16, S15...)
  const historicalSeasonsList = useMemo(() => {
    const seasons = new Set<string>();
    historicalStats.forEach(stat => {
      if (stat.season_id) seasons.add(stat.season_id);
    });
    return Array.from(seasons).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.replace(/\D/g, '')) || 0;
      return numB - numA; // Descending
    });
  }, [historicalStats]);

  // Compute player weights and scores
  const playersWithScores = useMemo(() => {
    return activePlayers.map(player => {
      const stats = historicalByPlayer.get(player.player_id) || [];
      
      // Calculate weighted score using decay weightage
      let weightedSum = 0;
      let weightSum = 0;
      const seasonPointsMap = new Map<string, number>();

      stats.forEach(stat => {
        const seasonNum = parseInt(stat.season_id.replace(/\D/g, '')) || 0;
        if (seasonNum > 0 && seasonNum < currentSeasonNum) {
          const distance = currentSeasonNum - seasonNum;
          // Exponential decay weight: 1.0 for dist 1, 0.5 for dist 2, 0.25 for dist 3...
          const weight = Math.pow(0.5, distance - 1);
          
          weightedSum += (stat.points || 0) * weight;
          weightSum += weight;
          
          seasonPointsMap.set(stat.season_id, stat.points);
        }
      });

      const weightedScore = weightSum > 0 ? Math.round(weightedSum / weightSum) : null;

      return {
        ...player,
        weightedScore,
        seasonPointsMap,
        isNewPlayer: weightedScore === null
      };
    });
  }, [activePlayers, historicalByPlayer, currentSeasonNum]);

  // Sort players: unrated/new at the bottom, others sorted by weightedScore descending
  const sortedPlayers = useMemo(() => {
    return [...playersWithScores].sort((a, b) => {
      if (a.isNewPlayer && b.isNewPlayer) return a.player_name.localeCompare(b.player_name);
      if (a.isNewPlayer) return 1; // Put new players at the bottom
      if (b.isNewPlayer) return -1;
      return (b.weightedScore || 0) - (a.weightedScore || 0); // Sort by score DESC
    });
  }, [playersWithScores]);

  // Initialize target category distribution inputs once categories are loaded
  useEffect(() => {
    if (categories.length > 0 && activePlayers.length > 0 && Object.keys(categoryTargets).length === 0) {
      const equalShare = Math.floor(activePlayers.length / categories.length);
      const initialTargets: { [key: string]: number } = {};
      categories.forEach((cat, index) => {
        // Distribute remaining players to the first category
        initialTargets[cat.id] = index === 0 
          ? equalShare + (activePlayers.length % categories.length)
          : equalShare;
      });
      setCategoryTargets(initialTargets);
    }
  }, [categories, activePlayers, categoryTargets]);

  // Run the AI partition assignment algorithm
  const handleCalculateProposals = () => {
    setError(null);
    setManualOverrides(new Map()); // Reset overrides

    // 1. Validate target inputs
    const totalTarget = Object.values(categoryTargets).reduce((a, b) => a + b, 0);
    if (totalTarget !== activePlayers.length) {
      setError(`Warning: The total target counts (${totalTarget}) must equal the number of registered players (${activePlayers.length}).`);
      return;
    }

    // 2. Partition sorted players based on targets
    const proposals = new Map<string, string>();
    let currentIndex = 0;

    // Categories are sorted by priority (e.g. Red, Black, Blue, White)
    categories.forEach(cat => {
      const count = categoryTargets[cat.id] || 0;
      for (let i = 0; i < count; i++) {
        const player = sortedPlayers[currentIndex];
        if (player) {
          proposals.set(player.id, cat.name);
          currentIndex++;
        }
      }
    });

    // Handle any leftover players just in case
    while (currentIndex < sortedPlayers.length) {
      const player = sortedPlayers[currentIndex];
      const lowestCat = categories[categories.length - 1];
      if (player && lowestCat) {
        proposals.set(player.id, lowestCat.name);
      }
      currentIndex++;
    }

    setProposedCategories(proposals);
    setHasCalculated(true);
  };

  // Get current player category (handles overrides and proposals)
  const getPlayerCategory = (playerId: string, proposedCatName: string) => {
    if (manualOverrides.has(playerId)) {
      return manualOverrides.get(playerId)!;
    }
    return proposedCatName || 'N/A';
  };

  // Handle manual category change
  const handleCategoryOverride = (playerId: string, categoryName: string) => {
    setManualOverrides(prev => {
      const copy = new Map(prev);
      copy.set(playerId, categoryName);
      return copy;
    });
  };

  // Computed live category counts
  const categoryCounts = useMemo(() => {
    const counts: { [key: string]: number } = {};
    categories.forEach(cat => {
      counts[cat.name] = 0;
    });

    sortedPlayers.forEach(p => {
      const proposed = proposedCategories.get(p.id) || '';
      const finalCategory = getPlayerCategory(p.id, proposed);
      if (finalCategory && finalCategory !== 'N/A') {
        counts[finalCategory] = (counts[finalCategory] || 0) + 1;
      }
    });

    return counts;
  }, [sortedPlayers, proposedCategories, manualOverrides, categories]);

  // Bulk Save and Apply updates
  const handleSaveCategories = async () => {
    if (!userSeasonId || !hasCalculated) return;
    
    setSaving(true);
    setError(null);
    setSuccess(null);

    const updates = sortedPlayers.map(p => {
      const proposed = proposedCategories.get(p.id) || '';
      const category = getPlayerCategory(p.id, proposed);
      return {
        id: p.id,
        category
      };
    }).filter(u => u.category !== 'N/A');

    try {
      const res = await fetchWithTokenRefresh('/api/committee/player-categorization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: userSeasonId,
          updates
        })
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(`Successfully updated categories for ${updates.length} players!`);
        // Refresh original player list categories in state
        setActivePlayers(prev => 
          prev.map(p => {
            const update = updates.find(u => u.id === p.id);
            return update ? { ...p, category: update.category } : p;
          })
        );
      } else {
        throw new Error(data.error || 'Failed to save categories');
      }
    } catch (err: any) {
      console.error('Error saving categories:', err);
      setError(err.message || 'Failed to bulk save categories');
    } finally {
      setSaving(false);
    }
  };

  // Export recommendations to Excel
  const handleExportExcel = () => {
    if (!hasCalculated) return;

    // Map data for export sheet
    const exportData = sortedPlayers.map(p => {
      const proposed = proposedCategories.get(p.id) || '';
      const finalCategory = getPlayerCategory(p.id, proposed);

      const row: { [key: string]: any } = {
        'Player Name': p.player_name,
        'Expected Category': finalCategory,
        'AI Performance Score': p.weightedScore !== null ? p.weightedScore : 'Unrated (New Player)',
      };

      // Add historical seasons columns
      historicalSeasonsList.forEach(seasonId => {
        row[`${seasonId} Points`] = p.seasonPointsMap.get(seasonId) || 'N/A';
      });

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'AI Proposed Categories');

    // Auto-adjust column widths
    const maxLenMap = new Map<string, number>();
    exportData.forEach(row => {
      Object.keys(row).forEach(key => {
        const valStr = String(row[key]);
        const currentMax = maxLenMap.get(key) || key.length;
        if (valStr.length > currentMax) {
          maxLenMap.set(key, valStr.length);
        }
      });
    });

    const wscols = Array.from(maxLenMap.keys()).map(key => ({
      wch: (maxLenMap.get(key) || 10) + 4
    }));
    worksheet['!cols'] = wscols;

    XLSX.writeFile(workbook, `AI-Player-Categorization-Season-${userSeasonId}.xlsx`);
  };

  // Filtered player list based on search term
  const filteredPlayers = useMemo(() => {
    return sortedPlayers.filter(p => 
      p.player_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [sortedPlayers, searchTerm]);

  // Loading skeleton UI
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading Categorization Assistant...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer w-fit"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold uppercase w-fit">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            AI Assistant Console
          </div>
        </div>

        {/* Page Banner */}
        <div className="console-card bg-slate-900 border border-slate-950 p-6 lg:p-8 rounded-2xl shadow-xl text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-72 h-72 rounded-full bg-gradient-to-br from-amber-500/10 to-transparent blur-3xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h1 className="text-xl lg:text-3xl font-black uppercase tracking-wider text-amber-400 mb-2">
                AI Player Categorization
              </h1>
              <p className="text-xs text-slate-400 font-bold uppercase max-w-2xl">
                Automatically allocate players into dynamic rating categories using decay-weighted performance curves. Set quotas, review proposal rosters, and export reports in seconds.
              </p>
            </div>
            
            <div className="flex gap-4">
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Registered</span>
                <span className="text-xl font-black text-amber-400">{activePlayers.length}</span>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Active Season</span>
                <span className="text-xl font-black text-white">{userSeasonId}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Setup Configuration */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Target inputs card */}
          <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl lg:col-span-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                <Layers className="w-5 h-5 text-slate-650" />
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Category Quotas</h3>
              </div>

              <p className="text-[10px] text-slate-500 font-bold uppercase mb-4 leading-relaxed">
                Specify the maximum number of players you want in each category. The AI will sort players by points and fill the quotas starting from the highest tier.
              </p>

              <div className="space-y-4">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between gap-4 p-2 border border-slate-150 rounded-xl hover:bg-slate-50/50 transition-all">
                    <span className="text-xs font-bold text-slate-700">{cat.name}</span>
                    <input
                      type="number"
                      min="0"
                      className="w-20 px-3 py-1.5 border border-slate-250 rounded-lg text-center font-mono font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                      value={categoryTargets[cat.id] || 0}
                      onChange={(e) => setCategoryTargets(prev => ({
                        ...prev,
                        [cat.id]: Math.max(0, parseInt(e.target.value) || 0)
                      }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                onClick={handleCalculateProposals}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-900 font-mono font-black text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4" /> Generate Proposals
              </button>
            </div>
          </div>

          {/* AI Explanation / Information card */}
          <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl lg:col-span-2 space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                <Info className="w-5 h-5 text-slate-650" />
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">How the AI Suggests Categories</h3>
              </div>

              <div className="space-y-3 text-slate-700 text-xs leading-relaxed">
                <div className="flex gap-2">
                  <div className="font-bold text-amber-500 flex-shrink-0">Step 1:</div>
                  <div>
                    <strong>Skip Active Season stats:</strong> Since categorization occurs at the start of a season or for replacement players, the active season stats are ignored.
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <div className="font-bold text-amber-500 flex-shrink-0">Step 2:</div>
                  <div>
                    <strong>Decay-Weighted Historical Averaging:</strong> The algorithm queries the points of every registered player across all past seasons. To keep the ratings relevant, older seasons are penalized:
                    <ul className="list-disc pl-5 mt-2 space-y-1 font-mono text-[10px] text-slate-550 uppercase">
                      <li>1 season ago (e.g. S17 for S18): Weight = <strong>1.00</strong></li>
                      <li>2 seasons ago (e.g. S16 for S18): Weight = <strong>0.50</strong></li>
                      <li>3 seasons ago (e.g. S15 for S18): Weight = <strong>0.25</strong></li>
                    </ul>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="font-bold text-amber-500 flex-shrink-0">Step 3:</div>
                  <div>
                    <strong>Quotas Allocation:</strong> All players are sorted by their performance scores. Category tiers are filled sequentially matching your requested sizes.
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="font-bold text-amber-500 flex-shrink-0">Step 4:</div>
                  <div>
                    <strong>New/Replacement Players Handling:</strong> Players with no historical records are placed in an <em>Unrated / New Players</em> pool at the bottom of the list for easy manual category assignment.
                  </div>
                </div>
              </div>
            </div>

            {hasCalculated && (
              <div className="p-4 border border-emerald-200 bg-emerald-50/50 text-emerald-800 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                Category allocation generated! Review the suggestions below.
              </div>
            )}
          </div>
        </div>

        {/* Errors & Success Notifications */}
        {error && (
          <div className="p-4 border border-rose-200 bg-rose-50 text-rose-800 rounded-xl text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="p-4 border border-emerald-250 bg-emerald-50 text-emerald-850 rounded-xl text-xs font-bold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            {success}
          </div>
        )}

        {/* Proposals Grid / Interactive Table */}
        {hasCalculated && (
          <div className="console-card bg-white border border-slate-200/60 shadow-sm rounded-2xl overflow-hidden space-y-4">
            
            {/* Table Header controls */}
            <div className="px-6 py-4 border-b border-slate-200/60 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-550" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                  Player Recommendations ({filteredPlayers.length})
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 w-full md:w-auto">
                <input
                  type="text"
                  placeholder="Search player name..."
                  className="px-3 py-1.5 border border-slate-250 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-amber-500 w-full md:w-48"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                
                <button
                  onClick={handleExportExcel}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-slate-250 hover:bg-slate-50 font-mono font-bold text-xs uppercase tracking-wider text-slate-700 cursor-pointer flex-1 md:flex-none"
                >
                  <Download className="w-3.5 h-3.5" /> Export Excel
                </button>

                <button
                  onClick={handleSaveCategories}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white font-mono font-bold text-xs uppercase tracking-wider cursor-pointer flex-1 md:flex-none"
                >
                  <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Apply Categories'}
                </button>
              </div>
            </div>

            {/* Target vs Live Counts Tracker */}
            <div className="px-6 py-2 bg-slate-50/50 border-b border-slate-100 flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-wider">
              {categories.map(cat => {
                const target = categoryTargets[cat.id] || 0;
                const live = categoryCounts[cat.name] || 0;
                const matches = target === live;
                return (
                  <div key={cat.id} className={`px-2 py-1 border rounded ${matches ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-250 text-amber-800'}`}>
                    {cat.name}: Live {live} / Target {target}
                  </div>
                );
              })}
            </div>

            {/* Recommendations Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200/60">
                <thead className="bg-slate-50/50">
                  <tr className="font-mono text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-3.5">Player</th>
                    <th className="px-6 py-3.5">Current Category</th>
                    <th className="px-6 py-3.5 text-center">AI Rating Suggestion</th>
                    <th className="px-6 py-3.5 text-center">AI Score</th>
                    {historicalSeasonsList.map(seasonId => (
                      <th key={seasonId} className="px-4 py-3.5 text-center font-mono">{seasonId}</th>
                    ))}
                    <th className="px-6 py-3.5 text-right">Manual Override</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 text-xs text-slate-700">
                  {filteredPlayers.map((player) => {
                    const proposed = proposedCategories.get(player.id) || '';
                    const finalCategory = getPlayerCategory(player.id, proposed);
                    const isOverridden = manualOverrides.has(player.id);
                    
                    return (
                      <tr key={player.id} className={`hover:bg-slate-50/30 transition-colors ${player.isNewPlayer ? 'bg-amber-50/15' : ''}`}>
                        
                        {/* Player name */}
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800">{player.player_name}</div>
                          {player.isNewPlayer && (
                            <span className="text-[9px] font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1 inline-block uppercase">New / Replacement</span>
                          )}
                        </td>

                        {/* Current assigned category */}
                        <td className="px-6 py-4 font-mono text-slate-500">
                          {player.category || 'None'}
                        </td>

                        {/* Proposed Category */}
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            proposed === 'Red' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                            proposed === 'Black' ? 'bg-slate-100 text-slate-700 border border-slate-200' :
                            proposed === 'Blue' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                            'bg-slate-50 text-slate-500 border border-slate-200'
                          }`}>
                            {proposed || 'N/A'}
                          </span>
                        </td>

                        {/* AI Score */}
                        <td className="px-6 py-4 font-mono font-bold text-center text-slate-700">
                          {player.weightedScore !== null ? player.weightedScore : '—'}
                        </td>

                        {/* Historical Season Stats */}
                        {historicalSeasonsList.map(seasonId => {
                          const pts = player.seasonPointsMap.get(seasonId);
                          return (
                            <td key={seasonId} className="px-4 py-4 font-mono text-center text-slate-500">
                              {pts !== undefined ? pts : '—'}
                            </td>
                          );
                        })}

                        {/* Manual override dropdown */}
                        <td className="px-6 py-4 text-right">
                          <div className="inline-block relative">
                            <select
                              value={finalCategory}
                              onChange={(e) => handleCategoryOverride(player.id, e.target.value)}
                              className={`appearance-none bg-white border pr-8 pl-3 py-1 rounded-lg text-xs font-mono font-bold uppercase tracking-wider text-slate-700 focus:outline-none focus:border-amber-500 cursor-pointer ${
                                isOverridden ? 'border-amber-500 ring-2 ring-amber-100' : 'border-slate-250'
                              }`}
                            >
                              <option value="N/A">Select...</option>
                              {categories.map(cat => (
                                <option key={cat.id} value={cat.name}>{cat.name}</option>
                              ))}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2 pointer-events-none" />
                          </div>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
