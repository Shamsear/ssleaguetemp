'use client';

import { SoccerBallIcon } from '@/components/ui/CustomIcons';
import { Tag, User, Users, DollarSign, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import OptimizedImage from '@/components/OptimizedImage';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { normalizeStr } from '@/lib/utils/normalizeStr';
import AuthGuard from '@/components/auth/AuthGuard';

interface RealPlayer {
  player_id: string;
  player_name: string;
  display_name?: string;
  photo_url?: string;
  photo_position_x_circle?: number | null;
  photo_position_y_circle?: number | null;
  photo_scale_circle?: number | null;
  team: string;
  team_id: string;
  category: string;
  base_price: number;
  price: number;
  /** legacy – only set for S16/S17 */
  star_rating?: number;
  /** legacy – only set for S16/S17 */
  auction_value?: number;
  points: number;
  matches_played: number;
  goals_scored: number;
  assists: number;
  wins: number;
  draws: number;
  losses: number;
  clean_sheets: number;
  motm_awards: number;
}

/** Colour style per category name */
function categoryStyle(cat: string) {
  const c = cat.toLowerCase();
  if (c === 'red' || c === 'legend')
    return 'bg-red-100 border border-red-300 text-red-800';
  if (c === 'black' || c === 'elite')
    return 'bg-slate-800 border border-slate-700 text-white';
  if (c === 'blue' || c === 'professional')
    return 'bg-blue-100 border border-blue-300 text-blue-800';
  if (c === 'white' || c === 'amateur')
    return 'bg-slate-100 border border-slate-300 text-slate-700';
  return 'bg-slate-200 border border-slate-300 text-slate-700';
}

export default function RealPlayersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [players, setPlayers] = useState<RealPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'points' | 'base_price' | 'price' | 'matches' | 'goals'>('points');
  const [activeSeason, setActiveSeason] = useState<any>(null);
  const [isModern, setIsModern] = useState(false);
  const [teams, setTeams] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [updateCounter, setUpdateCounter] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      const startTime = Date.now();
      try {
        setIsLoading(true);

        // 1) Active season
        const seasonResponse = await fetchWithTokenRefresh('/api/cached/firebase/seasons?isActive=true');
        if (!seasonResponse.ok) return;
        const seasonData = await seasonResponse.json();
        if (!seasonData.success || seasonData.data.length === 0) return;

        const season = seasonData.data[0];
        setActiveSeason(season);

        // 2) Players from the dedicated endpoint
        const playersResponse = await fetchWithTokenRefresh(
          `/api/realplayers/season-players?seasonId=${season.id}`
        );
        if (!playersResponse.ok) return;
        const playersData = await playersResponse.json();

        if (playersData.success) {
          setIsModern(playersData.isModern);
          const rawPlayers: RealPlayer[] = playersData.data || [];

          // 2.5) Fetch team_seasons to build a map of team_id -> team_name
          const teamNameMap = new Map<string, string>();
          try {
            const teamSeasonsRes = await fetch(`/api/team-seasons?season_id=${season.id}`);
            const teamSeasonsJson = await teamSeasonsRes.json();
            const allTeamSeasons = teamSeasonsJson.data || teamSeasonsJson.teamSeasons || [];
            for (const ts of allTeamSeasons) {
              const teamId = (ts.id || '').split('_')[0] || ts.team_id;
              const name = ts.team_name || ts.team_code || 'Unknown Team';
              teamNameMap.set(teamId, name);
            }
            
            // Apply team names to rawPlayers
            rawPlayers.forEach(p => {
              if (p.team_id && teamNameMap.has(p.team_id)) {
                p.team = teamNameMap.get(p.team_id)!;
              } else {
                p.team = '';
              }
            });
          } catch (teamError) {
            console.error('Error fetching team names:', teamError);
          }

          // 3) Fetch Firebase photo URLs
          const playerIds = rawPlayers.map((p) => p.player_id).filter(Boolean);
          if (playerIds.length > 0) {
            try {
              const photosResponse = await fetchWithTokenRefresh(
                '/api/real-players?' + new URLSearchParams({ playerIds: playerIds.join(',') })
              );
              if (photosResponse.ok) {
                const photosData = await photosResponse.json();
                if (photosData.success && photosData.players) {
                  const photoMap = new Map(
                    photosData.players.map((p: any) => [
                      p.player_id, 
                      {
                        photo_url: p.photo_url,
                        photo_position_x_circle: p.photo_position_x_circle,
                        photo_position_y_circle: p.photo_position_y_circle,
                        photo_scale_circle: p.photo_scale_circle,
                      }
                    ])
                  );
                  rawPlayers.forEach((player) => {
                    const photoData = photoMap.get(player.player_id);
                    if (photoData) {
                      (player as any).photo_url = photoData.photo_url || null;
                      (player as any).photo_position_x_circle = photoData.photo_position_x_circle;
                      (player as any).photo_position_y_circle = photoData.photo_position_y_circle;
                      (player as any).photo_scale_circle = photoData.photo_scale_circle;
                    }
                  });
                }
              }
            } catch (_) {}
          }

          setPlayers(rawPlayers);

          const uniqueTeams = Array.from(new Set(rawPlayers.map((p) => p.team).filter(Boolean))) as string[];
          setTeams(uniqueTeams.sort());

          const uniqueCats = Array.from(new Set(rawPlayers.map((p) => p.category).filter(Boolean))) as string[];
          setCategories(uniqueCats.sort());
        }
      } catch (error) {
        console.error('Error fetching players:', error);
      } finally {
        const elapsed = Date.now() - startTime;
        if (elapsed < 800) {
          await new Promise(resolve => setTimeout(resolve, 800 - elapsed));
        }
        setIsLoading(false);
        setIsRefreshing(false);
      }
    };

    setIsRefreshing(true);
    fetchData();
  }, [user, updateCounter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, teamFilter, sortBy]);

  const filteredPlayers = players
    .filter((player) => {
      const matchesSearch =
        normalizeStr(player.player_name).includes(normalizeStr(searchTerm)) ||
        (normalizeStr(player.display_name).includes(normalizeStr(searchTerm))) ||
        (normalizeStr(player.team).includes(normalizeStr(searchTerm)) ?? false);
      const matchesCat = categoryFilter === 'all' || player.category === categoryFilter;
      const matchesTeam = teamFilter === 'all' 
        ? true 
        : teamFilter === 'free_agents' 
          ? (!player.team_id || player.team_id === '') 
          : player.team === teamFilter;
      return matchesSearch && matchesCat && matchesTeam;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':    return a.player_name.localeCompare(b.player_name);
        case 'points':  return (b.points || 0) - (a.points || 0);
        case 'base_price': return (b.base_price || 0) - (a.base_price || 0);
        case 'price':   return (b.price || 0) - (a.price || 0);
        case 'matches': return (b.matches_played || 0) - (a.matches_played || 0);
        case 'goals':   return (b.goals_scored || 0) - (a.goals_scored || 0);
        default:        return (b.points || 0) - (a.points || 0);
      }
    });

  const totalPages = Math.ceil(filteredPlayers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedPlayers = filteredPlayers.slice(startIndex, startIndex + itemsPerPage);

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-extrabold font-mono">
            Loading players...
          </p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team') return null;

  const PriceTag = ({ player }: { player: RealPlayer }) => {
    if (isModern) {
      // S16/S17 – show auction value
      const av = player.auction_value || 0;
      return (
        <span className="text-[10px] font-mono font-bold text-slate-500">
          {av > 0 ? `${av.toLocaleString()} coins` : '—'}
        </span>
      );
    }
    const sold = (player.price || 0) > 0;
    if (sold) {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-mono font-bold">
          <DollarSign className="w-3 h-3" />
          Sold · {player.price.toLocaleString()}
        </span>
      );
    }
    if ((player.base_price || 0) > 0) {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-mono font-bold">
          <Tag className="w-3 h-3" />
          Base · {player.base_price.toLocaleString()}
        </span>
      );
    }
    return <span className="text-[10px] font-mono text-slate-400">No price</span>;
  };

  return (
    <AuthGuard requiredRole="team">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-8">
        {/* Header */}
        <div>
          <Link
            href="/dashboard/team"
            className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            {'<-'} Back to Dashboard
          </Link>
        </div>

        {/* Title */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">
              PLAYER REGISTRY
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              SS Members (Real Players)
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              {activeSeason ? `${activeSeason.name} • ` : ''}
              {filteredPlayers.length} Member{filteredPlayers.length !== 1 ? 's' : ''} listed
            </p>
          </div>
          <div className="text-right bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3 font-mono shrink-0">
            <div className="text-2xl font-black text-amber-600">{players.length}</div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Members</div>
          </div>
        </div>

        {/* Filters */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Search</label>
              <input
                type="text"
                placeholder="Search name, team..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-sans"
              />
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-mono font-bold"
              >
                <option value="all">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Team Filter */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Team</label>
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-sans font-bold"
              >
                <option value="all">All Teams</option>
                <option value="free_agents">Free Agents</option>
                {teams.map((team) => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-mono font-bold"
              >
                <option value="name">Name (A-Z)</option>
                <option value="points">Points</option>
                <option value="goals">Goals</option>
                <option value="matches">Matches Played</option>
                {!isModern && <option value="base_price">Base Price</option>}
                {!isModern && <option value="price">Sold Price</option>}
              </select>
            </div>
          </div>

          <div className="mt-4 text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
            Showing {filteredPlayers.length} of {players.length} players
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="block lg:hidden">
          {filteredPlayers.length === 0 ? (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center shadow-sm max-w-md mx-auto">
              <Users className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <h3 className="text-lg font-extrabold text-slate-900 leading-tight">No Players Found</h3>
              <p className="text-xs text-slate-400 font-sans mt-1">
                {searchTerm || categoryFilter !== 'all' || teamFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'No players available'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedPlayers.map((player) => (
                <Link
                  key={player.player_id}
                  href={`/dashboard/players/${player.player_id}`}
                  className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm hover:border-amber-400/40 transition-all duration-250 flex items-center gap-4"
                >
                  {/* Photo */}
                  <div className="relative shrink-0">
                    <div className="relative w-16 h-16 rounded-2xl overflow-hidden border border-slate-200/60 bg-white p-0.5">
                      {player.photo_url ? (
                        <OptimizedImage
                          src={player.photo_url}
                          alt={player.player_name}
                          width={64}
                          height={64}
                          quality={85}
                          className="rounded-2xl"
                          photoPositionX={player.photo_position_x_circle}
                          photoPositionY={player.photo_position_y_circle}
                          photoScale={player.photo_scale_circle}
                          fallback={
                            <div className="w-full h-full flex items-center justify-center bg-amber-50 rounded-2xl">
                              <span className="text-xl font-bold text-amber-600">{player.player_name[0]}</span>
                            </div>
                          }
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-amber-50 rounded-2xl">
                          <span className="text-xl font-bold text-amber-600">{player.player_name[0]}</span>
                        </div>
                      )}
                    </div>
                    {/* Category Badge */}
                    {player.category && (
                      <div className="absolute -bottom-2.5 left-1/2 transform -translate-x-1/2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${categoryStyle(player.category)}`}>
                          {player.category.toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Player Info */}
                  <div className="flex-1 min-w-0 font-mono">
                    <h3 className="font-bold text-slate-800 text-base truncate">
                      {player.display_name || player.player_name}
                    </h3>
                    <p className={`text-xs truncate mb-2 font-bold uppercase ${player.team ? 'text-slate-500' : 'text-slate-400 italic'}`}>
                      {player.team || 'FREE AGENT'}
                    </p>

                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-lg">
                        <span className="font-bold text-amber-800">{player.points || 0}</span>
                        <span className="text-[10px] text-slate-400 uppercase font-bold">PTS</span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800">
                        <SoccerBallIcon className="w-4 h-4" />
                        <span className="font-bold">{player.goals_scored || 0}</span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-700">
                        <span className="font-bold">{player.matches_played || 0}</span>
                        <span className="text-[9px] text-slate-400 uppercase font-bold">GMS</span>
                      </div>
                      <PriceTag player={player} />
                    </div>
                  </div>

                  <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
          {filteredPlayers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-mono text-sm">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
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
                    <th className="py-4 px-2 text-indigo-600">Assists</th>
                    <th className="py-4 px-2 text-emerald-600 font-bold">CS</th>
                    <th className="py-4 px-2 text-blue-600">Wins</th>
                    <th className="py-4 px-2 text-slate-500">MOTM</th>
                    <th className="py-4 px-4 text-amber-600">Pts</th>
                    <th className="py-4 px-4 text-right">Value/Price</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedPlayers.map((player, index) => (
                    <tr
                      key={player.player_id}
                      className="hover:bg-slate-50/50 transition-colors text-center"
                    >
                      <td className="py-4 px-4 text-left">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold font-mono text-xs">
                          {startIndex + index + 1}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-left font-bold text-slate-900 text-sm">
                        <Link href={`/dashboard/players/${player.player_id}`} className="flex items-center gap-3 group">
                          <div className="w-10 h-10 rounded-full overflow-hidden shadow-sm border border-slate-200 bg-white flex-shrink-0">
                            {player.photo_url ? (
                              <OptimizedImage
                                src={player.photo_url}
                                alt={player.player_name}
                                width={40}
                                height={40}
                                quality={85}
                                className="rounded-full animate-fade-in"
                                photoPositionX={player.photo_position_x_circle}
                                photoPositionY={player.photo_position_y_circle}
                                photoScale={player.photo_scale_circle}
                                fallback={
                                  <div className="w-full h-full flex items-center justify-center bg-amber-50">
                                    <span className="text-sm font-bold text-amber-600">{player.player_name[0]}</span>
                                  </div>
                                }
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-amber-50">
                                <span className="text-sm font-bold text-amber-600">{player.player_name[0]}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="group-hover:text-amber-600 transition-colors text-sm truncate">
                              {player.display_name || player.player_name}
                            </span>
                            {player.category && (
                              <span className="mt-0.5">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase ${categoryStyle(player.category)}`}>
                                  {player.category.toUpperCase()}
                                </span>
                              </span>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="py-4 px-4 text-left text-slate-600 text-xs font-semibold">
                        {player.team || <span className="text-slate-400 font-mono italic">FREE AGENT</span>}
                      </td>
                      <td className="py-4 px-2 font-mono text-xs text-slate-500">{player.matches_played || 0}</td>
                      <td className="py-4 px-2 font-mono text-xs text-purple-600 font-bold">{player.goals_scored || 0}</td>
                      <td className="py-4 px-2 font-mono text-xs text-indigo-600 font-bold">{player.assists || 0}</td>
                      <td className="py-4 px-2 font-mono text-xs text-emerald-600 font-bold">{player.clean_sheets || 0}</td>
                      <td className="py-4 px-2 font-mono text-xs text-blue-600 font-bold">{player.wins || 0}</td>
                      <td className="py-4 px-2 font-mono text-xs text-slate-500">{player.motm_awards || 0}</td>
                      <td className="py-4 px-4 font-mono font-black text-amber-600 text-sm">{player.points || 0}</td>
                      <td className="py-4 px-4 font-mono text-xs text-right">
                        <div className="inline-block">
                          <PriceTag player={player} />
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <Link href={`/dashboard/players/${player.player_id}`}>
                          <svg className="w-5 h-5 text-slate-400 hover:text-amber-600 transition-colors cursor-pointer inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm font-mono text-xs">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 transition-all font-bold cursor-pointer"
            >
              Previous
            </button>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => {
                  return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2;
                })
                .map((page, idx, arr) => {
                  const showDots = idx > 0 && page - arr[idx - 1] > 1;
                  return (

                    <div key={page} className="flex items-center gap-1.5">
                      {showDots && <span className="text-slate-400">...</span>}
                      <button
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 rounded-xl font-bold transition-all cursor-pointer ${
                          currentPage === page
                            ? 'bg-slate-800 text-white shadow-sm'
                            : 'border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        {page}
                      </button>
                    </div>

  );
                })}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 transition-all font-bold cursor-pointer"
            >
              Next
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setUpdateCounter(prev => prev + 1)}
        disabled={isRefreshing}
        className="fixed right-6 bottom-24 z-[1002] w-12 h-12 flex items-center justify-center bg-amber-600 text-white rounded-full shadow-lg hover:bg-amber-500 active:scale-95 transition-all disabled:opacity-80 cursor-pointer border border-amber-500/20 shadow-amber-600/20"
        title="Refresh Data"
      >
        <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  
    </AuthGuard>
  );
}
