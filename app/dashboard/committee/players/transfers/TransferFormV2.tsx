'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useCachedTeams } from '@/hooks/useCachedData';
import { calculateTransferDetails, TransferCalculation } from '@/lib/player-transfers-v2-utils';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import SearchablePlayerSelect from '@/components/ui/SearchablePlayerSelect';

interface Player {
  id: string;
  player_id: string;
  player_name: string;
  team_id: string;
  team_name?: string;
  auction_value: number;
  star_rating: number;
  points: number;
  season_id: string;
  type: 'real' | 'football';
}

interface TransferFormV2Props {
  playerType: 'real' | 'football';
  onSuccess?: () => void;
}

export default function TransferFormV2({ playerType, onSuccess }: TransferFormV2Props) {
  const { user, userSeasonId } = usePermissions();
  const { data: cachedTeams, isLoading: teamsLoading } = useCachedTeams(userSeasonId);

  // Form state
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [newTeamId, setNewTeamId] = useState('');
  const [searchPlayer, setSearchPlayer] = useState('');
  
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
  const [calculation, setCalculation] = useState<TransferCalculation | null>(null);

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
            star_rating: p.star_rating || 5,
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

  // Get filtered players based on search
  const filteredPlayers = useMemo(() => {
    if (!searchPlayer) return players;
    const searchLower = searchPlayer.toLowerCase();
    return players.filter(p => 
      p.player_name.toLowerCase().includes(searchLower) ||
      p.team_name?.toLowerCase().includes(searchLower)
    );
  }, [players, searchPlayer]);

  // Get selected player
  const selectedPlayer = useMemo(() => {
    return players.find(p => p.id === selectedPlayerId);
  }, [players, selectedPlayerId]);

  // Get available teams (exclude current team)
  const availableTeams = useMemo(() => {
    if (!cachedTeams || !selectedPlayer) return [];
    return cachedTeams.filter(t => t.id !== selectedPlayer.team_id);
  }, [cachedTeams, selectedPlayer]);

  // Fetch transfer limit for selling team
  useEffect(() => {
    const fetchTransferLimit = async () => {
      if (!selectedPlayer || !userSeasonId) return;

      try {
        const response = await fetchWithTokenRefresh(
          `/api/players/transfer-limits?team_id=${selectedPlayer.team_id}&season_id=${userSeasonId}`
        );
        
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.warn('Transfer limits API not available or returned non-JSON response');
          return;
        }
        
        const result = await response.json();
        
        if (result.success) {
          setTransferLimits(prev => ({
            ...prev,
            [selectedPlayer.team_id]: {
              used: result.transfers_used || 0,
              remaining: result.transfers_remaining || 2
            }
          }));
        }
      } catch (error) {
        console.error('Error fetching transfer limit:', error);
        // Don't show error to user, just log it
      }
    };

    fetchTransferLimit();
  }, [selectedPlayer, userSeasonId]);

  // Fetch team balances
  useEffect(() => {
    const fetchBalances = async () => {
      if (!newTeamId || !userSeasonId) return;

      try {
        // Fetch buying team balance (pass player_type to get correct balance)
        const response = await fetchWithTokenRefresh(
          `/api/teams/${newTeamId}/balance?season_id=${userSeasonId}&player_type=${playerType}`
        );
        
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.warn('Team balance API not available or returned non-JSON response');
          return;
        }
        
        const result = await response.json();
        
        if (result.success && result.data) {
          setTeamBalances(prev => ({
            ...prev,
            [newTeamId]: result.data.balance
          }));
        }
      } catch (error) {
        console.error('Error fetching team balance:', error);
        // Don't show error to user, just log it
      }
    };

    fetchBalances();
  }, [newTeamId, userSeasonId]);

  // Calculate transfer details when player and team are selected
  useEffect(() => {
    if (!selectedPlayer || !newTeamId) {
      setCalculation(null);
      return;
    }

    try {
      const calc = calculateTransferDetails(
        selectedPlayer.auction_value,
        selectedPlayer.star_rating,
        selectedPlayer.points,
        selectedPlayer.type
      );
      setCalculation(calc);
    } catch (error) {
      console.error('Error calculating transfer:', error);
      setCalculation(null);
    }
  }, [selectedPlayer, newTeamId]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPlayer || !newTeamId || !user || !userSeasonId) return;

    // Confirm transfer
    const buyingTeam = availableTeams.find(t => t.id === newTeamId);
    if (!buyingTeam) return;

    const confirmMessage = calculation 
      ? `Transfer ${selectedPlayer.player_name} to ${buyingTeam.name}?\n\n` +
        `New Value: $${calculation.newValue.toFixed(2)}\n` +
        `${buyingTeam.name} pays: $${calculation.buyingTeamPays.toFixed(2)}\n` +
        `${sellingTeamName} receives: $${calculation.sellingTeamReceives.toFixed(2)}\n` +
        `Committee fee: $${calculation.committeeFee.toFixed(2)}`
      : `Transfer ${selectedPlayer.player_name} to ${buyingTeam.name}?`;

    if (!confirm(confirmMessage)) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetchWithTokenRefresh('/api/players/transfer-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: selectedPlayer.player_id,
          player_type: playerType,
          new_team_id: newTeamId,
          season_id: userSeasonId,
          transferred_by: user.uid,
          transferred_by_name: user.username || user.email
        })
      });

      const result = await response.json();

      if (!result.success) {
        // Handle specific error codes
        let errorMessage = result.error || 'Failed to transfer player';
        
        switch (result.errorCode) {
          case 'TRANSFER_LIMIT_EXCEEDED':
            errorMessage = `Transfer limit exceeded: ${result.error}`;
            break;
          case 'INSUFFICIENT_FUNDS':
            errorMessage = `Insufficient funds: ${result.error}`;
            break;
          case 'PLAYER_NOT_FOUND':
            errorMessage = 'Player not found or not available for transfer';
            break;
          case 'SAME_TEAM':
            errorMessage = 'Cannot transfer player to the same team';
            break;
          case 'SYSTEM_ERROR':
            errorMessage = `System error: ${result.error}. Please try again or contact support.`;
            break;
        }
        
        throw new Error(errorMessage);
      }

      // Build detailed success message
      const calc = result.calculation;
      let successMessage = `✅ ${selectedPlayer.player_name} successfully transferred to ${buyingTeam.name}!`;
      
      if (calc) {
        successMessage += `\n\nTransaction Details:`;
        successMessage += `\n• New Value: $${calc.newValue.toFixed(2)}`;
        successMessage += `\n• ${buyingTeam.name} paid: $${calc.buyingTeamPays.toFixed(2)}`;
        successMessage += `\n• ${sellingTeamName} received: $${calc.sellingTeamReceives.toFixed(2)}`;
        successMessage += `\n• Committee fee: $${calc.committeeFee.toFixed(2)}`;
        
        if (calc.newStarRating > selectedPlayer.star_rating) {
          successMessage += `\n• ⭐ Star rating upgraded: ${selectedPlayer.star_rating}⭐ → ${calc.newStarRating}⭐`;
        }
      }
      
      setSuccess(successMessage);
      
      // Reset form
      setSelectedPlayerId('');
      setNewTeamId('');
      setCalculation(null);
      setTransferLimits({});
      setTeamBalances({});
      
      // Call success callback
      if (onSuccess) {
        onSuccess();
      }
      
      // Reload page after delay to show success message
      setTimeout(() => {
        window.location.reload();
      }, 3000);
      
    } catch (err: any) {
      setError(err.message || 'Failed to transfer player');
      console.error('Transfer error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Get buying team balance
  const buyingTeamBalance = newTeamId ? teamBalances[newTeamId] : undefined;
  const hasInsufficientFunds = calculation && buyingTeamBalance !== undefined && buyingTeamBalance < calculation.buyingTeamPays;

  // Get selling team transfer limit
  const sellingTeamLimit = selectedPlayer ? transferLimits[selectedPlayer.team_id] : undefined;
  const sellingTeamName = selectedPlayer?.team_name || 'Team';
  const buyingTeamName = availableTeams.find(t => t.id === newTeamId)?.name || 'Team';
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Player Selection */}
        <SearchablePlayerSelect
          players={players}
          value={selectedPlayerId}
          onChange={(id) => {
            setSelectedPlayerId(id);
            setNewTeamId(''); // Reset team selection
          }}
          label="Select Player to Transfer"
          placeholder="Select player..."
          color="blue"
        />

        {/* Current Player Info (Read-only) */}
        {selectedPlayer && (
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 font-mono text-xs">
            <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-3.5">Current Player Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Team</span>
                <p className="font-extrabold text-slate-800 uppercase mt-0.5">{selectedPlayer.team_name}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Value</span>
                <p className="font-extrabold text-amber-600 mt-0.5">${selectedPlayer.auction_value}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Star Rating</span>
                <p className="font-extrabold text-slate-800 mt-0.5">{'⭐'.repeat(selectedPlayer.star_rating || 0)}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Points</span>
                <p className="font-extrabold text-slate-800 mt-0.5">{selectedPlayer.points}</p>
              </div>
            </div>
          </div>
        )}

        {/* Transfer Limit Display */}
        {selectedPlayer && sellingTeamLimit && (
          <div className={`p-4 rounded-2xl border font-mono text-xs uppercase tracking-wide ${
            sellingTeamLimit.remaining > 0 
              ? 'bg-slate-50 border-slate-200' 
              : 'bg-rose-50 border-rose-200 text-rose-705'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-500">
                {sellingTeamName} Slots:
              </span>
              <span className={`font-black text-xs ${
                sellingTeamLimit.remaining > 0 ? 'text-slate-800' : 'text-rose-600'
              }`}>
                {sellingTeamLimit.remaining} / 2 remaining
              </span>
            </div>
            {sellingTeamLimit.remaining === 0 && (
              <p className="text-[10px] text-rose-600 font-bold mt-2">
                ⚠️ Warning: Zero transfer slots remaining
              </p>
            )}
          </div>
        )}

        {/* New Team Selection */}
        {selectedPlayer && (
          <div className="font-mono text-xs">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              New Team
            </label>
            <div className="relative">
              <select
                value={newTeamId}
                onChange={(e) => setNewTeamId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white uppercase font-bold tracking-wider appearance-none cursor-pointer outline-none"
                required
              >
                <option value="">-- Select Target Team --</option>
                {availableTeams.map(team => (
                  <option key={team.id} value={team.id}>
                    {team.team_name || team.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* Real-time Calculation Preview */}
        {calculation && selectedPlayer && newTeamId && (
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 font-mono text-xs">
            <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
              📊 Transfer Preview
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Player Value Details */}
              <div className="bg-white border border-slate-150 rounded-xl p-4 shadow-sm">
                <h4 className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mb-3">Value Appreciation</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Original Value:</span>
                    <span className="font-bold text-slate-800">${calculation.originalValue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Multiplier:</span>
                    <span className="font-extrabold text-amber-600">{(calculation.starMultiplier * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                    <span className="font-extrabold text-slate-800">New Value:</span>
                    <span className="font-black text-emerald-650">${calculation.newValue.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Committee Fee */}
              <div className="bg-white border border-slate-150 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mb-3">Committee Fee (10%)</h4>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Fee Amount:</span>
                    <span className="font-extrabold text-rose-600">${calculation.committeeFee.toFixed(2)}</span>
                  </div>
                </div>
                {calculation.newStarRating > selectedPlayer.star_rating && (
                  <div className="bg-amber-50/50 border border-amber-200/50 rounded-lg p-2 mt-3 text-[10px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5 justify-center">
                    ⭐ Upgraded to {calculation.newStarRating}⭐ (+{calculation.pointsAdded} Points)
                  </div>
                )}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="mt-4 bg-white border border-slate-150 rounded-xl p-4 shadow-sm">
              <h4 className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mb-3">Budget Impact Summary</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Buying Team */}
                <div className="bg-rose-50/50 border border-rose-100 rounded-lg p-3">
                  <div className="text-[9px] font-bold text-slate-450 uppercase mb-1">{buyingTeamName} (Buying)</div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-slate-500">Total Cost:</span>
                    <span className="font-black text-rose-600">-${calculation.buyingTeamPays.toFixed(2)}</span>
                  </div>
                  {buyingTeamBalance !== undefined && (
                    <div className="space-y-1 text-[10px] pt-1.5 border-t border-rose-200/40">
                      <div className="flex justify-between text-slate-500">
                        <span>Balance:</span>
                        <span>${buyingTeamBalance.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>Remaining:</span>
                        <span className={buyingTeamBalance - calculation.buyingTeamPays >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          ${(buyingTeamBalance - calculation.buyingTeamPays).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Selling Team */}
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-3 flex flex-col justify-between">
                  <div>
                    <div className="text-[9px] font-bold text-slate-450 uppercase mb-1">{sellingTeamName} (Selling)</div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Receives:</span>
                      <span className="font-black text-emerald-600">+${calculation.sellingTeamReceives.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="text-[9px] text-slate-450 uppercase tracking-wider mt-2.5">
                    *After 10% fee deduction
                  </div>
                </div>
              </div>
            </div>

            {/* Warnings */}
            {hasInsufficientFunds && (
              <div className="mt-4 bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700">
                <p className="font-extrabold">⚠️ Insufficient Budget</p>
                <p className="text-[10px] mt-1 font-bold">
                  {buyingTeamName} has ${buyingTeamBalance?.toFixed(2)} but needs ${calculation.buyingTeamPays.toFixed(2)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!selectedPlayerId || !newTeamId || submitting || hasInsufficientFunds || (sellingTeamLimit?.remaining === 0)}
          className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold font-mono text-xs uppercase tracking-wider rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md cursor-pointer text-center"
        >
          {submitting ? 'Processing Transfer...' : 'Execute Player Transfer'}
        </button>
      </form>
    </div>
  );
}
