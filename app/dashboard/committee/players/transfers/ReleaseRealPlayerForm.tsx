'use client';
import { AlertTriangle, Star, Unlock, BarChart2 } from 'lucide-react';

import { useState, useEffect, useMemo } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import SearchablePlayerSelect from '@/components/ui/SearchablePlayerSelect';

interface Player {
    id: string;
    player_id: string;
    player_name: string;
    team_id: string;
    team: string;
    auction_value: number;
    contract_start_season: string;
    contract_end_season: string;
    star_rating?: number;
    points?: number;
}

interface ReleasePreview {
    totalHalfSeasons: number;
    elapsedHalfSeasons: number;
    remainingHalfSeasons: number;
    refundPercentage: number;
    refundAmount: number;
    releaseSeasonId: string;
}

export default function ReleaseRealPlayerForm() {
    const { userSeasonId, user } = usePermissions();

    const [players, setPlayers] = useState<Player[]>([]);
    const [selectedPlayerId, setSelectedPlayerId] = useState('');
    const [searchPlayer, setSearchPlayer] = useState('');
    const [releaseTiming, setReleaseTiming] = useState<'start' | 'mid'>('start');
    const [refundPercentage, setRefundPercentage] = useState<number>(75); // Manual percentage
    const [preview, setPreview] = useState<ReleasePreview | null>(null);

    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Fetch players with contracts
    useEffect(() => {
        const fetchPlayers = async () => {
            if (!userSeasonId) return;

            try {
                setLoading(true);
                setError(null);

                // Fetch all contracted players for the current season
                const response = await fetchWithTokenRefresh(
                    `/api/players/contracted?seasonId=${userSeasonId}`
                );

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to fetch players');
                }

                // Filter players with valid teams and values
                const contractedPlayers = (data.players || []).filter(
                    (p: any) => p.team_id && p.auction_value
                ).map((p: any) => ({
                    id: p.id,
                    player_id: p.player_id,
                    player_name: p.player_name,
                    team_id: p.team_id,
                    team: p.team || 'Unknown Team',
                    auction_value: p.auction_value,
                    contract_start_season: p.contract_start_season || '',
                    contract_end_season: p.contract_end_season || '',
                    star_rating: p.star_rating,
                    points: p.points
                }));

                setPlayers(contractedPlayers);
            } catch (err: any) {
                setError(err.message || 'Failed to fetch players');
            } finally {
                setLoading(false);
            }
        };

        fetchPlayers();
    }, [userSeasonId]);

    // Calculate preview when player, timing, or percentage changes
    useEffect(() => {
        if (!selectedPlayerId || !userSeasonId) {
            setPreview(null);
            return;
        }

        const player = players.find(p => p.player_id === selectedPlayerId);
        if (!player) {
            setPreview(null);
            return;
        }

        try {
            // Calculate release season (uppercase)
            const releaseSeasonNumber = userSeasonId.replace(/\D/g, '');
            const releaseSeasonId = releaseTiming === 'mid'
                ? `SSPSLS${releaseSeasonNumber}.5`
                : userSeasonId.toUpperCase();

            // Extract season numbers for display
            // Handle both "SSPSLS16" and "SSPSLS16.5" formats
            const parseSeasonNumber = (seasonStr: string): number => {
                const cleaned = seasonStr.replace(/[^\d.]/g, ''); // Remove non-digits except decimal
                return parseFloat(cleaned) || 0;
            };

            const startSeasonNum = parseSeasonNumber(player.contract_start_season) || parseFloat(releaseSeasonNumber);
            const endSeasonNum = parseSeasonNumber(player.contract_end_season) || parseFloat(releaseSeasonNumber);
            const releaseSeasonNum = parseFloat(releaseSeasonNumber) + (releaseTiming === 'mid' ? 0.5 : 0);

            // Calculate half-seasons for display only
            const totalHalfSeasons = Math.round((endSeasonNum - startSeasonNum) * 2);
            const elapsedHalfSeasons = Math.round((releaseSeasonNum - startSeasonNum) * 2);
            const remainingHalfSeasons = totalHalfSeasons - elapsedHalfSeasons;

            // Use manual refund percentage
            const refundAmount = Math.round(player.auction_value * (refundPercentage / 100));

            setPreview({
                totalHalfSeasons,
                elapsedHalfSeasons,
                remainingHalfSeasons,
                refundPercentage: refundPercentage / 100, // Convert to decimal for display
                refundAmount,
                releaseSeasonId
            });
        } catch (err) {
            console.error('Error calculating preview:', err);
            setPreview(null);
        }
    }, [selectedPlayerId, releaseTiming, refundPercentage, players, userSeasonId]);

    const handleRelease = async () => {
        if (!selectedPlayerId || !userSeasonId || !user) {
            setError('Missing required information');
            return;
        }

        const player = players.find(p => p.player_id === selectedPlayerId);
        if (!player) {
            setError('Player not found');
            return;
        }

        const confirmMsg = `Are you sure you want to release ${player.player_name}?\n\n` +
            `Release Point: ${preview?.releaseSeasonId}\n` +
            `Refund: $${preview?.refundAmount} (${(preview?.refundPercentage || 0) * 100}%)\n\n` +
            `This action cannot be undone.`;

        if (!confirm(confirmMsg)) {
            return;
        }

        try {
            setProcessing(true);
            setError(null);
            setSuccess(null);

            const response = await fetchWithTokenRefresh('/api/players/release-real-player', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerId: selectedPlayerId,
                    seasonId: userSeasonId,
                    releaseTiming,
                    refundPercentage, // Send manual percentage
                    releasedBy: user.uid,
                    releasedByName: (user as any).displayName || user.email || 'Unknown'
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to release player');
            }

            setSuccess(data.message || 'Player released successfully!');

            // Reset form
            setSelectedPlayerId('');
            setReleaseTiming('start');
            setPreview(null);

            // Refresh players list
            const refreshResponse = await fetchWithTokenRefresh(
                `/api/players/contracted?seasonId=${userSeasonId}`
            );
            const refreshData = await refreshResponse.json();
            if (refreshResponse.ok) {
                const contractedPlayers = (refreshData.players || []).filter(
                    (p: any) => p.team_id && p.auction_value
                ).map((p: any) => ({
                    id: p.id,
                    player_id: p.player_id,
                    player_name: p.player_name,
                    team_id: p.team_id,
                    team: p.team || 'Unknown Team',
                    auction_value: p.auction_value,
                    contract_start_season: p.contract_start_season || '',
                    contract_end_season: p.contract_end_season || '',
                    star_rating: p.star_rating,
                    points: p.points
                }));
                setPlayers(contractedPlayers);
            }

        } catch (err: any) {
            setError(err.message || 'Failed to release player');
        } finally {
            setProcessing(false);
        }
    };

    // Get filtered players based on search
    const filteredPlayers = useMemo(() => {
        if (!searchPlayer) return players;
        const searchLower = searchPlayer.toLowerCase();
        return players.filter(p => 
            p.player_name.toLowerCase().includes(searchLower) ||
            p.team?.toLowerCase().includes(searchLower)
        );
    }, [players, searchPlayer]);

    const selectedPlayer = players.find(p => p.player_id === selectedPlayerId);

    return (
        <div className="space-y-6">
            {/* Info Banner */}
            <div className="p-5 bg-slate-50 border border-slate-200/60 rounded-2xl font-mono text-xs">
                <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-2.5"><Unlock className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Player Release System</h3>
                <ul className="space-y-1.5 text-slate-500">
                    <li>• Release players at season start or mid-season (X.5)</li>
                    <li>• <strong className="text-slate-800">Manual refund percentage selection</strong> (0-100%)</li>
                    <li>• Refund added to team's dollar balance</li>
                    <li>• Player becomes a free agent immediately</li>
                </ul>
            </div>

            {/* Success/Error Messages */}
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

            {/* Player Selection */}
            <div className="font-mono text-xs">
                <SearchablePlayerSelect
                    players={players.map(p => ({
                        id: p.player_id,
                        player_id: p.player_id,
                        player_name: p.player_name,
                        team_id: p.team_id || '',
                        team_name: p.team || 'Unknown Team',
                        auction_value: p.auction_value,
                        star_rating: p.star_rating || 5,
                        points: p.points || 0,
                        season_id: userSeasonId || '',
                        type: 'real' as const
                    }))}
                    value={selectedPlayerId}
                    onChange={setSelectedPlayerId}
                    disabled={loading || processing}
                    placeholder="Search player name or team..."
                    label="Select Player to Release"
                    color="blue"
                />
                {loading && (
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">Loading players...</p>
                )}
                {!loading && players.length === 0 && (
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
                            disabled={processing}
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
                            disabled={processing}
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
                                disabled={processing}
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
                            disabled={processing}
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
                                    <span className="font-bold text-slate-800 uppercase">{selectedPlayer.team}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Star Rating:</span>
                                    <span className="font-bold text-slate-800">{'<Star className="w-4 h-4 inline-block text-amber-400 fill-amber-400 mr-1 align-text-bottom" />'.repeat(selectedPlayer.star_rating || 0)}</span>
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
                                <span className="font-extrabold text-amber-600">{(preview.refundPercentage * 100).toFixed(0)}%</span>
                            </div>
                            <div className="flex justify-between pt-2.5 border-t border-slate-100 items-center">
                                <span className="font-extrabold text-slate-600">Original Value:</span>
                                <span className="font-bold text-slate-800">${selectedPlayer.auction_value}</span>
                            </div>
                            <div className="flex justify-between pt-2.5 border-t border-slate-200 items-center bg-emerald-50/50 -mx-4 px-4 py-3 rounded-b-xl">
                                <span className="font-black text-slate-900 uppercase">Team Refund Amount</span>
                                <span className="text-xl font-black text-emerald-600">${preview.refundAmount}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Button */}
            <div className="flex justify-end mt-4">
                <button
                    onClick={handleRelease}
                    disabled={!selectedPlayerId || !preview || processing}
                    className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold font-mono text-xs uppercase tracking-wider rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md cursor-pointer text-center"
                >
                    {processing ? 'Releasing Player...' : '<Unlock className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Execute Player Release'}
                </button>
            </div>
        </div>
    );
}
