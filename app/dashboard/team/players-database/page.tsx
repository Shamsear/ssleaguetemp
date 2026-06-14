'use client';

import { Star } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import OptimizedImage from '@/components/OptimizedImage';
import PlayerImage, { PlayerAvatar } from '@/components/PlayerImage';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { usePermissions } from '@/hooks/usePermissions';
import { useCachedSeasons } from '@/hooks/useCachedFirebase';

// Position constants
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
const POSITION_GROUPS = ['Offense', 'Defense', 'Special Teams'];

interface AuctionPlayer {
  id: number;
  name: string;
  position: string;
  position_group?: string;
  nfl_team: string;
  overall_rating: number;
  acquisition_value?: number;
  player_id?: string;
}

interface TournamentPlayer {
  id: string;
  player_id: string;
  name: string;
  team_id?: string;
  team_name?: string;
  category?: string;
  star_rating: number;
  points: number;
  auction_value: number;
  status: string;
  season_id: string;
  updated_at: string;
  photo_url?: string;
}

type TabType = 'auction' | 'tournament';

export default function TeamPlayersPage() {
  const { user, loading } = useAuth();
  const { userSeasonId } = usePermissions();
  const router = useRouter();
  
  // Fetch current active season from Firebase (same as team dashboard)
  const { data: activeSeasons, isLoading: activeSeasonsLoading } = useCachedSeasons(
    user?.role === 'team' ? { isActive: 'true' } : undefined
  );
  
  // Get active season ID
  const activeSeasonId = activeSeasons && Array.isArray(activeSeasons) && activeSeasons.length > 0 
    ? activeSeasons[0].id 
    : null;
  
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('tournament');
  
  // Player data state
  const [auctionPlayers, setAuctionPlayers] = useState<AuctionPlayer[]>([]);
  const [tournamentPlayers, setTournamentPlayers] = useState<TournamentPlayer[]>([]);
  const [isLoadingAuction, setIsLoadingAuction] = useState(true);
  const [isLoadingTournament, setIsLoadingTournament] = useState(true);
  
  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  // Auction player filters
  const [positionFilter, setPositionFilter] = useState('all');
  const [positionGroupFilter, setPositionGroupFilter] = useState('all');
  // Tournament player filters
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [starRatingFilter, setStarRatingFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchAuctionPlayers = async () => {
      if (!user) {
        console.log('No user, skipping auction players fetch');
        return;
      }

      console.log('Fetching auction players...');
      setIsLoadingAuction(true);

      try {
        const response = await fetchWithTokenRefresh('/api/team/players', {
          headers: { 'Cache-Control': 'no-cache' },
        });
        
        if (!response.ok) {
          console.error('Failed to fetch auction players:', response.status, response.statusText);
          setIsLoadingAuction(false);
          return;
        }
        
        const { success, data, error } = await response.json();

        if (success) {
          console.log('Auction players fetched successfully:', data.players?.length || 0, 'players');
          setAuctionPlayers(data.players || []);
        } else {
          console.error('API returned error:', error);
        }
      } catch (err) {
        console.error('Error fetching auction players:', err);
      } finally {
        console.log('Auction players loading finished');
        setIsLoadingAuction(false);
      }
    };

    fetchAuctionPlayers();
  }, [user]);

  useEffect(() => {
    const fetchTournamentPlayers = async () => {
      // Use userSeasonId first, then activeSeasonId as fallback
      const effectiveSeasonId = userSeasonId || activeSeasonId;
      
      if (!user) {
        console.log('No user, skipping tournament players fetch');
        return;
      }

      if (activeSeasonsLoading) {
        console.log('Still loading active seasons, waiting...');
        return;
      }

      if (!effectiveSeasonId) {
        console.log('No season ID available', { userSeasonId, activeSeasonId });
        setIsLoadingTournament(false);
        return;
      }

      console.log('Fetching tournament players for season:', effectiveSeasonId);
      setIsLoadingTournament(true);

      try {
        const response = await fetchWithTokenRefresh(`/api/team/tournament-players?seasonId=${effectiveSeasonId}`, {
          headers: { 'Cache-Control': 'no-cache' },
        });
        
        if (!response.ok) {
          console.error('Failed to fetch tournament players:', response.status, response.statusText);
          setIsLoadingTournament(false);
          return;
        }
        
        const { success, data, error } = await response.json();

        if (success) {
          console.log('Tournament players fetched successfully:', data.players?.length || 0, 'players');
          setTournamentPlayers(data.players || []);
        } else {
          console.error('Tournament players API returned error:', error);
        }
      } catch (err) {
        console.error('Error fetching tournament players:', err);
      } finally {
        console.log('Tournament players loading finished');
        setIsLoadingTournament(false);
      }
    };

    fetchTournamentPlayers();
  }, [user, userSeasonId, activeSeasonId, activeSeasonsLoading]);

  // Get current data based on active tab
  const currentPlayers = activeTab === 'auction' ? auctionPlayers : tournamentPlayers;
  const isCurrentLoading = activeTab === 'auction' ? isLoadingAuction : isLoadingTournament;

  // Filter and sort players based on current tab
  const filteredPlayers = currentPlayers
    .filter(player => {
      const matchesSearch = player.name.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (activeTab === 'auction') {
        const auctionPlayer = player as AuctionPlayer;
        const positionMatch = auctionPlayer.position?.toLowerCase().includes(searchTerm.toLowerCase());
        const searchMatch = matchesSearch || positionMatch;
        const matchesPosition = positionFilter === 'all' || auctionPlayer.position === positionFilter;
        const matchesGroup = positionGroupFilter === 'all' || auctionPlayer.position_group === positionGroupFilter;
        return searchMatch && matchesPosition && matchesGroup;
      } else {
        const tournamentPlayer = player as TournamentPlayer;
        const categoryMatch = tournamentPlayer.category?.toLowerCase().includes(searchTerm.toLowerCase());
        const searchMatch = matchesSearch || categoryMatch;
        
        // Tournament player filters
        const matchesCategory = categoryFilter === 'all' || tournamentPlayer.category === categoryFilter;
        const matchesStarRating = starRatingFilter === 'all' || tournamentPlayer.star_rating === parseInt(starRatingFilter);
        const matchesStatus = statusFilter === 'all' || tournamentPlayer.status === statusFilter;
        
        return searchMatch && matchesCategory && matchesStarRating && matchesStatus;
      }
    })
    .sort((a, b) => {
      // Sort tournament players by points (descending)
      if (activeTab === 'tournament') {
        const playerA = a as TournamentPlayer;
        const playerB = b as TournamentPlayer;
        return (playerB.points || 0) - (playerA.points || 0);
      }
      // Sort auction players by overall rating (descending)
      else {
        const playerA = a as AuctionPlayer;
        const playerB = b as AuctionPlayer;
        return (playerB.overall_rating || 0) - (playerA.overall_rating || 0);
      }
    });

  // Get unique values for filters
  // Tournament filters
  const categories = Array.from(new Set(tournamentPlayers.filter(p => p.category).map(p => p.category!))).sort();
  const statuses = Array.from(new Set(tournamentPlayers.filter(p => p.status).map(p => p.status!))).sort();
  const starRatings = Array.from(new Set(tournamentPlayers.map(p => p.star_rating))).sort((a, b) => b - a);
  
  // Auction filters - get positions from actual auction players data (football positions)
  const positions = Array.from(new Set(auctionPlayers.filter(p => p.position).map(p => p.position!))).sort();
  const positionGroups = Array.from(new Set(auctionPlayers.filter(p => p.position_group).map(p => p.position_group!))).sort();

  const getPositionColor = (position: string) => {
    switch (position) {
      case 'QB': return 'bg-red-50 text-red-600 border border-red-200/60';
      case 'RB': return 'bg-blue-50 text-blue-600 border border-blue-200/60';
      case 'WR': return 'bg-emerald-50 text-emerald-600 border border-emerald-200/60';
      case 'TE': return 'bg-purple-50 text-purple-600 border border-purple-200/60';
      case 'K': return 'bg-amber-50 text-amber-600 border border-amber-200/60';
      case 'DST': return 'bg-slate-50 text-slate-600 border border-slate-200/60';
      default: return 'bg-slate-50 text-slate-600 border border-slate-200/60';
    }
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 85) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (rating >= 75) return 'bg-blue-50 text-blue-700 border border-blue-200';
    if (rating >= 65) return 'bg-amber-50 text-amber-700 border border-amber-200';
    return 'bg-slate-50 text-slate-600 border border-slate-200';
  };

  const getStarRatingColor = (rating: number) => {
    if (rating >= 9) return 'bg-purple-50 text-purple-700 border border-purple-200';
    if (rating >= 7) return 'bg-blue-50 text-blue-700 border border-blue-200';
    if (rating >= 5) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    return 'bg-amber-50 text-amber-700 border border-amber-200';
  };

  const getCategoryColor = (category: string) => {
    switch (category?.toLowerCase()) {
      case 'legend': return 'bg-amber-50 text-amber-700 border border-amber-200/60';
      case 'classic': return 'bg-blue-50 text-blue-700 border border-blue-200/60';
      default: return 'bg-slate-50 text-slate-600 border border-slate-200/60';
    }
  };

  if (loading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-amber-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">Loading Console...</p>
        </div>
      </div>
    );
  }

  // Show loading only for the current tab
  if (isCurrentLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-amber-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">Loading {activeTab} players...</p>
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

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/team"
            className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            {"<-"} Back to Dashboard
          </Link>
        </div>

        {/* Mobile Header Section */}
        <div className="block sm:hidden console-card bg-white border border-slate-200/60 rounded-3xl p-4 shadow-sm mb-4">
          <div className="text-center mb-4">
            <span className="text-[9px] text-amber-600 font-bold uppercase tracking-wider font-mono">PLAYERS</span>
            <h2 className="text-xl font-mono font-bold text-slate-800 uppercase tracking-wide">Players Database</h2>
            <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mt-1">
              Showing {filteredPlayers.length} of {currentPlayers.length} players
            </p>
          </div>

          {/* Mobile Tabs */}
          <div className="flex mb-4 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setActiveTab('tournament')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all ${
                activeTab === 'tournament'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Tournament ({tournamentPlayers.length})
            </button>
            <button
              onClick={() => setActiveTab('auction')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all ${
                activeTab === 'auction'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Auction ({auctionPlayers.length})
            </button>
          </div>
          
          {/* Mobile Search Bar */}
          <div className="relative mb-3">
            <input 
              type="text" 
              placeholder="Search players..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-sans"
            />
            <svg className="w-5 h-5 text-slate-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          
          {/* Mobile Filters */}
          <div className="flex gap-2">
            {activeTab === 'auction' ? (
              <div className="relative flex-1">
                <select 
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value)}
                  className="w-full pl-8 py-2 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
                >
                  <option value="all">All Positions</option>
                  {positions.map(position => (
                    <option key={position} value={position}>{position}</option>
                  ))}
                </select>
                <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            ) : (
              <div className="relative flex-1">
                <select 
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full pl-8 py-2 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
                >
                  <option value="all">All Categories</option>
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
          </div>
        </div>
        
        {/* Desktop Header Section */}
        <div className="hidden sm:block console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">DATABASE</span>
              <h2 className="text-2xl font-mono font-bold text-slate-800 uppercase tracking-wide">Players Database</h2>
              <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mt-1">
                Showing {filteredPlayers.length} of {currentPlayers.length} players
              </p>
            </div>
            
            {/* Desktop Tabs */}
            <div className="flex bg-slate-100 rounded-xl p-1">
              <button
                onClick={() => setActiveTab('tournament')}
                className={`py-2 px-4 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all ${
                  activeTab === 'tournament'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                Tournament ({tournamentPlayers.length})
              </button>
              <button
                onClick={() => setActiveTab('auction')}
                className={`py-2 px-4 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all ${
                  activeTab === 'auction'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                Auction ({auctionPlayers.length})
              </button>
            </div>
          </div>
          
          {/* Desktop Filter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
            {activeTab === 'auction' ? (
              <>
                {/* Position Filter */}
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Position</label>
                  <div className="relative">
                    <select 
                      value={positionFilter}
                      onChange={(e) => setPositionFilter(e.target.value)}
                      className="w-full pl-8 py-2 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
                    >
                      <option value="all">All Positions</option>
                      {positions.map(position => (
                        <option key={position} value={position}>{position}</option>
                      ))}
                    </select>
                    <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                
                {/* Position Group Filter */}
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Position Group</label>
                  <div className="relative">
                    <select 
                      value={positionGroupFilter}
                      onChange={(e) => setPositionGroupFilter(e.target.value)}
                      className="w-full pl-8 py-2 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
                    >
                      <option value="all">All Position Groups</option>
                      {positionGroups.map(group => (
                        <option key={group} value={group}>{group}</option>
                      ))}
                    </select>
                    <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Category Filter */}
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Category</label>
                  <div className="relative">
                    <select 
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="w-full pl-8 py-2 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
                    >
                      <option value="all">All Categories</option>
                      {categories.map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                    <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                
                {/* Star Rating Filter */}
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Star Rating</label>
                  <div className="relative">
                    <select 
                      value={starRatingFilter}
                      onChange={(e) => setStarRatingFilter(e.target.value)}
                      className="w-full pl-8 py-2 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
                    >
                      <option value="all">All Star Ratings</option>
                      {starRatings.map(rating => (
                        <option key={rating} value={rating}>{rating} <Star className="w-4 h-4 text-amber-400 fill-amber-400" /></option>
                      ))}
                    </select>
                    <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </div>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Status</label>
                  <div className="relative">
                    <select 
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full pl-8 py-2 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
                    >
                      <option value="all">All Status</option>
                      {statuses.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                    <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </>
            )}
              
            {/* Search Bar */}
            <div className={`${activeTab === 'auction' ? 'lg:col-span-2' : 'lg:col-span-1'}`}>
              <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Search Players</label>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Search players..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-sans"
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
        
        {/* Mobile Card View */}
        <div className="block md:hidden space-y-4">
          {filteredPlayers.length > 0 ? (
            filteredPlayers.map(player => (
              <div 
                key={player.id}
                className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm hover:border-amber-400/40 transition-all duration-200"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="h-14 w-14 rounded-full overflow-hidden flex items-center justify-center border-2 border-slate-200 bg-slate-50 shrink-0">
                      {activeTab === 'tournament' ? (
                        <PlayerAvatar
                          playerId={(player as TournamentPlayer).player_id}
                          playerName={player.name}
                          size={56}
                        />
                      ) : player.photo_url ? (
                        <OptimizedImage
                          src={player.photo_url}
                          alt={player.name}
                          width={56}
                          height={56}
                          quality={85}
                          className="w-14 h-14 rounded-full object-cover"
                          fallback={
                            <div className="w-14 h-14 flex items-center justify-center bg-gradient-to-br from-slate-400 to-slate-600 rounded-full">
                              <span className="text-xl font-bold text-white">{player.name[0]}</span>
                            </div>
                          }
                        />
                      ) : (
                        <div className="w-14 h-14 flex items-center justify-center bg-gradient-to-br from-slate-400 to-slate-600 rounded-full">
                          <span className="text-xl font-bold text-white">{player.name[0]}</span>
                        </div>
                      )}
                    </div>
                    <div className="font-mono">
                      <h4 className="font-bold text-slate-800 text-sm leading-tight">{player.name}</h4>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {activeTab === 'auction' ? (
                          <>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase ${getPositionColor((player as AuctionPlayer).position)}`}>
                              {(player as AuctionPlayer).position}
                            </span>
                            {(player as AuctionPlayer).position_group && (
                              <span className="text-[9px] px-2 py-0.5 bg-slate-100 text-slate-600 font-bold rounded uppercase border border-slate-200/50">
                                {(player as AuctionPlayer).position_group}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase ${getCategoryColor((player as TournamentPlayer).category || '')}`}>
                              {(player as TournamentPlayer).category || 'N/A'}
                            </span>
                            <span className="text-[9px] px-2 py-0.5 bg-amber-50 text-amber-700 font-bold rounded uppercase border border-amber-200/50">
                              {(player as TournamentPlayer).star_rating}<Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                            </span>
                            <span className="text-[9px] px-2 py-0.5 bg-blue-50 text-blue-700 font-bold rounded uppercase border border-blue-200/50">
                              {(player as TournamentPlayer).points} pts
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {activeTab === 'auction' ? (
                    <span className={`flex items-center justify-center h-10 w-10 rounded-full shadow-sm border font-mono font-bold text-sm ${getRatingColor((player as AuctionPlayer).overall_rating)}`}>
                      {(player as AuctionPlayer).overall_rating}
                    </span>
                  ) : (
                    <div className="text-right font-mono">
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Status</div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase border ${
                        (player as TournamentPlayer).status === 'assigned' 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
                          : 'bg-slate-50 text-slate-600 border-slate-200/50'
                      }`}>
                        {(player as TournamentPlayer).status}
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center font-mono">
                  <div>
                    {activeTab === 'auction' ? (
                      <>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Acquisition Value</span>
                        <div className={`text-sm font-bold mt-0.5 ${(player as AuctionPlayer).acquisition_value ? 'text-amber-600' : 'text-slate-400'}`}>
                          {(player as AuctionPlayer).acquisition_value ? `£${(player as AuctionPlayer).acquisition_value!.toLocaleString()}` : 'Free Transfer'}
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Auction Value</span>
                        <div className="text-sm font-bold text-amber-600 mt-0.5">
                          ₹{((player as TournamentPlayer).auction_value || 0).toLocaleString()}
                        </div>
                      </>
                    )}
                  </div>
                  <Link 
                    href={`/dashboard/players/${player.player_id || player.id}`} 
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider transition-colors duration-200 flex items-center shadow-sm shadow-slate-900/10 hover:scale-[1.02]"
                  >
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Details
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-8 text-center shadow-sm">
              <svg className="w-16 h-16 mx-auto text-slate-350 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-slate-800 text-lg font-mono font-bold uppercase tracking-wider mb-2">
                {currentPlayers.length === 0 ? 'No players acquired yet' : 'No matches found'}
              </p>
              <p className="text-slate-400 font-mono text-xs uppercase tracking-wider mb-4">
                {currentPlayers.length === 0 ? 'Join an active round to bid on players' : 'Try adjusting your filters'}
              </p>
              {currentPlayers.length === 0 && (
                <Link href="/dashboard/team" className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-md hover:bg-slate-700 transition-all">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Browse Players
                </Link>
              )}
            </div>
          )}
        </div>
        
        {/* Desktop Table View */}
        <div className="hidden md:block console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm overflow-hidden">
          <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-inner bg-slate-50/50">
            <table className="min-w-full divide-y divide-slate-200/60 font-mono text-xs">
              <thead className="bg-slate-100/80 border-b border-slate-200/60">
                <tr>
                  <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Player Name</th>
                  {activeTab === 'auction' ? (
                    <>
                      <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Position</th>
                      <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Group</th>
                      <th className="px-6 py-4 text-center font-bold text-slate-500 uppercase tracking-wider">Rating</th>
                      <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Acquisition Value</th>
                    </>
                  ) : (
                    <>
                      <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-4 text-center font-bold text-slate-500 uppercase tracking-wider">Star Rating</th>
                      <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Points</th>
                      <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Auction Value</th>
                      <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    </>
                  )}
                  <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredPlayers.length > 0 ? (
                  filteredPlayers.map(player => (
                    <tr key={player.id} className="hover:bg-slate-50/70 transition-all duration-150">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-12 w-12 rounded-full overflow-hidden flex items-center justify-center border-2 border-slate-200 bg-slate-50">
                            {activeTab === 'tournament' ? (
                              <PlayerAvatar
                                playerId={(player as TournamentPlayer).player_id}
                                playerName={player.name}
                                size={48}
                              />
                            ) : player.photo_url ? (
                              <OptimizedImage
                                src={player.photo_url}
                                alt={player.name}
                                width={48}
                                height={48}
                                quality={85}
                                className="w-12 h-12 rounded-full object-cover"
                                fallback={
                                  <div className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-slate-400 to-slate-600 rounded-full">
                                    <span className="text-lg font-bold text-white">{player.name[0]}</span>
                                  </div>
                                }
                              />
                            ) : (
                              <div className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-slate-400 to-slate-600 rounded-full">
                                <span className="text-lg font-bold text-white">{player.name[0]}</span>
                              </div>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-sans font-bold text-slate-800 hover:text-amber-600 transition-colors">{player.name}</div>
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">ID: {player.player_id || player.id}</div>
                          </div>
                        </div>
                      </td>
                      {activeTab === 'auction' ? (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded text-[9px] font-bold uppercase ${getPositionColor((player as AuctionPlayer).position)}`}>
                              {(player as AuctionPlayer).position}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {(player as AuctionPlayer).position_group ? (
                              <span className="px-2.5 py-1 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200/50">
                                {(player as AuctionPlayer).position_group}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold border shadow-sm ${getRatingColor((player as AuctionPlayer).overall_rating)}`}>
                              {(player as AuctionPlayer).overall_rating}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`font-bold ${(player as AuctionPlayer).acquisition_value ? 'text-amber-600' : 'text-slate-400'}`}>
                              {(player as AuctionPlayer).acquisition_value ? `£${(player as AuctionPlayer).acquisition_value!.toLocaleString()}` : 'Free Transfer'}
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded text-[9px] font-bold uppercase ${getCategoryColor((player as TournamentPlayer).category || '')}`}>
                              {(player as TournamentPlayer).category || 'N/A'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center">
                              <span className={`inline-flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold border shadow-sm ${getStarRatingColor((player as TournamentPlayer).star_rating)}`}>
                                {(player as TournamentPlayer).star_rating}
                              </span>
                              <span className="ml-1 text-amber-500 text-[10px]"><Star className="w-4 h-4 text-amber-400 fill-amber-400" /></span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="font-bold text-slate-800">{(player as TournamentPlayer).points}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-amber-600 font-bold">
                              ₹{((player as TournamentPlayer).auction_value || 0).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-bold uppercase border ${
                              (player as TournamentPlayer).status === 'assigned' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
                                : 'bg-slate-50 text-slate-600 border-slate-200/50'
                            }`}>
                              {(player as TournamentPlayer).status}
                            </span>
                          </td>
                        </>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <Link 
                          href={`/dashboard/players/${player.player_id || player.id}`} 
                          className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all duration-200 shadow-sm shadow-slate-900/10 hover:scale-[1.02]"
                        >
                          <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Details
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={activeTab === 'auction' ? 6 : 7} className="px-6 py-12 whitespace-nowrap text-center">
                      <svg className="w-12 h-12 mx-auto text-slate-350 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <p className="text-slate-800 text-base font-mono font-bold uppercase tracking-wider mb-1">
                        {currentPlayers.length === 0 ? 'No players acquired yet' : 'No matches found'}
                      </p>
                      <p className="text-slate-400 font-mono text-xs uppercase tracking-wider mb-4">
                        {currentPlayers.length === 0 ? 'Join an active round to bid on players' : 'Try adjusting your filters'}
                      </p>
                      {currentPlayers.length === 0 && (
                        <Link href="/dashboard/team" className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-md hover:bg-slate-700 transition-all">
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          Browse Players
                        </Link>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
