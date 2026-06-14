'use client';
import { DollarSign, CheckCircle, BarChart2, AlertTriangle, Unlock } from 'lucide-react';

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
  star_rating: number; // For SearchablePlayerSelect compatibility
  position: string;
  contract_start_season: string;
  contract_end_season: string;
  season_id: string;
}

export default function ReleaseFootballPlayerForm() {
  const { user, userSeasonId } = usePermissions();
  const { data: cachedTeams, isLoading: teamsLoading } = useCachedTeams(userSeasonId);

  // Form state
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [releaseTiming, setReleaseTiming] = useState<'start' | 'mid'>('start');
  const [refundPercentage, setRefundPercentage] = useState<number>(75);

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

        const loadedPlayers: Player[] = result.data.players
          .filter((p: any) => p.team_id && p.acquisition_value) // Only players with teams and values
          .map((p: any) => {
            console.log('Release form player data:', { 
              name: p.name, 
              position: p.position, 
              acquisition_value: p.acquisition_value,
              contract_start_season: p.contract_start_season,
              contract_end_season: p.contract_end_season
            });
            return {
              id: p.id || p.player_id,
              player_id: p.player_id,
              player_name: p.name || 'Unknown Player',
              team_id: p.team_id,
              team_name: p.team_name || 'Unknown Team',
              acquisition_value: p.acquisition_value || 0,
              star_rating: p.overall_rating || 70, // For SearchablePlayerSelect compatibility
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

  // Get selected player
  const selectedPlayer = useMemo(() => {
    return players.find(p => p.id === selectedPlayerId);
  }, [players, selectedPlayerId]);

  // Calculate refund amount
  const refundAmount = useMemo(() => {
    if (!selectedPlayer) return 0;
    return Math.round(selectedPlayer.acquisition_value * (refundPercentage / 100));
  }, [selectedPlayer, refundPercentage]);

  // Calculate release season
  const releaseSeasonDisplay = useMemo(() => {
    if (!userSeasonId) return '';
    const seasonNumber = userSeasonId.replace(/\D/g, '');
    return releaseTiming === 'mid' ? `SSPSLS${seasonNumber}.5` : userSeasonId.toUpperCase();
  }, [userSeasonId, releaseTiming]);

  // Calculate preview details
  const preview = useMemo(() => {
    if (!selectedPlayer || !userSeasonId) return null;

    try {
      const releaseSeasonNumber = userSeasonId.replace(/\D/g, '');
      const releaseSeasonId = releaseTiming === 'mid'
        ? `SSPSLS${releaseSeasonNumber}.5`
        : userSeasonId.toUpperCase();

      const parseSeasonNumber = (seasonStr: string): number => {
        const cleaned = seasonStr.replace(/[^\d.]/g, '');
        return parseFloat(cleaned) || 0;
      };

      const startSeasonNum = parseSeasonNumber(selectedPlayer.contract_start_season) || parseFloat(releaseSeasonNumber);
      const endSeasonNum = parseSeasonNumber(selectedPlayer.contract_end_season) || parseFloat(releaseSeasonNumber);
      const releaseSeasonNum = parseFloat(releaseSeasonNumber) + (releaseTiming === 'mid' ? 0.5 : 0);

      const totalHalfSeasons = Math.round((endSeasonNum - startSeasonNum) * 2);
      const elapsedHalfSeasons = Math.round((releaseSeasonNum - startSeasonNum) * 2);
      const remainingHalfSeasons = totalHalfSeasons - elapsedHalfSeasons;

      return {
        totalHalfSeasons,
        elapsedHalfSeasons,
        remainingHalfSeasons,
        releaseSeasonId
      };
    } catch (err) {
      console.error('Error calculating preview:', err);
      return null;
    }
  }, [selectedPlayer, releaseTiming, userSeasonId]);

  // Generate WhatsApp message
  const generateWhatsAppMessage = (
    playerName: string,
    teamName: string,
    acquisitionValue: number,
    refundPercentage: number,
    refundAmount: number,
    timing: 'start' | 'mid',
    releaseSeason: string,
    contractStart: string,
    contractEnd: string
  ) => {
    return `<Unlock className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> *Player Release Notification*
 
━━━━━━━━━━━━━━━━━━━━
 
*Player:* ${playerName}
*Team:* ${teamName}
 
*Release Details:*
• Timing: ${timing === 'start' ? 'Season Start' : 'Mid-Season'}
• Original Contract: ${contractStart} &rarr; ${contractEnd}
• New Contract End: ${releaseSeason}
• Original Value: ${acquisitionValue} eCoin
 
*Refund Calculation:*
• Refund %: ${refundPercentage}%
• Refund Amount: *${refundAmount} eCoin*
 
━━━━━━━━━━━━━━━━━━━━
 
<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Player is now a free agent
<DollarSign className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> ${refundAmount} eCoin added to ${teamName}'s football budget`;
  };

  // Handle release submission
  const handleRelease = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPlayer || !user || !userSeasonId) return;

    const confirmMessage = `Release ${selectedPlayer.player_name} from ${selectedPlayer.team_name}?\n\n` +
      `Release Timing: ${releaseTiming === 'start' ? 'Season Start' : 'Mid-Season'}\n` +
      `Refund: ${refundPercentage}% of ${selectedPlayer.acquisition_value} eCoin = ${refundAmount} eCoin\n` +
      `Contract End: ${releaseSeasonDisplay}\n\n` +
      `The player will become a free agent and the refund will be added to the team's football budget.`;

    if (!confirm(confirmMessage)) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetchWithTokenRefresh('/api/players/release-football-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: selectedPlayer.player_id,
          seasonId: userSeasonId,
          releaseTiming,
          refundPercentage,
          releasedBy: user.uid,
          releasedByName: user.username || user.email
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to release player');
      }

      setSuccess(`<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> ${selectedPlayer.player_name} released successfully! Refund: ${refundAmount} eCoin`);

      // Generate WhatsApp message
      const whatsappMessage = generateWhatsAppMessage(
        selectedPlayer.player_name,
        selectedPlayer.team_name || 'Unknown Team',
        selectedPlayer.acquisition_value,
        refundPercentage,
        refundAmount,
        releaseTiming,
        releaseSeasonDisplay,
        selectedPlayer.contract_start_season,
        selectedPlayer.contract_end_season
      );

      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(whatsappMessage);
        setSuccess(`<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> ${selectedPlayer.player_name} released successfully! Refund: ${refundAmount} eCoin\n\n📋 WhatsApp message copied to clipboard!`);
      } catch (clipboardError) {
        console.error('Failed to copy to clipboard:', clipboardError);
      }

      // Reset form
      setSelectedPlayerId('');
      setRefundPercentage(75);
      setReleaseTiming('start');

      // Reload page after delay
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (err: any) {
      setError(err.message || 'Failed to release player');
      console.error('Release error:', err);
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

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="p-5 bg-slate-50 border border-slate-200/60 rounded-2xl font-mono text-xs">
          <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-2.5"><Unlock className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Player Release System</h3>
          <ul className="space-y-1.5 text-slate-500">
              <li>• Release players at season start or mid-season (X.5)</li>
              <li>• <strong className="text-slate-800">Manual refund percentage selection</strong> (0-100%)</li>
              <li>• Refund added to team's football budget</li>
              <li>• Player becomes a free agent immediately</li>
          </ul>
      </div>

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

      <form onSubmit={handleRelease} className="space-y-6">
        {/* Player Selection */}
        <div className="font-mono text-xs">
          <SearchablePlayerSelect
            players={players}
            value={selectedPlayerId}
            onChange={setSelectedPlayerId}
            disabled={submitting}
            label="Select Football Player to Release"
            placeholder="Search player name or team..."
            color="orange"
            playerType="football"
          />
          {loadingPlayers && (
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">Loading players...</p>
          )}
          {!loadingPlayers && players.length === 0 && (
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">No players with active contracts found</p>
          )}
        </div>

        {/* Release Timing */}
        {selectedPlayerId && (
          <div className="font-mono text-xs">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Release Timing
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setReleaseTiming('start')}
                disabled={submitting}
                className={`px-4 py-3 rounded-xl font-bold uppercase tracking-wider transition-all border ${
                  releaseTiming === 'start'
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                } disabled:opacity-50`}
              >
                Season Start
                <span className="block text-[9px] font-medium text-slate-400 mt-0.5 lowercase">{userSeasonId}</span>
              </button>
              <button
                type="button"
                onClick={() => setReleaseTiming('mid')}
                disabled={submitting}
                className={`px-4 py-3 rounded-xl font-bold uppercase tracking-wider transition-all border ${
                  releaseTiming === 'mid'
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                } disabled:opacity-50`}
              >
                Mid-Season
                <span className="block text-[9px] font-medium text-slate-400 mt-0.5 lowercase">{userSeasonId?.replace(/\D/g, '')}.5</span>
              </button>
            </div>
          </div>
        )}

        {/* Refund Percentage */}
        {selectedPlayerId && (
          <div className="font-mono text-xs">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Refund Percentage
            </label>
            <div className="grid grid-cols-5 gap-2 mb-3">
              {[100, 75, 50, 25, 0].map((percent) => (
                <button
                  key={percent}
                  type="button"
                  onClick={() => setRefundPercentage(percent)}
                  disabled={submitting}
                  className={`py-2 rounded-lg font-bold transition-all text-xs border ${
                    refundPercentage === percent
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  } disabled:opacity-50`}
                >
                  {percent}%
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-bold text-slate-450 uppercase">Custom Refund %:</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={refundPercentage}
                onChange={(e) => setRefundPercentage(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                disabled={submitting}
                className="w-24 px-3 py-2 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none disabled:opacity-50"
              />
            </div>
          </div>
        )}

        {/* Preview Card */}
        {preview && selectedPlayer && (
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 font-mono text-xs">
            <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-4"><BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Release Preview</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Player Info */}
              <div className="bg-white border border-slate-150 rounded-xl p-4 shadow-sm">
                <h4 className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mb-3">Player Details</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Name:</span>
                    <span className="font-bold text-slate-800 uppercase">{selectedPlayer.player_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Team:</span>
                    <span className="font-bold text-slate-800 uppercase">{selectedPlayer.team_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Position:</span>
                    <span className="font-bold text-slate-800 uppercase">{selectedPlayer.position}</span>
                  </div>
                </div>
              </div>

              {/* Contract Info */}
              <div className="bg-white border border-slate-150 rounded-xl p-4 shadow-sm">
                <h4 className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mb-3">Contract Schedule</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Contract End:</span>
                    <span className="font-bold text-slate-800 uppercase">{selectedPlayer.contract_end_season}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Release Point:</span>
                    <span className="font-extrabold text-amber-600 uppercase">{preview.releaseSeasonId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Duration:</span>
                    <span className="font-bold text-slate-800">{preview.totalHalfSeasons} Half-Seasons</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Refund Calculation */}
            <div className="bg-white border border-slate-150 rounded-xl p-4 shadow-sm">
              <h4 className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mb-3">Refund Calculation</h4>
              <div className="space-y-2.5">
                <div className="flex justify-between text-slate-600">
                  <span>Elapsed Contract:</span>
                  <span className="font-bold">{preview.elapsedHalfSeasons} Half-Seasons</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Remaining Duration:</span>
                  <span className="font-bold text-slate-850">{preview.remainingHalfSeasons} Half-Seasons</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-100 items-center">
                  <span className="font-extrabold text-slate-600">Selected Refund %:</span>
                  <span className="font-extrabold text-amber-600">{refundPercentage}%</span>
                </div>
                <div className="flex justify-between pt-2.5 border-t border-slate-100 items-center">
                  <span className="font-extrabold text-slate-600">Original Value:</span>
                  <span className="font-bold text-slate-800">{selectedPlayer.acquisition_value} eCoin</span>
                </div>
                <div className="flex justify-between pt-2.5 border-t border-slate-200 items-center bg-emerald-50/50 -mx-4 px-4 py-3 rounded-b-xl">
                  <span className="font-black text-slate-900 uppercase">Team Refund Amount</span>
                  <span className="text-xl font-black text-emerald-600">{refundAmount} eCoin</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex justify-end mt-4">
          <button
            type="submit"
            disabled={!selectedPlayerId || submitting}
            className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold font-mono text-xs uppercase tracking-wider rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md cursor-pointer text-center"
          >
            {submitting ? 'Releasing Player...' : '<Unlock className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Execute Player Release'}
          </button>
        </div>
      </form>
    </div>
  );
}
