'use client';

import { SoccerBallIcon } from '@/components/ui/CustomIcons';
import { Star, User, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import OptimizedImage from '@/components/OptimizedImage';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface RealPlayer {
  player_id: string;
  player_name: string;
  display_name?: string;
  photo_url?: string;
  team: string;
  team_id: string;
  category: string;
  star_rating: number;
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

export default function RealPlayersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState<RealPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [starFilter, setStarFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'points' | 'rating' | 'matches' | 'goals'>('points');
  const [activeSeason, setActiveSeason] = useState<any>(null);
  const [teams, setTeams] = useState<string[]>([]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        setIsLoading(true);

        // Get active season
        const seasonResponse = await fetchWithTokenRefresh('/api/cached/firebase/seasons?isActive=true');
        
        if (!seasonResponse.ok) {
          console.error('Failed to fetch seasons:', seasonResponse.statusText);
          return;
        }
        
        const contentType = seasonResponse.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.error('Season API did not return JSON');
          return;
        }
        
        const seasonData = await seasonResponse.json();
        
        if (seasonData.success && seasonData.data.length > 0) {
          const season = seasonData.data[0];
          setActiveSeason(season);

          // Fetch real players for this season
          // The API automatically queries the correct table based on season number
          const playersResponse = await fetchWithTokenRefresh(`/api/stats/players?seasonId=${season.id}&limit=1000`);
          
          if (!playersResponse.ok) {
            console.error('Failed to fetch players:', playersResponse.statusText);
            return;
          }
          
          const playersContentType = playersResponse.headers.get('content-type');
          if (!playersContentType || !playersContentType.includes('application/json')) {
            console.error('Players API did not return JSON');
            return;
          }
          
          const playersData = await playersResponse.json();

          if (playersData.success) {
            // Filter to show only players with star ratings (real players)
            const realPlayers = playersData.data?.filter((p: any) => p.star_rating && p.star_rating > 0) || [];
            
            // Fetch photo URLs from Firebase for each player
            const playerIds = realPlayers.map((p: any) => p.player_id).filter(Boolean);
            if (playerIds.length > 0) {
              try {
                const photosResponse = await fetchWithTokenRefresh('/api/real-players?' + new URLSearchParams({
                  playerIds: playerIds.join(',')
                }));
                
                if (photosResponse.ok) {
                  const photosData = await photosResponse.json();
                  if (photosData.success && photosData.players) {
                    // Create a map of player_id to photo_url
                    const photoMap = new Map(
                      photosData.players.map((p: any) => [p.player_id, p.photo_url])
                    );
                    
                    // Merge photo URLs into player data
                    realPlayers.forEach((player: any) => {
                      player.photo_url = photoMap.get(player.player_id) || null;
                    });
                  }
                }
              } catch (photoError) {
                console.warn('Could not fetch player photos:', photoError);
              }
            }
            
            setPlayers(realPlayers);
            
            // Extract unique teams for filter
            const uniqueTeams = Array.from(new Set(realPlayers.map((p: any) => p.team).filter(Boolean))) as string[];
            setTeams(uniqueTeams.sort());
            
            console.log(`✅ Loaded ${realPlayers.length} real players for ${season.name}`);
          } else {
            console.error('Players API error:', playersData.error);
          }
        }
      } catch (error) {
        console.error('Error fetching players:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user]);

  // Extract unique star ratings from players for filter options
  const uniqueStarRatings = Array.from(new Set(players.map(p => p.star_rating).filter(Boolean)))
    .sort((a, b) => b - a); // Sort in descending order

  const filteredPlayers = players
    .filter(player => {
      const matchesSearch = player.player_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (player.display_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
                           (player.team?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
      const matchesStar = starFilter === 'all' || (player.star_rating === parseInt(starFilter));
      const matchesTeam = teamFilter === 'all' || player.team === teamFilter;
      return matchesSearch && matchesStar && matchesTeam;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.player_name.localeCompare(b.player_name);
        case 'points':
          return (b.points || 0) - (a.points || 0);
        case 'rating':
          return (b.star_rating || 0) - (a.star_rating || 0);
        case 'matches':
          return (b.matches_played || 0) - (a.matches_played || 0);
        case 'goals':
          return (b.goals_scored || 0) - (a.goals_scored || 0);
        default:
          return (b.points || 0) - (a.points || 0);
      }
    });


  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0066FF] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading players...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team') {
    return null;
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-8">
        {/* Header */}
        <div>
          <Link
            href="/dashboard/team"
            className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            {"<-"} Back to Dashboard
          </Link>
        </div>

        {/* Title */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">PLAYER REGISTRY</span>
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

            {/* Star Rating Filter */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Star Rating</label>
              <select
                value={starFilter}
                onChange={(e) => setStarFilter(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-mono font-bold"
              >
                <option value="all">All Stars</option>
                {uniqueStarRatings.map(rating => (
                  <option key={rating} value={rating}>{rating} <Star className="w-4 h-4 text-amber-400 fill-amber-400" /></option>
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
                {teams.map(team => (
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
                <option value="rating">Star Rating</option>
              </select>
            </div>
          </div>

          {/* Results Count */}
          <div className="mt-4 text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
            Showing {filteredPlayers.length} of {players.length} players
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="block lg:hidden">
          {filteredPlayers.length === 0 ? (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center shadow-sm max-w-md mx-auto">
              <div className="text-4xl mb-3"><Users className="w-4 h-4 text-slate-500" /></div>
              <h3 className="text-lg font-extrabold text-slate-900 leading-tight">No Players Found</h3>
              <p className="text-xs text-slate-400 font-sans mt-1">
                {searchTerm || starFilter !== 'all' || teamFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'No players available'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPlayers.map((player) => (
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
                          className="w-full h-full object-cover rounded-2xl"
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
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                          player.category.toLowerCase() === 'legend'
                            ? 'bg-amber-100 border border-amber-200 text-amber-800'
                            : 'bg-slate-200 border border-slate-300 text-slate-700'
                        }`}>
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
                    <p className="text-xs text-slate-400 truncate mb-2">{player.team}</p>
                    
                    {/* Stats Pills */}
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-lg">
                        <span className="font-bold text-amber-800">{player.points || 0}</span>
                        <span className="text-[10px] text-slate-400 uppercase font-bold">PTS</span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800">
                        <span><SoccerBallIcon className="w-4 h-4" /></span>
                        <span className="font-bold">{player.goals_scored || 0}</span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-700">
                        <span className="font-bold">{player.matches_played || 0}</span>
                        <span className="text-[9px] text-slate-400 uppercase font-bold">GMS</span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                        <span className="font-bold">{player.star_rating || 3}</span>
                        <span><Star className="w-4 h-4 text-amber-400 fill-amber-400" /></span>
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Desktop List */}
        <div className="hidden lg:block">
          {filteredPlayers.length === 0 ? (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center shadow-sm max-w-md mx-auto">
              <div className="text-4xl mb-3"><Users className="w-4 h-4 text-slate-500" /></div>
              <h3 className="text-lg font-extrabold text-slate-900 leading-tight">No Players Found</h3>
              <p className="text-xs text-slate-400 font-sans mt-1">
                {searchTerm || starFilter !== 'all' || teamFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'No players available'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredPlayers.map((player) => (
                <Link
                  key={player.player_id}
                  href={`/dashboard/players/${player.player_id}`}
                  className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm hover:border-amber-400/40 transition-all duration-250 flex flex-col justify-between"
                >
                  <div className="flex items-start gap-4">
                    {/* Photo */}
                    <div className="relative shrink-0">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden border border-slate-200 bg-white p-0.5">
                        {player.photo_url ? (
                          <OptimizedImage
                            src={player.photo_url}
                            alt={player.player_name}
                            width={64}
                            height={64}
                            quality={85}
                            className="w-full h-full object-cover rounded-2xl"
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
                    </div>

                    {/* Player Info */}
                    <div className="flex-1 min-w-0 font-mono">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-extrabold text-slate-900 text-base truncate">
                          {player.display_name || player.player_name}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-400 truncate mb-2">{player.team}</p>

                      <div className="flex items-center gap-2 flex-wrap">
                        {player.category && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            player.category.toLowerCase() === 'legend'
                              ? 'bg-amber-100 border border-amber-200 text-amber-800'
                              : 'bg-slate-200 border border-slate-300 text-slate-700'
                          }`}>
                            {player.category}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 border border-amber-200 text-amber-800">
                          {player.star_rating || 3} <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100 font-mono text-center">
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-2">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">Points</div>
                      <div className="text-sm font-black text-amber-600">{player.points || 0}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-2">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">Goals</div>
                      <div className="text-sm font-black text-emerald-605">{player.goals_scored || 0}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-2">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">Matches</div>
                      <div className="text-sm font-black text-slate-800">{player.matches_played || 0}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-2">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">CS</div>
                      <div className="text-sm font-black text-emerald-650">{player.clean_sheets || 0}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-2">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">Assists</div>
                      <div className="text-sm font-black text-slate-800">{player.assists || 0}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-2">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">MOTM</div>
                      <div className="text-sm font-black text-amber-600">{player.motm_awards || 0}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
