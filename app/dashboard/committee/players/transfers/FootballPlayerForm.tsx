'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useCachedTeams } from '@/hooks/useCachedData';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import SearchablePlayerSelect from '@/components/ui/SearchablePlayerSelect';

interface Player {
  id: string;
  player_id: string;
  player_name: string;
  team_id: string;
  team_name?: string;
  acquisition_value: number;
  star_rating: number;
  position: string;
  contract_start_season?: string;
  contract_end_season?: string;
  season_id: string;
}

type OperationType = 'swap';

export default function FootballPlayerForm() {
  const { user, userSeasonId } = usePermissions();
  const { data: cachedTeams, isLoading: teamsLoading } = useCachedTeams(userSeasonId);

  // Form state - Only swap is supported now (release moved to separate form)
  const [operationType] = useState<OperationType>('swap');
  const [selectedPlayerAId, setSelectedPlayerAId] = useState('');
  const [selectedPlayerBId, setSelectedPlayerBId] = useState('');
  const [searchPlayerA, setSearchPlayerA] = useState('');
  const [searchPlayerB, setSearchPlayerB] = useState('');

  // Data state
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [swapLimits, setSwapLimits] = useState<Record<string, any>>({});

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

        const loadedPlayers: Player[] = result.data.players
          .map((p: any) => {
            console.log('Player data:', { name: p.name, position: p.position, acquisition_value: p.acquisition_value });
            return {
              id: p.id || p.player_id,
              player_id: p.player_id,
              player_name: p.name || 'Unknown Player',
              team_id: p.team_id,
              team_name: p.team_name || 'Unknown Team',
              acquisition_value: p.acquisition_value || 0,
              star_rating: p.overall_rating || 70,
              position: p.position || p.position_group || 'N/A',
              contract_start_season: p.contract_start_season || 'N/A',
              contract_end_season: p.contract_end_season || 'N/A',
              season_id: userSeasonId
            };
          });

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

  // Get selected players
  const selectedPlayerA = useMemo(() => {
    return players.find(p => p.id === selectedPlayerAId);
  }, [players, selectedPlayerAId]);

  const selectedPlayerB = useMemo(() => {
    return players.find(p => p.id === selectedPlayerBId);
  }, [players, selectedPlayerBId]);

  // Get filtered players for Player A based on search
  const filteredPlayersA = useMemo(() => {
    if (!searchPlayerA) return players;
    const searchLower = searchPlayerA.toLowerCase();
    return players.filter(p =>
      p.player_name.toLowerCase().includes(searchLower) ||
      p.team_name?.toLowerCase().includes(searchLower)
    );
  }, [players, searchPlayerA]);

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

  // Fetch swap limits for both teams
  useEffect(() => {
    const fetchSwapLimits = async () => {
      if (!userSeasonId) return;

      const teamsToFetch = new Set<string>();
      if (selectedPlayerA) teamsToFetch.add(selectedPlayerA.team_id);
      if (selectedPlayerB) teamsToFetch.add(selectedPlayerB.team_id);

      for (const teamId of teamsToFetch) {
        if (swapLimits[teamId]) continue; // Already fetched

        try {
          const response = await fetchWithTokenRefresh(
            `/api/players/football-swap-limits?team_id=${teamId}&season_id=${userSeasonId}`
          );

          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            console.warn('Swap limits API not available');
            continue;
          }

          const result = await response.json();

          if (result.success) {
            setSwapLimits(prev => ({
              ...prev,
              [teamId]: result.data
            }));
          }
        } catch (error) {
          console.error('Error fetching swap limits:', error);
        }
      }
    };

    fetchSwapLimits();
  }, [selectedPlayerA, selectedPlayerB, userSeasonId, swapLimits]);

  if (loadingPlayers || teamsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  // Handle swap submission
  const handleSwap = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPlayerA || !selectedPlayerB || !user || !userSeasonId) return;

    const teamAName = selectedPlayerA.team_name || 'Team A';
    const teamBName = selectedPlayerB.team_name || 'Team B';

    const teamALimit = swapLimits[selectedPlayerA.team_id];
    const teamBLimit = swapLimits[selectedPlayerB.team_id];

    const teamAFee = teamALimit?.next_swap_fee || 0;
    const teamBFee = teamBLimit?.next_swap_fee || 0;

    let confirmMessage = `Swap ${selectedPlayerA.player_name} (${teamAName}) ↔ ${selectedPlayerB.player_name} (${teamBName})?\n\n`;
    
    confirmMessage += `Value Exchange:\n`;
    confirmMessage += `• ${selectedPlayerA.player_name}: ${selectedPlayerA.acquisition_value} → ${selectedPlayerB.acquisition_value}\n`;
    confirmMessage += `• ${selectedPlayerB.player_name}: ${selectedPlayerB.acquisition_value} → ${selectedPlayerA.acquisition_value}\n\n`;

    if (teamAFee > 0 || teamBFee > 0) {
      confirmMessage += `Fees:\n`;
      if (teamAFee > 0) confirmMessage += `• ${teamAName}: ${teamAFee} (Swap #${teamALimit.next_swap_number})\n`;
      if (teamBFee > 0) confirmMessage += `• ${teamBName}: ${teamBFee} (Swap #${teamBLimit.next_swap_number})\n`;
    } else {
      confirmMessage += `This swap is FREE for both teams!\n`;
    }

    confirmMessage += `\nTeam assignments AND acquisition values will be swapped.`;

    if (!confirm(confirmMessage)) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetchWithTokenRefresh('/api/players/simple-swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_a_id: selectedPlayerA.player_id,
          player_b_id: selectedPlayerB.player_id,
          season_id: userSeasonId,
          swapped_by: user.uid,
          swapped_by_name: user.username || user.email
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to swap players');
      }

      setSuccess(`✅ ${selectedPlayerA.player_name} and ${selectedPlayerB.player_name} swapped successfully!`);

      // Reset form
      setSelectedPlayerAId('');
      setSelectedPlayerBId('');

      // Reload page after delay
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (err: any) {
      setError(err.message || 'Failed to swap players');
      console.error('Swap error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="p-5 bg-slate-50 border border-slate-200/60 rounded-2xl font-mono text-xs">
        <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-2.5">⚽ Football Player Swap</h3>
        <ul className="space-y-1.5 text-slate-500">
          <li>• <strong className="text-slate-800">Swap:</strong> Exchange team assignments AND acquisition values between two players</li>
          <li>• <strong className="text-slate-800">Swap Fees:</strong> Swaps are 100% FREE. No fee deductions from available budgets.</li>
          <li>• <strong className="text-slate-800">Values are swapped:</strong> Player A gets Player B's value, Player B gets Player A's value</li>
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

      {/* SWAP FORM */}
      <form onSubmit={handleSwap} className="space-y-6">
          {/* Player A Selection */}
          <SearchablePlayerSelect
            players={players}
            value={selectedPlayerAId}
            onChange={(id) => {
              setSelectedPlayerAId(id);
              setSelectedPlayerBId('');
            }}
            label="Player A"
            placeholder="Select Player A..."
            color="blue"
            playerType="football"
          />

          {/* Player A Info */}
          {selectedPlayerA && (
            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 font-mono text-xs">
              <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-3.5">Player A: {selectedPlayerA.player_name}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Team</span>
                  <p className="font-extrabold text-slate-800 uppercase mt-0.5">{selectedPlayerA.team_name}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Acquisition Value</span>
                  <p className="font-extrabold text-amber-600 mt-0.5">{selectedPlayerA.acquisition_value} eCoin</p>
                </div>
              </div>
              {swapLimits[selectedPlayerA.team_id] && (
                <div className="mt-3.5 p-3.5 bg-white border border-slate-200 rounded-xl">
                  <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider">
                    <span className="text-slate-500">Swap Status:</span>
                    <span className="text-slate-800">{swapLimits[selectedPlayerA.team_id].swaps_used} / 5 used</span>
                  </div>
                  <div className="flex justify-between items-center mt-2 text-[10px] uppercase font-bold tracking-wider">
                    <span className="text-slate-500">Next Swap Fee:</span>
                    <span className="text-emerald-650 font-black">FREE ✨</span>
                  </div>
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
              label="Player B (from different team)"
              placeholder="Select Player B..."
              color="purple"
              playerType="football"
            />
          )}

          {/* Player B Info */}
          {selectedPlayerB && (
            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 font-mono text-xs">
              <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-3.5">Player B: {selectedPlayerB.player_name}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Team</span>
                  <p className="font-extrabold text-slate-800 uppercase mt-0.5">{selectedPlayerB.team_name}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Acquisition Value</span>
                  <p className="font-extrabold text-amber-600 mt-0.5">{selectedPlayerB.acquisition_value} eCoin</p>
                </div>
              </div>
              {swapLimits[selectedPlayerB.team_id] && (
                <div className="mt-3.5 p-3.5 bg-white border border-slate-200 rounded-xl">
                  <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider">
                    <span className="text-slate-500">Swap Status:</span>
                    <span className="text-slate-800">{swapLimits[selectedPlayerB.team_id].swaps_used} / 5 used</span>
                  </div>
                  <div className="flex justify-between items-center mt-2 text-[10px] uppercase font-bold tracking-wider">
                    <span className="text-slate-500">Next Swap Fee:</span>
                    <span className="text-emerald-650 font-black">FREE ✨</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Free Swap Banner */}
          {selectedPlayerA && selectedPlayerB && (
            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 font-mono text-xs text-center">
              <h3 className="font-black text-emerald-600 uppercase tracking-wider mb-2.5">✨ Free Swap</h3>
              <p className="text-slate-500">
                Football player swaps are completely free. No fees will be charged and available budgets will remain unchanged.
              </p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!selectedPlayerAId || !selectedPlayerBId || submitting}
            className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold font-mono text-xs uppercase tracking-wider rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md cursor-pointer text-center"
          >
            {submitting ? 'Processing Swap...' : 'Execute Player Swap'}
          </button>
        </form>
    </div>
  );
}
