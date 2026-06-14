'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useCachedTeams } from '@/hooks/useCachedData';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import SearchablePlayerSelect from '@/components/ui/SearchablePlayerSelect';
import { X, Plus, ArrowLeftRight } from 'lucide-react';

interface Player {
  id: string;
  player_id: string;
  player_name: string;
  team_id: string;
  team_name?: string;
  acquisition_value: number;
  star_rating: number;
  position: string;
  season_id: string;
}

interface SwapPair {
  id: string;
  player_a_id: string;
  player_b_id: string;
}

export default function BulkSwapForm() {
  const { user, userSeasonId } = usePermissions();
  const { data: cachedTeams, isLoading: teamsLoading } = useCachedTeams(userSeasonId);

  // Form state
  const [swapPairs, setSwapPairs] = useState<SwapPair[]>([
    { id: '1', player_a_id: '', player_b_id: '' }
  ]);

  // Data state
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load football players
  useEffect(() => {
    const loadPlayers = async () => {
      if (!userSeasonId) return;

      setLoadingPlayers(true);
      try {
        const response = await fetchWithTokenRefresh(
          `/api/players/database?limit=2000&assigned_only=true`
        );
        const result = await response.json();

        if (!result.success) {
          throw new Error('Failed to fetch players');
        }

        const loadedPlayers: Player[] = result.data.players.map((p: any) => ({
          id: p.id || p.player_id,
          player_id: p.player_id,
          player_name: p.name || 'Unknown Player',
          team_id: p.team_id,
          team_name: p.team_name || 'Unknown Team',
          acquisition_value: p.acquisition_value || 0,
          star_rating: p.overall_rating || 70,
          position: p.position || p.position_group || 'N/A',
          season_id: userSeasonId
        }));

        // Add team names from cached data
        if (cachedTeams) {
          loadedPlayers.forEach(player => {
            if (!player.team_name) {
              const team = cachedTeams.find(t => t.id === player.team_id);
              player.team_name = team?.name || 'Unknown Team';
            }
          });
        }

        setPlayers(loadedPlayers);
      } catch (error) {
        console.error('Error loading players:', error);
        setError('Failed to load players');
      } finally {
        setLoadingPlayers(false);
      }
    };

    loadPlayers();
  }, [userSeasonId, cachedTeams]);

  // Add new swap pair
  const addSwapPair = () => {
    const newId = (Math.max(...swapPairs.map(p => parseInt(p.id))) + 1).toString();
    setSwapPairs([...swapPairs, { id: newId, player_a_id: '', player_b_id: '' }]);
  };

  // Remove swap pair
  const removeSwapPair = (id: string) => {
    if (swapPairs.length === 1) return; // Keep at least one
    setSwapPairs(swapPairs.filter(p => p.id !== id));
  };

  // Update swap pair
  const updateSwapPair = (id: string, field: 'player_a_id' | 'player_b_id', value: string) => {
    setSwapPairs(swapPairs.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  // Get selected player IDs to exclude from other selections
  const selectedPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    swapPairs.forEach(pair => {
      if (pair.player_a_id) ids.add(pair.player_a_id);
      if (pair.player_b_id) ids.add(pair.player_b_id);
    });
    return ids;
  }, [swapPairs]);

  // Get available players for a specific selection (excluding already selected)
  const getAvailablePlayers = (currentPairId: string, currentField: 'player_a_id' | 'player_b_id') => {
    const currentPair = swapPairs.find(p => p.id === currentPairId);
    const otherFieldValue = currentField === 'player_a_id' ? currentPair?.player_b_id : currentPair?.player_a_id;
    
    return players.filter(p => {
      // Exclude already selected players (except current selection)
      const currentValue = currentPair?.[currentField];
      if (selectedPlayerIds.has(p.id) && p.id !== currentValue) {
        return false;
      }
      
      // Exclude the other player in this pair
      if (otherFieldValue && p.id === otherFieldValue) {
        return false;
      }
      
      // If other player is selected, exclude same team
      if (otherFieldValue) {
        const otherPlayer = players.find(pl => pl.id === otherFieldValue);
        if (otherPlayer && p.team_id === otherPlayer.team_id) {
          return false;
        }
      }
      
      return true;
    });
  };

  // Validate all swaps
  const validateSwaps = (): string | null => {
    for (let i = 0; i < swapPairs.length; i++) {
      const pair = swapPairs[i];
      
      if (!pair.player_a_id || !pair.player_b_id) {
        return `Swap ${i + 1}: Both players must be selected`;
      }

      const playerA = players.find(p => p.id === pair.player_a_id);
      const playerB = players.find(p => p.id === pair.player_b_id);

      if (!playerA || !playerB) {
        return `Swap ${i + 1}: Invalid player selection`;
      }

      if (playerA.team_id === playerB.team_id) {
        return `Swap ${i + 1}: Players must be from different teams`;
      }
    }

    // Check for duplicate players
    const allPlayerIds = swapPairs.flatMap(p => [p.player_a_id, p.player_b_id]);
    const uniqueIds = new Set(allPlayerIds);
    if (uniqueIds.size !== allPlayerIds.length) {
      return 'Each player can only be in one swap';
    }

    return null;
  };

  // Calculate total fees preview
  const calculateFeesPreview = () => {
    const teamSwapCounts = new Map<string, number>();
    const teamFees = new Map<string, number>();
    const swapBreakdown: Array<{
      index: number;
      playerA: Player;
      playerB: Player;
      teamAFee: number;
      teamBFee: number;
      teamASwapNum: number;
      teamBSwapNum: number;
    }> = [];

    const calculateFee = (swapNumber: number): number => {
      return 0;  // Swaps are free, no fee is charged
    };

    swapPairs.forEach((pair, index) => {
      const playerA = players.find(p => p.id === pair.player_a_id);
      const playerB = players.find(p => p.id === pair.player_b_id);

      if (playerA && playerB) {
        // Increment counts
        const teamACount = (teamSwapCounts.get(playerA.team_id) || 0) + 1;
        const teamBCount = (teamSwapCounts.get(playerB.team_id) || 0) + 1;
        
        teamSwapCounts.set(playerA.team_id, teamACount);
        teamSwapCounts.set(playerB.team_id, teamBCount);

        // Calculate fees
        const teamAFee = calculateFee(teamACount);
        const teamBFee = calculateFee(teamBCount);

        teamFees.set(playerA.team_id, (teamFees.get(playerA.team_id) || 0) + teamAFee);
        teamFees.set(playerB.team_id, (teamFees.get(playerB.team_id) || 0) + teamBFee);

        swapBreakdown.push({
          index: index + 1,
          playerA,
          playerB,
          teamAFee,
          teamBFee,
          teamASwapNum: teamACount,
          teamBSwapNum: teamBCount
        });
      }
    });

    return { teamFees, teamSwapCounts, swapBreakdown };
  };

  // Handle bulk swap submission
  const handleBulkSwap = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateSwaps();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!user || !userSeasonId) return;

    const { teamFees, swapBreakdown } = calculateFeesPreview();
    const totalFee = Array.from(teamFees.values()).reduce((sum, fee) => sum + fee, 0);

    const swapSummary = swapPairs.map((pair, idx) => {
      const playerA = players.find(p => p.id === pair.player_a_id)!;
      const playerB = players.find(p => p.id === pair.player_b_id)!;
      return `${idx + 1}. ${playerA.player_name} (${playerA.team_name}, ${playerA.acquisition_value}) ↔ ${playerB.player_name} (${playerB.team_name}, ${playerB.acquisition_value})`;
    }).join('\n');

    const confirmMessage = `Perform ${swapPairs.length} swap(s)?\n\n${swapSummary}\n\nThis operation is completely free. Acquisition values will be swapped.`;

    if (!confirm(confirmMessage)) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetchWithTokenRefresh('/api/players/bulk-swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swaps: swapPairs.map(pair => ({
            player_a_id: players.find(p => p.id === pair.player_a_id)!.player_id,
            player_b_id: players.find(p => p.id === pair.player_b_id)!.player_id
          })),
          season_id: userSeasonId,
          swapped_by: user.uid,
          swapped_by_name: user.username || user.email
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to perform bulk swap');
      }

      // Show detailed success message
      const successDetails = result.data.swap_details.map((swap: any) => 
        `✅ Swap ${swap.swap_number}: ${swap.player_a.name} (${swap.player_a.old_value}→${swap.player_a.new_value}) ↔ ${swap.player_b.name} (${swap.player_b.old_value}→${swap.player_b.new_value})`
      ).join('\n');

      setSuccess(`Successfully swapped ${swapPairs.length} player pair(s)!\n\n${successDetails}`);

      // Reset form
      setSwapPairs([{ id: '1', player_a_id: '', player_b_id: '' }]);

      // Reload page after delay
      setTimeout(() => {
        window.location.reload();
      }, 3000);

    } catch (err: any) {
      setError(err.message || 'Failed to perform bulk swap');
      console.error('Bulk swap error:', err);
    } finally {
      setSubmitting(false);
    }
  };
  if (loadingPlayers || teamsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  const { teamFees, swapBreakdown } = calculateFeesPreview();

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="p-5 bg-slate-50 border border-slate-200/60 rounded-2xl font-mono text-xs">
        <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-2.5">🔄 Bulk Player Swap</h3>
        <ul className="space-y-1.5 text-slate-500">
          <li>• Swap multiple players across multiple teams at once</li>
          <li>• First 6 swaps per team are FREE, then 100/125/150</li>
          <li>• Acquisition values are swapped between players</li>
          <li>• Each player can only be in one swap</li>
        </ul>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl font-mono text-xs uppercase tracking-wide">
          <p className="font-extrabold">⚠️ Error</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl font-mono text-xs uppercase tracking-wide">
          <p className="font-extrabold">✨ Success</p>
          <pre className="whitespace-pre-wrap text-[10px] mt-2 font-mono leading-relaxed">{success}</pre>
        </div>
      )}

      {/* Bulk Swap Form */}
      <form onSubmit={handleBulkSwap} className="space-y-6">
        {/* Swap Pairs */}
        <div className="space-y-4">
          {swapPairs.map((pair, index) => {
            const playerA = players.find(p => p.id === pair.player_a_id);
            const playerB = players.find(p => p.id === pair.player_b_id);

            return (
              <div key={pair.id} className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 font-mono text-xs relative">
                <div className="flex items-center justify-between mb-3.5">
                  <h4 className="font-extrabold text-slate-800 uppercase tracking-wider">Swap Pair #{index + 1}</h4>
                  {swapPairs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSwapPair(pair.id)}
                      className="text-rose-600 hover:text-rose-800 p-1 border border-slate-200 hover:border-slate-300 rounded-lg bg-white shadow-sm transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Player A */}
                  <div>
                    <SearchablePlayerSelect
                      players={getAvailablePlayers(pair.id, 'player_a_id')}
                      value={pair.player_a_id}
                      onChange={(id) => updateSwapPair(pair.id, 'player_a_id', id)}
                      label="Player A"
                      placeholder="Select Player A..."
                      color="blue"
                      playerType="football"
                    />
                    {playerA && (
                      <div className="mt-2 text-[10px] text-slate-450 uppercase font-bold tracking-wider space-y-0.5">
                        <div>Team: <span className="text-slate-700">{playerA.team_name}</span></div>
                        <div>Value: <span className="text-amber-600">{playerA.acquisition_value} eCoin</span></div>
                      </div>
                    )}
                  </div>

                  {/* Player B */}
                  <div>
                    <SearchablePlayerSelect
                      players={getAvailablePlayers(pair.id, 'player_b_id')}
                      value={pair.player_b_id}
                      onChange={(id) => updateSwapPair(pair.id, 'player_b_id', id)}
                      label="Player B"
                      placeholder="Select Player B..."
                      color="purple"
                      playerType="football"
                    />
                    {playerB && (
                      <div className="mt-2 text-[10px] text-slate-450 uppercase font-bold tracking-wider space-y-0.5">
                        <div>Team: <span className="text-slate-700">{playerB.team_name}</span></div>
                        <div>Value: <span className="text-amber-600">{playerB.acquisition_value} eCoin</span></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add Swap Button */}
        <button
          type="button"
          onClick={addSwapPair}
          className="w-full py-3 bg-white text-slate-700 border border-dashed border-slate-200 rounded-xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2 font-mono text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Another Swap Pair
        </button>

        {/* Swap Details Preview */}
        {swapBreakdown.length > 0 && (
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 font-mono text-xs">
            <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
              📋 Bulk Swap Summary
            </h3>
            
            <div className="space-y-3 mb-4">
              {swapBreakdown.map((swap) => (
                <div key={swap.index} className="bg-white border border-slate-150 rounded-xl p-4 shadow-sm">
                  <div className="flex justify-between items-center mb-2.5">
                    <span className="font-bold text-slate-800 uppercase tracking-wider">Swap Pair #{swap.index}</span>
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">FREE ✨</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Player A */}
                    <div className="bg-slate-50/50 border border-slate-100 rounded-lg p-3">
                      <div className="font-bold text-slate-800 uppercase tracking-wide">{swap.playerA.player_name}</div>
                      <div className="text-[10px] text-slate-450 uppercase font-bold tracking-wider mt-1 space-y-0.5">
                        <div>From: <span className="text-slate-700">{swap.playerA.team_name}</span></div>
                        <div>To: <span className="text-slate-700">{swap.playerB.team_name}</span></div>
                        <div>Value: <span className="text-amber-600">{swap.playerA.acquisition_value} → {swap.playerB.acquisition_value}</span></div>
                      </div>
                    </div>

                    {/* Player B */}
                    <div className="bg-slate-50/50 border border-slate-100 rounded-lg p-3">
                      <div className="font-bold text-slate-800 uppercase tracking-wide">{swap.playerB.player_name}</div>
                      <div className="text-[10px] text-slate-450 uppercase font-bold tracking-wider mt-1 space-y-0.5">
                        <div>From: <span className="text-slate-700">{swap.playerB.team_name}</span></div>
                        <div>To: <span className="text-slate-700">{swap.playerA.team_name}</span></div>
                        <div>Value: <span className="text-amber-600">{swap.playerB.acquisition_value} → {swap.playerA.acquisition_value}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting || !swapPairs.every(p => p.player_a_id && p.player_b_id)}
          className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold font-mono text-xs uppercase tracking-wider rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md cursor-pointer text-center"
        >
          {submitting ? 'Processing Bulk Swap...' : `🔄 Swap ${swapPairs.length} Player Pair(s)`}
        </button>
      </form>
    </div>
  );
}
