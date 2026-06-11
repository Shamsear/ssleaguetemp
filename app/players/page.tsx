'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PlayerPhoto from '@/components/PlayerPhoto';
import {
  Zap,
  Shield,
  Flame,
  Target,
  Award,
  ArrowRight,
  Search,
  Filter,
  ChevronRight,
  TrendingUp,
  Activity,
  Award as AwardIcon
} from 'lucide-react';

interface Player {
  id: string;
  player_id: string;
  name: string;
  display_name?: string;
  category?: string;
  team?: string;
  team_name?: string;
  photo_url?: string;
  photo_position_circle?: string;
  photo_scale_circle?: number;
  photo_position_x_circle?: number;
  photo_position_y_circle?: number;
  photo_position_square?: string;
  photo_scale_square?: number;
  photo_position_x_square?: number;
  photo_position_y_square?: number;
  current_season_id?: string;
  stats: {
    points: number;
    matches_played: number;
    goals_scored: number;
    clean_sheets: number;
  };
}

function PlayersContent() {
  const searchParams = useSearchParams();
  const seasonId = searchParams.get('season');
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('points'); // Default sort by points now, fits leaderboards better
  const [teams, setTeams] = useState<string[]>([]);
  const [seasonName, setSeasonName] = useState<string>('');

  useEffect(() => {
    fetchPlayers();
  }, [seasonId]);

  useEffect(() => {
    applyFilters();
  }, [searchTerm, categoryFilter, teamFilter, sortBy, players]);

  const fetchPlayers = async () => {
    try {
      setLoading(true);
      
      let playersData: Player[] = [];
      
      // If season filter is provided, fetch season-specific stats
      if (seasonId) {
        const seasonRes = await fetch(`/api/seasons/${seasonId}/stats`);
        const seasonData = await seasonRes.json();
        
        if (seasonData.success && seasonData.data) {
          // Fetch season details for name
          try {
            const detailsRes = await fetch(`/api/seasons/${seasonId}/details`);
            const detailsData = await detailsRes.json();
            if (detailsData.success) {
              setSeasonName(detailsData.data.name || '');
            }
          } catch (err) {
            console.error('Error fetching season name:', err);
          }
          
          // Get players from the API response
          const playersList = seasonData.data.players || [];
          
          // Fetch player photos from the overall players API which includes photo_url
          let photoMap = new Map<string, any>();
          try {
            const allPlayersRes = await fetch('/api/players/with-stats');
            const allPlayersData = await allPlayersRes.json();
            if (allPlayersData.success && allPlayersData.players) {
              allPlayersData.players.forEach((p: any) => {
                photoMap.set(p.player_id, p);
              });
            }
          } catch (err) {
            console.error('Error fetching player photos:', err);
          }
          
          playersData = playersList.map((player: any) => {
            const extra = photoMap.get(player.player_id) || {};
            return {
              id: player.player_id,
              player_id: player.player_id,
              name: player.player_name,
              display_name: player.player_name,
              category: player.category,
              team: player.team_name,
              team_name: player.team_name,
              photo_url: extra.photo_url || null,
              photo_position_circle: extra.photo_position_circle,
              photo_scale_circle: extra.photo_scale_circle,
              photo_position_x_circle: extra.photo_position_x_circle,
              photo_position_y_circle: extra.photo_position_y_circle,
              photo_position_square: extra.photo_position_square,
              photo_scale_square: extra.photo_scale_square,
              photo_position_x_square: extra.photo_position_x_square,
              photo_position_y_square: extra.photo_position_y_square,
              current_season_id: seasonId,
              stats: {
                points: player.points || 0,
                matches_played: player.matches_played || 0,
                goals_scored: player.goals_scored || 0,
                clean_sheets: player.clean_sheets || 0
              }
            };
          }) as Player[];
        }
      } else {
        // Fetch all players with overall stats
        const response = await fetch('/api/players/with-stats');
        const data = await response.json();
        
        if (data.success && data.players) {
          playersData = data.players.map((p: any) => ({
            id: p.id,
            player_id: p.player_id,
            name: p.name,
            display_name: p.display_name,
            category: p.category,
            team: p.team,
            team_name: p.team_name,
            photo_url: p.photo_url,
            photo_position_circle: p.photo_position_circle,
            photo_scale_circle: p.photo_scale_circle,
            photo_position_x_circle: p.photo_position_x_circle,
            photo_position_y_circle: p.photo_position_y_circle,
            photo_position_square: p.photo_position_square,
            photo_scale_square: p.photo_scale_square,
            photo_position_x_square: p.photo_position_x_square,
            photo_position_y_square: p.photo_position_y_square,
            current_season_id: p.current_season_id,
            stats: {
              points: p.total_points || 0,
              matches_played: p.matches_played || 0,
              goals_scored: p.goals_scored || 0,
              clean_sheets: p.clean_sheets || 0
            }
          })) as Player[];
        }
      }
      
      setPlayers(playersData);
      
      // Extract unique teams for filter
      const uniqueTeams = Array.from(new Set(playersData.map(p => p.team_name).filter(Boolean))) as string[];
      setTeams(uniqueTeams.sort());
    } catch (error) {
      console.error('Error fetching players:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...players];
    
    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(player =>
        player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        player.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(player => player.category === categoryFilter);
    }
    
    // Team filter
    if (teamFilter !== 'all') {
      filtered = filtered.filter(player => player.team_name === teamFilter);
    }
    
    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'goals':
          return b.stats.goals_scored - a.stats.goals_scored;
        case 'matches':
          return b.stats.matches_played - a.stats.matches_played;
        case 'points':
          return b.stats.points - a.stats.points;
        default:
          return 0;
      }
    });
    
    setFilteredPlayers(filtered);
  };

  if (loading) {
    return (
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-slate-500 font-mono text-xs">Loading Players Portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-8">
        
        {/* Title Panel */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">League Registry</span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              {seasonName ? `${seasonName} Players` : 'All Players'}
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-1">
              {seasonName ? `PLAYERS IN ${seasonName.toUpperCase()}:` : 'REGISTERED PLAYERS:'} <span className="text-amber-600 font-bold">{filteredPlayers.length}</span>
            </p>
          </div>
          
          <div className="text-right bg-slate-50 border border-slate-200 px-5 py-2.5 rounded-xl font-mono">
            <div className="text-2xl font-black text-amber-600">{players.length}</div>
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Total Players</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                Search Players
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Enter name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-700 bg-slate-50 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                Category
              </label>
              <div className="relative">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-700 bg-slate-50 focus:ring-1 focus:ring-amber-500 focus:outline-none appearance-none"
                >
                  <option value="all">All Categories</option>
                  <option value="Legend">Legend</option>
                  <option value="Classic">Classic</option>
                </select>
                <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Team Filter */}
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                Squad/Team
              </label>
              <div className="relative">
                <select
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-700 bg-slate-50 focus:ring-1 focus:ring-amber-500 focus:outline-none appearance-none"
                >
                  <option value="all">All Squads</option>
                  {teams.map(team => (
                    <option key={team} value={team}>{team}</option>
                  ))}
                </select>
                <Shield className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                Sort By
              </label>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-700 bg-slate-50 focus:ring-1 focus:ring-amber-500 focus:outline-none appearance-none"
                >
                  <option value="points">Points (High to Low)</option>
                  <option value="goals">Goals (High to Low)</option>
                  <option value="matches">Matches Played</option>
                  <option value="name">Name (A-Z)</option>
                </select>
                <TrendingUp className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Results Count */}
          <div className="mt-4 text-[10px] font-mono text-slate-400 uppercase flex justify-between items-center">
            <span>Showing {filteredPlayers.length} of {players.length} players</span>
            {searchTerm || categoryFilter !== 'all' || teamFilter !== 'all' ? (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setCategoryFilter('all');
                  setTeamFilter('all');
                  setSortBy('points');
                }}
                className="text-amber-600 hover:text-amber-700 font-bold hover:underline"
              >
                Clear Filters
              </button>
            ) : null}
          </div>
        </div>

        {/* Mobile Cards View */}
        <div className="block lg:hidden space-y-3">
          {filteredPlayers.length === 0 ? (
            <div className="bg-white border border-slate-200/60 rounded-2xl p-12 text-center shadow-sm">
              <Shield className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-1">No Players Found</h3>
              <p className="text-xs text-slate-500 font-mono">
                TRY ADJUSTING YOUR FILTER CRITERIA
              </p>
            </div>
          ) : (
            filteredPlayers.map((player, index) => (
              <Link
                key={player.id}
                href={`/players/${player.player_id}`}
                className="block console-card rounded-xl p-4 hover:border-amber-400/40 transition-all duration-200"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold font-mono text-xs">
                    {index + 1}
                  </div>
                  
                  {/* Photo circle overlay matching modern season page cards */}
                  <div className="relative w-12 h-12 rounded-full overflow-hidden shadow-sm border border-slate-200 bg-white flex-shrink-0">
                    <PlayerPhoto
                      photoUrl={player.photo_url}
                      playerName={player.name}
                      shape="circle"
                      size={48}
                      positionCircle={player.photo_position_circle}
                      scaleCircle={player.photo_scale_circle}
                      posXCircle={player.photo_position_x_circle}
                      posYCircle={player.photo_position_y_circle}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate">
                      {player.display_name || player.name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-slate-500 font-semibold truncate">
                        {player.team_name || 'Unassigned'}
                      </span>
                      {player.category && (
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold font-mono uppercase ${
                          player.category.toLowerCase() === 'legend'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {player.category}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <span className="text-sm font-black text-amber-600 font-mono">
                      {player.stats.points} PTS
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[10px] text-center text-slate-500 font-mono pt-2 border-t border-slate-100">
                  <div>
                    <div className="text-[9px] uppercase text-slate-400">MP</div>
                    <div className="font-bold text-slate-800 mt-0.5">{player.stats.matches_played}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-purple-600 font-bold">Goals</div>
                    <div className="font-bold text-purple-600 mt-0.5">{player.stats.goals_scored}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-emerald-600 font-bold">CS</div>
                    <div className="font-bold text-emerald-600 mt-0.5">{player.stats.clean_sheets}</div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
          {filteredPlayers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-mono text-sm">
              <Shield className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              No players found matching your criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-slate-700 border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 font-mono text-[10px] text-slate-400 font-bold uppercase tracking-wider text-center">
                    <th className="text-left py-4 px-4 w-16">Rank</th>
                    <th className="text-left py-4 px-4">Player</th>
                    <th className="text-left py-4 px-4">Squad</th>
                    <th className="py-4 px-2">MP</th>
                    <th className="py-4 px-2 text-purple-600">Goals</th>
                    <th className="py-4 px-2 text-emerald-600">CS</th>
                    <th className="py-4 px-4 text-amber-600">Pts</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredPlayers.map((player, index) => (
                    <tr
                      key={player.id}
                      className="hover:bg-slate-50/50 transition-colors text-center"
                    >
                      <td className="py-4 px-4 text-left">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold font-mono text-xs">
                          {index + 1}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-left font-bold text-slate-900 text-sm">
                        <Link href={`/players/${player.player_id}`} className="flex items-center gap-3 group">
                          <div className="w-10 h-10 rounded-full overflow-hidden shadow-sm border border-slate-200 bg-white flex-shrink-0">
                            <PlayerPhoto
                              photoUrl={player.photo_url}
                              playerName={player.name}
                              shape="circle"
                              size={40}
                              positionCircle={player.photo_position_circle}
                              scaleCircle={player.photo_scale_circle}
                              posXCircle={player.photo_position_x_circle}
                              posYCircle={player.photo_position_y_circle}
                            />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="group-hover:text-amber-600 transition-colors text-sm truncate">
                              {player.display_name || player.name}
                            </span>
                            {player.category && (
                              <span className="mt-0.5">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold font-mono uppercase tracking-wider ${
                                  player.category.toLowerCase() === 'legend'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200/20'
                                    : 'bg-blue-100 text-blue-800 border border-blue-200/20'
                                }`}>
                                  {player.category}
                                </span>
                              </span>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="py-4 px-4 text-left text-slate-600 text-xs font-semibold">
                        {player.team_name || <span className="text-slate-400 font-mono italic">Unassigned</span>}
                      </td>
                      <td className="py-4 px-2 font-mono text-xs text-slate-500">{player.stats.matches_played}</td>
                      <td className="py-4 px-2 font-mono text-xs text-purple-600 font-bold">{player.stats.goals_scored}</td>
                      <td className="py-4 px-2 font-mono text-xs text-emerald-600 font-bold">{player.stats.clean_sheets}</td>
                      <td className="py-4 px-4 font-mono font-black text-amber-600 text-sm">{player.stats.points}</td>
                      <td className="py-4 px-4 text-right">
                        <Link href={`/players/${player.player_id}`}>
                          <ChevronRight className="w-5 h-5 text-slate-400 hover:text-amber-600 transition-colors cursor-pointer inline-block" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AllPlayersPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-slate-500 font-mono text-xs">Loading Players Portal...</p>
        </div>
      </div>
    }>
      <PlayersContent />
    </Suspense>
  );
}
