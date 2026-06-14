'use client';
import { CheckCircle, AlertTriangle, BarChart2 } from 'lucide-react';

import { useState, useEffect, useMemo } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useCachedTeams } from '@/hooks/useCachedData';
import { calculateSwapDetails, SwapCalculation, validateCashAmount } from '@/lib/player-transfers-v2-utils-categories';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import SearchablePlayerSelect from '@/components/ui/SearchablePlayerSelect';

interface Player {
  id: string;
  player_id: string;
  player_name: string;
  team_id: string;
  team_name?: string;
  auction_value: number;
  category: string;
  points: number;
  season_id: string;
  type: 'real' | 'football';
}

interface SwapFormV2Props {
  playerType: 'real' | 'football';
  onSuccess?: () => void;
}

export default function SwapFormV2({ playerType, onSuccess }: SwapFormV2Props) {
  const { user, userSeasonId } = usePermissions();
  const { data: cachedTeams, isLoading: teamsLoading } = useCachedTeams(userSeasonId);

  // Form state
  const [selectedPlayerAId, setSelectedPlayerAId] = useState('');
  const [selectedPlayerBId, setSelectedPlayerBId] = useState('');
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [cashDirection, setCashDirection] = useState<'A_to_B' | 'B_to_A' | 'none'>('none');
  const [searchPlayerA, setSearchPlayerA] = useState('');
  const [searchPlayerB, setSearchPlayerB] = useState('');
  
  // Data state
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [transferLimits, setTransferLimits] = useState<Record<string, { used: number; remaining: number }>>({});
  const [teamBalances, setTeamBalances] = useState<Record<string, number>>({});
  
  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Calculation preview
  const [calculation, setCalculation] = useState<SwapCalculation | null>(null);
  const [cashValidation, setCashValidation] = useState<{ valid: boolean; maxAllowed: number; message?: string } | null>(null);

  // Load players
  useEffect(() => {
    const loadPlayers = async () => {
      if (!userSeasonId) return;

      setLoadingPlayers(true);
      try {
        const endpoint = playerType === 'real' 
          ? `/api/stats/players?seasonId=${userSeasonId}&limit=1000`
          : `/api/football-players?seasonId=${userSeasonId}&limit=1000`;
        
        const response = await fetchWithTokenRefresh(endpoint);
        const result = await response.json();
        
        if (!result.success) {
          throw new Error('Failed to fetch players');
        }
        
        const loadedPlayers: Player[] = result.data
          .filter((p: any) => p.team_id && p.status !== 'free_agent')
          .map((p: any) => ({
            id: p.id || `${p.player_id}_${userSeasonId}`,
            player_id: p.player_id,
            player_name: p.player_name || p.name || 'Unknown',
            team_id: p.team_id,
            team_name: p.team || p.team_name,
            auction_value: p.auction_value || 0,
            category: p.category || 'Bronze',
            points: p.points || 180,
            season_id: userSeasonId,
            type: playerType
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
  }, [userSeasonId, cachedTeams, playerType]);

  // Get filtered players for Player A based on search
  const filteredPlayersA = useMemo(() => {
    if (!searchPlayerA) return players;
    const searchLower = searchPlayerA.toLowerCase();
    return players.filter(p => 
      p.player_name.toLowerCase().includes(searchLower) ||
      p.team_name?.toLowerCase().includes(searchLower)
    );
  }, [players, searchPlayerA]);

  // Get selected players
  const selectedPlayerA = useMemo(() => {
    return players.find(p => p.id === selectedPlayerAId);
  }, [players, selectedPlayerAId]);

  const selectedPlayerB = useMemo(() => {
    return players.find(p => p.id === selectedPlayerBId);
  }, [players, selectedPlayerBId]);

  // Get available players for Player B (exclude Player A's team)
  const availablePlayersForB = useMemo(() => {
    if (!selectedPlayerA) return players;
    return players.filter(p => p.team_id !== selectedPlayerA.team_id);
  }, [players, selectedPlayerA]);

  // Get filtered players for Player B based on search
  const filteredPlayersB = useMemo(() => {
    if (!searchPlayerB) return availablePlayersForB;
    const searchLower = searchPlayerB.toLowerCase();
    return availablePlayersForB.filter(p => 
      p.player_name.toLowerCase().includes(searchLower) ||
      p.team_name?.toLowerCase().includes(searchLower)
    );
  }, [availablePlayersForB, searchPlayerB]);

  // Fetch transfer limits for both teams
  useEffect(() => {
    const fetchTransferLimits = async () => {
      if (!userSeasonId) return;
      
      const teamsToFetch = new Set<string>();
      if (selectedPlayerA) teamsToFetch.add(selectedPlayerA.team_id);
      if (selectedPlayerB) teamsToFetch.add(selectedPlayerB.team_id);
      
      for (const teamId of teamsToFetch) {
        if (transferLimits[teamId]) continue; // Already fetched
        
        try {
          const response = await fetchWithTokenRefresh(
            `/api/players/transfer-limits?team_id=${teamId}&season_id=${userSeasonId}`
          );
          
          // Check if response is JSON
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            console.warn('Transfer limits API not available or returned non-JSON response');
            continue;
          }
          
          const result = await response.json();
          
          if (result.success) {
            setTransferLimits(prev => ({
              ...prev,
              [teamId]: {
                used: result.transfers_used || 0,
                remaining: result.transfers_remaining || 2
              }
            }));
          }
        } catch (error) {
          console.error('Error fetching transfer limit:', error);
          // Don't show error to user, just log it
        }
      }
    };

    fetchTransferLimits();
  }, [selectedPlayerA, selectedPlayerB, userSeasonId, transferLimits]);

  // Fetch team balances for both teams
  useEffect(() => {
    const fetchBalances = async () => {
      if (!userSeasonId) return;
      
      const teamsToFetch = new Set<string>();
      if (selectedPlayerA) teamsToFetch.add(selectedPlayerA.team_id);
      if (selectedPlayerB) teamsToFetch.add(selectedPlayerB.team_id);
      
      for (const teamId of teamsToFetch) {
        if (teamBalances[teamId] !== undefined) continue; // Already fetched
        
        try {
          const response = await fetchWithTokenRefresh(
            `/api/teams/${teamId}/balance?season_id=${userSeasonId}&player_type=${playerType}`
          );
          
          // Check if response is JSON
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            console.warn('Team balance API not available or returned non-JSON response');
            continue;
          }
          
          const result = await response.json();
          
          if (result.success && result.data) {
            setTeamBalances(prev => ({
              ...prev,
              [teamId]: result.data.balance
            }));
          }
        } catch (error) {
          console.error('Error fetching team balance:', error);
          // Don't show error to user, just log it
        }
      }
    };

    fetchBalances();
  }, [selectedPlayerA, selectedPlayerB, userSeasonId, teamBalances]);

  // Validate cash amount when it changes
  useEffect(() => {
    if (cashAmount > 0 && selectedPlayerA && selectedPlayerB) {
      const maxPlayerValue = Math.max(selectedPlayerA.auction_value, selectedPlayerB.auction_value);
      const validation = validateCashAmount(cashAmount, maxPlayerValue);
      setCashValidation(validation);
    } else {
      setCashValidation(null);
    }
  }, [cashAmount, selectedPlayerA, selectedPlayerB]);

  // Calculate swap details when both players are selected
  useEffect(() => {
    if (!selectedPlayerA || !selectedPlayerB) {
      setCalculation(null);
      return;
    }

    // Validate players are from different teams
    if (selectedPlayerA.team_id === selectedPlayerB.team_id) {
      setError('Cannot swap players from the same team');
      setCalculation(null);
      return;
    }

    try {
      const calc = calculateSwapDetails(
        {
          value: selectedPlayerA.auction_value,
          category: selectedPlayerA.category,
          points: selectedPlayerA.points,
          type: selectedPlayerA.type
        },
        {
          value: selectedPlayerB.auction_value,
          category: selectedPlayerB.category,
          points: selectedPlayerB.points,
          type: selectedPlayerB.type
        },
        cashDirection === 'B_to_A' ? -cashAmount : cashAmount
      );
      setCalculation(calc);
      setError(null);
    } catch (error: any) {
      console.error('Error calculating swap:', error);
      setError(error.message || 'Failed to calculate swap');
      setCalculation(null);
    }
  }, [selectedPlayerA, selectedPlayerB, cashAmount, cashDirection]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPlayerA || !selectedPlayerB || !user || !userSeasonId || !calculation) return;

    // Validate same team
    if (selectedPlayerA.team_id === selectedPlayerB.team_id) {
      setError('Cannot swap players from the same team');
      return;
    }

    let confirmMessage = `Swap ${selectedPlayerA.player_name} (${teamAName}) &harr; ${selectedPlayerB.player_name} (${teamBName})?\n\n`;
    confirmMessage += `This swap is completely free. No fees or cash transfers will be made.`;

    if (!confirm(confirmMessage)) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetchWithTokenRefresh('/api/players/swap-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_a_id: selectedPlayerA.player_id,
          player_a_type: playerType,
          player_b_id: selectedPlayerB.player_id,
          player_b_type: playerType,
          cash_amount: cashAmount,
          cash_direction: cashDirection,
          season_id: userSeasonId,
          swapped_by: user.uid,
          swapped_by_name: user.username || user.email
        })
      });

      const result = await response.json();

      if (!result.success) {
        // Handle specific error codes
        let errorMessage = result.error || 'Failed to swap players';
        
        switch (result.errorCode) {
          case 'TRANSFER_LIMIT_EXCEEDED':
            errorMessage = `Transfer limit exceeded: ${result.error}`;
            break;
          case 'INSUFFICIENT_FUNDS':
            errorMessage = `Insufficient funds: ${result.error}`;
            break;
          case 'INVALID_CASH_AMOUNT':
            errorMessage = `Invalid cash amount: ${result.error}`;
            break;
          case 'SAME_TEAM_SWAP':
            errorMessage = 'Cannot swap players from the same team';
            break;
          case 'PLAYER_NOT_FOUND':
            errorMessage = 'One or both players not found';
            break;
          case 'SYSTEM_ERROR':
            errorMessage = `System error: ${result.error}. Please try again or contact support.`;
            break;
        }
        
        throw new Error(errorMessage);
      }

      // Build detailed success message
      const calc = result.calculation;
      let successMessage = `<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Player swap completed successfully!\n\n`;
      successMessage += `${selectedPlayerA.player_name} &rarr; ${teamBName}\n`;
      successMessage += `${selectedPlayerB.player_name} &rarr; ${teamAName}\n`;
      
      if (calc) {
        // Show category upgrades
        if (calc.playerA.newCategory !== selectedPlayerA.category) {
          successMessage += `\n• 🏷️ ${selectedPlayerA.player_name}: ${selectedPlayerA.category} &rarr; ${calc.playerA.newCategory}`;
        }
        if (calc.playerB.newCategory !== selectedPlayerB.category) {
          successMessage += `\n• 🏷️ ${selectedPlayerB.player_name}: ${selectedPlayerB.category} &rarr; ${calc.playerB.newCategory}`;
        }
      }
      
      setSuccess(successMessage);
      
      // Reset form
      setSelectedPlayerAId('');
      setSelectedPlayerBId('');
      setCashAmount(0);
      setCashDirection('none');
      setCalculation(null);
      setTransferLimits({});
      setTeamBalances({});
      setCashValidation(null);
      
      // Call success callback
      if (onSuccess) {
        onSuccess();
      }
      
      // Reload page after delay to show success message
      setTimeout(() => {
        window.location.reload();
      }, 3000);
      
    } catch (err: any) {
      setError(err.message || 'Failed to swap players');
      console.error('Swap error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Get team names
  const teamAName = selectedPlayerA?.team_name || 'Team A';
  const teamBName = selectedPlayerB?.team_name || 'Team B';

  // Get team balances
  const teamABalance = selectedPlayerA ? teamBalances[selectedPlayerA.team_id] : undefined;
  const teamBBalance = selectedPlayerB ? teamBalances[selectedPlayerB.team_id] : undefined;

  // Get transfer limits
  const teamALimit = selectedPlayerA ? transferLimits[selectedPlayerA.team_id] : undefined;
  const teamBLimit = selectedPlayerB ? transferLimits[selectedPlayerB.team_id] : undefined;

  // Check for insufficient funds
  const teamAHasInsufficientFunds = calculation && teamABalance !== undefined && teamABalance < calculation.teamAPays;
  const teamBHasInsufficientFunds = calculation && teamBBalance !== undefined && teamBBalance < calculation.teamBPays;
  const hasInsufficientFunds = teamAHasInsufficientFunds || teamBHasInsufficientFunds;

  // Check for transfer limit exceeded
  const teamALimitExceeded = teamALimit && teamALimit.remaining === 0;
  const teamBLimitExceeded = teamBLimit && teamBLimit.remaining === 0;
  const limitExceeded = teamALimitExceeded || teamBLimitExceeded;

  // Calculate max cash allowed
  const maxCashAllowed = useMemo(() => {
    if (!selectedPlayerA || !selectedPlayerB) return 0;
    const maxPlayerValue = Math.max(selectedPlayerA.auction_value, selectedPlayerB.auction_value);
    return Math.round(maxPlayerValue * 0.30 * 100) / 100;
  }, [selectedPlayerA, selectedPlayerB]);
  if (loadingPlayers || teamsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl font-mono text-xs uppercase tracking-wide">
          <p className="font-extrabold"><AlertTriangle className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Error</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl font-mono text-xs uppercase tracking-wide">
          <p className="font-extrabold">✨ Success</p>
          <pre className="whitespace-pre-wrap text-[10px] mt-2 font-mono leading-relaxed">{success}</pre>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Player A Selection */}
        <SearchablePlayerSelect
          players={players}
          value={selectedPlayerAId}
          onChange={(id) => {
            setSelectedPlayerAId(id);
            setSelectedPlayerBId(''); // Reset Player B selection
          }}
          label="Team A Player"
          placeholder="Select Player A..."
          color="blue"
        />

        {/* Team A Info */}
        {selectedPlayerA && (
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 font-mono text-xs">
            <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-3.5">Team A: {teamAName}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Player</span>
                <p className="font-extrabold text-slate-800 uppercase mt-0.5">{selectedPlayerA.player_name}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Value</span>
                <p className="font-extrabold text-amber-600 mt-0.5">${selectedPlayerA.auction_value}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category</span>
                <p className="font-extrabold text-slate-800 uppercase mt-0.5">{selectedPlayerA.category}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Balance</span>
                <p className="font-extrabold text-slate-800 mt-0.5">
                  {teamABalance !== undefined ? `$${teamABalance.toFixed(2)}` : 'Loading...'}
                </p>
              </div>
            </div>
            {teamALimit && (
              <div className={`mt-3 p-2.5 rounded-xl border text-[10px] uppercase font-bold tracking-wider text-center ${
                teamALimit.remaining > 0 ? 'bg-white border-slate-200 text-slate-650' : 'bg-rose-50 border-rose-200 text-rose-600'
              }`}>
                Transfer Slots: {teamALimit.remaining} / 2 remaining
              </div>
            )}
          </div>
        )}

        {/* Player B Selection */}
        {selectedPlayerA && (
          <SearchablePlayerSelect
            players={availablePlayersForB}
            value={selectedPlayerBId}
            onChange={setSelectedPlayerBId}
            label="Team B Player (from different team)"
            placeholder="Select Player B..."
            color="purple"
          />
        )}

        {/* Team B Info */}
        {selectedPlayerB && (
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 font-mono text-xs">
            <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-3.5">Team B: {teamBName}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Player</span>
                <p className="font-extrabold text-slate-800 uppercase mt-0.5">{selectedPlayerB.player_name}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Value</span>
                <p className="font-extrabold text-amber-600 mt-0.5">${selectedPlayerB.auction_value}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category</span>
                <p className="font-extrabold text-slate-800 uppercase mt-0.5">{selectedPlayerB.category}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Balance</span>
                <p className="font-extrabold text-slate-800 mt-0.5">
                  {teamBBalance !== undefined ? `$${teamBBalance.toFixed(2)}` : 'Loading...'}
                </p>
              </div>
            </div>
            {teamBLimit && (
              <div className={`mt-3 p-2.5 rounded-xl border text-[10px] uppercase font-bold tracking-wider text-center ${
                teamBLimit.remaining > 0 ? 'bg-white border-slate-200 text-slate-650' : 'bg-rose-50 border-rose-200 text-rose-600'
              }`}>
                Transfer Slots: {teamBLimit.remaining} / 2 remaining
              </div>
            )}
          </div>
        )}

        {/* Real-time Calculation Preview */}
        {calculation && selectedPlayerA && selectedPlayerB && (
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 font-mono text-xs">
            <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Swap Preview
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Player A Details */}
              <div className="bg-white border border-slate-150 rounded-xl p-4 shadow-sm">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-3 flex items-center gap-1">
                  👤 {selectedPlayerA.player_name}
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Value:</span>
                    <span className="font-bold text-slate-800">${calculation.playerA.originalValue.toFixed(2)} &rarr; ${calculation.playerA.newValue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Category:</span>
                    <span className={`font-extrabold ${calculation.playerA.newCategory !== selectedPlayerA.category ? 'text-amber-600' : 'text-slate-800'}`}>
                      {selectedPlayerA.category} &rarr; {calculation.playerA.newCategory}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Points:</span>
                    <span className="font-bold text-slate-800">
                      {selectedPlayerA.points} &rarr; {selectedPlayerA.points + calculation.playerA.pointsAdded}
                    </span>
                  </div>
                  {calculation.playerA.pointsAdded > 0 && (
                    <div className="bg-amber-50/50 border border-amber-200/50 rounded-lg p-1.5 text-[10px] font-bold text-center text-amber-800 uppercase tracking-wider mt-1">
                      +{calculation.playerA.pointsAdded} Points Added
                    </div>
                  )}
                </div>
              </div>

              {/* Player B Details */}
              <div className="bg-white border border-slate-150 rounded-xl p-4 shadow-sm">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-3 flex items-center gap-1">
                  👤 {selectedPlayerB.player_name}
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Value:</span>
                    <span className="font-bold text-slate-800">${calculation.playerB.originalValue.toFixed(2)} &rarr; ${calculation.playerB.newValue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Category:</span>
                    <span className={`font-extrabold ${calculation.playerB.newCategory !== selectedPlayerB.category ? 'text-amber-600' : 'text-slate-800'}`}>
                      {selectedPlayerB.category} &rarr; {calculation.playerB.newCategory}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Points:</span>
                    <span className="font-bold text-slate-800">
                      {selectedPlayerB.points} &rarr; {selectedPlayerB.points + calculation.playerB.pointsAdded}
                    </span>
                  </div>
                  {calculation.playerB.pointsAdded > 0 && (
                    <div className="bg-amber-50/50 border border-amber-200/50 rounded-lg p-1.5 text-[10px] font-bold text-center text-amber-800 uppercase tracking-wider mt-1">
                      +{calculation.playerB.pointsAdded} Points Added
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Free Swap Info Banner */}
            <div className="mt-4 bg-white border border-slate-150 rounded-xl p-4 shadow-sm text-center">
              <span className="text-xs font-black text-emerald-600 uppercase tracking-wider">🆓 Free Player Swap</span>
              <p className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mt-1">
                This operation is free of swap charges. Budgets remain untouched.
              </p>
            </div>

            {/* Warnings */}
            {limitExceeded && (
              <div className="mt-4 bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700">
                <p className="font-extrabold"><AlertTriangle className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Limit Exceeded</p>
                <p className="text-[10px] mt-1 font-bold">
                  {teamALimitExceeded && `${teamAName} has no transfer slots left. `}
                  {teamBLimitExceeded && `${teamBName} has no transfer slots left.`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!selectedPlayerAId || !selectedPlayerBId || submitting || hasInsufficientFunds || limitExceeded}
          className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold font-mono text-xs uppercase tracking-wider rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md cursor-pointer text-center"
        >
          {submitting ? 'Processing Swap...' : 'Execute Player Swap'}
        </button>
      </form>
    </div>
  );
}
