'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import Link from 'next/link';
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
  ChevronDown,
  ChevronUp,
  Sliders,
  Search,
  Check
} from 'lucide-react';
import { normalizeStr } from '@/lib/utils/normalizeStr';

// Helper to group sub-seasons (like 16.5 into 16, 17.5 into 17)
function getBaseSeasonId(seasonId: string): string {
  if (!seasonId) return '';
  if (seasonId.startsWith('SSPSLS16')) return 'SSPSLS16';
  if (seasonId.startsWith('SSPSLS17')) return 'SSPSLS17';
  return seasonId;
}

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
  base_price?: number;
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
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);

  // AI Configuration state enhancements
  const [maxSeasons, setMaxSeasons] = useState<number | 'all'>('all');
  const [minMatches, setMinMatches] = useState<number>(3);
  const [weightPreset, setWeightPreset] = useState<'decay' | 'equal' | 'linear' | 'custom'>('decay');
  const [seasonWeights, setSeasonWeights] = useState<number[]>([1.0, 0.5, 0.25, 0.12, 0.06]); // Corresponds to 1, 2, 3, 4, 5 seasons ago
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

  // Table Filter states
  const [filterProposedCategory, setFilterProposedCategory] = useState<string>('all');
  const [filterOverrideStatus, setFilterOverrideStatus] = useState<string>('all'); // 'all', 'overridden', 'proposed'
  const [filterPlayerStatus, setFilterPlayerStatus] = useState<string>('all'); // 'all', 'new', 'rated'
  const [selectedHistoricalSeasons, setSelectedHistoricalSeasons] = useState<string[]>([]);

  // Redirect if unauthorized
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
    if (!authLoading && user && !isCommitteeAdmin) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router, isCommitteeAdmin]);

  // Update weights based on preset and maxSeasons
  useEffect(() => {
    if (weightPreset === 'custom') return;

    const count = 5; // We always show 5 weight slots in UI for seasons 1-5 ago
    let newWeights = Array(count).fill(1.0);

    if (weightPreset === 'decay') {
      newWeights = newWeights.map((_, i) => parseFloat(Math.pow(0.5, i).toFixed(2)));
    } else if (weightPreset === 'linear') {
      newWeights = newWeights.map((_, i) => parseFloat(Math.max(0, 1.0 - i * 0.2).toFixed(2)));
    } else if (weightPreset === 'equal') {
      newWeights = Array(count).fill(1.0);
    }

    // Apply maxSeasons mask: if i >= maxSeasons, set weight to 0
    if (maxSeasons !== 'all') {
      newWeights = newWeights.map((w, i) => (i < maxSeasons ? w : 0.0));
    }

    setSeasonWeights(newWeights);
  }, [weightPreset, maxSeasons]);

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
          
          // Pre-select all fetched seasons
          const seasons = new Set<string>();
          (dataResult.historicalStats || []).forEach((stat: any) => {
            if (stat.season_id) seasons.add(stat.season_id);
          });
          const sortedSeasons = Array.from(seasons).sort((a: string, b: string) => {
            const numA = parseInt(a.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.replace(/\D/g, '')) || 0;
            return numB - numA;
          });
          setSelectedHistoricalSeasons(sortedSeasons);
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

  // Load saved temp overrides from DB after the page data is ready
  useEffect(() => {
    if (!userSeasonId || !isCommitteeAdmin) return;
    const loadSavedOverrides = async () => {
      try {
        const res = await fetchWithTokenRefresh(
          `/api/committee/player-categorization/temp-overrides?seasonId=${userSeasonId}`
        );
        const data = await res.json();
        if (data.success && data.overrides.length > 0) {
          const map = new Map<string, string>(
            data.overrides.map((o: { player_id: string; category: string }) => [o.player_id, o.category])
          );
          setManualOverrides(map);
        }
      } catch (err) {
        console.error('Could not load saved overrides:', err);
      }
    };
    loadSavedOverrides();
  }, [userSeasonId, isCommitteeAdmin]);

  // Auto-save overrides to DB whenever they change (debounced 800 ms)
  const overrideSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!userSeasonId) return;
    if (overrideSaveTimer.current) clearTimeout(overrideSaveTimer.current);
    overrideSaveTimer.current = setTimeout(async () => {
      try {
        const overrideArray = Array.from(manualOverrides.entries()).map(
          ([player_id, category]) => ({ player_id, category })
        );
        await fetchWithTokenRefresh(
          '/api/committee/player-categorization/temp-overrides',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seasonId: userSeasonId, overrides: overrideArray })
          }
        );
      } catch (err) {
        console.error('Could not auto-save overrides:', err);
      }
    }, 800);
    return () => {
      if (overrideSaveTimer.current) clearTimeout(overrideSaveTimer.current);
    };
  }, [manualOverrides, userSeasonId]);

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
      if (stat.season_id) seasons.add(getBaseSeasonId(stat.season_id));
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
      
      // Calculate weighted score using decay weightage and PPM (points per match)
      let weightedSum = 0;
      let weightSum = 0;
      const seasonPointsMap = new Map<string, { points: number; matches: number; ppm: number; appliedWeight: number }>();

      // Group historical stats by base season ID (e.g. S16.5 and S16.0 merge into S16)
      const baseSeasonStats = new Map<string, { pointsSum: number; matchesSum: number }>();

      stats.forEach(stat => {
        const baseId = getBaseSeasonId(stat.season_id);
        const points = stat.points || 0;

        if (!baseSeasonStats.has(baseId)) {
          baseSeasonStats.set(baseId, { pointsSum: 0, matchesSum: 0 });
        }

        const existing = baseSeasonStats.get(baseId)!;
        baseSeasonStats.set(baseId, {
          pointsSum: existing.pointsSum + points,
          matchesSum: existing.matchesSum + (stat.matches_played || 0)
        });
      });

      // Process grouped base season stats
      const baseSeasonsSorted = Array.from(baseSeasonStats.keys()).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numB - numA; // Descending (most recent first)
      });

      baseSeasonsSorted.forEach(baseId => {
        // Ignore seasons not selected in the Season filter
        if (!selectedHistoricalSeasons.includes(baseId)) {
          return;
        }

        const seasonNum = parseInt(baseId.replace(/\D/g, '')) || 0;
        if (seasonNum > 0 && seasonNum < currentSeasonNum) {
          const distance = currentSeasonNum - seasonNum;

          // Check if distance is within maxSeasons constraint
          if (maxSeasons !== 'all' && distance > maxSeasons) {
            return; // Ignore older seasons
          }

          // Get weight from seasonWeights array (index = distance - 1)
          const weight = (distance - 1 < seasonWeights.length) ? seasonWeights[distance - 1] : 0.0;
          
          const data = baseSeasonStats.get(baseId)!;
          const matches = data.matchesSum;
          const points = data.pointsSum;

          if (matches >= minMatches) {
            const ppm = points / matches;
            weightedSum += ppm * weight;
          }

          // Always add weight to denominator if the player has a record for this season
          // (even if matches < minMatches). This treats "registered but didn't play"
          // seasons as 0 PPM, preventing score inflation for players who skip seasons.
          // Without this, a player with great S16 stats but 0 S17 matches would get
          // their S16 PPM weighted more heavily than someone who actually played S17.
          weightSum += weight;
          
          const ppmVal = matches > 0 ? parseFloat((points / matches).toFixed(1)) : 0;
          seasonPointsMap.set(baseId, {
            points: points,
            matches: matches,
            ppm: ppmVal,
            appliedWeight: weight
          });
        }
      });


      // Track any seasons this player has stats in, but were excluded by our settings
      const excludedSeasons: string[] = [];
      baseSeasonsSorted.forEach(baseId => {
        const seasonNum = parseInt(baseId.replace(/\D/g, '')) || 0;
        const distance = currentSeasonNum - seasonNum;

        const isUnselected = !selectedHistoricalSeasons.includes(baseId);
        const isPastLimit = maxSeasons !== 'all' && distance > maxSeasons;

        if (isUnselected || isPastLimit) {
          excludedSeasons.push(baseId);
        }
      });

      // Calculate hypothetical score including all seasons (ignoring checklist and distance limits)
      let hypotheticalWeightedSum = 0;
      let hypotheticalWeightSum = 0;
      baseSeasonsSorted.forEach(baseId => {
        const seasonNum = parseInt(baseId.replace(/\D/g, '')) || 0;
        if (seasonNum > 0 && seasonNum < currentSeasonNum) {
          const distance = currentSeasonNum - seasonNum;
          const weight = (distance - 1 < seasonWeights.length) ? seasonWeights[distance - 1] : 0.0;
          
          const data = baseSeasonStats.get(baseId)!;
          const matches = data.matchesSum;
          const points = data.pointsSum;

          if (matches >= minMatches) {
            const ppm = points / matches;
            hypotheticalWeightedSum += ppm * weight;
            hypotheticalWeightSum += weight;
          }
        }
      });
      const hypotheticalScore = hypotheticalWeightSum > 0 ? parseFloat((hypotheticalWeightedSum / hypotheticalWeightSum).toFixed(2)) : null;

      // AI Score is the weighted PPM (rounded to 2 decimal places for sorting precision)
      const weightedScore = weightSum > 0 ? parseFloat((weightedSum / weightSum).toFixed(2)) : null;

      return {
        ...player,
        weightedScore,
        hypotheticalScore,
        seasonPointsMap,
        isNewPlayer: weightedScore === null,
        excludedSeasons: Array.from(new Set(excludedSeasons))
      };
    });
  }, [activePlayers, historicalByPlayer, currentSeasonNum, maxSeasons, minMatches, seasonWeights, selectedHistoricalSeasons]);

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
    // NOTE: We intentionally keep existing manual overrides — they persist across proposals

    // 1. Validate target inputs
    const totalTarget = Object.values(categoryTargets).reduce((a, b) => a + b, 0);
    if (totalTarget !== activePlayers.length) {
      setError(`Warning: The total target counts (${totalTarget}) must equal the number of registered players (${activePlayers.length}).`);
      return;
    }

    // 2. Partition sorted players based on targets (excluding new players)
    const proposals = new Map<string, string>();
    const ratedPlayersOnly = sortedPlayers.filter(p => !p.isNewPlayer);
    let currentIndex = 0;

    // Categories are sorted by priority (e.g. Red, Black, Blue, White)
    categories.forEach(cat => {
      const count = categoryTargets[cat.id] || 0;
      for (let i = 0; i < count; i++) {
        const player = ratedPlayersOnly[currentIndex];
        if (player) {
          proposals.set(player.id, cat.name);
          currentIndex++;
        }
      }
    });

    // Handle any leftover rated players just in case
    while (currentIndex < ratedPlayersOnly.length) {
      const player = ratedPlayersOnly[currentIndex];
      const lowestCat = categories[categories.length - 1];
      if (player && lowestCat) {
        proposals.set(player.id, lowestCat.name);
      }
      currentIndex++;
    }

    // For new players, default their proposed category to 'N/A' (Unrated)
    sortedPlayers.forEach(player => {
      if (player.isNewPlayer) {
        proposals.set(player.id, 'N/A');
      }
    });

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

  // Computed unallocated players count
  const totalQuotasSelected = useMemo(() => {
    return Object.values(categoryTargets).reduce((a, b) => a + b, 0);
  }, [categoryTargets]);

  const unallocatedCount = useMemo(() => {
    return activePlayers.length - totalQuotasSelected;
  }, [activePlayers, totalQuotasSelected]);

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
        // Delete temp overrides from DB — categories are now permanently saved
        try {
          await fetchWithTokenRefresh(
            `/api/committee/player-categorization/temp-overrides?seasonId=${userSeasonId}`,
            { method: 'DELETE' }
          );
          setManualOverrides(new Map());
        } catch (err) {
          console.error('Could not clear temp overrides:', err);
        }
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

    // Category priority order for sorting (Red = 1 = highest)
    const catPriority = (catName: string) => {
      const c = categories.find(c => c.name === catName);
      return c ? c.priority : 999;
    };

    // Sort players by final category priority, then by AI score desc within category
    const sortedForExport = [...sortedPlayers].sort((a, b) => {
      const propA = proposedCategories.get(a.id) || '';
      const propB = proposedCategories.get(b.id) || '';
      const catA = getPlayerCategory(a.id, propA);
      const catB = getPlayerCategory(b.id, propB);
      const prioA = catPriority(catA);
      const prioB = catPriority(catB);
      if (prioA !== prioB) return prioA - prioB;
      return (b.weightedScore || 0) - (a.weightedScore || 0);
    });

    // Map data for main export sheet
    const exportData = sortedForExport.map(p => {
      const proposed = proposedCategories.get(p.id) || '';
      const finalCategory = getPlayerCategory(p.id, proposed);
      const isOverridden = manualOverrides.has(p.id);

      const finalCatObj = categories.find(c => c.name === finalCategory);
      const basePriceVal = finalCatObj?.base_price ?? 0;

      const smartAssistLabel = (val: string | null | undefined) => {
        const v = (val || '').toLowerCase();
        if (v === 'yes') return 'Yes';
        if (v === 'partially') return 'Partially';
        if (v === 'no') return 'No';
        if (v === 'didnt_play') return "Didn't Play";
        return 'N/A';
      };

      const row: { [key: string]: any } = {
        'Player Name': p.player_name,
        'Smart Assist?': smartAssistLabel(p.used_smart_assist),
        'Final Category': finalCategory,
        'Base Price': basePriceVal > 0 ? `${basePriceVal} COINS` : '—',
        'AI Proposed': proposed || 'N/A',
        'Override?': isOverridden ? `Yes (was: ${proposed || 'N/A'})` : 'No',
        'AI Score (PPM)': p.weightedScore !== null ? p.weightedScore : 'Unrated',
      };

      // Add historical seasons columns
      historicalSeasonsList.forEach(seasonId => {
        const data = p.seasonPointsMap.get(seasonId);
        row[`${seasonId} Points`] = data ? `${data.points} pts (${data.matches} matches, ${data.ppm} PPM)` : 'N/A';
      });

      return row;
    });


    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Player Categories');
    if (exportData.length > 0) {
      worksheet.columns = Object.keys(exportData[0]).map(key => ({ header: key, key, width: Math.max(key.length + 4, 12) }));
      exportData.forEach(row => worksheet.addRow(row));
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Player-Categorization-${userSeasonId}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };



  // Filtered player list based on search term and advanced selectors
  const filteredPlayers = useMemo(() => {
    return sortedPlayers.filter(p => {
      // 1. Search term (by name)
      const matchesSearch = normalizeStr(p.player_name).includes(normalizeStr(searchTerm));
      
      // 2. Proposed Category filter
      const proposed = proposedCategories.get(p.id) || '';
      const finalCategory = getPlayerCategory(p.id, proposed);
      const matchesCategory = filterProposedCategory === 'all' || finalCategory === filterProposedCategory;

      // 3. Override Status filter
      let matchesOverride = true;
      if (filterOverrideStatus === 'overridden') {
        matchesOverride = manualOverrides.has(p.id);
      } else if (filterOverrideStatus === 'proposed') {
        matchesOverride = !manualOverrides.has(p.id) && hasCalculated && proposed !== 'N/A';
      }

      // 4. Player Status filter (New vs Rated)
      let matchesPlayerStatus = true;
      if (filterPlayerStatus === 'new') {
        matchesPlayerStatus = p.isNewPlayer;
      } else if (filterPlayerStatus === 'rated') {
        matchesPlayerStatus = !p.isNewPlayer;
      }

      return matchesSearch && matchesCategory && matchesOverride && matchesPlayerStatus;
    });
  }, [sortedPlayers, searchTerm, proposedCategories, filterProposedCategory, filterOverrideStatus, filterPlayerStatus, manualOverrides, hasCalculated]);

  // Display order: sorted by FINAL category (respecting manual overrides), then by AI score
  const displayPlayers = useMemo(() => {
    const catPriority = (catName: string) => {
      const c = categories.find(c => c.name === catName);
      return c ? c.priority : 999;
    };
    return [...filteredPlayers].sort((a, b) => {
      const propA = proposedCategories.get(a.id) || '';
      const propB = proposedCategories.get(b.id) || '';
      const catA = getPlayerCategory(a.id, propA);
      const catB = getPlayerCategory(b.id, propB);
      const prioA = catPriority(catA);
      const prioB = catPriority(catB);
      if (prioA !== prioB) return prioA - prioB;
      // Within same category: AI score desc, new players last
      if (a.isNewPlayer && !b.isNewPlayer) return 1;
      if (!a.isNewPlayer && b.isNewPlayer) return -1;
      return (b.weightedScore || 0) - (a.weightedScore || 0);
    });
  }, [filteredPlayers, proposedCategories, manualOverrides, categories]);

  // Loading skeleton UI
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-500 uppercase tracking-wider font-extrabold font-mono">Loading Categorization Assistant...</p>
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
                <Layers className="w-5 h-5 text-slate-600" />
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Category Quotas</h3>
              </div>

              <div className="p-3 mb-4 rounded-xl border border-slate-150 bg-slate-50 flex items-center justify-between text-xs font-mono font-bold uppercase">
                <span className="text-slate-500">Total Players:</span>
                <span className="text-slate-800">{activePlayers.length}</span>
              </div>

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

              <div className={`p-3 mt-4 rounded-xl border text-xs font-mono font-bold uppercase flex items-center justify-between transition-colors ${
                unallocatedCount === 0 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : unallocatedCount > 0 
                    ? 'bg-amber-50 border-amber-200 text-amber-800' 
                    : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                <span>{unallocatedCount === 0 ? 'Remaining:' : unallocatedCount > 0 ? 'Unallocated:' : 'Overallocated:'}</span>
                <span>{Math.abs(unallocatedCount)}</span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                onClick={handleCalculateProposals}
                disabled={unallocatedCount !== 0}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-mono font-black text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer ${
                  unallocatedCount === 0
                    ? 'bg-amber-500 hover:bg-amber-600 text-slate-900 active:scale-95'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                }`}
              >
                {unallocatedCount === 0 ? (
                  <>
                    <Sparkles className="w-4 h-4" /> Generate Proposals
                  </>
                ) : (
                  <span>Allocate All Players ({unallocatedCount > 0 ? `${unallocatedCount} left` : `${Math.abs(unallocatedCount)} over`})</span>
                )}
              </button>
            </div>
          </div>

          {/* AI Settings / Sliders Card */}
          <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl lg:col-span-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                <Sliders className="w-5 h-5 text-slate-600" />
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Algorithm Tuning</h3>
              </div>

              <div className="space-y-4 text-xs font-mono">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Max Seasons</label>
                    <select
                      className="w-full px-2 py-1.5 border border-slate-250 rounded-lg font-bold text-slate-800 bg-white"
                      value={maxSeasons}
                      onChange={(e) => setMaxSeasons(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                    >
                      <option value="all">All Seasons</option>
                      <option value="1">Last 1 Season</option>
                      <option value="2">Last 2 Seasons</option>
                      <option value="3">Last 3 Seasons</option>
                      <option value="4">Last 4 Seasons</option>
                      <option value="5">Last 5 Seasons</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Min Matches</label>
                    <input
                      type="number"
                      min="1"
                      className="w-full px-2 py-1.5 border border-slate-250 rounded-lg text-center font-bold text-slate-800 bg-white"
                      value={minMatches}
                      onChange={(e) => setMinMatches(Math.max(1, parseInt(e.target.value) || 3))}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Weight Preset</label>
                  <select
                    className="w-full px-2 py-1.5 border border-slate-250 rounded-lg font-bold text-slate-800 bg-white"
                    value={weightPreset}
                    onChange={(e) => setWeightPreset(e.target.value as any)}
                  >
                    <option value="decay">Exponential Decay (Default)</option>
                    <option value="equal">Equal Weight (1.0)</option>
                    <option value="linear">Linear Decay</option>
                    <option value="custom">Custom (Drag Sliders)</option>
                  </select>
                </div>

                {/* Seasons Checkboxes */}
                <div className="space-y-2 pt-2 border-t border-slate-50">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Seasons to Consider</span>
                  <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1.5 border border-slate-150 rounded-lg bg-slate-50/50">
                    {historicalSeasonsList.map(seasonId => {
                      const isChecked = selectedHistoricalSeasons.includes(seasonId);
                      return (
                        <label key={seasonId} className="flex items-center gap-1.5 p-1 rounded hover:bg-slate-100/80 cursor-pointer text-[10px] font-bold text-slate-700 font-mono">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedHistoricalSeasons(prev => [...prev, seasonId]);
                              } else {
                                setSelectedHistoricalSeasons(prev => prev.filter(s => s !== seasonId));
                              }
                            }}
                            className="rounded border-slate-350 text-amber-500 focus:ring-amber-400 w-3.5 h-3.5"
                          />
                          <span>{seasonId}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-50">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Season Weights / Intensity</span>
                  
                  {seasonWeights.map((w, idx) => {
                    const disabled = maxSeasons !== 'all' && idx >= maxSeasons;
                    return (
                      <div key={idx} className={`flex flex-col gap-1 p-2 rounded-xl border border-slate-100 bg-slate-50/50 ${disabled ? 'opacity-40' : ''}`}>
                        <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 uppercase">
                          <span>{idx + 1} Season{idx > 0 ? 's' : ''} Ago</span>
                          <span className="text-slate-800 font-mono font-black">{disabled ? 'Ignored' : `${Math.round(w * 100)}%`}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          disabled={disabled}
                          value={disabled ? 0 : w}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setWeightPreset('custom');
                            setSeasonWeights(prev => {
                              const copy = [...prev];
                              copy[idx] = val;
                              return copy;
                            });
                          }}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* AI Explanation / Information card */}
          <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl lg:col-span-1 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                <Info className="w-5 h-5 text-slate-600" />
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">AI Calculation Guide</h3>
              </div>

              <div className="space-y-3 text-slate-700 text-xs leading-relaxed">
                <div className="flex gap-2">
                  <div className="font-bold text-amber-500 flex-shrink-0">Step 1:</div>
                  <div>
                    <strong>Skip Active Season:</strong> Current season stats are ignored for objectivity.
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <div className="font-bold text-amber-500 flex-shrink-0">Step 2:</div>
                  <div>
                    <strong>Group Sub-Seasons:</strong> Sub-seasons (like S16.5 and S16) are merged into their base season to ensure balanced statistics.
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="font-bold text-amber-500 flex-shrink-0">Step 3:</div>
                  <div>
                    <strong>Weighted PPM:</strong> For each qualifying past season, the Points Per Match (PPM) is multiplied by its slider weight to compute a weighted performance index.
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="font-bold text-amber-500 flex-shrink-0">Step 4:</div>
                  <div>
                    <strong>Quotas & New Players:</strong> Rated players are sorted and allocated to category quotas. New players are excluded and marked <strong>Unrated (N/A)</strong> for manual evaluation.
                  </div>
                </div>
              </div>
            </div>

            {hasCalculated && (
              <div className="p-3 border border-emerald-250 bg-emerald-50 text-emerald-800 rounded-xl text-[9px] font-bold uppercase tracking-wider flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                Proposals computed! Review the breakdown below.
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
            <div className="px-6 py-4 border-b border-slate-200/60 bg-slate-50/50 flex flex-col gap-4">
              {/* Top Tier: Title and Action Buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                    Player Recommendations ({filteredPlayers.length})
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleExportExcel}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-slate-250 hover:bg-slate-50 font-mono font-bold text-xs uppercase tracking-wider text-slate-700 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Export Excel
                  </button>

                  <button
                    onClick={handleSaveCategories}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white font-mono font-bold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Apply Categories'}
                  </button>
                </div>
              </div>

              {/* Bottom Tier: Advanced Filters and Search */}
              <div className="flex flex-wrap gap-2 items-center bg-white p-3 border border-slate-150 rounded-xl">
                <div className="relative flex items-center flex-1 sm:flex-none sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search player name..."
                    className="pl-9 pr-3 py-1.5 border border-slate-250 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-amber-500 w-full"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <select
                  className="px-2 py-1.5 border border-slate-250 rounded-lg text-xs font-mono text-slate-800 bg-white focus:outline-none focus:border-amber-500 flex-1 sm:flex-none sm:w-40"
                  value={filterProposedCategory}
                  onChange={(e) => setFilterProposedCategory(e.target.value)}
                >
                  <option value="all">All Categories</option>
                  <option value="N/A">Unrated (N/A)</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>

                <select
                  className="px-2 py-1.5 border border-slate-250 rounded-lg text-xs font-mono text-slate-800 bg-white focus:outline-none focus:border-amber-500 flex-1 sm:flex-none sm:w-40"
                  value={filterOverrideStatus}
                  onChange={(e) => setFilterOverrideStatus(e.target.value)}
                >
                  <option value="all">All Overrides</option>
                  <option value="overridden">Overridden Only</option>
                  <option value="proposed">Auto AI Proposals</option>
                </select>

                <select
                  className="px-2 py-1.5 border border-slate-250 rounded-lg text-xs font-mono text-slate-800 bg-white focus:outline-none focus:border-amber-500 flex-1 sm:flex-none sm:w-40"
                  value={filterPlayerStatus}
                  onChange={(e) => setFilterPlayerStatus(e.target.value)}
                >
                  <option value="all">All Players</option>
                  <option value="new">New Players Only</option>
                  <option value="rated">Rated Only</option>
                </select>
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
                    <th className="px-6 py-3.5 text-center">Base Price</th>
                    <th className="px-6 py-3.5 text-center">AI Score (PPM)</th>
                    <th className="px-6 py-3.5 text-center">Smart Assist</th>
                    {historicalSeasonsList.filter(s => selectedHistoricalSeasons.includes(s)).map(seasonId => (
                      <th key={seasonId} className="px-4 py-3.5 text-center font-mono">{seasonId}</th>
                    ))}
                    <th className="px-6 py-3.5 text-right">Manual Override</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 text-xs text-slate-700">
                  {displayPlayers.map((player) => {
                    const proposed = proposedCategories.get(player.id) || '';
                    const finalCategory = getPlayerCategory(player.id, proposed);
                    const isOverridden = manualOverrides.has(player.id);
                    const isExpanded = expandedPlayerId === player.id;
                    const proposedCatObj = categories.find(c => c.name === proposed);
                    const currentCatObj = categories.find(c => c.name === player.category);
                    const finalCatObj = categories.find(c => c.name === finalCategory);
                    const basePrice = finalCatObj?.base_price ?? 0;
                    let categoryBadgeClass = 'bg-slate-50 text-slate-500 border border-slate-200';
                    let changeLabel = null;

                    if (proposed === 'Red') categoryBadgeClass = 'bg-rose-50 text-rose-700 border border-rose-200';
                    else if (proposed === 'Black') categoryBadgeClass = 'bg-slate-900 text-slate-100 border border-slate-950';
                    else if (proposed === 'Blue') categoryBadgeClass = 'bg-blue-50 text-blue-700 border border-blue-200';
                    else if (proposed === 'White') categoryBadgeClass = 'bg-slate-50 text-slate-700 border border-slate-200';

                    if (proposed && player.category && proposed !== 'N/A' && proposed !== player.category) {
                      if (proposedCatObj && currentCatObj) {
                        const isUpgrade = proposedCatObj.priority < currentCatObj.priority;
                        changeLabel = isUpgrade ? (
                          <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-250 rounded px-1.5 py-0.5 ml-1.5 uppercase tracking-wider inline-block">Upgrade</span>
                        ) : (
                          <span className="text-[8px] font-bold text-rose-600 bg-rose-50 border border-rose-250 rounded px-1.5 py-0.5 ml-1.5 uppercase tracking-wider inline-block">Downgrade</span>
                        );
                      }
                    }
                    
                    return (
                      <React.Fragment key={player.id}>
                        <tr className={`hover:bg-slate-50/30 transition-colors ${player.isNewPlayer ? 'bg-amber-50/15' : ''}`}>
                          
                          {/* Player name with Expand Toggle */}
                          <td className="px-6 py-4">
                            <button
                              onClick={() => setExpandedPlayerId(isExpanded ? null : player.id)}
                              className="flex items-center gap-1.5 font-bold text-slate-800 hover:text-amber-600 transition-colors font-mono text-left focus:outline-none"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                              )}
                              <span>{player.player_name}</span>
                            </button>
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
                            <div className="flex items-center justify-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${categoryBadgeClass}`}>
                                {proposed || 'N/A'}
                              </span>
                              {changeLabel}
                            </div>
                          </td>

                          {/* Base Price */}
                          <td className="px-6 py-4 font-mono font-bold text-center text-slate-700">
                            {basePrice > 0 ? `${basePrice} COINS` : '—'}
                          </td>

                          {/* AI Score */}
                          <td className="px-6 py-4 font-mono font-bold text-center text-slate-700">
                            {player.weightedScore !== null ? player.weightedScore : '—'}
                          </td>

                          {/* Smart Assist */}
                          <td className="px-6 py-4 text-center">
                            {(() => {
                              const v = (player.used_smart_assist || '').toLowerCase();
                              if (v === 'yes') return (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-violet-50 border border-violet-200 text-violet-800 font-mono">✓ Yes</span>
                              );
                              if (v === 'partially') return (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-50 border border-amber-200 text-amber-800 font-mono">∼ Partial</span>
                              );
                              if (v === 'no') return (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 border border-slate-200 text-slate-500 font-mono">No</span>
                              );
                              if (v === 'didnt_play') return (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-rose-50 border border-rose-200 text-rose-600 font-mono">Didn't Play</span>
                              );
                              return <span className="text-slate-300 font-mono text-[10px]">—</span>;
                            })()}
                          </td>

                          {/* Historical Season Stats */}
                          {historicalSeasonsList.filter(s => selectedHistoricalSeasons.includes(s)).map(seasonId => {
                            const data = player.seasonPointsMap.get(seasonId);
                            return (
                              <td key={seasonId} className="px-4 py-4 font-mono text-center text-slate-500">
                                {data !== undefined ? (
                                  <div className="leading-tight">
                                    <div className="font-bold text-slate-700">{data.points} pts</div>
                                    <div className="text-[10px] text-slate-400">{data.matches}m ({data.ppm} PPM)</div>
                                  </div>
                                ) : '—'}
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

                        {/* Calculation Breakdown expanded view */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7 + historicalSeasonsList.filter(s => selectedHistoricalSeasons.includes(s)).length} className="px-6 py-4 bg-slate-50/50 border-t border-b border-slate-200">
                              {player.isNewPlayer ? (
                                <div className="p-4 bg-amber-50/40 border border-amber-200/80 rounded-xl space-y-2 font-mono text-slate-700">
                                  <div className="font-bold text-amber-800 text-[10px] uppercase tracking-wider">AI Calculation Breakdown</div>
                                  <p className="text-[11px] leading-relaxed">
                                    This player is a newly registered or replacement player with no qualified historical stats (has played fewer than {minMatches} matches in all of the past seasons).
                                  </p>
                                  <p className="text-[11px] text-amber-700 font-bold uppercase">
                                    Recommendation: Keep category as Unrated (N/A) for manual evaluation by the committee.
                                  </p>
                                </div>
                              ) : (
                                <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-4 font-mono text-[11px] text-slate-700 shadow-sm">
                                  <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                    <span className="font-black text-slate-800 uppercase tracking-wider text-xs">AI Performance Breakdown: {player.player_name}</span>
                                    <span className="text-[9px] text-slate-550 uppercase font-bold">Min Matches Limit: {minMatches}</span>
                                  </div>

                                  {/* Formula representation */}
                                  <div className="space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-150">
                                    <div className="text-slate-500 uppercase text-[9px] font-bold">Calculation Formula:</div>
                                    <div className="text-slate-800 text-xs font-bold py-0.5">
                                      Weighted Score = &Sigma;(Season_PPM &times; Weight) / &Sigma;(Weights)
                                    </div>
                                    <div className="text-slate-600 text-[10px] pt-1 leading-relaxed">
                                      {"Weighted Score = ("}
                                      {
                                        Array.from(player.seasonPointsMap.entries())
                                          .filter(([_, data]) => data.matches >= minMatches)
                                          .map(([seasonId, data]) => `${data.ppm} [${seasonId}] * ${data.appliedWeight}`)
                                          .join(' + ') || 'No qualifying seasons'
                                      }
                                      {") / ("}
                                      {
                                        Array.from(player.seasonPointsMap.entries())
                                          .filter(([_, data]) => data.matches >= minMatches)
                                          .map(([_, data]) => data.appliedWeight)
                                          .join(' + ') || '0'
                                      }
                                      {") = "}
                                      <strong className="text-amber-600 text-sm ml-1">{player.weightedScore ?? 'N/A'}</strong>
                                    </div>
                                  </div>

                                  {/* Excluded seasons warning notice */}
                                  {player.excludedSeasons && player.excludedSeasons.length > 0 && player.weightedScore === null && (
                                    <div className="p-3 bg-amber-50/40 border border-amber-250/70 rounded-xl text-[10px] text-amber-800 leading-relaxed font-mono flex flex-col gap-1">
                                      <div className="flex items-start gap-2">
                                        <span className="text-amber-600 font-bold"><AlertTriangle className="w-3 h-3 inline text-amber-500 mr-1" /> Excluded Stats:</span>
                                        <span>
                                          Stats for <strong>{player.excludedSeasons.join(', ')}</strong> were fetched but ignored under your current settings (Max Seasons limit or unselected checkboxes).
                                        </span>
                                      </div>
                                      {player.hypotheticalScore !== null && player.hypotheticalScore !== player.weightedScore && (
                                        <div className="pl-6 text-[10px] text-slate-600 font-bold">
                                          Hypothetical AI Score if these seasons were included: <span className="text-amber-700">{player.hypotheticalScore} PPM</span>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Stats Table */}
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-slate-200 border border-slate-200 text-left rounded-lg overflow-hidden">
                                      <thead>
                                        <tr className="text-[9px] font-bold uppercase text-slate-500 bg-slate-100">
                                          <th className="px-3 py-2">Season</th>
                                          <th className="px-3 py-2 text-right">Points</th>
                                          <th className="px-3 py-2 text-right">Matches Played</th>
                                          <th className="px-3 py-2 text-right">PPM</th>
                                          <th className="px-3 py-2 text-right">Intensity Weight</th>
                                          <th className="px-3 py-2 text-right">Weighted Contribution</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-150 bg-white">
                                        {Array.from(player.seasonPointsMap.entries()).map(([seasonId, data]) => {
                                          const qualified = data.matches >= minMatches;
                                          const contribution = qualified ? (data.ppm * data.appliedWeight).toFixed(2) : '0.00';
                                          return (
                                            <tr key={seasonId} className={qualified ? 'text-slate-800 font-bold bg-white' : 'text-slate-400 font-normal bg-slate-50/40'}>
                                              <td className="px-3 py-2">{seasonId}</td>
                                              <td className="px-3 py-2 text-right">{data.points}</td>
                                              <td className="px-3 py-2 text-right">
                                                <span className={qualified ? '' : 'text-rose-600 font-bold'}>
                                                  {data.matches} {!qualified && `(< ${minMatches})`}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2 text-right">{data.ppm}</td>
                                              <td className="px-3 py-2 text-right">{data.appliedWeight}</td>
                                              <td className="px-3 py-2 text-right font-bold text-amber-600">{qualified ? contribution : '—'}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        )}

      </div>

      {/* ─── Override Summary Side Panel ─── */}
      {hasCalculated && manualOverrides.size > 0 && (
        <div className="fixed bottom-6 right-6 z-50 w-72 bg-white border border-amber-300 rounded-2xl shadow-xl overflow-hidden transition-all">

          {/* Header — always visible, acts as toggle */}
          <button
            onClick={() => setIsPanelExpanded(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 border-b border-amber-200 hover:bg-amber-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-mono font-black uppercase tracking-wider text-amber-800">
                Manual Overrides ({manualOverrides.size})
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!isPanelExpanded && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-200 rounded-full px-2 py-0.5">
                  {manualOverrides.size}
                </span>
              )}
              {isPanelExpanded ? (
                <ChevronDown className="w-4 h-4 text-amber-600" />
              ) : (
                <ChevronUp className="w-4 h-4 text-amber-600" />
              )}
            </div>
          </button>

          {/* Collapsible body */}
          {isPanelExpanded && (
            <>
              {/* Scrollable override list */}
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                {Array.from(manualOverrides.entries()).map(([playerId, overrideCat]) => {
                  const player = sortedPlayers.find(p => p.id === playerId);
                  if (!player) return null;
                  const proposed = proposedCategories.get(playerId) || 'N/A';

                  const catColor = (cat: string) => {
                    if (cat === 'Red') return 'text-rose-700 bg-rose-50 border-rose-200';
                    if (cat === 'Black') return 'text-slate-100 bg-slate-900 border-slate-950';
                    if (cat === 'Blue') return 'text-blue-700 bg-blue-50 border-blue-200';
                    if (cat === 'White') return 'text-slate-700 bg-slate-100 border-slate-300';
                    return 'text-slate-500 bg-slate-50 border-slate-200';
                  };

                  return (
                    <div key={playerId} className="px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50">
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-slate-800 font-mono truncate">{player.player_name}</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${catColor(proposed)}`}>{proposed}</span>
                          <span className="text-[9px] text-slate-400">→</span>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${catColor(overrideCat)}`}>{overrideCat}</span>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          setManualOverrides(prev => {
                            const copy = new Map(prev);
                            copy.delete(playerId);
                            return copy;
                          });
                          // Immediately remove from DB
                          try {
                            await fetchWithTokenRefresh(
                              `/api/committee/player-categorization/temp-overrides?seasonId=${userSeasonId}&playerId=${playerId}`,
                              { method: 'DELETE' }
                            );
                          } catch (err) {
                            console.error('Could not remove saved override:', err);
                          }
                        }}
                        className="text-[10px] font-bold text-slate-400 hover:text-rose-600 transition-colors flex-shrink-0"
                        title="Remove override"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                  Click "Apply" to save
                </span>
                <button
                  onClick={() => setManualOverrides(new Map())}
                  className="text-[10px] font-bold text-rose-600 hover:text-rose-800 uppercase tracking-wider transition-colors"
                >
                  Clear All
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
