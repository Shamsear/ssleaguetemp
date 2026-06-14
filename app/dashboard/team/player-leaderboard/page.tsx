'use client';

import { GloveIcon, SoccerBallIcon } from '@/components/ui/CustomIcons';
import { BarChart2, Globe, Star, TrendingUp, Trophy, User, Users, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTournamentContext } from '@/contexts/TournamentContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePermissions } from '@/hooks/usePermissions';
import { usePlayerStats } from '@/hooks';
import { useTournament } from '@/hooks/useTournaments';
import TournamentSelector from '@/components/TournamentSelector';

interface PlayerStats {
  id: string;
  player_id: string;
  name: string;
  team_id?: string;
  team_name?: string;
  category_id?: string;
  category_name?: string;
  category_color?: string;
  points: number;
  base_points?: number;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  goals: number;
  assists: number;
  goals_conceded: number;
  clean_sheets: number;
  potm: number;
  points_change?: number; // For most improved tab
}

interface Team {
  id: string;
  team_name: string;
}

interface Category {
  id: string;
  name: string;
  color: string;
}

type SortField = 'points' | 'matches_played' | 'wins' | 'losses' | 'draws' | 'win_rate' | 'name';
type SortOrder = 'asc' | 'desc';
type TabType = 'all' | 'golden-boot' | 'golden-glove' | 'rankings' | 'most-improved';

export default function PlayerLeaderboardPage() {
  const { user, loading } = useAuth();
  const { selectedTournamentId, seasonId, setSeasonId } = useTournamentContext();
  const { userSeasonId } = usePermissions();
  const router = useRouter();
  
  // Get tournament info for display
  const { data: tournament } = useTournament(selectedTournamentId);
  
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<PlayerStats[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showOverall, setShowOverall] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  
  // Use React Query hook for player stats from Neon
  // If showOverall is true, use seasonId (all tournaments), otherwise use tournamentId (specific tournament)
  // Use seasonId from context for team users, userSeasonId for committee admins
  const effectiveSeasonId = user?.role === 'team' ? seasonId : userSeasonId;
  
  const { data: playerStatsData, isLoading: statsLoading } = usePlayerStats({
    tournamentId: showOverall ? undefined : selectedTournamentId,
    seasonId: effectiveSeasonId || '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  
  const [sortField, setSortField] = useState<SortField>('points');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch and set the team's season if not already set
  useEffect(() => {
    const fetchTeamSeason = async () => {
      if (!user || user.role !== 'team' || seasonId) return;

      try {
        // Get active season from Firebase
        const { db } = await import('@/lib/firebase/config');
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        
        const seasonsRef = collection(db, 'seasons');
        const activeSeasonQuery = query(seasonsRef, where('isActive', '==', true));
        const snapshot = await getDocs(activeSeasonQuery);
        
        if (!snapshot.empty) {
          const activeSeason = snapshot.docs[0];
          const activeSeasonId = activeSeason.id;
          
          // Check if team is registered for this season
          const teamSeasonsRef = collection(db, 'team_seasons');
          const teamSeasonQuery = query(
            teamSeasonsRef,
            where('user_id', '==', user.uid),
            where('season_id', '==', activeSeasonId),
            where('status', '==', 'registered')
          );
          const teamSeasonSnapshot = await getDocs(teamSeasonQuery);
          
          if (!teamSeasonSnapshot.empty) {
            console.log('📝 [Player Leaderboard] Setting team season ID:', activeSeasonId);
            setSeasonId(activeSeasonId);
          } else {
            console.log('⚠️ [Player Leaderboard] Team not registered for active season');
          }
        } else {
          console.log('⚠️ [Player Leaderboard] No active season found');
        }
      } catch (error) {
        console.error('<XCircle className="w-4 h-4 text-rose-500" /> [Player Leaderboard] Error fetching team season:', error);
      }
    };

    fetchTeamSeason();
  }, [user, seasonId, setSeasonId]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user || user.role !== 'team' || !effectiveSeasonId) return;

      try {
        setIsLoading(true);
        
        // Fetch teams and categories for filters
        const [teamsRes, categoriesRes] = await Promise.all([
          fetch('/api/team/all'),
          fetch('/api/categories'),
        ]);

        const [teamsData, categoriesData] = await Promise.all([
          teamsRes.json(),
          categoriesRes.json(),
        ]);

        if (categoriesData.success) {
          setCategories(categoriesData.data);
        }

        if (teamsData.success) {
          setTeams(teamsData.data);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user, effectiveSeasonId]);

  // Process player stats data from Neon when it arrives
  useEffect(() => {
    if (!playerStatsData || playerStatsData.length === 0) return;
    
    const playersData: PlayerStats[] = playerStatsData.map((data: any) => {
      const winRate = data.matches_played > 0 ? (data.wins / data.matches_played) * 100 : 0;
      
      return {
        id: data.id || data.player_id,
        player_id: data.player_id,
        name: data.player_name,
        team_id: data.team_id,
        team_name: data.team || 'Unassigned',
        category_id: data.category_id,
        category_name: data.category || 'Unknown',
        category_color: undefined,
        matches_played: data.matches_played || 0,
        wins: data.wins || 0,
        draws: data.draws || 0,
        losses: data.losses || 0,
        points: data.points || 0,
        base_points: data.base_points || 0,
        win_rate: winRate,
        goals: data.goals_scored || 0,
        assists: data.assists || 0,
        goals_conceded: data.goals_conceded || 0,
        clean_sheets: data.clean_sheets || 0,
        potm: data.motm_awards || 0,
      };
    });

    setPlayers(playersData);
  }, [playerStatsData]);

  useEffect(() => {
    let filtered = [...players];

    // Tab filter
    if (activeTab === 'golden-boot') {
      // Top 10 goal scorers
      filtered = filtered
        .filter(p => p.goals > 0)
        .sort((a, b) => b.goals - a.goals)
        .slice(0, 10);
    } else if (activeTab === 'golden-glove') {
      // Top 10 clean sheet keepers
      filtered = filtered
        .filter(p => p.matches_played > 0)
        .sort((a, b) => {
          if (b.clean_sheets !== a.clean_sheets) {
            return b.clean_sheets - a.clean_sheets;
          }
          return a.goals_conceded - b.goals_conceded;
        })
        .slice(0, 10);
    } else if (activeTab === 'rankings') {
      // Top 20 by points
      filtered = filtered
        .sort((a, b) => b.points - a.points)
        .slice(0, 20);
    } else if (activeTab === 'most-improved') {
      // Top 10 most improved (highest positive points change)
      filtered = filtered
        .filter(p => p.base_points && p.base_points > 0)
        .map(p => ({
          ...p,
          id: p.id || p.player_id, // Ensure id is always present
          points_change: p.points - (p.base_points || 0)
        }))
        .sort((a: any, b: any) => b.points_change - a.points_change)
        .slice(0, 10);
    }

    // Search filter (only for 'all' tab)
    if (activeTab === 'all' && searchTerm) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.player_id.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Team filter (only for 'all' tab)
    if (activeTab === 'all') {
      if (teamFilter === 'unassigned') {
        filtered = filtered.filter((p) => !p.team_id);
      } else if (teamFilter) {
        filtered = filtered.filter((p) => p.team_id === teamFilter);
      }
    }

    // Sort (only for 'all' tab)
    if (activeTab === 'all') {
      filtered.sort((a, b) => {
        let aVal: any = a[sortField];
        let bVal: any = b[sortField];

        if (sortField === 'name') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }

        if (sortOrder === 'asc') {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });
    }

    setFilteredPlayers(filtered);
  }, [players, searchTerm, teamFilter, sortField, sortOrder, activeTab]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getColorClass = (color: string) => {
    const colorMap: { [key: string]: string } = {
      red: 'bg-red-600',
      blue: 'bg-blue-600',
      black: 'bg-black',
      white: 'bg-white border-2 border-gray-300',
      green: 'bg-green-600',
      yellow: 'bg-yellow-500',
      orange: 'bg-orange-600',
      purple: 'bg-purple-600',
    };
    return colorMap[color] || 'bg-gray-200';
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    
    if (sortOrder === 'asc') {
      return (
        <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
        </svg>
      );
    } else {
      return (
        <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      );
    }
  };

  if (loading || statsLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Leaderboard...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team') {
    return null;
  }

  const stats = {
    totalPlayers: players.length,
    activePlayers: players.filter(p => p.matches_played > 0).length,
    topScorer: players.length > 0 ? players.reduce((max, p) => p.points > max.points ? p : max, players[0]) : null,
  };

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          {/* Back Link */}
          <Link
            href="/dashboard/team"
            className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit mb-4"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Dashboard
          </Link>

          {/* Title Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono relative overflow-hidden">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/10">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800">
                      Player Leaderboard
                    </h1>
                    <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                      {tournament?.tournament_name ? `${tournament.tournament_name} - ` : ''}Player Rankings
                    </p>
                  </div>
                </div>
                
                {/* Quick Link */}
                <Link
                  href="/dashboard/team/team-leaderboard"
                  className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold inline-flex items-center gap-1.5 mt-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  View Team Standings
                </Link>
              </div>
              
              {/* Tournament Selector */}
              <div className="w-full sm:w-auto">
                <TournamentSelector />
              </div>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="console-card bg-white border border-slate-200/60 rounded-xl p-4 shadow-sm hover:border-amber-400/40 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Players</p>
                <p className="text-2xl font-black text-slate-800 mt-1">{stats.totalPlayers}</p>
              </div>
              <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-xl p-4 shadow-sm hover:border-amber-400/40 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Players</p>
                <p className="text-2xl font-black text-slate-800 mt-1">{stats.activePlayers}</p>
              </div>
              <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-xl p-4 shadow-sm hover:border-amber-400/40 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Top Scorer</p>
                <p className="text-base font-black text-slate-800 mt-1 truncate pr-2">
                  {stats.topScorer ? stats.topScorer.name : 'N/A'}
                </p>
                {stats.topScorer && (
                  <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{stats.topScorer.points} points</p>
                )}
              </div>
              <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Overall Stats Toggle */}
        <div className="mb-4 flex justify-end font-mono">
          <button
            onClick={() => setShowOverall(!showOverall)}
            className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer ${
              showOverall
                ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-lg'
                : 'bg-white text-slate-700 border border-slate-200/60 hover:border-amber-400/40 hover:text-amber-600'
            }`}
          >
            {showOverall ? '<Globe className="w-4 h-4 text-slate-500" /> Overall Stats' : '<Trophy className="w-4 h-4 text-amber-500 fill-amber-500" /> Tournament Stats'}
          </button>
        </div>

        {/* Tabs */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 mb-6 font-mono shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">Leaderboards</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Select a view to filter player stats</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-slate-800 text-amber-400 border border-slate-900'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-850 hover:bg-slate-100 border border-slate-200/30'
              }`}
            >
              <Users className="w-4 h-4 text-slate-500" /> All Players
            </button>
            <button
              onClick={() => setActiveTab('golden-boot')}
              className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer ${
                activeTab === 'golden-boot'
                  ? 'bg-slate-800 text-amber-400 border border-slate-900'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-850 hover:bg-slate-100 border border-slate-200/30'
              }`}
            >
              <SoccerBallIcon className="w-4 h-4" /> Golden Boot
            </button>
            <button
              onClick={() => setActiveTab('golden-glove')}
              className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer ${
                activeTab === 'golden-glove'
                  ? 'bg-slate-800 text-amber-400 border border-slate-900'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-850 hover:bg-slate-100 border border-slate-200/30'
              }`}
            >
              <GloveIcon className="w-4 h-4" /> Golden Glove
            </button>
            <button
              onClick={() => setActiveTab('rankings')}
              className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer ${
                activeTab === 'rankings'
                  ? 'bg-slate-800 text-amber-400 border border-slate-900'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-850 hover:bg-slate-100 border border-slate-200/30'
              }`}
            >
              <Trophy className="w-4 h-4 text-amber-500 fill-amber-500" /> Top Rankings
            </button>
            <button
              onClick={() => setActiveTab('most-improved')}
              className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer ${
                activeTab === 'most-improved'
                  ? 'bg-slate-800 text-amber-400 border border-slate-900'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-850 hover:bg-slate-100 border border-slate-200/30'
              }`}
            >
              <TrendingUp className="w-4 h-4 text-emerald-500" /> Most Improved
            </button>
          </div>
        </div>

        {/* Filters - Only show for 'all' tab */}
        {activeTab === 'all' && (
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 mb-6 font-mono shadow-sm">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-4">Filters</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Search Players</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name or ID..."
                  className="w-full py-2 px-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Filter by Team</label>
                <select
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value)}
                  className="w-full py-2 px-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                >
                  <option value="">All Teams</option>
                  <option value="unassigned">Unassigned</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.team_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Leaderboard Table Container */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl overflow-hidden font-mono shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="text-xl">
                    {activeTab === 'golden-boot' && '<SoccerBallIcon className="w-4 h-4" />'}
                    {activeTab === 'golden-glove' && '<GloveIcon className="w-4 h-4" />'}
                    {activeTab === 'rankings' && '<Trophy className="w-4 h-4 text-amber-500 fill-amber-500" />'}
                    {activeTab === 'most-improved' && '<TrendingUp className="w-4 h-4 text-emerald-500" />'}
                    {activeTab === 'all' && '<Users className="w-4 h-4 text-slate-500" />'}
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
                    {activeTab === 'golden-boot' && 'Golden Boot - Top Scorers'}
                    {activeTab === 'golden-glove' && 'Golden Glove - Clean Sheet Leaders'}
                    {activeTab === 'rankings' && 'Top 20 Rankings'}
                    {activeTab === 'most-improved' && 'Most Improved Players'}
                    {activeTab === 'all' && 'Player Rankings'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                    {activeTab === 'golden-boot' && 'Top 10 players by goals scored'}
                    {activeTab === 'golden-glove' && 'Top 10 players by clean sheets'}
                    {activeTab === 'rankings' && 'Top 20 players by points'}
                    {activeTab === 'most-improved' && 'Top 10 players with highest points gain'}
                    {activeTab === 'all' && `${filteredPlayers.length} players competing`}
                  </p>
                </div>
              </div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider sm:text-right">
                <span className="text-slate-800 font-extrabold">{filteredPlayers.length}</span> / {players.length} Players
              </div>
            </div>
          </div>

          {/* Desktop Table - Hidden on mobile */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/50 border-b border-slate-100 font-mono text-[10px] text-slate-400 font-bold uppercase tracking-wider text-center">
                <tr>
                  <th className="px-4 py-3.5 text-left font-bold uppercase tracking-wider">
                    Rank
                  </th>
                  <th 
                    className="px-4 py-3.5 text-left font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 hover:text-slate-800 transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1.5">
                      Player
                      <SortIcon field="name" />
                    </div>
                  </th>
                  <th className="px-4 py-3.5 text-left font-bold uppercase tracking-wider">
                    Team
                  </th>
                  <th 
                    className="px-4 py-3.5 font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 hover:text-slate-800 transition-colors"
                    onClick={() => handleSort('points')}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      {activeTab === 'most-improved' ? 'PTS Change' : 'PTS'}
                      <SortIcon field="points" />
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3.5 font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 hover:text-slate-800 transition-colors"
                    onClick={() => handleSort('matches_played')}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      MP
                      <SortIcon field="matches_played" />
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3.5 font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 hover:text-slate-800 transition-colors"
                    onClick={() => handleSort('wins')}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      W
                      <SortIcon field="wins" />
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3.5 font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 hover:text-slate-800 transition-colors"
                    onClick={() => handleSort('draws')}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      D
                      <SortIcon field="draws" />
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3.5 font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 hover:text-slate-800 transition-colors"
                    onClick={() => handleSort('losses')}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      L
                      <SortIcon field="losses" />
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3.5 font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 hover:text-slate-800 transition-colors"
                    onClick={() => handleSort('win_rate')}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      Win %
                      <SortIcon field="win_rate" />
                    </div>
                  </th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">
                    GS
                  </th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">
                    GC
                  </th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">
                    CS
                  </th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">
                    POTM
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white/40 divide-y divide-slate-100/60">
                {filteredPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-6 py-12 text-center text-slate-400 font-mono">
                      <span className="text-4xl mb-3 block"><User className="w-4 h-4 text-slate-500" /></span>
                      <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">No Players Found</h3>
                      <p className="text-[10px] text-slate-450 uppercase font-semibold">Try adjusting your filters</p>
                    </td>
                  </tr>
                ) : (
                  filteredPlayers.map((player, index) => {
                    const isTop3 = index < 3;
                    const rankClass = isTop3 
                      ? 'border-l-4 border-l-amber-500 bg-amber-500/[0.015]' 
                      : '';
                    
                    return (
                      <tr 
                        key={player.id || player.player_id || `player-${index}`} 
                        className={`hover:bg-slate-50/50 transition-colors text-center ${rankClass}`}
                      >
                        <td className="px-4 py-3.5 whitespace-nowrap text-left text-xs font-black text-slate-800">
                          {index === 0 && <span className="text-lg"><Trophy className="w-4 h-4 text-amber-500 fill-amber-500" /></span>}
                          {index === 1 && <span className="text-lg"><Trophy className="w-4 h-4 text-slate-400 fill-slate-400" /></span>}
                          {index === 2 && <span className="text-lg"><Trophy className="w-4 h-4 text-amber-700 fill-amber-700" /></span>}
                          {index > 2 && <span className="text-slate-400">#{index + 1}</span>}
                        </td>
                        <td className="px-4 py-3.5 text-left">
                          <div>
                            <div className="text-xs font-black text-slate-800">{player.name}</div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase">{player.player_id}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-left whitespace-nowrap">
                          <span className="text-xs text-slate-700 font-bold">
                            {player.team_name || <span className="text-slate-450 italic">Unassigned</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {activeTab === 'most-improved' && player.points_change !== undefined ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span 
                                className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-extrabold border ${
                                  player.points_change > 0 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
                                    : player.points_change < 0
                                    ? 'bg-rose-50 text-rose-700 border-rose-200/50'
                                    : 'bg-slate-50 text-slate-650 border-slate-200/50'
                                }`}
                              >
                                {player.points_change > 0 ? '+' : ''}{player.points_change}
                              </span>
                              <span className="text-[9px] text-slate-400 font-semibold uppercase">
                                {player.base_points} {"->"} {player.points}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black border uppercase tracking-wider bg-slate-800 text-amber-400 border-slate-900">
                              {player.points}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="text-xs text-slate-600 font-bold">{player.matches_played}</span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="text-xs font-bold text-emerald-600">{player.wins}</span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="text-xs text-slate-600 font-bold">{player.draws}</span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="text-xs font-bold text-rose-600">{player.losses}</span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="text-xs font-extrabold text-slate-700">
                            {player.matches_played > 0 ? `${player.win_rate.toFixed(1)}%` : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider bg-emerald-50 text-emerald-700 border-emerald-200/40">
                            <SoccerBallIcon className="w-4 h-4" /> {player.goals || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="text-xs font-bold text-rose-600">{player.goals_conceded || 0}</span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="text-xs font-bold text-sky-600">{player.clean_sheets || 0}</span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider bg-amber-50 text-amber-700 border-amber-200/40">
                            <Star className="w-4 h-4 text-amber-400 fill-amber-400" /> {player.potm || 0}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards - Shown only on mobile */}
          <div className="md:hidden space-y-4 px-2 pb-4">
            {filteredPlayers.length === 0 ? (
              <div className="text-center py-12 text-slate-400 font-mono">
                <span className="text-4xl mb-3 block"><User className="w-4 h-4 text-slate-500" /></span>
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">No Players Found</h3>
                <p className="text-[10px] text-slate-450 uppercase font-semibold">Try adjusting your filters</p>
              </div>
            ) : (
              filteredPlayers.map((player, index) => {
                const isTop3 = index < 3;
                const cardBorder = isTop3 
                  ? 'border-l-4 border-l-amber-500 border-y-slate-200/60 border-r-slate-200/60 bg-amber-500/[0.01]' 
                  : 'border-slate-200/60';
                
                return (
                  <div 
                    key={player.id || player.player_id || `player-${index}`}
                    className={`console-card bg-white border rounded-xl p-4 shadow-sm font-mono transition-all ${cardBorder}`}
                  >
                    {/* Header with Rank and Name */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="text-xl font-bold flex-shrink-0">
                          {index === 0 && '<Trophy className="w-4 h-4 text-amber-500 fill-amber-500" />'}
                          {index === 1 && '<Trophy className="w-4 h-4 text-slate-400 fill-slate-400" />'}
                          {index === 2 && '<Trophy className="w-4 h-4 text-amber-700 fill-amber-700" />'}
                          {index > 2 && <span className="text-xs text-slate-400 font-bold">#{index + 1}</span>}
                        </div>
                        <div>
                          <h3 className="text-xs font-black text-slate-800">{player.name}</h3>
                          <p className="text-[9px] text-slate-400 font-bold uppercase">{player.player_id}</p>
                          <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">
                            {player.team_name || <span className="text-slate-400 italic">Unassigned</span>}
                          </p>
                        </div>
                      </div>
                      {activeTab === 'most-improved' && player.points_change !== undefined ? (
                        <div className="text-right">
                          <span 
                            className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-extrabold border ${
                              player.points_change > 0 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
                                : player.points_change < 0
                                ? 'bg-rose-50 text-rose-700 border-rose-200/50'
                                : 'bg-slate-50 text-slate-650 border-slate-200/50'
                            }`}
                          >
                            {player.points_change > 0 ? '+' : ''}{player.points_change}
                          </span>
                          <p className="text-[9px] text-slate-450 font-semibold uppercase mt-0.5">
                            {player.base_points} {"->"} {player.points}
                          </p>
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black border uppercase tracking-wider bg-slate-800 text-amber-400 border-slate-900">
                          {player.points}
                        </span>
                      )}
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100">
                      <div className="text-center bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Played</p>
                        <p className="text-xs font-extrabold text-slate-800">{player.matches_played}</p>
                      </div>
                      <div className="text-center bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5 font-bold text-emerald-600">Wins</p>
                        <p className="text-xs font-extrabold text-emerald-600">{player.wins}</p>
                      </div>
                      <div className="text-center bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Draws</p>
                        <p className="text-xs font-extrabold text-slate-800">{player.draws}</p>
                      </div>
                      <div className="text-center bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5 font-bold text-rose-650">Losses</p>
                        <p className="text-xs font-extrabold text-rose-600">{player.losses}</p>
                      </div>
                      <div className="text-center bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Win %</p>
                        <p className="text-xs font-extrabold text-slate-800">
                          {player.matches_played > 0 ? `${player.win_rate.toFixed(1)}%` : '-'}
                        </p>
                      </div>
                      <div className="text-center bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Goals</p>
                        <p className="text-xs font-extrabold text-emerald-700"><SoccerBallIcon className="w-4 h-4" /> {player.goals || 0}</p>
                      </div>
                      <div className="text-center bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Conceded</p>
                        <p className="text-xs font-extrabold text-rose-600">{player.goals_conceded || 0}</p>
                      </div>
                      <div className="text-center bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Clean</p>
                        <p className="text-xs font-extrabold text-sky-600"><GloveIcon className="w-4 h-4" /> {player.clean_sheets || 0}</p>
                      </div>
                      <div className="text-center bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">POTM</p>
                        <p className="text-xs font-extrabold text-amber-700"><Star className="w-4 h-4 text-amber-400 fill-amber-400" /> {player.potm || 0}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Legend Info */}
        <div className="console-card mt-6 bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm font-mono">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-xl"><BarChart2 className="w-4 h-4 text-slate-500" /></span>
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-3">Leaderboard Legend</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2.5 text-[10px] text-slate-500 font-bold uppercase">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-800 font-extrabold min-w-[50px]">PTS:</span> 
                  <span className="font-semibold text-slate-450 normal-case">Overall score accumulated</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-800 font-extrabold min-w-[50px]">MP:</span> 
                  <span className="font-semibold text-slate-450 normal-case">Total matches played</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-800 font-extrabold min-w-[50px]">WIN %:</span> 
                  <span className="font-semibold text-slate-450 normal-case">Percentage of matches won</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-800 font-extrabold min-w-[50px]">W/D/L:</span> 
                  <span className="font-semibold text-slate-450 normal-case">Wins, Draws, Losses count</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-800 font-extrabold min-w-[50px]">GS:</span> 
                  <span className="font-semibold text-slate-450 normal-case">Goals Scored</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-800 font-extrabold min-w-[50px]">GC:</span> 
                  <span className="font-semibold text-slate-450 normal-case">Goals Conceded</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-800 font-extrabold min-w-[50px]">CS:</span> 
                  <span className="font-semibold text-slate-450 normal-case">Clean Sheets (Goalkeeper stats)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-800 font-extrabold min-w-[50px]">POTM:</span> 
                  <span className="font-semibold text-slate-450 normal-case">Player of the Match awards</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-800 font-extrabold min-w-[50px]"><Trophy className="w-4 h-4 text-amber-500 fill-amber-500" /><Trophy className="w-4 h-4 text-slate-400 fill-slate-400" /><Trophy className="w-4 h-4 text-amber-700 fill-amber-700" />:</span> 
                  <span className="font-semibold text-slate-450 normal-case">Top 3 player ranks highlighted</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

