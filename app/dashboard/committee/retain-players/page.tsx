'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { 
  ArrowLeft, 
  Users, 
  DollarSign, 
  Percent, 
  CheckCircle, 
  AlertCircle, 
  X, 
  Settings, 
  Sliders, 
  Sparkles, 
  RefreshCw, 
  Plus, 
  Trash2, 
  HelpCircle, 
  Trophy,
  Shield,
  Search,
  Check
} from 'lucide-react';
import Link from 'next/link';
import { usePermissions } from '@/hooks/usePermissions';
import { Season } from '@/types/season';
import AuthGuard from '@/components/auth/AuthGuard';

export interface RetentionTier {
  id: string;
  label: string;
  minRank: number;
  maxRank: number;
  formula: string;
  percentage: number;
  amount: number;
}

export interface CategoryRetentionRules {
  basePrice: number;
  tiers: RetentionTier[];
}

export interface RetentionSettings {
  seasonId: string;
  mode: 'rank' | 'percentage';
  totalPurse: number;
  rules: {
    WHITE: CategoryRetentionRules;
    BLUE: CategoryRetentionRules;
    BLACK: CategoryRetentionRules;
    RED: CategoryRetentionRules;
    [key: string]: CategoryRetentionRules;
  };
}

export const OFFICIAL_S19_RULES: RetentionSettings['rules'] = {
  WHITE: {
    basePrice: 10,
    tiers: [
      { id: 'white-1', label: 'Rank 1-6', minRank: 1, maxRank: 6, formula: 'Base + 500%', percentage: 600, amount: 60 },
      { id: 'white-2', label: 'Rank 7-12', minRank: 7, maxRank: 12, formula: 'Base + 400%', percentage: 500, amount: 50 },
      { id: 'white-3', label: 'Rank 13-16', minRank: 13, maxRank: 16, formula: '400% of Base', percentage: 400, amount: 40 },
    ],
  },
  BLUE: {
    basePrice: 15,
    tiers: [
      { id: 'blue-1', label: 'Rank 1-8', minRank: 1, maxRank: 8, formula: 'Base + 400%', percentage: 500, amount: 75 },
      { id: 'blue-2', label: 'Rank 9-16', minRank: 9, maxRank: 16, formula: '400% of Base', percentage: 400, amount: 60 },
    ],
  },
  BLACK: {
    basePrice: 20,
    tiers: [
      { id: 'black-1', label: 'Rank 1-6', minRank: 1, maxRank: 6, formula: 'Base + 500%', percentage: 600, amount: 120 },
      { id: 'black-2', label: 'Rank 7-12', minRank: 7, maxRank: 12, formula: 'Base + 400%', percentage: 500, amount: 100 },
      { id: 'black-3', label: 'Rank 13-16', minRank: 13, maxRank: 16, formula: '400% of Base', percentage: 400, amount: 80 },
    ],
  },
  RED: {
    basePrice: 25,
    tiers: [
      { id: 'red-1', label: 'Rank 1-8', minRank: 1, maxRank: 8, formula: 'Base + 600%', percentage: 700, amount: 175 },
      { id: 'red-2', label: 'Rank 9-16', minRank: 9, maxRank: 16, formula: 'Base + 500%', percentage: 600, amount: 150 },
      { id: 'red-3', label: 'Rank 17-32', minRank: 17, maxRank: 32, formula: 'Base + 400%', percentage: 500, amount: 125 },
    ],
  },
};

interface Player {
  id: string;
  playerName: string;
  category: string;
  basePrice: number;
}

interface TeamData {
  id: string;
  name: string;
  originalBudget: number;
  currentBudget: number;
  currentSpent: number;
  retainedPlayers: Array<Player & { retentionPrice: number; retentionPercentage: number; tierLabel?: string }>;
}

export default function RetainPlayersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { isCommitteeAdmin, userSeasonId } = usePermissions();
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [teamSeasons, setTeamSeasons] = useState<any[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Retention Rules & Settings state
  const [retentionSettings, setRetentionSettings] = useState<RetentionSettings>({
    seasonId: '',
    mode: 'rank',
    totalPurse: 400,
    rules: OFFICIAL_S19_RULES,
  });
  const [calculationMode, setCalculationMode] = useState<'rank' | 'percentage'>('rank');

  // Retain form state
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [selectedTier, setSelectedTier] = useState<RetentionTier | null>(null);
  const [rankInput, setRankInput] = useState<string>('');
  const [retentionPercentage, setRetentionPercentage] = useState<string>('100');
  const [isRetaining, setIsRetaining] = useState(false);

  // Player search & filter
  const [playerFilterCategory, setPlayerFilterCategory] = useState<string>('ALL');
  const [playerSearchQuery, setPlayerSearchQuery] = useState<string>('');

  // Rules Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editPurse, setEditPurse] = useState<number>(400);
  const [editSyncBudgets, setEditSyncBudgets] = useState<boolean>(true);
  const [editDefaultMode, setEditDefaultMode] = useState<'rank' | 'percentage'>('rank');
  const [editCategoryRules, setEditCategoryRules] = useState<RetentionSettings['rules']>(OFFICIAL_S19_RULES);
  const [activeSettingsCategory, setActiveSettingsCategory] = useState<string>('WHITE');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Fetch season and teams
  useEffect(() => {
    const fetchData = async () => {
      if (!userSeasonId) return;

      try {
        // Fetch season from API
        const seasonRes = await fetch(`/api/seasons/${userSeasonId}`);
        const seasonJson = await seasonRes.json();
        if (seasonJson.success && seasonJson.data) {
          setCurrentSeason(seasonJson.data);
          const purse = seasonJson.data.dollar_budget ? Number(seasonJson.data.dollar_budget) : 400;
          setEditPurse(purse);
        }

        // Fetch retention rules
        try {
          const rulesRes = await fetch(`/api/committee/retention-rules?seasonId=${userSeasonId}`);
          const rulesJson = await rulesRes.json();
          if (rulesJson.success && rulesJson.data) {
            setRetentionSettings(rulesJson.data);
            setCalculationMode(rulesJson.data.mode || 'rank');
            setEditDefaultMode(rulesJson.data.mode || 'rank');
            setEditPurse(rulesJson.data.totalPurse || 400);
            if (rulesJson.data.rules) {
              setEditCategoryRules(rulesJson.data.rules);
            }
          }
        } catch (rulesErr) {
          console.warn('Using default retention rules:', rulesErr);
        }

        // Fetch team_seasons to get budget data
        const teamSeasonsRes = await fetch(`/api/team-seasons?season_id=${userSeasonId}`);
        const teamSeasonsJson = await teamSeasonsRes.json();
        const allTeamSeasons = teamSeasonsJson.data || teamSeasonsJson.teamSeasons || [];
        const teamSeasonsData = allTeamSeasons.filter((ts: any) => ts.status === 'registered' || ts.status === 'active');
        setTeamSeasons(teamSeasonsData);
      } catch (error: any) {
        console.error('Error fetching data:', error);
        setError('Failed to load season data');
      }
    };

    if (isCommitteeAdmin && userSeasonId) {
      fetchData();
    }
  }, [isCommitteeAdmin, userSeasonId]);

  // Load players & organize team data
  useEffect(() => {
    const loadData = async () => {
      if (!userSeasonId || !currentSeason || teamSeasons.length === 0) return;

      setIsLoading(true);
      try {
        // Load players
        const playersResponse = await fetchWithTokenRefresh(`/api/realplayers/season-players?seasonId=${userSeasonId}`);
        const playersResult = await playersResponse.json();

        if (!playersResult.success) {
          setError('Failed to load players');
          return;
        }

        const realPlayersData = playersResult.data || [];

        // Organize players
        const teamMap: { [key: string]: Array<Player & { retentionPrice: number; retentionPercentage: number; tierLabel?: string }> } = {};
        const unassignedPlayers: Player[] = [];

        realPlayersData.forEach((data: any) => {
          const cat = (data.category || 'WHITE').toUpperCase().trim();
          const player: Player = {
            id: data.id,
            playerName: data.player_name || '',
            category: cat,
            basePrice: parseInt(data.base_price) || 0,
          };

          const teamId = data.team_id;
          if (teamId && teamId !== '' && teamId !== null) {
            if (!teamMap[teamId]) teamMap[teamId] = [];
            const retentionPrice = parseInt(data.price) || player.basePrice;
            const retentionPercentage = player.basePrice > 0 
              ? Math.round((retentionPrice / player.basePrice) * 100)
              : 100;

            // Try to match tier label
            const categoryTiers = retentionSettings.rules[cat]?.tiers || OFFICIAL_S19_RULES[cat]?.tiers || [];
            const matchedTier = categoryTiers.find(t => t.amount === retentionPrice);

            teamMap[teamId].push({
              ...player,
              retentionPrice,
              retentionPercentage,
              tierLabel: matchedTier ? `${matchedTier.label} (${matchedTier.formula})` : undefined,
            });
          } else {
            unassignedPlayers.push(player);
          }
        });

        // Create team data structure
        const seasonPurse = currentSeason.dollar_budget ? Number(currentSeason.dollar_budget) : retentionSettings.totalPurse || 400;

        const teamsData: TeamData[] = teamSeasons.map((teamSeason: any) => {
          const teamId = teamSeason.team_id || teamSeason.id.split('_')[0];
          const retainedPlayers = teamMap[teamId] || [];

          // Compute realistic initial budget without the bogus 1000 fallback
          const rawInitial = teamSeason.initial_real_player_budget || 
            teamSeason.real_player_budget_initial || 
            teamSeason.raw_data?.initial_real_player_budget;
          
          const currentSpent = Number(teamSeason.real_player_spent || 0);
          const currentBudget = Number(teamSeason.real_player_budget ?? (seasonPurse - currentSpent));
          
          const originalBudget = Number(
            rawInitial || 
            (currentBudget + currentSpent) || 
            seasonPurse || 
            400
          );

          return {
            id: teamId,
            name: teamSeason.team_name || teamSeason.team_code || 'Unknown Team',
            originalBudget,
            currentBudget,
            currentSpent,
            retainedPlayers,
          };
        }).sort((a, b) => a.name.localeCompare(b.name));

        setTeams(teamsData);
        setAvailablePlayers(unassignedPlayers);
      } catch (error: any) {
        console.error('Error loading data:', error);
        setError('Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [userSeasonId, currentSeason, teamSeasons, retentionSettings]);

  // Helper to get active tiers for selected player
  const currentCategoryTiers = useMemo((): RetentionTier[] => {
    if (!selectedPlayer) return [];
    const cat = selectedPlayer.category.toUpperCase().trim();
    const rules = retentionSettings.rules[cat] || OFFICIAL_S19_RULES[cat];
    return rules ? rules.tiers : [];
  }, [selectedPlayer, retentionSettings]);

  // Auto-select tier when player or rank changes in rank mode
  const handlePlayerSelect = (player: Player | null) => {
    setSelectedPlayer(player);
    setSelectedTier(null);
    setRankInput('');
    if (player) {
      const cat = player.category.toUpperCase().trim();
      const catRules = retentionSettings.rules[cat] || OFFICIAL_S19_RULES[cat];
      if (catRules && catRules.tiers.length > 0 && calculationMode === 'rank') {
        // Default to tier 1
        setSelectedTier(catRules.tiers[0]);
        setRetentionPercentage(String(catRules.tiers[0].percentage));
      } else {
        setRetentionPercentage('100');
      }
    }
  };

  const handleRankInputChange = (val: string) => {
    setRankInput(val);
    const num = parseInt(val);
    if (!isNaN(num) && currentCategoryTiers.length > 0) {
      const matched = currentCategoryTiers.find(t => num >= t.minRank && num <= t.maxRank);
      if (matched) {
        setSelectedTier(matched);
        setRetentionPercentage(String(matched.percentage));
      }
    }
  };

  const handleTierSelect = (tier: RetentionTier) => {
    setSelectedTier(tier);
    setRankInput(`${tier.minRank}`);
    setRetentionPercentage(String(tier.percentage));
  };

  // Calculate final retention price
  const calculatedRetentionPrice = useMemo(() => {
    if (!selectedPlayer) return 0;
    if (calculationMode === 'rank') {
      if (selectedTier) return selectedTier.amount;
      return selectedPlayer.basePrice;
    }
    const pct = parseInt(retentionPercentage) || 100;
    return Math.round((selectedPlayer.basePrice * pct) / 100);
  }, [selectedPlayer, calculationMode, selectedTier, retentionPercentage]);

  // Handle player retention submission
  const handleRetainPlayer = async () => {
    if (!selectedPlayer || !selectedTeam) {
      setError('Please select a player and a team');
      return;
    }

    if (calculatedRetentionPrice < 1) {
      setError('Retention price must be at least 1 coin');
      return;
    }

    const team = teams.find(t => t.id === selectedTeam);
    if (team && team.currentBudget < calculatedRetentionPrice) {
      setError(`Insufficient budget: ${team.name} has ${team.currentBudget} coins, but retention costs ${calculatedRetentionPrice} coins`);
      return;
    }

    const effectivePercentage = calculationMode === 'rank' && selectedTier 
      ? selectedTier.percentage 
      : (parseInt(retentionPercentage) || 100);

    const tierDesc = calculationMode === 'rank' && selectedTier
      ? `${selectedTier.label} (${selectedTier.formula})`
      : `${effectivePercentage}%`;

    try {
      setIsRetaining(true);
      setError(null);
      setSuccess(null);

      const response = await fetchWithTokenRefresh('/api/contracts/assign-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: userSeasonId,
          players: [{
            id: selectedPlayer.id,
            teamId: selectedTeam,
            playerName: selectedPlayer.playerName,
            auctionValue: calculatedRetentionPrice,
          }],
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to retain player');
      }

      // Update local state
      setTeams(prevTeams => prevTeams.map(t => {
        if (t.id === selectedTeam) {
          return {
            ...t,
            currentBudget: t.currentBudget - calculatedRetentionPrice,
            currentSpent: t.currentSpent + calculatedRetentionPrice,
            retainedPlayers: [...t.retainedPlayers, {
              ...selectedPlayer,
              retentionPrice: calculatedRetentionPrice,
              retentionPercentage: effectivePercentage,
              tierLabel: tierDesc,
            }]
          };
        }
        return t;
      }));

      setAvailablePlayers(prev => prev.filter(p => p.id !== selectedPlayer.id));

      const teamName = teams.find(t => t.id === selectedTeam)?.name || 'Team';
      setSuccess(`${selectedPlayer.playerName} retained by ${teamName} at ${tierDesc} = ${calculatedRetentionPrice} coins`);

      // Reset form
      setSelectedPlayer(null);
      setSelectedTier(null);
      setRankInput('');
      setSelectedTeam('');
      setRetentionPercentage('100');

      setTimeout(() => setSuccess(null), 6000);
    } catch (err: any) {
      console.error('Error retaining player:', err);
      setError(err.message || 'Failed to retain player');
    } finally {
      setIsRetaining(false);
    }
  };

  // Remove player from team
  const removePlayerFromTeam = async (teamId: string, playerId: string) => {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    const removedPlayer = team.retainedPlayers.find(p => p.id === playerId);
    if (!removedPlayer) return;

    const confirmMsg = `Are you sure you want to release ${removedPlayer.playerName}? This will refund 100% of the retention cost ($${removedPlayer.retentionPrice}) back to ${team.name}.`;
    if (!confirm(confirmMsg)) return;

    try {
      setError(null);
      setSuccess(null);
      
      const response = await fetchWithTokenRefresh('/api/contracts/release-assigned-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: userSeasonId,
          playerId: removedPlayer.id,
          teamId,
          refundAmount: removedPlayer.retentionPrice,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to release player');
      }

      setTeams(prevTeams => prevTeams.map(t => {
        if (t.id === teamId) {
          return {
            ...t,
            currentBudget: t.currentBudget + removedPlayer.retentionPrice,
            currentSpent: t.currentSpent - removedPlayer.retentionPrice,
            retainedPlayers: t.retainedPlayers.filter(p => p.id !== playerId)
          };
        }
        return t;
      }));

      setAvailablePlayers(prev => [...prev, {
        id: removedPlayer.id,
        playerName: removedPlayer.playerName,
        category: removedPlayer.category,
        basePrice: removedPlayer.basePrice,
      }]);

      setSuccess(`Successfully released ${removedPlayer.playerName} and refunded ${removedPlayer.retentionPrice} coins to ${team.name}.`);
    } catch (err: any) {
      console.error('Error releasing player:', err);
      setError(err.message || 'Failed to release player');
    }
  };

  // Save Settings Modal
  const handleSaveSettings = async () => {
    try {
      setIsSavingSettings(true);
      setError(null);

      const response = await fetchWithTokenRefresh('/api/committee/retention-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: userSeasonId,
          mode: editDefaultMode,
          totalPurse: editPurse,
          rules: editCategoryRules,
          syncTeamBudgets: editSyncBudgets,
        }),
      });

      const resJson = await response.json();
      if (!response.ok || !resJson.success) {
        throw new Error(resJson.error || 'Failed to save settings');
      }

      setRetentionSettings({
        seasonId: userSeasonId || '',
        mode: editDefaultMode,
        totalPurse: editPurse,
        rules: editCategoryRules,
      });
      setCalculationMode(editDefaultMode);

      if (editSyncBudgets) {
        setTeams(prev => prev.map(t => ({
          ...t,
          originalBudget: editPurse,
          currentBudget: editPurse - t.currentSpent,
        })));
      }

      setSuccess(`Retention settings and $${editPurse} purse saved successfully!`);
      setIsSettingsOpen(false);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to save rules');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Reset to Season 19 Official rules
  const handleResetToS19 = () => {
    setEditPurse(400);
    setEditDefaultMode('rank');
    setEditCategoryRules(JSON.parse(JSON.stringify(OFFICIAL_S19_RULES)));
  };

  // Filtered available players
  const filteredPlayers = useMemo(() => {
    return availablePlayers.filter(p => {
      const matchCat = playerFilterCategory === 'ALL' || p.category.toUpperCase() === playerFilterCategory;
      const matchQuery = !playerSearchQuery || p.playerName.toLowerCase().includes(playerSearchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [availablePlayers, playerFilterCategory, playerSearchQuery]);

  // Category badge helper
  const getCategoryBadge = (category: string) => {
    const c = category.toUpperCase().trim();
    if (c === 'RED') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-300">🔴 Red</span>;
    }
    if (c === 'BLACK') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-900 text-amber-300 border border-slate-700">⚫ Black</span>;
    }
    if (c === 'BLUE') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-100 text-sky-800 border border-sky-300">🔵 Blue</span>;
    }
    if (c === 'WHITE') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-800 border border-slate-300">⚪ White</span>;
    }
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-100 text-purple-800 border border-purple-300">{category}</span>;
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-500 uppercase tracking-wider font-bold">Loading System...</p>
        </div>
      </div>
    );
  }

  const selectedTeamData = teams.find(t => t.id === selectedTeam);

  return (
    <AuthGuard requiredRole="committee_admin">
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-12 px-4 sm:px-6 font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10 space-y-6">
          
          {/* Navigation & Controls Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <Link
              href="/dashboard/committee/team-management"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </Link>

            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 font-extrabold text-xs">
                <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                Purse: ${retentionSettings.totalPurse}
              </span>

              <button
                onClick={() => {
                  setEditPurse(retentionSettings.totalPurse);
                  setEditDefaultMode(calculationMode);
                  setEditCategoryRules(JSON.parse(JSON.stringify(retentionSettings.rules || OFFICIAL_S19_RULES)));
                  setIsSettingsOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider shadow-sm transition-all"
              >
                <Settings className="w-3.5 h-3.5" />
                Rule Settings & Purse
              </button>
            </div>
          </div>

          {/* Header Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0">
                  <Users className="w-7 h-7 text-amber-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-amber-600 font-black uppercase tracking-wider">SYSTEM CONTROL</span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full uppercase">
                      {currentSeason?.name || 'Active Season'}
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                    Player Retention Console
                  </h1>
                  <p className="text-xs text-slate-500 font-mono mt-1">
                    Retain real players with official Rank-Based Tier rules or custom percentage
                  </p>
                </div>
              </div>

              {/* Mode Selector Pill */}
              <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl border border-slate-200 self-start md:self-auto">
                <button
                  type="button"
                  onClick={() => setCalculationMode('rank')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all ${
                    calculationMode === 'rank'
                      ? 'bg-slate-900 text-amber-400 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Rank Tiers (S19 Rules)
                </button>
                <button
                  type="button"
                  onClick={() => setCalculationMode('percentage')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all ${
                    calculationMode === 'percentage'
                      ? 'bg-slate-900 text-amber-400 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Percent className="w-3.5 h-3.5" />
                  Custom % / Manual
                </button>
              </div>
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="console-card bg-rose-50 border border-rose-200 rounded-3xl p-5 shadow-sm flex items-center justify-between gap-3 text-rose-800">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
                <p className="text-xs font-bold uppercase tracking-wide">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {success && (
            <div className="console-card bg-emerald-50 border border-emerald-200 rounded-3xl p-5 shadow-sm flex items-center justify-between gap-3 text-emerald-800">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <p className="text-xs font-bold uppercase tracking-wide">{success}</p>
              </div>
              <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Retention Form Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase tracking-wide">
                  Retain a Player
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select player, assign to team, and apply rank tier or percentage
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Method</span>
                <span className="text-xs font-black text-slate-800 uppercase">
                  {calculationMode === 'rank' ? 'Official Rank Tiers' : 'Custom Percentage'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* Step 1: Select Player */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    1. Select Player ({filteredPlayers.length} unassigned)
                  </label>
                  {selectedPlayer && (
                    <span className="text-[10px] text-emerald-600 font-black uppercase">
                      Base: {selectedPlayer.basePrice} coins
                    </span>
                  )}
                </div>

                {/* Category quick filters */}
                <div className="flex flex-wrap gap-1 mb-1">
                  {['ALL', 'WHITE', 'BLUE', 'BLACK', 'RED'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setPlayerFilterCategory(cat)}
                      className={`px-2 py-0.5 text-[9px] font-black rounded-lg uppercase transition-all ${
                        playerFilterCategory === cat
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <select
                    value={selectedPlayer?.id || ''}
                    onChange={(e) => {
                      const found = availablePlayers.find(p => p.id === e.target.value);
                      handlePlayerSelect(found || null);
                    }}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide"
                  >
                    <option value="">Choose player...</option>
                    {filteredPlayers
                      .sort((a, b) => a.playerName.localeCompare(b.playerName))
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.playerName} ({p.category}) - Base: {p.basePrice}
                        </option>
                      ))}
                  </select>
                </div>

                {selectedPlayer && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-900">{selectedPlayer.playerName}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Base Price: {selectedPlayer.basePrice} coins</p>
                    </div>
                    {getCategoryBadge(selectedPlayer.category)}
                  </div>
                )}
              </div>

              {/* Step 2: Select Team */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                  2. Select Team
                </label>

                <select
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide"
                >
                  <option value="">Choose team...</option>
                  {teams.map(team => (
                    <option key={team.id} value={team.id}>
                      {team.name} (Budget: {team.currentBudget} / {team.originalBudget})
                    </option>
                  ))}
                </select>

                {selectedTeamData && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">{selectedTeamData.name}</span>
                      <span className="text-xs font-black text-emerald-600 font-mono">
                        {selectedTeamData.currentBudget} / {selectedTeamData.originalBudget}
                      </span>
                    </div>
                    {calculatedRetentionPrice > 0 && (
                      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-200">
                        <span className="text-slate-500 font-medium">After Retention:</span>
                        <span className={`font-black font-mono ${
                          selectedTeamData.currentBudget >= calculatedRetentionPrice 
                            ? 'text-slate-800' 
                            : 'text-rose-600'
                        }`}>
                          {selectedTeamData.currentBudget - calculatedRetentionPrice} coins
                          {selectedTeamData.currentBudget < calculatedRetentionPrice && ' (INSUFFICIENT)'}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 3: Retention Calculation */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    3. {calculationMode === 'rank' ? 'Select Rank Tier' : 'Retention %'}
                  </label>
                  <span className="text-[10px] font-black text-amber-600">
                    = {calculatedRetentionPrice} coins
                  </span>
                </div>

                {calculationMode === 'rank' ? (
                  <div className="space-y-3">
                    {/* Optional Rank input */}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="32"
                        placeholder="Enter Rank (1-32)"
                        value={rankInput}
                        onChange={(e) => handleRankInputChange(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-slate-800 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 whitespace-nowrap font-bold">Auto-picks tier</span>
                    </div>

                    {/* Tier Buttons */}
                    {currentCategoryTiers.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2">
                        {selectedPlayer ? 'No specific tiers defined for this category.' : 'Select a player to view available tiers.'}
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {currentCategoryTiers.map(tier => {
                          const isSelected = selectedTier?.id === tier.id;
                          return (
                            <button
                              key={tier.id}
                              type="button"
                              onClick={() => handleTierSelect(tier)}
                              className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                                isSelected
                                  ? 'bg-amber-500/10 border-amber-500 text-slate-900 shadow-sm ring-1 ring-amber-500'
                                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black ${
                                  isSelected ? 'bg-amber-500 text-slate-950' : 'bg-slate-200 text-slate-600'
                                }`}>
                                  {isSelected ? <Check className="w-3 h-3 stroke-[3]" /> : '•'}
                                </div>
                                <div>
                                  <p className="text-xs font-black">{tier.label}</p>
                                  <p className="text-[9px] text-slate-500 font-mono">{tier.formula}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-black text-emerald-700 font-mono block">
                                  {tier.amount} coins
                                </span>
                                <span className="text-[9px] text-slate-400 font-bold">
                                  ({tier.percentage}%)
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        value={retentionPercentage}
                        onChange={(e) => setRetentionPercentage(e.target.value)}
                        className="w-full px-4 py-2.5 pr-8 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none"
                        placeholder="100"
                      />
                      <Percent className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>

                    <div className="flex gap-1.5">
                      {[100, 200, 400, 500, 600].map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setRetentionPercentage(String(p))}
                          className={`flex-1 py-1 text-[10px] font-black rounded-lg border ${
                            retentionPercentage === String(p)
                              ? 'bg-slate-900 text-amber-400 border-slate-900'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {p}%
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Submit Action Bar */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500">
                {selectedPlayer && selectedTeamData ? (
                  <span>
                    Retaining <strong className="text-slate-900">{selectedPlayer.playerName}</strong> for{' '}
                    <strong className="text-emerald-600 font-mono">{calculatedRetentionPrice} coins</strong> to{' '}
                    <strong className="text-slate-900">{selectedTeamData.name}</strong>
                  </span>
                ) : (
                  <span>Select a player and team to retain</span>
                )}
              </div>

              <button
                onClick={handleRetainPlayer}
                disabled={isRetaining || !selectedPlayer || !selectedTeam || calculatedRetentionPrice < 1 || (selectedTeamData && selectedTeamData.currentBudget < calculatedRetentionPrice)}
                className="w-full sm:w-auto px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isRetaining ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                    Processing Retention...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    Confirm Retention ({calculatedRetentionPrice} coins)
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Teams Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Team Squads & Retained Players ({teams.length} Teams)
              </h2>
              <span className="text-xs text-slate-500 font-mono">
                Total Retained: {teams.reduce((acc, t) => acc + t.retainedPlayers.length, 0)} players
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {teams.map(team => {
                const spentPct = team.originalBudget > 0 
                  ? Math.min(100, Math.round((team.currentSpent / team.originalBudget) * 100))
                  : 0;

                return (
                  <div key={team.id} className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      {/* Team Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                            {team.name}
                          </h3>
                          <span className="text-[10px] text-slate-400 font-bold uppercase">
                            {team.retainedPlayers.length} Retained
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] text-slate-400 uppercase font-black">Budget</p>
                          <p className="text-sm font-black text-emerald-600 font-mono">
                            {team.currentBudget} / {team.originalBudget}
                          </p>
                        </div>
                      </div>

                      {/* Mini Budget Bar */}
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-4">
                        <div 
                          className="bg-amber-500 h-full transition-all" 
                          style={{ width: `${spentPct}%` }}
                        />
                      </div>

                      {/* Retained Players List */}
                      {team.retainedPlayers.length === 0 ? (
                        <div className="text-center py-6 border border-dashed border-slate-200 rounded-2xl">
                          <p className="text-xs text-slate-400">No retained players</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {team.retainedPlayers.map(player => (
                            <div
                              key={player.id}
                              className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl"
                            >
                              <div className="flex-1 min-w-0 pr-2">
                                <p className="text-xs font-black text-slate-900 truncate">{player.playerName}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {getCategoryBadge(player.category)}
                                  <span className="text-[9px] text-slate-400 font-mono">
                                    Base: {player.basePrice}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-right">
                                  <p className="text-xs font-black text-emerald-600 font-mono">
                                    {player.retentionPrice} coins
                                  </p>
                                  <p className="text-[9px] text-slate-400 font-bold">
                                    {player.tierLabel || `${player.retentionPercentage}%`}
                                  </p>
                                </div>
                                <button
                                  onClick={() => removePlayerFromTeam(team.id, player.id)}
                                  className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="Release player and refund cost"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Team Footer Summary */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>Spent: ${team.currentSpent}</span>
                      <span>Rem: ${team.currentBudget}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Retention Rules & Purse Settings Modal */}
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in font-mono">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-6">
              
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600">
                    <Settings className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 uppercase">
                      Retention Rules & Purse Settings
                    </h3>
                    <p className="text-xs text-slate-500">Configure season retention calculation and total purse</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Purse & Mode Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                    Season Total Purse ($)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editPurse}
                    onChange={(e) => setEditPurse(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-sm font-black bg-white"
                  />
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editSyncBudgets}
                      onChange={(e) => setEditSyncBudgets(e.target.checked)}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-[10px] text-slate-600 font-bold uppercase">
                      Sync to all {teams.length} teams now
                    </span>
                  </label>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                    Default Retention Mode
                  </label>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer">
                      <input
                        type="radio"
                        name="defaultMode"
                        checked={editDefaultMode === 'rank'}
                        onChange={() => setEditDefaultMode('rank')}
                        className="text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-bold text-slate-800 uppercase">
                        Rank-Based Tiers (S19 Rules)
                      </span>
                    </label>
                    <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer">
                      <input
                        type="radio"
                        name="defaultMode"
                        checked={editDefaultMode === 'percentage'}
                        onChange={() => setEditDefaultMode('percentage')}
                        className="text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-bold text-slate-800 uppercase">
                        Custom Percentage / Manual
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Category Tiers Editor */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-slate-900">
                    Category Tier Rules Editor
                  </span>
                  <button
                    type="button"
                    onClick={handleResetToS19}
                    className="text-[10px] font-bold text-amber-600 hover:text-amber-700 uppercase flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Restore Season 19 Rules
                  </button>
                </div>

                {/* Category Tabs */}
                <div className="flex gap-2 border-b border-slate-200 pb-2">
                  {['WHITE', 'BLUE', 'BLACK', 'RED'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveSettingsCategory(cat)}
                      className={`px-3 py-1.5 text-xs font-black rounded-xl uppercase transition-all ${
                        activeSettingsCategory === cat
                          ? 'bg-slate-900 text-amber-400 shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat} ({editCategoryRules[cat]?.tiers?.length || 0})
                    </button>
                  ))}
                </div>

                {/* Tiers for Active Category */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase px-1">
                    <span>Rank Range / Label</span>
                    <span>Formula</span>
                    <span>Amount ($)</span>
                  </div>

                  {(editCategoryRules[activeSettingsCategory]?.tiers || []).map((tier, idx) => (
                    <div key={tier.id || idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2">
                      <input
                        type="text"
                        value={tier.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditCategoryRules(prev => {
                            const updated = { ...prev };
                            updated[activeSettingsCategory].tiers[idx].label = val;
                            return updated;
                          });
                        }}
                        className="w-1/3 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                        placeholder="e.g. Rank 1-6"
                      />

                      <input
                        type="text"
                        value={tier.formula}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditCategoryRules(prev => {
                            const updated = { ...prev };
                            updated[activeSettingsCategory].tiers[idx].formula = val;
                            return updated;
                          });
                        }}
                        className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                        placeholder="e.g. Base + 500%"
                      />

                      <div className="flex items-center gap-1 w-24">
                        <input
                          type="number"
                          value={tier.amount}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setEditCategoryRules(prev => {
                              const updated = { ...prev };
                              updated[activeSettingsCategory].tiers[idx].amount = val;
                              return updated;
                            });
                          }}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-right"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setEditCategoryRules(prev => {
                            const updated = { ...prev };
                            updated[activeSettingsCategory].tiers = updated[activeSettingsCategory].tiers.filter((_, i) => i !== idx);
                            return updated;
                          });
                        }}
                        className="p-1 text-rose-500 hover:text-rose-700"
                        title="Delete tier"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      setEditCategoryRules(prev => {
                        const updated = { ...prev };
                        const tiers = updated[activeSettingsCategory]?.tiers || [];
                        const newTier: RetentionTier = {
                          id: `${activeSettingsCategory.toLowerCase()}-${Date.now()}`,
                          label: `Rank ${tiers.length * 8 + 1}-${tiers.length * 8 + 8}`,
                          minRank: tiers.length * 8 + 1,
                          maxRank: tiers.length * 8 + 8,
                          formula: 'Custom formula',
                          percentage: 400,
                          amount: 50,
                        };
                        updated[activeSettingsCategory] = {
                          ...updated[activeSettingsCategory],
                          tiers: [...tiers, newTier],
                        };
                        return updated;
                      });
                    }}
                    className="w-full py-2 border border-dashed border-slate-300 hover:border-slate-400 rounded-xl text-xs font-bold text-slate-600 flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Tier to {activeSettingsCategory}
                  </button>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={isSavingSettings}
                  className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-900 hover:bg-slate-800 text-white shadow-md flex items-center gap-2"
                >
                  {isSavingSettings ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      Save Settings
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </AuthGuard>
  );
}
