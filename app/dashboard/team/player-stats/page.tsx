'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import Link from 'next/link';
import { BarChart2, ArrowLeft, Calendar, Search } from 'lucide-react';

interface PlayerStats {
  id: string;
  player_id: string;
  player_name: string;
  season_id: string;
  team: string;
  points: number;
  base_points: number;
  matches_played: number;
  goals_scored: number;
  goals_conceded: number;
  goal_difference: number;
  wins: number;
  draws: number;
  losses: number;
  clean_sheets: number;
  auction_value?: number;
  star_rating?: number;
}

interface MatchdayStats {
  matchday: number;
  fixture_id: string;
  player_side: 'home' | 'away';
  home_team_name: string;
  away_team_name: string;
  home_player_name: string;
  away_player_name: string;
  goals_scored: number;
  goals_conceded: number;
  goal_difference: number;
  points: number;
  was_substitute: boolean;
}

interface Season {
  id: string;
  name: string;
}

export default function TeamPlayerStatsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<keyof PlayerStats>('points');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [matchdayStats, setMatchdayStats] = useState<Map<string, MatchdayStats[]>>(new Map());
  const [loadingMatchday, setLoadingMatchday] = useState<string | null>(null);
  const [playerTotalPoints, setPlayerTotalPoints] = useState<Map<string, number>>(new Map());
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
  }, [user, authLoading, router]);

  // Load available seasons
  useEffect(() => {
    const loadSeasons = async () => {
      try {
        const response = await fetchWithTokenRefresh('/api/seasons');
        if (response.ok) {
          const data = await response.json();
          const allSeasons = data.seasons || [];
          
          // Filter to show only SSPSLS16 and later (hide historical seasons)
          const filteredSeasons = allSeasons.filter((s: Season) => {
            const match = s.id.match(/\d+$/);
            if (match) {
              const seasonNumber = parseInt(match[0]);
              return seasonNumber >= 16;
            }
            return true;
          });
          
          setSeasons(filteredSeasons);
          
          // Set default season to SSPSLS16 or first available
          const defaultSeason = filteredSeasons.find((s: Season) => s.id === 'SSPSLS16') || filteredSeasons[0];
          if (defaultSeason) {
            setSelectedSeason(defaultSeason.id);
          }
        }
      } catch (error) {
        console.error('Error loading seasons:', error);
      }
    };
    
    if (user) {
      loadSeasons();
    }
  }, [user]);

  useEffect(() => {
    if (user && selectedSeason) {
      loadPlayers();
    }
  }, [user, selectedSeason]);

  const loadPlayers = async () => {
    if (!selectedSeason) {
      console.warn('No season selected');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/committee/player-stats?season_id=${selectedSeason}`);
      if (response.ok) {
        const data = await response.json();
        console.log('[Player Stats Page] Loaded players:', data.players?.length);
        if (data.players?.length > 0) {
          console.log('[Player Stats Page] First player base_points:', data.players[0].base_points);
        }
        setPlayers(data.players || []);
        
        // Load total points for all players
        loadAllPlayerTotalPoints(data.players || []);
      }
    } catch (error) {
      console.error('Error loading players:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllPlayerTotalPoints = async (playersList: PlayerStats[]) => {
    const newPlayerTotalPoints = new Map<string, number>();
    
    // Load total points for each player in parallel
    const promises = playersList.map(async (player) => {
      try {
        const response = await fetchWithTokenRefresh(`/api/committee/player-matchday-stats?player_id=${player.id}&season_id=${selectedSeason}`);
        if (response.ok) {
          const data = await response.json();
          newPlayerTotalPoints.set(player.id, data.totalPoints || 0);
        }
      } catch (error) {
        console.error(`Error loading total points for ${player.player_name}:`, error);
      }
    });
    
    await Promise.all(promises);
    setPlayerTotalPoints(newPlayerTotalPoints);
  };

  const loadMatchdayStats = async (playerId: string) => {
    if (matchdayStats.has(playerId)) {
      // Already loaded, just toggle
      setExpandedPlayer(expandedPlayer === playerId ? null : playerId);
      return;
    }

    setLoadingMatchday(playerId);
    try {
      const response = await fetchWithTokenRefresh(`/api/committee/player-matchday-stats?player_id=${playerId}&season_id=${selectedSeason}`);
      if (response.ok) {
        const data = await response.json();
        const newMatchdayStats = new Map(matchdayStats);
        newMatchdayStats.set(playerId, data.matchdayStats || []);
        setMatchdayStats(newMatchdayStats);
        
        // Store total points for this player
        const newPlayerTotalPoints = new Map(playerTotalPoints);
        newPlayerTotalPoints.set(playerId, data.totalPoints || 0);
        setPlayerTotalPoints(newPlayerTotalPoints);
        
        setExpandedPlayer(playerId);
      }
    } catch (error) {
      console.error('Error loading matchday stats:', error);
    } finally {
      setLoadingMatchday(null);
    }
  };

  const handleSort = (column: keyof PlayerStats) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const filteredPlayers = players
    .filter(p =>
      p.player_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.team?.toLowerCase().includes(searchTerm.toLowerCase())
    )
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

  const SortIcon = ({ field }: { field: keyof PlayerStats }) => {
    if (sortBy !== field) {
      return (
        <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    if (sortOrder === 'asc') {
      return (
        <svg className="w-3 h-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
        </svg>
      );
    } else {
      return (
        <svg className="w-3 h-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
        </svg>
      );
    }
  };

  if (authLoading || loading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Player Statistics...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Back Link */}
        <Link
          href="/dashboard/team"
          className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5 text-slate-600" />
          Dashboard
        </Link>

        {/* Header Title Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono relative overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
                <BarChart2 className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800">
                  Player Statistics
                </h1>
                <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                  Track performance details for all league players
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Season & Search Filter Container */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Season Filter */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Select Season</h3>
            </div>
            {seasons.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200/40 rounded-xl w-fit">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-amber-500"></div>
                <span className="text-[10px] text-slate-500 font-bold uppercase">Loading seasons...</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {seasons.map((season) => (
                  <button
                    key={season.id}
                    onClick={() => {
                      setSelectedSeason(season.id);
                      setExpandedPlayer(null);
                      setMatchdayStats(new Map());
                    }}
                    className={`
                      px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer
                      ${selectedSeason === season.id
                        ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                        : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
                      }
                    `}
                  >
                    {season.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Search Player</h3>
            </div>
            <div className="relative flex-1 flex items-center">
              <input
                type="text"
                placeholder="Search player or team name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full py-2 px-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
              />
            </div>
            <div className="mt-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Filtering {filteredPlayers.length} of {players.length} players
            </div>
          </div>
        </div>

        {/* Players Table Container */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl overflow-hidden font-mono shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/40 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-lg font-bold">📋</span>
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Player Standings & Stats</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Click expand button for matchday performance breakdown</p>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Sorted by <span className="text-slate-800 font-extrabold">{sortBy === 'player_name' ? 'Name' : sortBy.replace('_', ' ').toUpperCase()}</span>
            </div>
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-center font-mono">
              <thead className="bg-slate-50/50 border-b border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3.5 w-12 text-center">
                    <span className="sr-only">Expand</span>
                  </th>
                  <th
                    onClick={() => handleSort('player_name')}
                    className="px-4 py-3.5 text-left font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 hover:text-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      Player
                      <SortIcon field="player_name" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('team')}
                    className="px-4 py-3.5 text-left font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 hover:text-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      Team
                      <SortIcon field="team" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('points')}
                    className="px-4 py-3.5 font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 hover:text-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      Points
                      <SortIcon field="points" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('base_points')}
                    className="px-4 py-3.5 font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 hover:text-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      Base
                      <SortIcon field="base_points" />
                    </div>
                  </th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">
                    Change
                  </th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">
                    Total
                  </th>
                  <th
                    onClick={() => handleSort('matches_played')}
                    className="px-4 py-3.5 font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 hover:text-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      MP
                      <SortIcon field="matches_played" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('goals_scored')}
                    className="px-4 py-3.5 font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 hover:text-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      GS
                      <SortIcon field="goals_scored" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('goals_conceded')}
                    className="px-4 py-3.5 font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 hover:text-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      GC
                      <SortIcon field="goals_conceded" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('goal_difference')}
                    className="px-4 py-3.5 font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 hover:text-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      GD
                      <SortIcon field="goal_difference" />
                    </div>
                  </th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">
                    W-D-L
                  </th>
                  <th
                    onClick={() => handleSort('clean_sheets')}
                    className="px-4 py-3.5 font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 hover:text-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      CS
                      <SortIcon field="clean_sheets" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white/40 divide-y divide-slate-100/60">
                {filteredPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-6 py-12 text-center text-slate-400">
                      <span className="text-4xl mb-3 block">👤</span>
                      <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">No Players Found</h3>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Verify search input or try a different season</p>
                    </td>
                  </tr>
                ) : (
                  filteredPlayers.map((player) => {
                    const change = player.base_points > 0 ? player.points - player.base_points : 0;
                    const totalPoints = playerTotalPoints.get(player.id) || 0;
                    return (
                      <React.Fragment key={player.id}>
                        <tr className="hover:bg-slate-50/50 transition-colors text-center">
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <button
                              onClick={() => loadMatchdayStats(player.id)}
                              disabled={loadingMatchday === player.id}
                              className="p-1 hover:bg-slate-100 border border-slate-200/60 rounded-lg transition-all disabled:opacity-50 cursor-pointer"
                            >
                              {loadingMatchday === player.id ? (
                                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-amber-500"></div>
                              ) : expandedPlayer === player.id ? (
                                <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                                </svg>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3.5 text-left whitespace-nowrap font-bold text-slate-800">
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0 w-8 h-8 bg-slate-800 border border-slate-900 rounded-xl flex items-center justify-center text-amber-400 font-extrabold text-xs shadow-md">
                                {player.player_name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span className="text-xs font-black text-slate-800">{player.player_name}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-left whitespace-nowrap text-xs font-extrabold text-slate-500 uppercase">
                            {player.team || 'Unassigned'}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-black border uppercase tracking-wider bg-slate-800 text-amber-400 border-slate-900">
                              {player.points || 0}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-extrabold text-slate-650">
                            {player.base_points || 0}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {player.base_points > 0 ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black border ${
                                change > 0 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
                                  : change < 0
                                  ? 'bg-rose-50 text-rose-700 border-rose-200/50'
                                  : 'bg-slate-50 text-slate-600 border-slate-200/50'
                              }`}>
                                {change > 0 ? '↑' : change < 0 ? '↓' : '='} 
                                {change > 0 ? '+' : ''}{change}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 font-bold">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {playerTotalPoints.has(player.id) ? (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-black border uppercase tracking-wider ${
                                totalPoints > 0 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
                                  : totalPoints < 0
                                  ? 'bg-rose-50 text-rose-700 border-rose-200/50'
                                  : 'bg-slate-50 text-slate-600 border-slate-200/50'
                              }`}>
                                {totalPoints > 0 ? '+' : ''}{totalPoints}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-bold">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-extrabold text-slate-700">
                            {player.matches_played || 0}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider bg-emerald-50 text-emerald-700 border-emerald-200/40">
                              ⚽ {player.goals_scored || 0}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-semibold text-rose-600">
                            {player.goals_conceded || 0}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black border ${
                              player.goal_difference > 0 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
                                : player.goal_difference < 0
                                ? 'bg-rose-50 text-rose-700 border-rose-200/50'
                                : 'bg-slate-50 text-slate-650 border-slate-200/50'
                            }`}>
                              {player.goal_difference > 0 ? '+' : ''}{player.goal_difference || 0}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-extrabold text-slate-600">
                            <span className="text-emerald-600 font-bold">{player.wins}</span>-
                            <span className="text-slate-400">{player.draws}</span>-
                            <span className="text-rose-600 font-bold">{player.losses}</span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-extrabold text-slate-750">
                            {player.clean_sheets || 0}
                          </td>
                        </tr>

                        {/* Expanded Matchday Stats Drawer inside the table */}
                        {expandedPlayer === player.id && matchdayStats.has(player.id) && (
                          <tr className="bg-slate-50/[0.15]">
                            <td colSpan={13} className="px-6 py-6 border-t border-b border-slate-100">
                              <div className="console-card bg-white border border-slate-200/60 rounded-xl p-5 shadow-inner">
                                <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
                                  <span className="text-base">📊</span>
                                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                                    Matchday Breakdown - {player.player_name}
                                  </h4>
                                </div>

                                {matchdayStats.get(player.id)!.length === 0 ? (
                                  <div className="text-center py-6 text-slate-400">
                                    <p className="text-[10px] font-bold uppercase">No completed matches in this range</p>
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-slate-100 text-center font-mono">
                                      <thead className="bg-slate-50/50 border-b border-slate-100 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                                        <tr>
                                          <th className="px-3 py-2 text-left">Round</th>
                                          <th className="px-3 py-2 text-left">Matchup</th>
                                          <th className="px-3 py-2">Score</th>
                                          <th className="px-3 py-2">GD</th>
                                          <th className="px-3 py-2">Points</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100/50 bg-white/40">
                                        {matchdayStats.get(player.id)!.map((match, idx) => (
                                          <tr key={idx} className="hover:bg-slate-50/20 text-xs">
                                            <td className="px-3 py-2.5 text-left whitespace-nowrap">
                                              <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider bg-slate-800 text-amber-400 border-slate-900">
                                                R{match.matchday}
                                              </span>
                                              {match.was_substitute && (
                                                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200/50 uppercase">
                                                  SUB
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2.5 text-left">
                                              <div className="text-slate-800 font-medium">
                                                {match.player_side === 'home' ? (
                                                  <>
                                                    <span className="font-extrabold text-slate-800">{match.home_player_name}</span>
                                                    <span className="text-slate-400 mx-1.5 font-bold">vs</span>
                                                    <span className="text-slate-500">{match.away_player_name}</span>
                                                  </>
                                                ) : (
                                                  <>
                                                    <span className="text-slate-500">{match.home_player_name}</span>
                                                    <span className="text-slate-400 mx-1.5 font-bold">vs</span>
                                                    <span className="font-extrabold text-slate-800">{match.away_player_name}</span>
                                                  </>
                                                )}
                                                <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                                                  {match.home_team_name} vs {match.away_team_name}
                                                </div>
                                              </div>
                                            </td>
                                            <td className="px-3 py-2.5 font-bold text-slate-700 whitespace-nowrap">
                                              {match.goals_scored} - {match.goals_conceded}
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                match.goal_difference > 0 
                                                  ? 'text-emerald-650 font-black' 
                                                  : match.goal_difference < 0 
                                                  ? 'text-rose-650 font-black' 
                                                  : 'text-slate-550'
                                              }`}>
                                                {match.goal_difference > 0 ? '+' : ''}{match.goal_difference}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                              <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border ${
                                                match.points > 0 
                                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
                                                  : match.points < 0 
                                                  ? 'bg-rose-50 text-rose-700 border-rose-200/50' 
                                                  : 'bg-slate-50 text-slate-600 border-slate-200/50'
                                              }`}>
                                                {match.points > 0 ? '+' : ''}{match.points}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                      <tfoot className="border-t border-slate-200 bg-slate-50/50 font-black text-xs text-slate-800">
                                        <tr>
                                          <td colSpan={4} className="px-3 py-3 text-right uppercase tracking-wider font-extrabold text-[10px] text-slate-400">
                                            Total Points:
                                          </td>
                                          <td className="px-3 py-3">
                                            <span className={`inline-flex items-center px-3 py-1 rounded-xl text-xs font-black border uppercase tracking-wider ${
                                              matchdayStats.get(player.id)!.reduce((sum, m) => sum + m.points, 0) > 0 
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                                                : matchdayStats.get(player.id)!.reduce((sum, m) => sum + m.points, 0) < 0 
                                                ? 'bg-rose-50 text-rose-700 border-rose-300' 
                                                : 'bg-slate-50 text-slate-600 border-slate-300'
                                            }`}>
                                              {matchdayStats.get(player.id)!.reduce((sum, m) => sum + m.points, 0) > 0 ? '+' : ''}
                                              {matchdayStats.get(player.id)!.reduce((sum, m) => sum + m.points, 0)}
                                            </span>
                                          </td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile View */}
          <div className="sm:hidden space-y-4 px-3 pb-4 pt-2">
            {filteredPlayers.length === 0 ? (
              <div className="text-center py-8 text-slate-400 bg-white border border-slate-200/60 rounded-xl">
                <span className="text-4xl mb-2 block">👤</span>
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-1">No Players Found</h3>
              </div>
            ) : (
              filteredPlayers.map((player) => {
                const isExpanded = expandedPlayer === player.id;
                const change = player.base_points > 0 ? player.points - player.base_points : 0;
                const totalPoints = playerTotalPoints.get(player.id) || 0;
                return (
                  <div 
                    key={player.id} 
                    className="console-card bg-white border border-slate-200/60 rounded-xl p-4 shadow-sm relative overflow-hidden"
                  >
                    {/* Player Card Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex-shrink-0 w-8 h-8 bg-slate-800 border border-slate-900 rounded-xl flex items-center justify-center text-amber-400 font-extrabold text-xs shadow-md">
                          {player.player_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="text-xs font-black text-slate-800">{player.player_name}</h3>
                          <span className="block text-[9px] text-slate-400 font-bold uppercase mt-0.5">{player.team || 'Unassigned'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black border uppercase tracking-wider bg-slate-800 text-amber-400 border-slate-900">
                          {player.points || 0}
                        </span>
                        <button
                          onClick={() => loadMatchdayStats(player.id)}
                          disabled={loadingMatchday === player.id}
                          className="p-1 hover:bg-slate-100 border border-slate-200/60 rounded-lg transition-all disabled:opacity-50 cursor-pointer"
                        >
                          {loadingMatchday === player.id ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-amber-500"></div>
                          ) : isExpanded ? (
                            <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 text-center text-xs">
                      <div className="bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Played</p>
                        <p className="font-extrabold text-slate-800">{player.matches_played || 0}</p>
                      </div>
                      <div className="bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Goals</p>
                        <p className="font-extrabold text-emerald-700">⚽ {player.goals_scored || 0}</p>
                      </div>
                      <div className="bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">GD</p>
                        <p className={`font-extrabold ${player.goal_difference > 0 ? 'text-emerald-600' : player.goal_difference < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                          {player.goal_difference > 0 ? '+' : ''}{player.goal_difference || 0}
                        </p>
                      </div>
                    </div>

                    {/* Points Details Row */}
                    <div className="grid grid-cols-3 gap-2 mt-2 text-center text-xs">
                      <div className="bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Base</p>
                        <p className="font-extrabold text-slate-800">{player.base_points || 0}</p>
                      </div>
                      <div className="bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Change</p>
                        {player.base_points > 0 ? (
                          <span className={`font-black text-[10px] ${change > 0 ? 'text-emerald-600' : change < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                            {change > 0 ? '+' : ''}{change}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-bold">-</span>
                        )}
                      </div>
                      <div className="bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Total</p>
                        <span className={`font-black text-[10px] ${totalPoints > 0 ? 'text-emerald-600' : totalPoints < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                          {totalPoints > 0 ? '+' : ''}{totalPoints}
                        </span>
                      </div>
                    </div>

                    {/* Additional Stats Row */}
                    <div className="grid grid-cols-2 gap-2 mt-2 text-center text-xs">
                      <div className="bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">W-D-L</p>
                        <p className="font-extrabold text-[10px]">
                          <span className="text-emerald-600">{player.wins}</span>-
                          <span className="text-slate-400">{player.draws}</span>-
                          <span className="text-rose-600">{player.losses}</span>
                        </p>
                      </div>
                      <div className="bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Clean Sheets</p>
                        <p className="font-extrabold text-slate-800">{player.clean_sheets || 0}</p>
                      </div>
                    </div>

                    {/* Expanded breakdown for mobile */}
                    {isExpanded && matchdayStats.has(player.id) && (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                        <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-wider mb-2">Matchday Log</h4>
                        {matchdayStats.get(player.id)!.length === 0 ? (
                          <p className="text-[10px] text-slate-400 font-bold uppercase text-center py-2">No completed matches</p>
                        ) : (
                          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                            {matchdayStats.get(player.id)!.map((match, idx) => (
                              <div key={idx} className="bg-slate-50/60 p-2.5 rounded-lg border border-slate-100 text-[11px] space-y-1">
                                <div className="flex justify-between items-center font-bold">
                                  <span className="inline-flex items-center px-1.5 py-0.2 bg-slate-800 text-amber-400 border border-slate-900 rounded text-[9px]">R{match.matchday}</span>
                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-black border ${
                                    match.points > 0 
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
                                      : match.points < 0 
                                      ? 'bg-rose-50 text-rose-700 border-rose-200/50' 
                                      : 'bg-slate-50 text-slate-650 border-slate-200/50'
                                  }`}>{match.points > 0 ? '+' : ''}{match.points} pts</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-700">
                                  <span>
                                    {match.player_side === 'home' ? (
                                      <>
                                        <span className="font-extrabold">{match.home_player_name}</span>
                                        <span className="text-slate-400 mx-1">vs</span>
                                        <span className="text-slate-500">{match.away_player_name}</span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-slate-500">{match.home_player_name}</span>
                                        <span className="text-slate-400 mx-1">vs</span>
                                        <span className="font-extrabold">{match.away_player_name}</span>
                                      </>
                                    )}
                                  </span>
                                  <span className="font-black text-slate-800">{match.goals_scored}-{match.goals_conceded}</span>
                                </div>
                                <div className="text-[9px] text-slate-400 uppercase font-semibold">
                                  {match.home_team_name} vs {match.away_team_name}
                                </div>
                              </div>
                            ))}
                            
                            <div className="flex justify-between items-center bg-slate-100 p-2 rounded-lg border border-slate-200/60 font-black text-xs">
                              <span className="uppercase text-[9px] text-slate-400">Total Points:</span>
                              <span className={matchdayStats.get(player.id)!.reduce((sum, m) => sum + m.points, 0) > 0 ? 'text-emerald-600' : matchdayStats.get(player.id)!.reduce((sum, m) => sum + m.points, 0) < 0 ? 'text-rose-600' : 'text-slate-700'}>
                                {matchdayStats.get(player.id)!.reduce((sum, m) => sum + m.points, 0) > 0 ? '+' : ''}
                                {matchdayStats.get(player.id)!.reduce((sum, m) => sum + m.points, 0)} pts
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="console-card bg-white border border-slate-200/60 rounded-xl p-5 shadow-sm hover:border-amber-400/40 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Players</p>
                <p className="text-2xl font-black text-slate-800 mt-1">{filteredPlayers.length}</p>
              </div>
              <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-xl p-5 shadow-sm hover:border-amber-400/40 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Goals</p>
                <p className="text-2xl font-black text-slate-800 mt-1">
                  {filteredPlayers.reduce((sum, p) => sum + (p.goals_scored || 0), 0)}
                </p>
              </div>
              <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-lg">⚽</span>
              </div>
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-xl p-5 shadow-sm hover:border-amber-400/40 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Matches</p>
                <p className="text-2xl font-black text-slate-800 mt-1">
                  {filteredPlayers.reduce((sum, p) => sum + (p.matches_played || 0), 0)}
                </p>
              </div>
              <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-xl p-5 shadow-sm hover:border-amber-400/40 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Clean Sheets</p>
                <p className="text-2xl font-black text-slate-800 mt-1">
                  {filteredPlayers.reduce((sum, p) => sum + (p.clean_sheets || 0), 0)}
                </p>
              </div>
              <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-lg">🧤</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
