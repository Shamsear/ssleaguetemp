'use client';

import { useState, useEffect } from 'react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface Player {
    id: string;
    player_id: string;
    player_name: string;
    position?: number;
    category?: string;
    isStarting?: boolean;
    isSubstitute?: boolean;
}

interface Lineup {
    players: Player[];
    locked: boolean;
}

interface MatchupCreatorProps {
    fixtureId: string;
    seasonId: string;
    homeTeamId: string;
    homeTeamName: string;
    awayTeamId: string;
    awayTeamName: string;
    userId: string;
    userName: string;
    onSuccess: () => void;
    onCancel: () => void;
    initialTeamToEdit?: 'home' | 'away'; // NEW: Auto-open lineup setter for this team
}

export default function CommitteeMatchupCreator({
    fixtureId,
    seasonId,
    homeTeamId,
    homeTeamName,
    awayTeamId,
    awayTeamName,
    userId,
    userName,
    onSuccess,
    onCancel,
    initialTeamToEdit
}: MatchupCreatorProps) {
    const [homeLineup, setHomeLineup] = useState<Lineup | null>(null);
    const [awayLineup, setAwayLineup] = useState<Lineup | null>(null);
    const [homeNeedsLineup, setHomeNeedsLineup] = useState(false);
    const [awayNeedsLineup, setAwayNeedsLineup] = useState(false);

    // Lineup setting state
    const [showLineupSetter, setShowLineupSetter] = useState<'home' | 'away' | null>(null);
    const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
    const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
    const [isSettingLineup, setIsSettingLineup] = useState(false);

    // Matchup state
    const [selectedMatchups, setSelectedMatchups] = useState<Array<{
        position: number;
        home_player_id: string;
        home_player_name: string;
        away_player_id: string;
        away_player_name: string;
        match_duration: number;
    }>>([]);
    const [usedHomePlayers, setUsedHomePlayers] = useState<Set<string>>(new Set());
    const [usedAwayPlayers, setUsedAwayPlayers] = useState<Set<string>>(new Set());
    const [selectedHomePlayer, setSelectedHomePlayer] = useState<Player | null>(null);
    const [selectedAwayPlayer, setSelectedAwayPlayer] = useState<Player | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchLineups();
    }, []);

    // NEW: Auto-open lineup setter if initialTeamToEdit is provided
    useEffect(() => {
        if (initialTeamToEdit && !isLoading) {
            handleSetLineup(initialTeamToEdit);
        }
    }, [initialTeamToEdit, isLoading]);

    const fetchLineups = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [homeRes, awayRes] = await Promise.all([
                fetchWithTokenRefresh(`/api/lineups?fixture_id=${fixtureId}&team_id=${homeTeamId}`),
                fetchWithTokenRefresh(`/api/lineups?fixture_id=${fixtureId}&team_id=${awayTeamId}`)
            ]);

            const homeData = await homeRes.json();
            const awayData = await awayRes.json();

            console.log('Home lineup data:', homeData);
            console.log('Away lineup data:', awayData);

            // API returns { success: true, lineups: {...} } for single team
            // lineups can be null if not found, or an object with starting_xi and substitutes
            if (homeData.lineups && homeData.lineups.starting_xi) {
                // starting_xi and substitutes are arrays of player IDs (strings)
                // We need to fetch the full player details to get names
                const startingIds = homeData.lineups.starting_xi || [];
                const subIds = homeData.lineups.substitutes || [];
                const playerIds = [...startingIds, ...subIds];

                // Fetch player details from player_seasons
                const playerDetails = await fetchWithTokenRefresh(`/api/player-seasons?team_id=${homeTeamId}&season_id=${seasonId}`)
                    .then(res => res.json())
                    .then(data => data.players || []);

                // Filter to only include players in the lineup and mark their type
                const players = playerDetails
                    .filter((p: any) => playerIds.includes(p.player_id))
                    .map((p: any) => ({
                        ...p,
                        isStarting: startingIds.includes(p.player_id),
                        isSubstitute: subIds.includes(p.player_id)
                    }));

                console.log('Home players constructed:', players);
                setHomeLineup({ ...homeData.lineups, players });
                setHomeNeedsLineup(false);
            } else {
                setHomeLineup(null);
                setHomeNeedsLineup(true);
            }

            if (awayData.lineups && awayData.lineups.starting_xi) {
                // starting_xi and substitutes are arrays of player IDs (strings)
                const startingIds = awayData.lineups.starting_xi || [];
                const subIds = awayData.lineups.substitutes || [];
                const playerIds = [...startingIds, ...subIds];

                // Fetch player details from player_seasons
                const playerDetails = await fetchWithTokenRefresh(`/api/player-seasons?team_id=${awayTeamId}&season_id=${seasonId}`)
                    .then(res => res.json())
                    .then(data => data.players || []);

                // Filter to only include players in the lineup and mark their type
                const players = playerDetails
                    .filter((p: any) => playerIds.includes(p.player_id))
                    .map((p: any) => ({
                        ...p,
                        isStarting: startingIds.includes(p.player_id),
                        isSubstitute: subIds.includes(p.player_id)
                    }));

                console.log('Away players constructed:', players);
                setAwayLineup({ ...awayData.lineups, players });
                setAwayNeedsLineup(false);
            } else {
                setAwayLineup(null);
                setAwayNeedsLineup(true);
            }
        } catch (err) {
            console.error('Error fetching lineups:', err);
            setError('Failed to load team lineups');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchTeamPlayers = async (teamId: string) => {
        try {
            console.log('🔍 Fetching players for team:', { teamId, seasonId });
            const response = await fetchWithTokenRefresh(`/api/player-seasons?team_id=${teamId}&season_id=${seasonId}`);
            const data = await response.json();
            console.log('📊 Player-seasons API response:', data);
            return data.players || [];
        } catch (err) {
            console.error('Error fetching team players:', err);
            return [];
        }
    };

    const handleSetLineup = async (team: 'home' | 'away') => {
        const teamId = team === 'home' ? homeTeamId : awayTeamId;
        const existingLineup = team === 'home' ? homeLineup : awayLineup;

        console.log('🎯 Setting lineup for team:', { team, teamId, seasonId });
        setShowLineupSetter(team);
        setIsSettingLineup(true);

        const players = await fetchTeamPlayers(teamId);
        console.log('👥 Fetched players:', players);
        setAvailablePlayers(players);

        // If editing existing lineup, pre-select the current players
        if (existingLineup && existingLineup.players && existingLineup.players.length > 0) {
            const currentPlayerIds = existingLineup.players.map(p => p.player_id);
            const preSelectedPlayers = players.filter((p: Player) => currentPlayerIds.includes(p.player_id));
            console.log('✏️ Editing existing lineup, pre-selecting:', preSelectedPlayers);
            setSelectedPlayers(preSelectedPlayers);
        } else {
            setSelectedPlayers([]);
        }

        setIsSettingLineup(false);
    };

    const togglePlayerSelection = (player: Player) => {
        setSelectedPlayers(prev => {
            const isSelected = prev.some(p => p.player_id === player.player_id);
            if (isSelected) {
                return prev.filter(p => p.player_id !== player.player_id);
            } else {
                if (prev.length >= 7) {
                    setError('Maximum 7 players allowed in lineup');
                    return prev;
                }
                return [...prev, player];
            }
        });
    };

    const submitLineup = async () => {
        if (selectedPlayers.length < 5) {
            setError('Minimum 5 players required');
            return;
        }

        if (selectedPlayers.length > 7) {
            setError('Maximum 7 players allowed');
            return;
        }

        const teamId = showLineupSetter === 'home' ? homeTeamId : awayTeamId;

        // Send only player_id, not the full id field
        const starting_xi = selectedPlayers.slice(0, 5).map(p => p.player_id);
        const substitutes = selectedPlayers.slice(5).map(p => p.player_id);

        setIsSettingLineup(true);
        setError(null);

        try {
            const response = await fetchWithTokenRefresh(`/api/lineups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fixture_id: fixtureId,
                    team_id: teamId,
                    starting_xi,
                    substitutes,
                    submitted_by: userId,
                    submitted_by_name: userName,
                    bypass_deadline: true // Committee admin can bypass deadline
                })
            });

            if (response.ok) {
                setShowLineupSetter(null);
                setSelectedPlayers([]);
                setAvailablePlayers([]);
                await fetchLineups(); // Reload lineups
            } else {
                const errorData = await response.json();
                setError(errorData.error || 'Failed to set lineup');
            }
        } catch (err) {
            console.error('Error setting lineup:', err);
            setError('Failed to set lineup. Please try again.');
        } finally {
            setIsSettingLineup(false);
        }
    };

    const addMatchup = (homePlayer: Player, awayPlayer: Player) => {
        const position = selectedMatchups.length + 1;

        setSelectedMatchups(prev => [...prev, {
            position,
            home_player_id: homePlayer.player_id,
            home_player_name: homePlayer.player_name,
            away_player_id: awayPlayer.player_id,
            away_player_name: awayPlayer.player_name,
            match_duration: 6
        }]);

        setUsedHomePlayers(prev => new Set([...prev, homePlayer.player_id]));
        setUsedAwayPlayers(prev => new Set([...prev, awayPlayer.player_id]));

        // Clear selections after creating matchup
        setSelectedHomePlayer(null);
        setSelectedAwayPlayer(null);
    };

    const handlePlayerClick = (player: Player, team: 'home' | 'away') => {
        if (team === 'home') {
            // If clicking the same home player, deselect
            if (selectedHomePlayer?.player_id === player.player_id) {
                setSelectedHomePlayer(null);
                return;
            }

            setSelectedHomePlayer(player);

            // If away player is already selected, create matchup
            if (selectedAwayPlayer) {
                addMatchup(player, selectedAwayPlayer);
            }
        } else {
            // If clicking the same away player, deselect
            if (selectedAwayPlayer?.player_id === player.player_id) {
                setSelectedAwayPlayer(null);
                return;
            }

            setSelectedAwayPlayer(player);

            // If home player is already selected, create matchup
            if (selectedHomePlayer) {
                addMatchup(selectedHomePlayer, player);
            }
        }
    };

    const removeMatchup = (position: number) => {
        const matchup = selectedMatchups.find(m => m.position === position);
        if (!matchup) return;

        setSelectedMatchups(prev => prev
            .filter(m => m.position !== position)
            .map((m, idx) => ({ ...m, position: idx + 1 }))
        );

        setUsedHomePlayers(prev => {
            const newSet = new Set(prev);
            newSet.delete(matchup.home_player_id);
            return newSet;
        });

        setUsedAwayPlayers(prev => {
            const newSet = new Set(prev);
            newSet.delete(matchup.away_player_id);
            return newSet;
        });
    };

    const updateMatchupDuration = (position: number, duration: number) => {
        setSelectedMatchups(prev => prev.map(m =>
            m.position === position ? { ...m, match_duration: duration } : m
        ));
    };

    const handleSubmit = async () => {
        if (selectedMatchups.length === 0) {
            setError('Please create at least one matchup');
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/matchups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    matchups: selectedMatchups,
                    created_by: userId,
                    allow_overwrite: false
                })
            });

            if (response.ok) {
                onSuccess();
            } else {
                const errorData = await response.json();
                setError(errorData.error || 'Failed to create matchups');
            }
        } catch (err) {
            console.error('Error creating matchups:', err);
            setError('Failed to create matchups. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const autoGenerate = () => {
        if (!homeLineup || !awayLineup) return;

        const homePlayers = homeLineup.players.filter(p => !usedHomePlayers.has(p.player_id));
        const awayPlayers = awayLineup.players.filter(p => !usedAwayPlayers.has(p.player_id));

        const count = Math.min(homePlayers.length, awayPlayers.length);

        for (let i = 0; i < count; i++) {
            addMatchup(homePlayers[i], awayPlayers[i]);
        }
    };

    // If showing lineup setter
    if (showLineupSetter) {
        const teamName = showLineupSetter === 'home' ? homeTeamName : awayTeamName;

        return (
            <div className="p-6 max-h-[85vh] overflow-y-auto font-mono text-slate-800">
                <div className="mb-6">
                    <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight mb-1">Set Lineup for {teamName}</h2>
                    <p className="text-xs text-slate-550">Select 5-7 players (first 5 starting XI, remaining are substitutes)</p>
                </div>

                {error && (
                    <div className="bg-rose-50 border border-rose-250 rounded-2xl p-4 mb-4 text-xs font-bold text-rose-700 flex items-center gap-2">
                        <span>⚠️</span> {error}
                    </div>
                )}

                <div className="mb-6 p-4 bg-slate-50 border border-slate-200/60 rounded-2xl">
                    <p className="font-bold text-xs uppercase tracking-wider text-slate-650 flex items-center justify-between">
                        <span>Selected Players:</span>
                        <span className="font-mono bg-white px-2.5 py-1 rounded-lg border border-slate-200/50 text-slate-800">
                            {selectedPlayers.length} / 7
                        </span>
                    </p>
                    {selectedPlayers.length >= 5 && (
                        <p className="text-[10px] font-bold text-emerald-650 mt-2 flex items-center gap-1">
                            ✓ Ready to submit lineup
                        </p>
                    )}
                </div>

                {isSettingLineup ? (
                    <div className="flex items-center justify-center p-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                        {availablePlayers.map((player) => {
                            const isSelected = selectedPlayers.some(p => p.player_id === player.player_id);
                            const position = selectedPlayers.findIndex(p => p.player_id === player.player_id) + 1;

                            return (
                                <button
                                    key={player.player_id}
                                    onClick={() => togglePlayerSelection(player)}
                                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${isSelected
                                        ? 'border-slate-800 bg-slate-50 shadow-xs'
                                        : 'border-slate-250 bg-white hover:border-slate-350 hover:bg-slate-50/50'
                                        }`}
                                >
                                    <div className="flex items-start justify-between w-full">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-slate-900 text-xs sm:text-sm truncate">{player.player_name}</p>
                                            <p className="text-[10px] font-mono text-slate-400 mt-0.5">{player.player_id}</p>
                                        </div>
                                        {isSelected && (
                                            <span className="text-emerald-500 font-bold shrink-0 ml-2">✓</span>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between w-full mt-2">
                                        {player.category ? (
                                            <span className="text-[9px] font-bold font-mono uppercase px-2 py-0.5 bg-slate-105 text-slate-600 rounded">
                                                {player.category}
                                            </span>
                                        ) : <div />}
                                        {isSelected && (
                                            <span className="text-[9px] font-black font-mono uppercase bg-slate-800 text-white px-2 py-0.5 rounded">
                                                {position <= 5 ? `XI #${position}` : `SUB #${position - 5}`}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-slate-100">
                    <button
                        onClick={() => {
                            setShowLineupSetter(null);
                            setSelectedPlayers([]);
                            setAvailablePlayers([]);
                            setError(null);
                        }}
                        disabled={isSettingLineup}
                        className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-slate-200 disabled:opacity-50 cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={submitLineup}
                        disabled={isSettingLineup || selectedPlayers.length < 5 || selectedPlayers.length > 7}
                        className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                        {isSettingLineup ? 'Setting Lineup...' : `Set Lineup (${selectedPlayers.length} players)`}
                    </button>
                </div>
            </div>
        );
    }

    // Main matchup creator view
    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="text-center font-mono">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800 mx-auto mb-4"></div>
                    <p className="text-xs text-slate-550">Loading lineups...</p>
                </div>
            </div>
        );
    }

    // Show lineup setting options if needed
    if (homeNeedsLineup || awayNeedsLineup) {
        return (
            <div className="p-6 font-mono text-slate-850">
                <div className="mb-6">
                    <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight mb-1">Lineups Required</h2>
                    <p className="text-xs text-slate-550">Both teams need to set their lineups before creating matchups</p>
                </div>

                <div className="space-y-4 mb-6">
                    {homeNeedsLineup ? (
                        <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <p className="font-bold text-slate-900 text-sm">{homeTeamName}</p>
                                <p className="text-[10px] text-amber-700 mt-0.5">⚠️ Lineup not set</p>
                            </div>
                            <button
                                onClick={() => handleSetLineup('home')}
                                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-sm self-start sm:self-auto"
                            >
                                Set Lineup
                            </button>
                        </div>
                    ) : (
                        <div className="bg-emerald-50/30 border border-emerald-250 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <p className="font-bold text-slate-900 text-sm">{homeTeamName}</p>
                                <p className="text-[10px] text-emerald-700 mt-0.5">✓ Lineup set ({homeLineup?.players.length} players)</p>
                            </div>
                            <button
                                onClick={() => handleSetLineup('home')}
                                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-slate-200 cursor-pointer self-start sm:self-auto"
                            >
                                ✏️ Edit Lineup
                            </button>
                        </div>
                    )}

                    {awayNeedsLineup ? (
                        <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <p className="font-bold text-slate-900 text-sm">{awayTeamName}</p>
                                <p className="text-[10px] text-amber-700 mt-0.5">⚠️ Lineup not set</p>
                            </div>
                            <button
                                onClick={() => handleSetLineup('away')}
                                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-sm self-start sm:self-auto"
                            >
                                Set Lineup
                            </button>
                        </div>
                    ) : (
                        <div className="bg-emerald-50/30 border border-emerald-250 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <p className="font-bold text-slate-900 text-sm">{awayTeamName}</p>
                                <p className="text-[10px] text-emerald-700 mt-0.5">✓ Lineup set ({awayLineup?.players.length} players)</p>
                            </div>
                            <button
                                onClick={() => handleSetLineup('away')}
                                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-slate-200 cursor-pointer self-start sm:self-auto"
                            >
                                ✏️ Edit Lineup
                            </button>
                        </div>
                    )}
                </div>

                <button
                    onClick={onCancel}
                    className="w-full px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-slate-200 cursor-pointer"
                >
                    Close
                </button>
            </div>
        );
    }

    const availableHomePlayers = homeLineup?.players.filter(p => !usedHomePlayers.has(p.player_id)) || [];
    const availableAwayPlayers = awayLineup?.players.filter(p => !usedAwayPlayers.has(p.player_id)) || [];

    return (
        <div className="p-6 max-h-[85vh] overflow-y-auto font-mono text-slate-850">
            {/* Header */}
            <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight mb-1">Create Matchups</h2>
                <p className="text-xs text-slate-550">Select players from each team to create individual matchups</p>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-rose-50 border border-rose-250 rounded-2xl p-4 mb-4 text-xs font-bold text-rose-700 flex items-center gap-2">
                    <span>⚠️</span> {error}
                </div>
            )}

            {/* Auto-Generate Button */}
            {selectedMatchups.length === 0 && availableHomePlayers.length > 0 && availableAwayPlayers.length > 0 && (
                <div className="mb-6">
                    <button
                        onClick={autoGenerate}
                        className="w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                        ⚡ Auto-Generate Matchups
                        <span className="text-[10px] font-normal opacity-80">(Pairs starting XI in order)</span>
                    </button>
                </div>
            )}

            {/* Created Matchups */}
            {selectedMatchups.length > 0 && (
                <div className="mb-6">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-slate-550 mb-3">Created Matchups ({selectedMatchups.length})</h3>
                    <div className="space-y-3">
                        {selectedMatchups.map((matchup) => (
                            <div key={matchup.position} className="bg-slate-50/70 border border-slate-200/60 rounded-2xl p-4 hover:bg-slate-50 transition-all">
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <div className="flex items-center gap-4 flex-1 w-full">
                                        <span className="text-sm font-black font-mono text-slate-400 bg-white px-2 py-1 rounded-lg border shadow-3xs">#{matchup.position}</span>
                                        <div className="flex-1 grid grid-cols-3 gap-2 items-center text-xs">
                                            <div className="text-right">
                                                <p className="font-bold text-slate-850 truncate">{matchup.home_player_name}</p>
                                                <p className="text-[9px] font-mono text-slate-450 uppercase tracking-wider mt-0.5">{homeTeamName}</p>
                                            </div>
                                            <div className="text-center font-bold text-slate-400">
                                                VS
                                            </div>
                                            <div className="text-left">
                                                <p className="font-bold text-slate-850 truncate">{matchup.away_player_name}</p>
                                                <p className="text-[9px] font-mono text-slate-450 uppercase tracking-wider mt-0.5">{awayTeamName}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-end sm:justify-start pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                                        <select
                                            value={matchup.match_duration}
                                            onChange={(e) => updateMatchupDuration(matchup.position, parseInt(e.target.value))}
                                            className="px-3 py-1.5 bg-white border border-slate-205 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                                        >
                                            <option value={6}>6 min</option>
                                            <option value={7}>7 min</option>
                                            <option value={8}>8 min</option>
                                        </select>
                                        <button
                                            onClick={() => removeMatchup(matchup.position)}
                                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-rose-100"
                                            title="Remove matchup"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Available Players */}
            {(availableHomePlayers.length > 0 || availableAwayPlayers.length > 0) && (
                <div className="mb-6">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-slate-550 mb-3 flex items-center justify-between">
                        <span>Select Players to Match</span>
                        {(selectedHomePlayer || selectedAwayPlayer) && (
                            <span className="text-[10px] font-bold text-amber-600 animate-pulse">
                                {selectedHomePlayer && !selectedAwayPlayer && '← Select away player next'}
                                {!selectedHomePlayer && selectedAwayPlayer && '← Select home player next'}
                            </span>
                        )}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Home Team */}
                        <div>
                            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">{homeTeamName}</h4>
                            <div className="space-y-2">
                                {availableHomePlayers.map((player) => {
                                    const isSelected = selectedHomePlayer?.player_id === player.player_id;
                                    const isSubstitute = player.isSubstitute;
                                    const isDisabled = isSubstitute;

                                    return (
                                        <button
                                            key={player.player_id}
                                            onClick={() => !isDisabled && handlePlayerClick(player, 'home')}
                                            disabled={isDisabled}
                                            className={`w-full text-left border rounded-2xl p-3 transition-all flex items-center justify-between ${
                                                isDisabled
                                                    ? 'bg-slate-55/50 border-slate-150 opacity-50 cursor-not-allowed'
                                                    : isSelected
                                                        ? 'bg-slate-100 border-slate-800 shadow-sm cursor-pointer'
                                                        : 'bg-white border-slate-200 hover:border-slate-350 hover:bg-slate-55/50 cursor-pointer'
                                            }`}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-bold text-slate-800 text-xs truncate">{player.player_name}</p>
                                                    {player.isStarting && (
                                                        <span className="text-[9px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold">
                                                            XI
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] font-mono text-slate-400 mt-0.5">{player.player_id}</p>
                                            </div>
                                            {isSelected && !isDisabled && (
                                                <span className="text-slate-800 shrink-0 ml-2">👈</span>
                                            )}
                                        </button>
                                    );
                                })}
                                {availableHomePlayers.length === 0 && (
                                    <p className="text-xs text-slate-400 italic font-mono">All players assigned</p>
                                )}
                            </div>
                        </div>

                        {/* Away Team */}
                        <div>
                            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">{awayTeamName}</h4>
                            <div className="space-y-2">
                                {availableAwayPlayers.map((player) => {
                                    const isSelected = selectedAwayPlayer?.player_id === player.player_id;
                                    const isSubstitute = player.isSubstitute;
                                    const isDisabled = isSubstitute;

                                    return (
                                        <button
                                            key={player.player_id}
                                            onClick={() => !isDisabled && handlePlayerClick(player, 'away')}
                                            disabled={isDisabled}
                                            className={`w-full text-left border rounded-2xl p-3 transition-all flex items-center justify-between ${
                                                isDisabled
                                                    ? 'bg-slate-55/50 border-slate-150 opacity-50 cursor-not-allowed'
                                                    : isSelected
                                                        ? 'bg-slate-100 border-slate-800 shadow-sm cursor-pointer'
                                                        : 'bg-white border-slate-200 hover:border-slate-350 hover:bg-slate-55/50 cursor-pointer'
                                            }`}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-bold text-slate-800 text-xs truncate">{player.player_name}</p>
                                                    {player.isStarting && (
                                                        <span className="text-[9px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold">
                                                            XI
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] font-mono text-slate-400 mt-0.5">{player.player_id}</p>
                                            </div>
                                            {isSelected && !isDisabled && (
                                                <span className="text-slate-800 shrink-0 ml-2">👈</span>
                                            )}
                                        </button>
                                    );
                                })}
                                {availableAwayPlayers.length === 0 && (
                                    <p className="text-xs text-slate-400 italic font-mono">All players assigned</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                    onClick={onCancel}
                    disabled={isSaving}
                    className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-slate-200 disabled:opacity-50 cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={isSaving || selectedMatchups.length === 0}
                    className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                    {isSaving ? (
                        <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Creating...
                        </>
                    ) : (
                        <>
                            ⚔️ Create {selectedMatchups.length} Matchup{selectedMatchups.length !== 1 ? 's' : ''}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
