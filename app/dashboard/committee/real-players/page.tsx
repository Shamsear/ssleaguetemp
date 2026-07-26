'use client';
import { CheckCircle, DollarSign, AlertTriangle, BarChart2 } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { getSeasonById } from '@/lib/firebase/seasons';
import { Season } from '@/types/season';
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
  
  // Refs for auto-focus
  const playerSelectRef = useRef<HTMLSelectElement>(null);
  const teamSelectRef = useRef<HTMLSelectElement>(null);
  const auctionInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && !isCommitteeAdmin) {
      router.push('/dashboard');
    }
  }, [user, loading, router, isCommitteeAdmin]);

  // Click outside handler for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownOpen) {
        const dropdownElement = dropdownRefs.current.get(dropdownOpen);
        if (dropdownElement && !dropdownElement.contains(event.target as Node)) {
          setDropdownOpen(null);
        }
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

      try {
        // Fetch season
        const season = await getSeasonById(userSeasonId);
        setCurrentSeason(season);

        // Fetch team_seasons to get budget data
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase/config');

        const teamSeasonsQuery = query(
          collection(db, 'team_seasons'),
          where('season_id', '==', userSeasonId),
          where('status', '==', 'registered')
        );

        const teamSeasonsSnapshot = await getDocs(teamSeasonsQuery);
        const teamSeasonsData = teamSeasonsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

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

  // Load existing players and organize by team
  useEffect(() => {
    const loadPlayers = async () => {
      if (!userSeasonId || !currentSeason || teamSeasons.length === 0) return;

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
      }
    };

    loadPlayers();
  }, [userSeasonId, currentSeason, teamSeasons]);

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

  const removePlayerFromTeam = (teamId: string, playerId: string) => {
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

  if (!user || !isCommitteeAdmin) {
    return null;
  }

  const filteredAvailablePlayers = availablePlayers.filter(p =>
    p.playerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const minPlayers = currentSeason?.min_real_players || 5;
  const maxPlayers = minPlayers; // Max equals min for exact count

  return (
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
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm font-mono text-xs">
          <div className="bg-slate-800 text-white p-5 border-b border-slate-700 flex items-center justify-between">
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
                <select
                  ref={playerSelectRef}
                  value={quickAssignPlayer?.id || ''}
                  onChange={(e) => {
                    const player = availablePlayers.find(p => p.id === e.target.value);
                    setQuickAssignPlayer(player || null);
                    if (player) {
                      setQuickAssignAuction(String(player.basePrice !== undefined && player.basePrice > 0 ? player.basePrice : 0));
                      // Auto-focus team select
                      setTimeout(() => teamSelectRef.current?.focus(), 50);
                    }
                  }}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide cursor-pointer hover:border-slate-300 transition-all"
                >
                  <option value="">Choose player...</option>
                  {availablePlayers
                    .filter(p => categoryFilter === 'all' || p.category === categoryFilter)
                    .sort((a, b) => a.playerName.localeCompare(b.playerName))
                    .map(player => (
                      <option key={player.id} value={player.id}>
                        {player.playerName} ({player.category}) - Min ${player.basePrice !== undefined && player.basePrice > 0 ? player.basePrice : 0}
                      </option>
                    ))}
                </select>
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
                <select
                  ref={teamSelectRef}
                  value={quickAssignTeam}
                  onChange={(e) => {
                    setQuickAssignTeam(e.target.value);
                    // Auto-focus auction input
                    setTimeout(() => auctionInputRef.current?.focus(), 50);
                  }}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide cursor-pointer hover:border-slate-300 transition-all"
                >
                  <option value="">Choose team...</option>
                  {teams
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(team => {
                      const slots = maxPlayers - team.assignedPlayers.length;
                      return (
                        <option
                          key={team.id}
                          value={team.id}
                          disabled={slots <= 0}
                        >
                          {team.name} ({team.assignedPlayers.length}/{maxPlayers}) {slots > 0 ? `- ${slots} slots` : '- FULL'}
                        </option>
                      );
                    })}
                </select>
                {quickAssignTeam && (
                  <div className="mt-2 px-3 py-2 bg-slate-50 border border-slate-200/60 rounded-xl flex items-center justify-between">
                    {(() => {
                      const team = teams.find(t => t.id === quickAssignTeam);
                      if (!team) return null;
                      const remaining = showActualBudget
                        ? team.currentBudget
                        : (team.originalBudget - team.assignedPlayers.reduce((sum, p) => sum + p.auctionValue, 0));
                      return (
                        <>
                          <span className="text-[10px] text-slate-500 font-bold uppercase">Budget:</span>
                          <span className={`text-[10px] font-black ${remaining < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            <DollarSign className="w-3 h-3 inline-block text-emerald-500 align-text-bottom" />
                            {remaining.toLocaleString()}
                          </span>
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
                {quickAssignPlayer && quickAssignAuction && (
                  <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200/60 rounded-xl flex items-center justify-between">
                    <span className="text-[10px] text-blue-600 font-bold uppercase">Final:</span>
                    <span className="text-[10px] font-black text-blue-700">
                      <DollarSign className="w-3 h-3 inline-block text-blue-600 align-text-bottom" />
                      {(parseInt(quickAssignAuction) || 0).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Assign Button */}
              <div className="flex items-end">
                <button
                  onClick={handleQuickAssign}
                  disabled={!quickAssignPlayer || !quickAssignTeam || !quickAssignAuction || isQuickAssigning}
                  className={`w-full py-3.5 font-mono font-bold text-sm uppercase tracking-wider rounded-xl transition-all shadow-sm ${
                    !quickAssignPlayer || !quickAssignTeam || !quickAssignAuction || isQuickAssigning
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
              </div>
            </div>

            {/* Keyboard shortcuts help */}
            <div className="mt-4 flex items-center justify-between px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-3 text-[9px] text-amber-800 font-bold uppercase">
                <span>⌨️ Shortcuts:</span>
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
            {teams.map(team => {
              const totalCost = team.assignedPlayers.reduce((sum, p) => sum + p.auctionValue, 0);

              const displayBudget = showActualBudget ? team.currentBudget : (team.originalBudget - totalCost);
              const displaySpent = showActualBudget ? team.currentSpent : totalCost;
              const displayTotal = showActualBudget ? (team.currentBudget + team.currentSpent) : team.originalBudget;

              const isOverBudget = displayBudget < 0;
              const playerCount = team.assignedPlayers.length;
              const isValidCount = playerCount === maxPlayers;

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
                          <div className="flex items-center gap-2 mt-1 text-[10px]">
                            <span className={`font-bold uppercase tracking-wider ${playerCount !== maxPlayers ? 'text-rose-600' : 'text-slate-500'}`}>
                              {playerCount}/{maxPlayers} Players
                            </span>
                            <span className="text-slate-400 font-bold">•</span>
                            <span className={`font-bold uppercase tracking-wider ${isOverBudget ? 'text-rose-600 font-extrabold' : 'text-emerald-600'}`}>
                              <DollarSign className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" />{displayBudget.toLocaleString()} LEFT
                            </span>
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
                                      return p.playerName.toLowerCase().includes(searchTerm) ||
                                        p.category?.toLowerCase().includes(searchTerm);
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
                                    return p.playerName.toLowerCase().includes(searchTerm) ||
                                      p.category?.toLowerCase().includes(searchTerm);
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
    </div>
  );
}