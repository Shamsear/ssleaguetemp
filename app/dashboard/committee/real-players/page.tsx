'use client';
import { CheckCircle, DollarSign, AlertTriangle, BarChart2, RefreshCw } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { Season } from '@/types/season';
import AuthGuard from '@/components/auth/AuthGuard';
import { normalizeStr } from '@/lib/utils/normalizeStr';
import { useCachedTeams } from '@/hooks/useCachedData';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface Player {
  id: string;
  playerName: string;
  category: string;
  /** For S18+: the price paid at auction (0 if unsold). Legacy field for S16/S17. */
  auctionValue: number;
  /** S18+ only: base price from category */
  basePrice?: number;
}

interface TeamData {
  id: string;
  name: string;
  originalBudget: number;
  currentBudget: number;
  currentSpent: number;
  assignedPlayers: Player[];
  isExpanded: boolean;
}

export default function RealPlayersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { isCommitteeAdmin, userSeasonId } = usePermissions();
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [categories, setCategories] = useState<any[]>([]);

  const { data: cachedTeams, isLoading: teamsLoading } = useCachedTeams();
  const [teamSeasons, setTeamSeasons] = useState<any[]>([]);
  const [loadingTeamSeasons, setLoadingTeamSeasons] = useState(true);

  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [savingTeamId, setSavingTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [updateCounter, setUpdateCounter] = useState(0);
  const [dropdownSearchTerms, setDropdownSearchTerms] = useState<Map<string, string>>(new Map());
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const dropdownRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Quick assign state
  const [quickAssignPlayer, setQuickAssignPlayer] = useState<Player | null>(null);
  const [quickAssignTeam, setQuickAssignTeam] = useState<string>('');
  const [quickAssignAuction, setQuickAssignAuction] = useState<string>('');
  const [isQuickAssigning, setIsQuickAssigning] = useState(false);
  const [showActualBudget, setShowActualBudget] = useState(true);
  const [isModernSeason, setIsModernSeason] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [lastUsedTeam, setLastUsedTeam] = useState<string>('');
  const [copiedBudgets, setCopiedBudgets] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Quick assign searchable dropdown states and refs
  const [playerSearchOpen, setPlayerSearchOpen] = useState(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [highlightedPlayerIndex, setHighlightedPlayerIndex] = useState(0);

  const [teamSearchOpen, setTeamSearchOpen] = useState(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [highlightedTeamIndex, setHighlightedTeamIndex] = useState(0);

  const playerSearchInputRef = useRef<HTMLInputElement>(null);
  const teamSearchInputRef = useRef<HTMLInputElement>(null);
  const playerDropdownRef = useRef<HTMLDivElement>(null);
  const teamDropdownRef = useRef<HTMLDivElement>(null);

  // Refs for auto-focus
  const playerSelectRef = useRef<HTMLButtonElement>(null);
  const teamSelectRef = useRef<HTMLButtonElement>(null);
  const auctionInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownOpen) {
        const dropdownElement = dropdownRefs.current.get(dropdownOpen);
        if (dropdownElement && !dropdownElement.contains(event.target as Node)) {
          setDropdownOpen(null);
        }
      }

      // Close quick assign dropdowns if click is outside
      if (playerDropdownRef.current && !playerDropdownRef.current.contains(event.target as Node)) {
        setPlayerSearchOpen(false);
      }
      if (teamDropdownRef.current && !teamDropdownRef.current.contains(event.target as Node)) {
        setTeamSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  // Keyboard shortcuts for quick assign
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Enter key to assign (when all fields are filled)
      if (e.key === 'Enter' && quickAssignPlayer && quickAssignTeam && quickAssignAuction && !isQuickAssigning) {
        e.preventDefault();
        handleQuickAssign();
      }
      // Escape key to clear form
      if (e.key === 'Escape') {
        setQuickAssignPlayer(null);
        setQuickAssignTeam(lastUsedTeam); // Keep last team
        setQuickAssignAuction('');
        playerSelectRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [quickAssignPlayer, quickAssignTeam, quickAssignAuction, isQuickAssigning, lastUsedTeam]);

  // Auto-populate last used team on mount
  useEffect(() => {
    if (lastUsedTeam && !quickAssignTeam) {
      setQuickAssignTeam(lastUsedTeam);
    }
  }, [availablePlayers]); // Trigger when players reload

  // Remove contract duration initialization - using single season model

  useEffect(() => {
    const fetchData = async () => {
      if (!userSeasonId) return;
      setLoadingTeamSeasons(true);

      try {
        // Fetch categories
        const catRes = await fetchWithTokenRefresh('/api/categories');
        const catData = await catRes.json();
        if (catData.success) {
          const sortedCats = (catData.data || []).sort((a: any, b: any) => a.priority - b.priority);
          setCategories(sortedCats);
          console.log('Loaded categories:', sortedCats.map((c: any) => c.name));
        }

        // Fetch season from API (not server-side Neon)
        const seasonRes = await fetch(`/api/seasons/${userSeasonId}`);
        const seasonJson = await seasonRes.json();
        if (seasonJson.success && seasonJson.data) {
          setCurrentSeason(seasonJson.data);
        }

        // Fetch team_seasons to get budget data
        const teamSeasonsRes = await fetch(`/api/team-seasons?season_id=${userSeasonId}`);
        const teamSeasonsJson = await teamSeasonsRes.json();
        const allTeamSeasons = teamSeasonsJson.data || teamSeasonsJson.teamSeasons || [];
        const teamSeasonsData = allTeamSeasons.filter((ts: any) => ts.status === 'registered' || ts.status === 'active');

        setTeamSeasons(teamSeasonsData);
        console.log(`Loaded ${teamSeasonsData.length} team seasons with budget data`);
      } catch (error) {
        console.error('Error fetching season:', error);
      } finally {
        setLoadingTeamSeasons(false);
      }
    };

    if (isCommitteeAdmin && userSeasonId) {
      fetchData();
    }
  }, [isCommitteeAdmin, userSeasonId]);

  useEffect(() => {
    const loadPlayers = async () => {
      if (!userSeasonId || !currentSeason || teamSeasons.length === 0) return;
      const startTime = Date.now();
      setIsRefreshing(true);

      try {
        const seasonNum = parseInt(userSeasonId.replace(/\D/g, '')) || 0;
        const isModern = seasonNum === 16 || seasonNum === 17;
        setIsModernSeason(isModern);

        // Use the dedicated season-players endpoint for all seasons (S16, S17, S18+)
        const response = await fetchWithTokenRefresh(`/api/realplayers/season-players?seasonId=${userSeasonId}`);
        const result = await response.json();

        if (result.success && result.data && result.data.length > 0) {
          const realPlayersData = result.data.filter((p: any) => p.category && p.category.trim() !== '');

          const teamMap: { [key: string]: Player[] } = {};
          const unassignedPlayers: Player[] = [];

          realPlayersData.forEach((data: any) => {
            const category = data.category || 'BRONZE';
            const isS18Plus = !result.isModern;

            // For S18+: price = auction bid (what team paid), base_price = category base
            // For S16/S17: auction_value = what was paid
            let auctionValue: number;
            let basePrice: number | undefined;
            if (isS18Plus) {
              auctionValue = parseInt(data.price) || 0;
              basePrice = parseInt(data.base_price) || 0;
              // If not sold yet, show base_price as a guide
              if (auctionValue === 0 && basePrice > 0) {
                auctionValue = basePrice;
              }
            } else {
              auctionValue = typeof data.auction_value === 'number'
                ? data.auction_value
                : parseFloat(String(data.auction_value || '0'));
              if (auctionValue === 0 || isNaN(auctionValue)) auctionValue = 250;
            }

            const player: Player = {
              id: data.id,
              playerName: data.player_name || '',
              category,
              auctionValue,
              basePrice,
            };

            const teamId = data.team_id;
            if (teamId && teamId !== '' && teamId !== null && teamId !== undefined) {
              if (!teamMap[teamId]) teamMap[teamId] = [];
              teamMap[teamId].push(player);
            } else {
              unassignedPlayers.push(player);
            }
          });

          // Create team data structure
          const teamsData: TeamData[] = teamSeasons.map(teamSeason => {
            const teamId = teamSeason.team_id || teamSeason.id.split('_')[0];
            const assignedPlayers = teamMap[teamId] || [];

            // Use dual currency system for real players
            const originalBudget = teamSeason.initial_real_player_budget ||
              teamSeason.real_player_budget_initial ||
              teamSeason.real_player_starting_balance ||
              1000;
            const currentBudget = teamSeason.real_player_budget ?? originalBudget;
            const currentSpent = teamSeason.real_player_spent || 0;

            console.log(`Team ${teamSeason.team_name || teamSeason.team_code}: originalBudget=${originalBudget}, currentBudget=${currentBudget}, currentSpent=${currentSpent}`);

            return {
              id: teamId,
              name: teamSeason.team_name || teamSeason.team_code || 'Unknown Team',
              originalBudget: originalBudget,
              currentBudget: currentBudget,
              currentSpent: currentSpent,
              assignedPlayers: assignedPlayers,
              isExpanded: false,
            };
          }).sort((a, b) => a.name.localeCompare(b.name));

          setTeams(teamsData);
          setAvailablePlayers(unassignedPlayers);
          console.log(`Loaded ${realPlayersData.length} players organized into ${teamsData.length} teams`);
          console.log(`Available (unassigned) players:`, unassignedPlayers.map(p => p.playerName));
          console.log(`Assigned players by team:`, Object.entries(teamMap).map(([teamId, players]) => ({
            teamId,
            count: players.length,
            players: players.map(p => p.playerName)
          })));
        }
      } catch (error) {
        console.error('Error loading players:', error);
        setError('Failed to load players');
      } finally {
        const elapsed = Date.now() - startTime;
        if (elapsed < 800) {
          await new Promise(resolve => setTimeout(resolve, 800 - elapsed));
        }
        setIsRefreshing(false);
      }
    };

    loadPlayers();
  }, [userSeasonId, currentSeason, teamSeasons, updateCounter]);

  const toggleTeam = (teamId: string) => {
    setTeams(teams.map(t =>
      t.id === teamId ? { ...t, isExpanded: !t.isExpanded } : t
    ));
  };

  const addPlayerToTeam = (teamId: string, player: Player) => {
    console.log(`Adding player ${player.playerName} (ID: ${player.id}) to team ${teamId}`);

    // Remove from available
    setAvailablePlayers(prev => {
      const filtered = prev.filter(p => p.id !== player.id);
      console.log(`Player removed from available. Remaining available: ${filtered.length}`);
      return filtered;
    });

    // Add to team (single-season model)
    setTeams(prevTeams => prevTeams.map(t => {
      if (t.id === teamId) {
        const updated = { ...t, assignedPlayers: [...t.assignedPlayers, player] };
        console.log(`Player added to team ${t.name}. Team now has ${updated.assignedPlayers.length} players`);
        return updated;
      }
      return t;
    }));
  };

  const removePlayerFromTeam = async (teamId: string, playerId: string) => {
    // Find the player to remove first
    const team = teams.find(t => t.id === teamId);
    if (!team) {
      console.log(`Team ${teamId} not found`);
      return;
    }

    const removedPlayer = team.assignedPlayers.find(p => p.id === playerId);
    if (!removedPlayer) {
      console.log(`Player ${playerId} not found in team ${teamId}`);
      return;
    }

    const confirmMsg = `Are you sure you want to release ${removedPlayer.playerName}? This will refund 100% of the assignment cost ($${removedPlayer.auctionValue}) back to the team.`;
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
          refundAmount: removedPlayer.auctionValue || 0,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to release player');
      }

      console.log(`Removing player ${removedPlayer.playerName} (ID: ${playerId}) from team ${team.name}`);

      // Remove from team and restore budget
      setTeams(prevTeams => prevTeams.map(t => {
        if (t.id === teamId) {
          return { 
            ...t, 
            currentBudget: t.currentBudget + (removedPlayer.auctionValue || 0),
            currentSpent: t.currentSpent - (removedPlayer.auctionValue || 0),
            assignedPlayers: t.assignedPlayers.filter(p => p.id !== playerId) 
          };
        }
        return t;
      }));

      // Add back to available players list
      setAvailablePlayers(prev => {
        const updated = [...prev, removedPlayer];
        console.log(`Player ${removedPlayer.playerName} added back to available. Total available: ${updated.length}`);
        return updated;
      });

      setSuccess(`Successfully released ${removedPlayer.playerName} and refunded ${removedPlayer.auctionValue} coins.`);
    } catch (err: any) {
      console.error('Error releasing player:', err);
      setError(err.message || 'Failed to release player');
    }

    // Force re-render of dropdowns
    setUpdateCounter(prev => prev + 1);
  };

  const updatePlayerAuctionValue = (teamId: string, playerId: string, value: number) => {
    setTeams(teams.map(t => {
      if (t.id === teamId) {
        const player = t.assignedPlayers.find(p => p.id === playerId);
        const oldValue = player?.auctionValue || 0;
        const difference = value - oldValue;

        return {
          ...t,
          currentBudget: t.currentBudget - difference,
          currentSpent: t.currentSpent + difference,
          assignedPlayers: t.assignedPlayers.map(p => {
            if (p.id === playerId) {
              return { ...p, auctionValue: value };
            }
            return p;
          })
        };
      }
      return t;
    }));
  };

  // Contract functions removed - using single-season model

  const handleQuickAssign = async () => {
    if (!quickAssignPlayer || !quickAssignTeam || !quickAssignAuction) {
      setError('Please select a player, team, and enter auction value');
      return;
    }

    const auctionValue = parseInt(quickAssignAuction);
    const minRequired = quickAssignPlayer.basePrice !== undefined && quickAssignPlayer.basePrice > 0 
      ? quickAssignPlayer.basePrice 
      : 0;
    if (isNaN(auctionValue) || auctionValue < minRequired) {
      setError(`Auction value cannot be less than the player's base price (${minRequired} coins)`);
      return;
    }

    // Category quota and balance reserve validation for S18+
    if (!isModernSeason) {
      const targetTeam = teams.find(t => t.id === quickAssignTeam);
      if (targetTeam) {
        const category = quickAssignPlayer.category;
        const currentCount = targetTeam.assignedPlayers.filter(p => (p.category || '').toLowerCase() === category.toLowerCase()).length;
        const limit = getCategoryLimit(category);
        if (currentCount >= limit) {
          setError(`Cannot assign ${quickAssignPlayer.playerName}. Team ${targetTeam.name} already has the maximum allowed players for category "${category}" (${limit}).`);
          return;
        }

        const maxBid = calculateMaxBidForTeam(targetTeam, quickAssignPlayer);
        if (auctionValue > maxBid) {
          setError(`Cannot assign player. Maximum allowed bid for ${targetTeam.name} is $${maxBid.toLocaleString()} (must reserve budget for remaining roster slots).`);
          return;
        }
      }
    }

    try {
      setIsQuickAssigning(true);
      setError(null);
      setSuccess(null);

      // Assign player immediately (single-season model)
      const response = await fetchWithTokenRefresh('/api/contracts/assign-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: userSeasonId,
          players: [{
            id: quickAssignPlayer.id,
            teamId: quickAssignTeam,
            playerName: quickAssignPlayer.playerName,
            auctionValue: auctionValue,
          }],
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to assign player');
      }

      // Update local state - add to team AND remove from available
      setTeams(prevTeams => prevTeams.map(t => {
        if (t.id === quickAssignTeam) {
          // Check if player already exists in team
          const playerExists = t.assignedPlayers.some(p => p.id === quickAssignPlayer.id);
          if (playerExists) {
            return t; // Don't add duplicate
          }
          return {
            ...t,
            currentBudget: t.currentBudget - auctionValue,
            currentSpent: t.currentSpent + auctionValue,
            assignedPlayers: [...t.assignedPlayers, {
              ...quickAssignPlayer,
              auctionValue: auctionValue,
            }]
          };
        }
        return t;
      }));

      // Remove from available players
      setAvailablePlayers(prev => prev.filter(p => p.id !== quickAssignPlayer.id));

      const teamName = teams.find(t => t.id === quickAssignTeam)?.name || 'Team';
      setSuccess(`${quickAssignPlayer.playerName} assigned to ${teamName} for $${auctionValue.toLocaleString()}!`);

      // Play success sound (optional)
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSOG0fPTgjMGHm7A7+OZSA0PVqzn77BdGAg+ltzy0H8pBSV+zPLaizsIGGS56+mjUBELTKXh8bllHAU2jdXzzn0qBSh3yO/akz4JGGm98+ScTw0PU6vl8rrDhwYmjNLy0n4qBSV7y/HZijsIGWW66OyrUxILTajk87dpGwY4ktXzzn0qBSl3x+/Zkz4JGWq98uWcTw0PVKzl8rpcGAg+mdzy0H8pBSV/zfLYijsIGGS76+mjTxELTKXh8bhlGwU3jdX0zn0pBSl5yO/dkj4JGGu98eScUQ0OVKrl8rhcGAk9mNvy0H8pBSZ/zfLYijsIGGS56+mjTxELTKXi8bllHAU3j9X0zn4qBSl5x+/dkz4JGWu88+WbUQ0OVKrl8rhbGAk9mdzy0H4pBSZ+zPLYizwIGGS56+mjUBELTKPi8bllHAU3j9Tz0H4qBSl6yO/dkj4JGWq88+WbUQ0PU6vl8rdbGAo9mdvy0H8pBSaAzfLYijsIG2W56+mjUBELTKPi8rhlHAU2j9X00H4qBSl6x+/dkz4JGWq98+WbUQ0PU6vl8rdbGAk+mdvy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBSZ/zPLYizsIG2W56+qiUBELTKPi8rhmHAU3jtTz0H4qBSl6yO/dkz4JGWu88+WbUQ0PU6vl8rdbGAk+mdzy0H4pBQ==');
        audio.volume = 0.3;
        audio.play().catch(() => {}); // Ignore errors if audio fails
      } catch {}

      // Store last used team for next assignment
      setLastUsedTeam(quickAssignTeam);

      // Reset form but keep team selected
      setQuickAssignPlayer(null);
      setQuickAssignAuction('');
      
      // Auto-focus back to player select for next assignment
      setTimeout(() => {
        playerSelectRef.current?.focus();
      }, 100);

      setTimeout(() => {
        setSuccess(null);
      }, 2000); // Shorter timeout for faster flow
    } catch (err: any) {
      setError(err.message || 'Failed to assign player');
      setTimeout(() => setError(null), 4000);
    } finally {
      setIsQuickAssigning(false);
    }
  };

  const saveTeam = async (teamId: string) => {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    // Validate exact player count
    const requiredPlayers = currentSeason?.required_real_players || currentSeason?.min_real_players || 5;

    if (team.assignedPlayers.length !== requiredPlayers) {
      setError(`${team.name} must have exactly ${requiredPlayers} players (currently ${team.assignedPlayers.length})`);
      return;
    }

    // Validate category quotas for S18+
    if (!isModernSeason) {
      const validation = validateTeamCategories(team.assignedPlayers);
      if (!validation.valid) {
        setError(`Cannot save ${team.name}. ${validation.error}`);
        return;
      }
    }

    try {
      setSavingTeamId(teamId);
      setError(null);
      setSuccess(null);

      // Refresh auth token
      const { auth } = await import('@/lib/firebase/config');
      const currentUser = auth.currentUser;
      if (currentUser) {
        const freshToken = await currentUser.getIdToken(true);
        await fetchWithTokenRefresh('/api/auth/set-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: freshToken }),
        });
      }

      // Save team's players (single-season model)
      const response = await fetchWithTokenRefresh('/api/contracts/assign-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: userSeasonId,
          players: team.assignedPlayers.map(p => ({
            id: p.id,
            teamId: teamId,
            playerName: p.playerName,
            auctionValue: p.auctionValue,
          })),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save team');
      }

      setSuccess(`Successfully saved ${team.name} with ${team.assignedPlayers.length} players!`);

      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save team');
    } finally {
      setSavingTeamId(null);
    }
  };

  if (loading || teamsLoading || loadingTeamSeasons) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center">
        <div className="text-center font-mono">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 font-mono font-extrabold uppercase tracking-wider">Loading team databases...</p>
        </div>
      </div>
    );
  }

  // Helper calculations for searchable dropdowns
  const filteredPlayersForDropdown = availablePlayers
    .filter(p => categoryFilter === 'all' || p.category === categoryFilter)
    .filter(p => {
      const q = playerSearchQuery.toLowerCase();
      return normalizeStr(p.playerName).includes(normalizeStr(q)) || normalizeStr(p.category).includes(normalizeStr(q));
    })
    .sort((a, b) => a.playerName.localeCompare(b.playerName));

  const filteredTeamsForDropdown = teams
    .filter(t => {
      const q = teamSearchQuery.toLowerCase();
      return normalizeStr(t.name).includes(normalizeStr(q));
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const handlePlayerKeyDown = (e: React.KeyboardEvent) => {
    if (!playerSearchOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setPlayerSearchOpen(true);
        setHighlightedPlayerIndex(0);
        setTimeout(() => playerSearchInputRef.current?.focus(), 50);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      setHighlightedPlayerIndex(prev => 
        prev < filteredPlayersForDropdown.length - 1 ? prev + 1 : 0
      );
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setHighlightedPlayerIndex(prev => 
        prev > 0 ? prev - 1 : filteredPlayersForDropdown.length - 1
      );
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const selected = filteredPlayersForDropdown[highlightedPlayerIndex];
      if (selected) {
        setQuickAssignPlayer(selected);
        setQuickAssignAuction(String(selected.basePrice !== undefined && selected.basePrice > 0 ? selected.basePrice : 0));
        setPlayerSearchOpen(false);
        setPlayerSearchQuery('');
        // Focus team select trigger button
        setTimeout(() => {
          const btn = document.getElementById('quick-assign-team-btn');
          btn?.focus();
          setTeamSearchOpen(true);
          setHighlightedTeamIndex(0);
          setTimeout(() => teamSearchInputRef.current?.focus(), 50);
        }, 50);
      }
      e.preventDefault();
    } else if (e.key === 'Escape') {
      setPlayerSearchOpen(false);
      const trigger = document.getElementById('quick-assign-player-btn');
      trigger?.focus();
      e.preventDefault();
    }
  };

  const handleTeamKeyDown = (e: React.KeyboardEvent) => {
    if (!teamSearchOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setTeamSearchOpen(true);
        setHighlightedTeamIndex(0);
        setTimeout(() => teamSearchInputRef.current?.focus(), 50);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      setHighlightedTeamIndex(prev => 
        prev < filteredTeamsForDropdown.length - 1 ? prev + 1 : 0
      );
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setHighlightedTeamIndex(prev => 
        prev > 0 ? prev - 1 : filteredTeamsForDropdown.length - 1
      );
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const selected = filteredTeamsForDropdown[highlightedTeamIndex];
      const slots = minPlayers - selected.assignedPlayers.length; // maxPlayers is minPlayers
      const isCategoryFull = quickAssignPlayer 
        ? selected.assignedPlayers.filter(p => (p.category || '').toLowerCase() === quickAssignPlayer.category.toLowerCase()).length >= getCategoryLimit(quickAssignPlayer.category)
        : false;
      if (selected && slots > 0 && !isCategoryFull) {
        setQuickAssignTeam(selected.id);
        setTeamSearchOpen(false);
        setTeamSearchQuery('');
        // Focus auction value input
        setTimeout(() => auctionInputRef.current?.focus(), 50);
      }
      e.preventDefault();
    } else if (e.key === 'Escape') {
      setTeamSearchOpen(false);
      const trigger = document.getElementById('quick-assign-team-btn');
      trigger?.focus();
      e.preventDefault();
    }
  };

  const getCategoryLimit = (catName: string) => {
    if (categories.length === 0) return 1;
    const cat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
    if (cat && cat.max_players !== undefined) {
      return cat.max_players;
    }
    const idx = categories.findIndex(c => c.name.toLowerCase() === catName.toLowerCase());
    if (idx === 0) return 2;
    return 1;
  };

  const validateTeamCategories = (assignedPlayers: Player[]) => {
    if (categories.length === 0) return { valid: true, error: '' };
    
    const counts = new Map<string, number>();
    assignedPlayers.forEach(p => {
      const cat = (p.category || '').toLowerCase();
      counts.set(cat, (counts.get(cat) || 0) + 1);
    });

    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      const current = counts.get(cat.name.toLowerCase()) || 0;
      const target = cat.max_players !== undefined ? cat.max_players : (i === 0 ? 2 : 1);
      if (current !== target) {
        return { 
          valid: false, 
          error: `Quota mismatch for category "${cat.name}": must have exactly ${target} player(s) (currently ${current}).` 
        };
      }
    }

    const activeCatNames = categories.map(c => c.name.toLowerCase());
    for (const p of assignedPlayers) {
      if (!activeCatNames.includes((p.category || '').toLowerCase())) {
        return {
          valid: false,
          error: `Player "${p.playerName}" has an invalid category "${p.category}" which is not configured for this season.`
        };
      }
    }

    return { valid: true, error: '' };
  };

  const calculateMaxBidForTeam = (team: TeamData, selectedPlayer: Player | null) => {
    if (!selectedPlayer || categories.length === 0) {
      return team.currentBudget;
    }

    const getCategoryBasePrice = (catName: string) => {
      const name = catName.toLowerCase();
      if (name.includes('red')) return 25;
      if (name.includes('black')) return 20;
      if (name.includes('blue')) return 15;
      if (name.includes('white')) return 10;
      return 0;
    };

    const selectedCat = (selectedPlayer.category || '').toLowerCase();
    
    // Create copy of counts to simulate assignment
    const simulatedCounts = new Map<string, number>();
    categories.forEach(c => {
      const catName = c.name.toLowerCase();
      const count = team.assignedPlayers.filter(p => (p.category || '').toLowerCase() === catName).length;
      simulatedCounts.set(catName, count);
    });

    // Add selected player's category to simulated counts
    simulatedCounts.set(selectedCat, (simulatedCounts.get(selectedCat) || 0) + 1);

    let totalReserve = 0;
    categories.forEach((c, idx) => {
      const catName = c.name.toLowerCase();
      const target = c.max_players !== undefined ? c.max_players : (idx === 0 ? 2 : 1);
      const current = simulatedCounts.get(catName) || 0;
      const needed = Math.max(0, target - current);
      
      const basePrice = getCategoryBasePrice(catName);
      totalReserve += needed * basePrice;
    });

    return Math.max(0, team.currentBudget - totalReserve);
  };

  const handleCopyBudgets = () => {
    const lines: string[] = [];
    teams.forEach((team, idx) => {
      const totalCost = team.assignedPlayers.reduce((sum, p) => sum + p.auctionValue, 0);
      const displayBudget = showActualBudget ? team.currentBudget : (team.originalBudget - totalCost);
      const playerCount = team.assignedPlayers.length;
      lines.push(`${idx + 1}. *${team.name}*: $${displayBudget.toLocaleString()} left (${playerCount}/${minPlayers})`);
    });
    
    const text = '*SS LEAGUE - TEAM BALANCES* 💰\n\n' + lines.join('\n');
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedBudgets(true);
        setTimeout(() => setCopiedBudgets(false), 2000);
        setSuccess('Successfully copied team budgets for WhatsApp!');
        setTimeout(() => setSuccess(null), 3000);
      })
      .catch(err => {
        console.error('Error copying text: ', err);
        setError('Failed to copy text to clipboard');
      });
  };

  const filteredAvailablePlayers = availablePlayers.filter(p =>
    normalizeStr(p.playerName).includes(normalizeStr(searchTerm))
  );

  const minPlayers = currentSeason?.min_real_players || 5;
  const maxPlayers = minPlayers; // Max equals min for exact count

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <button
              onClick={() => router.push('/dashboard/committee')}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all mb-4"
            >
              &larr; Back to Panel
            </button>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight font-mono">
              🎯 SS Members Team Assignment
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1 leading-normal">
              Assign SS Members to teams for {currentSeason?.name || 'Active Season'}
            </p>
          </div>
          
          <div className="bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm shrink-0">
            COMMITTEE ADMIN ONLY
          </div>
        </div>

        {/* Season Info & Toggles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
          {/* Season info */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">SEASON PARAMETERS</h3>
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Season</p>
                <p className="text-sm font-extrabold text-slate-800 uppercase mt-0.5">{userSeasonId}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Required Players</p>
                <p className="text-sm font-extrabold text-slate-800 uppercase mt-0.5">{minPlayers} Exactly</p>
              </div>
            </div>
          </div>

          {/* Budget Toggle */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-3">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">BUDGET TRACKING MODE</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowActualBudget(true)}
                className={`flex-1 py-2 font-mono font-bold text-xs uppercase tracking-wider rounded-xl border transition-all ${
                  showActualBudget
                    ? 'bg-slate-800 border-slate-800 text-white shadow-sm'
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <DollarSign className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Actual Balance
              </button>
              <button
                onClick={() => setShowActualBudget(false)}
                className={`flex-1 py-2 font-mono font-bold text-xs uppercase tracking-wider rounded-xl border transition-all ${
                  !showActualBudget
                    ? 'bg-slate-800 border-slate-800 text-white shadow-sm'
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Max Limit
              </button>
            </div>
            <div className="text-[9px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">
              {showActualBudget ? 'Active balance loaded from database' : 'Initial budget minus locally calculated costs'}
            </div>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-rose-50 border border-rose-200/60 rounded-2xl p-4 font-mono text-xs">
            <div className="flex items-center gap-2 text-rose-800">
              <span className="font-extrabold"><AlertTriangle className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> ERROR:</span>
              <span className="font-bold uppercase tracking-wide">{error}</span>
            </div>
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 border border-emerald-200/60 rounded-2xl p-4 font-mono text-xs">
            <div className="flex items-center gap-2 text-emerald-800">
              <span className="font-extrabold flex items-center gap-1">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                SUCCESS:
              </span>
              <span className="font-bold uppercase tracking-wide">{success}</span>
            </div>
          </div>
        )}

        {/* Quick Assign - Live Auction Mode */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl shadow-sm font-mono text-xs relative !overflow-visible z-50">
          <div className="bg-slate-800 text-white p-5 border-b border-slate-700 flex items-center justify-between rounded-t-[22px]">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Quick Assign - Live Auction
              </h2>
              <p className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mt-0.5">Assign players instantly as WhatsApp auction happens</p>
            </div>
            <div className="px-2 py-0.5 bg-rose-600/90 text-white font-extrabold text-[9px] uppercase tracking-wider rounded border border-rose-500 animate-pulse">
              🔴 LIVE
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 gap-4 mb-4">
              {/* Category Filter Row */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Filter:</span>
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap transition-all ${
                    categoryFilter === 'all'
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({availablePlayers.length})
                </button>
                {Array.from(new Set(availablePlayers.map(p => p.category))).sort().map(cat => {
                  const count = availablePlayers.filter(p => p.category === cat).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap transition-all ${
                        categoryFilter === cat
                          ? 'bg-purple-600 text-white'
                          : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
                      }`}
                    >
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Player Selection */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  1. Select Player <span className="text-rose-500">*</span>
                </label>
                <div ref={playerDropdownRef} className="relative">
                  <button
                    type="button"
                    ref={playerSelectRef}
                    id="quick-assign-player-btn"
                    onClick={() => {
                      setPlayerSearchOpen(prev => !prev);
                      if (!playerSearchOpen) {
                        setHighlightedPlayerIndex(0);
                        setTimeout(() => playerSearchInputRef.current?.focus(), 50);
                      }
                    }}
                    onKeyDown={handlePlayerKeyDown}
                    className="w-full text-left px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide cursor-pointer hover:border-slate-300 transition-all flex items-center justify-between"
                  >
                    <span className="truncate">
                      {quickAssignPlayer 
                        ? `${quickAssignPlayer.playerName} (${quickAssignPlayer.category})` 
                        : 'Choose player...'}
                    </span>
                    <svg className="w-4 h-4 text-slate-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {playerSearchOpen && (
                    <div className="absolute z-[99999] w-full mt-1.5 bg-white border-2 border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto flex flex-col">
                      <div className="p-2 border-b border-slate-100 bg-slate-50 sticky top-0">
                        <input
                          type="text"
                          ref={playerSearchInputRef}
                          placeholder="Search player..."
                          value={playerSearchQuery}
                          onChange={(e) => {
                            setPlayerSearchQuery(e.target.value);
                            setHighlightedPlayerIndex(0);
                          }}
                          onKeyDown={handlePlayerKeyDown}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white outline-none font-mono text-xs focus:border-amber-500"
                        />
                      </div>
                      <div className="overflow-y-auto max-h-56 divide-y divide-slate-50">
                        {filteredPlayersForDropdown.length === 0 ? (
                          <div className="p-3 text-slate-400 text-center font-mono text-[10px] uppercase font-bold">No players found</div>
                        ) : (
                          filteredPlayersForDropdown.map((player, idx) => {
                            const isHighlighted = idx === highlightedPlayerIndex;
                            const isSelected = quickAssignPlayer?.id === player.id;
                            return (
                              <button
                                key={player.id}
                                type="button"
                                onClick={() => {
                                  setQuickAssignPlayer(player);
                                  setQuickAssignAuction(String(player.basePrice !== undefined && player.basePrice > 0 ? player.basePrice : 0));
                                  setPlayerSearchOpen(false);
                                  setPlayerSearchQuery('');
                                  setTimeout(() => {
                                    document.getElementById('quick-assign-team-btn')?.focus();
                                    setTeamSearchOpen(true);
                                    setHighlightedTeamIndex(0);
                                    setTimeout(() => teamSearchInputRef.current?.focus(), 50);
                                  }, 50);
                                }}
                                className={`w-full text-left px-4 py-2.5 font-mono text-xs font-bold uppercase transition-all flex items-center justify-between ${
                                  isHighlighted ? 'bg-amber-50 text-amber-900 font-extrabold' : isSelected ? 'bg-slate-100 text-slate-800' : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <span className="truncate">{player.playerName} ({player.category})</span>
                                <span className="text-[9px] text-slate-400 ml-2">Min ${player.basePrice || 0}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {quickAssignPlayer && (
                  <div className="mt-2 px-3 py-2 bg-slate-50 border border-slate-200/60 rounded-xl flex items-center justify-between">
                    <span className="text-[9px] font-extrabold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-1 rounded uppercase">
                      {quickAssignPlayer.category}
                    </span>
                    <span className="text-[10px] font-black text-slate-600">
                      MIN <DollarSign className="w-3 h-3 inline-block text-emerald-500 align-text-bottom" />
                      {quickAssignPlayer.basePrice !== undefined && quickAssignPlayer.basePrice > 0 ? quickAssignPlayer.basePrice : 0}
                    </span>
                  </div>
                )}
              </div>

              {/* Team Selection */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  2. Select Team <span className="text-rose-500">*</span>
                </label>
                <div ref={teamDropdownRef} className="relative">
                  <button
                    type="button"
                    ref={teamSelectRef}
                    id="quick-assign-team-btn"
                    onClick={() => {
                      setTeamSearchOpen(prev => !prev);
                      if (!teamSearchOpen) {
                        setHighlightedTeamIndex(0);
                        setTimeout(() => teamSearchInputRef.current?.focus(), 50);
                      }
                    }}
                    onKeyDown={handleTeamKeyDown}
                    className="w-full text-left px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide cursor-pointer hover:border-slate-300 transition-all flex items-center justify-between"
                  >
                    <span className="truncate">
                      {quickAssignTeam 
                        ? teams.find(t => t.id === quickAssignTeam)?.name 
                        : 'Choose team...'}
                    </span>
                    <svg className="w-4 h-4 text-slate-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {teamSearchOpen && (
                    <div className="absolute z-[99999] w-full mt-1.5 bg-white border-2 border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto flex flex-col">
                      <div className="p-2 border-b border-slate-100 bg-slate-50 sticky top-0">
                        <input
                          type="text"
                          ref={teamSearchInputRef}
                          placeholder="Search team..."
                          value={teamSearchQuery}
                          onChange={(e) => {
                            setTeamSearchQuery(e.target.value);
                            setHighlightedTeamIndex(0);
                          }}
                          onKeyDown={handleTeamKeyDown}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white outline-none font-mono text-xs focus:border-amber-500"
                        />
                      </div>
                      <div className="overflow-y-auto max-h-56 divide-y divide-slate-50">
                        {filteredTeamsForDropdown.length === 0 ? (
                          <div className="p-3 text-slate-400 text-center font-mono text-[10px] uppercase font-bold">No teams found</div>
                        ) : (
                          filteredTeamsForDropdown.map((team, idx) => {
                            const slots = minPlayers - team.assignedPlayers.length; // maxPlayers is minPlayers
                            const isHighlighted = idx === highlightedTeamIndex;
                            const isSelected = quickAssignTeam === team.id;
                            const isCategoryFull = quickAssignPlayer 
                              ? team.assignedPlayers.filter(p => (p.category || '').toLowerCase() === quickAssignPlayer.category.toLowerCase()).length >= getCategoryLimit(quickAssignPlayer.category)
                              : false;
                            return (
                              <button
                                key={team.id}
                                type="button"
                                disabled={slots <= 0 || isCategoryFull}
                                onClick={() => {
                                  setQuickAssignTeam(team.id);
                                  setTeamSearchOpen(false);
                                  setTeamSearchQuery('');
                                  setTimeout(() => auctionInputRef.current?.focus(), 50);
                                }}
                                className={`w-full text-left px-4 py-2.5 font-mono text-xs font-bold uppercase transition-all flex items-center justify-between disabled:opacity-40 disabled:cursor-not-allowed ${
                                  isHighlighted ? 'bg-amber-50 text-amber-900 font-extrabold' : isSelected ? 'bg-slate-100 text-slate-800' : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div className="flex flex-col text-left">
                                  <span className="truncate">{team.name}</span>
                                  {quickAssignPlayer && !isCategoryFull && slots > 0 && (
                                    <span className="text-[9px] text-emerald-600 font-extrabold uppercase mt-0.5">
                                      MAX BID: ${calculateMaxBidForTeam(team, quickAssignPlayer).toLocaleString()}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[9px] text-slate-400 ml-2">
                                  ({team.assignedPlayers.length}/{minPlayers}) {slots <= 0 ? 'FULL' : isCategoryFull ? `${quickAssignPlayer?.category} FULL` : `${slots} slots`}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {quickAssignTeam && (
                  <div className="mt-2 px-3 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl space-y-1.5 font-mono text-[10px]">
                    {(() => {
                      const team = teams.find(t => t.id === quickAssignTeam);
                      if (!team) return null;
                      const remaining = showActualBudget
                        ? team.currentBudget
                        : (team.originalBudget - team.assignedPlayers.reduce((sum, p) => sum + p.auctionValue, 0));
                      const maxBid = calculateMaxBidForTeam(team, quickAssignPlayer);
                      return (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 font-bold uppercase">Budget Left:</span>
                            <span className={`font-black ${remaining < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              <DollarSign className="w-3 h-3 inline-block text-emerald-500 align-text-bottom mr-0.5" />
                              {remaining.toLocaleString()}
                            </span>
                          </div>
                          {quickAssignPlayer && (
                            <div className="flex items-center justify-between border-t border-slate-200/60 pt-1.5">
                              <span className="text-purple-700 font-extrabold uppercase">Max Allowed Bid:</span>
                              <span className="font-black text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">
                                <DollarSign className="w-3 h-3 inline-block text-purple-700 align-text-bottom mr-0.5" />
                                {maxBid.toLocaleString()}
                              </span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Auction Value Input */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  3. Auction Value <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold text-sm">$</span>
                  <input
                    ref={auctionInputRef}
                    type="number"
                    value={quickAssignAuction}
                    onChange={(e) => setQuickAssignAuction(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && quickAssignPlayer && quickAssignTeam && quickAssignAuction) {
                        e.preventDefault();
                        handleQuickAssign();
                      }
                    }}
                    placeholder="0"
                    min={quickAssignPlayer?.basePrice || 0}
                    step="5"
                    className="w-full pl-8 pr-4 py-3 border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-sm font-bold outline-none tracking-wide text-right hover:border-slate-300 transition-all"
                  />
                </div>
                {quickAssignPlayer && quickAssignAuction && quickAssignTeam && (() => {
                  const team = teams.find(t => t.id === quickAssignTeam);
                  if (!team) return null;
                  const maxBid = calculateMaxBidForTeam(team, quickAssignPlayer);
                  const bidValue = parseInt(quickAssignAuction) || 0;
                  const isExceeded = bidValue > maxBid;
                  return (
                    <div className={`mt-2 px-3 py-2 rounded-xl flex items-center justify-between border ${
                      isExceeded 
                        ? 'bg-rose-50 border-rose-250 text-rose-700 font-extrabold animate-pulse' 
                        : 'bg-blue-50 border-blue-200/60 text-blue-700 font-bold'
                    }`}>
                      <span className="text-[10px] uppercase tracking-wide">
                        {isExceeded ? '⚠️ EXCEEDS MAX BID:' : 'Final Bid:'}
                      </span>
                      <span className="text-[10px] font-black">
                        <DollarSign className="w-3.5 h-3.5 inline-block align-text-bottom mr-0.5" />
                        {bidValue.toLocaleString()} {isExceeded && `(Max: $${maxBid})`}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Assign Button */}
              <div className="flex items-end">
                {(() => {
                  const selectedTeamData = teams.find(t => t.id === quickAssignTeam);
                  const isBidExceeded = selectedTeamData && quickAssignPlayer && quickAssignAuction
                    ? (parseInt(quickAssignAuction) || 0) > calculateMaxBidForTeam(selectedTeamData, quickAssignPlayer)
                    : false;
                  const isBtnDisabled = !quickAssignPlayer || !quickAssignTeam || !quickAssignAuction || isQuickAssigning || isBidExceeded;
                  return (
                    <button
                      onClick={handleQuickAssign}
                      disabled={isBtnDisabled}
                      className={`w-full py-3.5 font-mono font-bold text-sm uppercase tracking-wider rounded-xl transition-all shadow-sm ${
                        isBtnDisabled
                          ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-emerald-500/20 hover:shadow-lg'
                      }`}
                    >
                      {isQuickAssigning ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Assigning...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          ⚡ Assign Now
                          <span className="text-[9px] opacity-70">(Enter)</span>
                        </span>
                      )}
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* Keyboard shortcuts help */}
            <div className="mt-4 flex items-center justify-between px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-3 text-[9px] text-amber-800 font-bold uppercase">
                <span>Shortcuts:</span>
                <span className="px-2 py-0.5 bg-white rounded border border-amber-300">Enter</span>
                <span>= Assign</span>
                <span className="px-2 py-0.5 bg-white rounded border border-amber-300">Esc</span>
                <span>= Clear</span>
              </div>
              {lastUsedTeam && (
                <div className="text-[9px] text-amber-700 font-bold">
                  Last: {teams.find(t => t.id === lastUsedTeam)?.name}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Available Players Panel */}
          <div className="lg:col-span-1">
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm font-mono text-xs sticky top-0">
              <div className="bg-slate-800 text-white p-5 border-b border-slate-700">
                <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Available SS Members
                </h2>
                <p className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mt-0.5">{availablePlayers.length} unassigned players</p>

                <div className="mt-4">
                  <input
                    type="text"
                    placeholder="SEARCH MEMBERS..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-700/60 rounded-xl bg-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/80 font-mono text-xs font-bold uppercase tracking-wider"
                  />
                </div>
              </div>

              <div className="max-h-[500px] overflow-y-auto p-4 space-y-2">
                {filteredAvailablePlayers.length === 0 ? (
                  <div className="text-center py-12 text-slate-550 font-mono font-extrabold uppercase tracking-wider">
                    <p className="text-xs">
                      {searchTerm ? 'No players found' : 'All players assigned!'}
                    </p>
                    {availablePlayers.length === 0 && (
                      <p className="text-[10px] text-slate-500 mt-2">
                        {isModernSeason ? (
                          <>
                            <Link href="/dashboard/committee/player-ratings" className="text-amber-500 underline">
                              Set star ratings
                            </Link> to import members
                          </>
                        ) : (
                          <>
                            <Link href="/dashboard/committee/player-categorization" className="text-amber-500 underline">
                              Categorize players
                            </Link> to import members
                          </>
                        )}
                      </p>
                    )}
                  </div>
                ) : (
                  filteredAvailablePlayers.map(player => (
                    <div
                      key={player.id}
                      className="p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/85 rounded-xl cursor-grab transition-all"
                      draggable
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-800 uppercase tracking-wide">{player.playerName}</p>
                          <span className="inline-flex mt-1 text-[9px] font-extrabold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded uppercase">
                            {player.category}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-blue-600 block text-xs"><DollarSign className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" />{player.auctionValue}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Teams Panel */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between bg-slate-800 text-white p-4 rounded-2xl mb-2 font-mono text-xs border border-slate-700">
              <span className="font-extrabold uppercase text-slate-200 tracking-wider">Team Squads & Balances</span>
              <button
                type="button"
                onClick={handleCopyBudgets}
                className={`px-3 py-1.5 rounded-xl transition-all font-bold flex items-center gap-1.5 shadow-sm active:scale-95 ${
                  copiedBudgets 
                    ? 'bg-emerald-700 text-white shadow-emerald-700/10' 
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/10'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.705 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
                {copiedBudgets ? 'Copied!' : 'Copy budgets (WhatsApp)'}
              </button>
            </div>
            {teams.map(team => {
              const totalCost = team.assignedPlayers.reduce((sum, p) => sum + p.auctionValue, 0);

              const displayBudget = showActualBudget ? team.currentBudget : (team.originalBudget - totalCost);
              const displaySpent = showActualBudget ? team.currentSpent : totalCost;
              const displayTotal = showActualBudget ? (team.currentBudget + team.currentSpent) : team.originalBudget;

              const isOverBudget = displayBudget < 0;
              const playerCount = team.assignedPlayers.length;
              const categoriesValid = isModernSeason ? true : validateTeamCategories(team.assignedPlayers).valid;
              const isValidCount = playerCount === maxPlayers && categoriesValid;

              return (
                <div
                  key={team.id}
                  className={`console-card bg-white border rounded-3xl overflow-hidden transition-all ${
                    team.isExpanded ? 'border-amber-400 shadow-md' : 'border-slate-200/60 shadow-sm'
                  }`}
                >
                  {/* Team Header */}
                  <div
                    className="p-4 cursor-pointer hover:bg-slate-50/50 transition-colors font-mono text-xs"
                    onClick={() => toggleTeam(team.id)}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl border ${
                          isValidCount && !isOverBudget 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                            : 'bg-slate-100 border-slate-200 text-slate-500'
                        }`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="font-extrabold text-slate-800 uppercase tracking-wider">{team.name}</h3>
                          <div className="flex items-center gap-2 mt-1 text-[10px] flex-wrap">
                            <span className={`font-bold uppercase tracking-wider ${playerCount !== maxPlayers ? 'text-rose-600' : 'text-slate-500'}`}>
                              {playerCount}/{maxPlayers} Players
                            </span>
                            <span className="text-slate-400 font-bold">•</span>
                            <span className={`font-bold uppercase tracking-wider ${isOverBudget ? 'text-rose-600 font-extrabold' : 'text-emerald-600'}`}>
                              <DollarSign className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" />{displayBudget.toLocaleString()} LEFT
                            </span>
                            {!isModernSeason && categories.length > 0 && (
                              <>
                                <span className="text-slate-400 font-bold">•</span>
                                <span className="text-slate-600 font-extrabold uppercase tracking-wider bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  {categories.map((c, idx) => {
                                    const count = team.assignedPlayers.filter(p => (p.category || '').toLowerCase() === c.name.toLowerCase()).length;
                                    const limit = c.max_players !== undefined ? c.max_players : (idx === 0 ? 2 : 1);
                                    return `${c.name}: ${count}/${limit}`;
                                  }).join(' | ')}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        {isValidCount && !isOverBudget && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-emerald-700">
                            Yes READY
                          </span>
                        )}

                        <svg
                          className={`w-4 h-4 text-slate-400 transition-transform ${team.isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Team Content (Expanded) */}
                  {team.isExpanded && (
                    <div className="border-t border-slate-200/60 font-mono text-xs !overflow-visible">
                      {/* Budget Bar */}
                      <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 font-mono text-[10px]">
                        <div className="flex justify-between mb-1.5">
                          <span className="text-slate-500 font-bold uppercase">Budget Usage</span>
                          <span className={`font-bold ${isOverBudget ? 'text-rose-600 font-extrabold' : 'text-slate-700'}`}>
                            <DollarSign className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" />{displaySpent.toLocaleString()} / <DollarSign className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" />{displayTotal.toLocaleString()}
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 border border-slate-300/20">
                          <div
                            className={`h-full rounded-full transition-all ${isOverBudget ? 'bg-rose-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min((displaySpent / displayTotal) * 100, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Quota checklist for S18+ */}
                      {!isModernSeason && categories.length > 0 && (
                        <div className="px-5 py-3 bg-indigo-50/20 border-b border-slate-100 font-mono text-[10px]">
                          <span className="text-slate-500 font-bold uppercase block mb-2">Category Quota Checklist</span>
                          <div className="flex flex-wrap gap-2.5">
                            {categories.map((c, idx) => {
                              const current = team.assignedPlayers.filter(p => (p.category || '').toLowerCase() === c.name.toLowerCase()).length;
                              const target = c.max_players !== undefined ? c.max_players : (idx === 0 ? 2 : 1);
                              const isFilled = current === target;
                              const isOver = current > target;
                              return (

                                <div key={c.id || c.name} className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all ${
                                  isFilled 
                                    ? 'bg-emerald-50 border-emerald-250 text-emerald-700 font-black' 
                                    : isOver 
                                      ? 'bg-rose-50 border-rose-250 text-rose-700 font-black'
                                      : 'bg-slate-50 border-slate-200 text-slate-500 font-bold'
                                }`}>
                                  <span>{c.name}: {current}/{target}</span>
                                  <span>{isFilled ? '✓' : <AlertTriangle className="w-3 h-3 inline text-amber-500" />}</span>
                                </div>

  );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Assigned Players */}
                      <div className="p-5 space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          Assigned Players ({playerCount} of {maxPlayers})
                        </h4>

                        {team.assignedPlayers.length === 0 ? (
                          <div className="text-center py-8 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 text-slate-400 uppercase tracking-wider">
                            <p className="text-xs">No players assigned yet</p>
                            <p className="text-[10px] text-slate-500 mt-1">Select from available players below</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {team.assignedPlayers.map((player, index) => (
                              <div
                                key={player.id}
                                className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-all"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400">#{index + 1}</span>
                                    <div>
                                      <p className="font-bold text-slate-800 uppercase tracking-wide">{player.playerName}</p>
                                      <span className="inline-flex mt-0.5 text-[9px] font-extrabold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded uppercase">
                                        {player.category}
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => removePlayerFromTeam(team.id, player.id)}
                                    className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                                    title="Remove player"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200/50">
                                  <span className="text-[10px] text-slate-500 font-bold uppercase">Auction Bid:</span>
                                  <div className="relative">
                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-500 font-semibold text-[10px]"><DollarSign className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /></span>
                                    <input
                                      type="number"
                                      value={player.auctionValue}
                                      onChange={(e) => updatePlayerAuctionValue(team.id, player.id, parseInt(e.target.value) || 0)}
                                      min={250}
                                      step="10"
                                      className="w-20 pl-5 pr-2 py-1 text-[11px] font-bold text-right border border-slate-200 rounded-lg focus:border-slate-800 focus:outline-none"
                                      title="Minimum: $250"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add Player Dropdown with Search */}
                        <div className="mb-4 relative pt-2 border-t border-slate-200/55 !overflow-visible">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                            Add Player to {team.name}
                          </label>

                          {playerCount >= maxPlayers ? (
                            <div className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-400 text-xs text-center uppercase font-bold tracking-wider">
                              Slots filled ({playerCount}/{maxPlayers})
                            </div>
                          ) : (
                            <div
                              className="relative !overflow-visible"
                              ref={(el) => dropdownRefs.current.set(team.id, el)}
                            >
                              <input
                                type="text"
                                placeholder="SEARCH AND SELECT PLAYER..."
                                value={dropdownSearchTerms.get(team.id) || ''}
                                onChange={(e) => {
                                  const newMap = new Map(dropdownSearchTerms);
                                  newMap.set(team.id, e.target.value);
                                  setDropdownSearchTerms(newMap);
                                  if (e.target.value) {
                                    setDropdownOpen(team.id);
                                  }
                                }}
                                onFocus={() => setDropdownOpen(team.id)}
                                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide pr-10"
                              />
                              <svg
                                className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>

                              {dropdownOpen === team.id && availablePlayers.length > 0 && (
                                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
                                  {availablePlayers
                                    .filter(p => {
                                      const searchTerm = (dropdownSearchTerms.get(team.id) || '').toLowerCase();
                                      if (!searchTerm) return true;
                                      return normalizeStr(p.playerName).includes(normalizeStr(searchTerm)) ||
                                        normalizeStr(p.category).includes(normalizeStr(searchTerm));
                                    })
                                    .slice(0, 50)
                                    .map(player => (
                                      <button
                                        key={player.id}
                                        type="button"
                                        onClick={() => {
                                          console.log(`Selected player:`, player.playerName);
                                          addPlayerToTeam(team.id, player);
                                          const newMap = new Map(dropdownSearchTerms);
                                          newMap.set(team.id, '');
                                          setDropdownSearchTerms(newMap);
                                          setDropdownOpen(null);
                                        }}
                                        className="w-full px-4 py-2.5 text-left hover:bg-slate-50 flex items-center justify-between text-xs transition-colors"
                                      >
                                        <div>
                                          <p className="font-bold text-slate-800 uppercase">{player.playerName}</p>
                                          <span className="inline-flex text-[9px] font-extrabold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded uppercase mt-0.5">
                                            {player.category}
                                          </span>
                                        </div>
                                        <span className="text-xs font-black text-blue-600">
                                          <DollarSign className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" />{player.auctionValue}
                                        </span>
                                      </button>
                                    ))}
                                  {availablePlayers.filter(p => {
                                    const searchTerm = (dropdownSearchTerms.get(team.id) || '').toLowerCase();
                                    if (!searchTerm) return true;
                                    return normalizeStr(p.playerName).includes(normalizeStr(searchTerm)) ||
                                      normalizeStr(p.category).includes(normalizeStr(searchTerm));
                                  }).length === 0 && (
                                      <div className="px-3 py-4 text-center text-xs text-slate-550 font-mono font-extrabold uppercase tracking-wider">
                                        No players found
                                      </div>
                                    )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Save Button */}
                        <button
                          onClick={() => saveTeam(team.id)}
                          disabled={
                            savingTeamId === team.id ||
                            playerCount !== maxPlayers ||
                            isOverBudget
                          }
                          className={`w-full py-2.5 font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm ${
                            savingTeamId === team.id
                              ? 'bg-slate-300 text-slate-500 cursor-wait'
                              : playerCount !== maxPlayers || isOverBudget
                                ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-slate-800 hover:bg-slate-700 text-white'
                          }`}
                        >
                          {savingTeamId === team.id ? (
                            <span className="flex items-center justify-center gap-1.5">
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Saving...
                            </span>
                          ) : playerCount !== maxPlayers ? (
                            playerCount > maxPlayers 
                              ? `✕ Remove ${playerCount - maxPlayers} Players`
                              : `+ Add ${maxPlayers - playerCount} Players`
                          ) : isOverBudget ? (
                            '✕ Over Budget!'
                          ) : (
                            `💾 Save ${team.name}`
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setUpdateCounter(prev => prev + 1)}
        disabled={isRefreshing}
        className="fixed right-6 bottom-24 z-[1002] w-12 h-12 flex items-center justify-center bg-amber-600 text-white rounded-full shadow-lg hover:bg-amber-500 active:scale-95 transition-all disabled:opacity-80 cursor-pointer border border-amber-500/20 shadow-amber-600/20"
        title="Refresh Data"
      >
        <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  
    </AuthGuard>
  );
}