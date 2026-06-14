'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import Link from 'next/link';

interface PlayerEligibility {
    id: string;
    player_id: string;
    player_name: string;
    team_id: string;
    team_name: string;
    season_id: string;
    matches_played: number;
    goals_scored: number;
    goals_conceded: number;
    goal_difference: number;
    wins: number;
    draws: number;
    losses: number;
    clean_sheets: number;
    points: number;
    star_rating?: number;
    category?: string;
}

export default function PlayerEligibilityPage() {
    const { user, loading: authLoading } = useAuth();
    const { userSeasonId } = usePermissions();
    const router = useRouter();
    const [players, setPlayers] = useState<PlayerEligibility[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<keyof PlayerEligibility>('team_name');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [filterTeam, setFilterTeam] = useState<string>('all');
    const [filterEligibility, setFilterEligibility] = useState<'all' | 'eligible' | 'ineligible'>('all');

    // Round range selection
    const [fromRound, setFromRound] = useState<number>(1);
    const [toRound, setToRound] = useState<number>(10);
    const [maxRound, setMaxRound] = useState<number>(10);
    const [minGames, setMinGames] = useState<number>(5);

    const [initialLoad, setInitialLoad] = useState(true);
    const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
            return;
        }
        if (!authLoading && user && user.role !== 'committee_admin') {
            router.push('/dashboard');
            return;
        }
    }, [user, authLoading, router]);

    // Initial load
    useEffect(() => {
        if (user && user.role === 'committee_admin' && initialLoad && userSeasonId) {
            loadPlayers();
        }
    }, [user, userSeasonId]);

    // Debounced reload when parameters change
    useEffect(() => {
        if (!user || initialLoad || !userSeasonId) return;

        const timer = setTimeout(() => {
            loadPlayers();
        }, 500);

        return () => clearTimeout(timer);
    }, [fromRound, toRound, userSeasonId]);

    const loadPlayers = async () => {
        if (!userSeasonId) {
            console.warn('No season selected');
            return;
        }
        
        setLoading(true);
        try {
            const response = await fetchWithTokenRefresh(
                `/api/committee/player-eligibility?season_id=${userSeasonId}&from_round=${fromRound}&to_round=${toRound}`
            );
            if (response.ok) {
                const data = await response.json();
                setPlayers(data.players || []);
                if (data.maxRound) {
                    setMaxRound(data.maxRound);
                }

                // Extract unique teams
                const uniqueTeams = Array.from(
                    new Set(data.players.map((p: PlayerEligibility) => JSON.stringify({ id: p.team_id, name: p.team_name })))
                ).map(t => JSON.parse(t));
                setTeams(uniqueTeams);
            }
        } catch (error) {
            console.error('Error loading players:', error);
        } finally {
            setLoading(false);
            if (initialLoad) setInitialLoad(false);
        }
    };

    const handleSort = (column: keyof PlayerEligibility) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('desc');
        }
    };

    const filteredPlayers = players
        .filter(p => {
            const matchesSearch = p.player_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.team_name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesTeam = filterTeam === 'all' || p.team_id === filterTeam;
            const matchesEligibility = filterEligibility === 'all' ||
                (filterEligibility === 'eligible' && p.matches_played >= minGames) ||
                (filterEligibility === 'ineligible' && p.matches_played < minGames);

            return matchesSearch && matchesTeam && matchesEligibility;
        })
        .sort((a, b) => {
            const aVal = a[sortBy] ?? 0;
            const bVal = b[sortBy] ?? 0;

            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortOrder === 'asc'
                    ? aVal.localeCompare(bVal)
                    : bVal.localeCompare(aVal);
            }

            return sortOrder === 'asc'
                ? (aVal as number) - (bVal as number)
                : (bVal as number) - (aVal as number);
        });

    const eligibleCount = players.filter(p => p.matches_played >= minGames).length;
    const ineligibleCount = players.filter(p => p.matches_played < minGames).length;

    if (authLoading || (loading && initialLoad)) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
                <div className="text-center font-mono">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto"></div>
                    <p className="mt-4 text-xs text-slate-450 font-bold uppercase tracking-wider">Loading eligibility matrix...</p>
                </div>
            </div>
        );
    }

    if (!user || user.role !== 'committee_admin') return null;

    // Show message if no season is selected
    if (!userSeasonId) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
                <div className="text-center max-w-md mx-auto p-8 font-mono">
                    <div className="text-4xl mb-4">🏆</div>
                    <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">No Season Selected</h2>
                    <p className="text-xs text-slate-450 mt-2 mb-6 uppercase font-bold tracking-wider leading-relaxed">
                        Please select a season from the tournament management panel to load eligibility rules.
                    </p>
                    <Link
                        href="/dashboard/committee/team-management/tournament"
                        className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
                    >
                        Go to Tournament
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
            {/* Decorative eSports glowing ambient overlay */}
            <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

            <div className="max-w-7xl mx-auto relative z-10 space-y-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <Link
                            href="/dashboard/committee/team-management/tournament"
                            className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all mb-4"
                        >
                            ← Back to Tournament
                        </Link>
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight font-mono">
                            Player Eligibility Checker
                        </h1>
                        <p className="text-xs text-slate-400 font-mono mt-1 leading-normal">
                            Check if players have met minimum game requirements
                        </p>
                    </div>
                    
                    <div className="bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm shrink-0">
                        SYSTEM: ELIGIBILITY
                    </div>
                </div>

                {/* Filters */}
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4 font-mono text-xs">
                    {/* Round Range */}
                    <div>
                        <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                            Filter by Round Range
                        </h2>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                                    From Round
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max={toRound}
                                    value={fromRound}
                                    onChange={(e) => setFromRound(Math.max(1, Math.min(parseInt(e.target.value) || 1, toRound)))}
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                                    To Round
                                </label>
                                <input
                                    type="number"
                                    min={fromRound}
                                    max={maxRound}
                                    value={toRound}
                                    onChange={(e) => setToRound(Math.max(fromRound, Math.min(parseInt(e.target.value) || maxRound, maxRound)))}
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                                    Minimum Games Required
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max={toRound - fromRound + 1}
                                    value={minGames}
                                    onChange={(e) => setMinGames(Math.max(0, parseInt(e.target.value) || 0))}
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide"
                                />
                            </div>
                        </div>

                        <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            {loading && !initialLoad ? (
                                <>
                                    <div className="animate-spin rounded-full h-3 w-3 border-b border-amber-500"></div>
                                    <span>Updating stats...</span>
                                </>
                            ) : (
                                <>
                                    <span>Showing stats from Round {fromRound} to Round {toRound} • Min {minGames} games required</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Team and Eligibility Filters */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                                Filter by Team
                            </label>
                            <select
                                value={filterTeam}
                                onChange={(e) => setFilterTeam(e.target.value)}
                                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide cursor-pointer"
                            >
                                <option value="all">All Teams</option>
                                {teams.map(team => (
                                    <option key={team.id} value={team.id}>{team.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                                Filter by Eligibility
                            </label>
                            <select
                                value={filterEligibility}
                                onChange={(e) => setFilterEligibility(e.target.value as any)}
                                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide cursor-pointer"
                            >
                                <option value="all">All Players</option>
                                <option value="eligible">✅ Eligible Only</option>
                                <option value="ineligible">⚠️ Ineligible Only</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Search */}
                <div className="mb-4 md:mb-6">
                    <div className="relative font-mono text-xs">
                        <input
                            type="text"
                            placeholder="Search player or team..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full px-4 py-3 pl-10 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide shadow-sm"
                        />
                        <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 font-mono text-xs">
                    <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Players</span>
                        <div className="text-2xl font-black text-slate-800 mt-2">{filteredPlayers.length}</div>
                    </div>
                    <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">✅ Eligible</span>
                        <div className="text-2xl font-black text-emerald-600 mt-2">{eligibleCount}</div>
                    </div>
                    <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">⚠️ Ineligible</span>
                        <div className="text-2xl font-black text-amber-600 mt-2">{ineligibleCount}</div>
                    </div>
                    <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Eligibility Rate</span>
                        <div className="text-2xl font-black text-slate-800 mt-2">
                            {players.length > 0 ? Math.round((eligibleCount / players.length) * 100) : 0}%
                        </div>
                    </div>
                </div>

                {/* Players Table */}
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm font-mono text-xs">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-100">
                            <thead className="bg-slate-800 text-white uppercase text-[10px] font-bold tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 text-left">
                                        Status
                                    </th>
                                    <th
                                        onClick={() => handleSort('player_name')}
                                        className="px-4 py-3 text-left cursor-pointer hover:bg-slate-700 transition-colors"
                                    >
                                        Player {sortBy === 'player_name' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th
                                        onClick={() => handleSort('team_name')}
                                        className="px-4 py-3 text-left cursor-pointer hover:bg-slate-700 transition-colors"
                                    >
                                        Team {sortBy === 'team_name' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th
                                        onClick={() => handleSort('matches_played')}
                                        className="px-4 py-3 text-center cursor-pointer hover:bg-slate-700 transition-colors"
                                    >
                                        Games {sortBy === 'matches_played' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th
                                        onClick={() => handleSort('wins')}
                                        className="px-4 py-3 text-center cursor-pointer hover:bg-slate-700 transition-colors"
                                    >
                                        W {sortBy === 'wins' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th
                                        onClick={() => handleSort('draws')}
                                        className="px-4 py-3 text-center cursor-pointer hover:bg-slate-700 transition-colors"
                                    >
                                        D {sortBy === 'draws' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th
                                        onClick={() => handleSort('losses')}
                                        className="px-4 py-3 text-center cursor-pointer hover:bg-slate-700 transition-colors"
                                    >
                                        L {sortBy === 'losses' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                    <th
                                        onClick={() => handleSort('goal_difference')}
                                        className="px-4 py-3 text-center cursor-pointer hover:bg-slate-700 transition-colors"
                                    >
                                        GD {sortBy === 'goal_difference' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {filteredPlayers.map((player, index) => {
                                    const isEligible = player.matches_played >= minGames;
                                    return (
                                        <tr key={player.id} className="even:bg-slate-50/40 hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3">
                                                {isEligible ? (
                                                    <span className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-50 border border-emerald-250 text-emerald-700">
                                                        ✅ Eligible
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-50 border border-amber-250 text-amber-700">
                                                        ⚠️ Ineligible
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-shrink-0 w-6 h-6 bg-slate-800 rounded-full flex items-center justify-center text-white font-extrabold text-[10px]">
                                                        {player.player_name.charAt(0)}
                                                    </div>
                                                    <span className="font-bold text-slate-800 uppercase tracking-wide">{player.player_name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-slate-650 uppercase font-medium">{player.team_name}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wide bg-slate-50 border border-slate-200 text-slate-700`}>
                                                    {player.matches_played} / {minGames}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="font-bold text-slate-700">{player.wins || 0}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="font-bold text-slate-700">{player.draws || 0}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="font-bold text-slate-700">{player.losses || 0}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`font-extrabold ${player.goal_difference > 0 ? 'text-emerald-600' : player.goal_difference < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                                                    {player.goal_difference > 0 ? '+' : ''}{player.goal_difference || 0}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
