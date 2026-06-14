'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useTournamentContext } from '@/contexts/TournamentContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePermissions } from '@/hooks/usePermissions';
import { usePlayerStats } from '@/hooks';
import { useTournament } from '@/hooks/useTournaments';
import TournamentSelector from '@/components/TournamentSelector';
import { ArrowLeft, TrendingUp, Activity, Trophy, Download, Search, Award, Shield, Star, Crown, ChevronRight, Info, CheckCircle, X, Flame, BarChart2 } from 'lucide-react';

interface PlayerStats {
  player_id: string;
  name: string;
  team_name: string;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  goals_conceded: number;
  clean_sheets: number;
  potm: number;
  win_rate: number;
  average_rating: number;
  points: number;
  star_rating: number;
  base_points?: number;
}

type SortField = 'matches_played' | 'wins' | 'goals' | 'goals_conceded' | 'potm' | 'win_rate' | 'points' | 'star_rating';
type TabType = 'all' | 'golden-boot' | 'golden-glove' | 'rankings' | 'most-improved';

export default function PlayerStatsPage() {
  const { user, loading } = useAuth();
  const { selectedTournamentId } = useTournamentContext();
  const { userSeasonId } = usePermissions();
  const router = useRouter();
  
  // Get tournament info for display
  const { data: tournament } = useTournament(selectedTournamentId);
  
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<PlayerStats[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [roundRange, setRoundRange] = useState<string>('all');

  // Use React Query hook for player stats from Neon - fetches from player_seasons table
  const { data: playerStatsData, isLoading: statsLoading, isFetching } = usePlayerStats({
    tournamentId: selectedTournamentId || undefined,
    seasonId: userSeasonId || '',
  });
  
  console.log('[Player Stats Page] Stats loading:', statsLoading, 'Fetching:', isFetching, 'Data count:', playerStatsData?.length || 0);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('matches_played');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Process player stats data from Neon when it arrives
  useEffect(() => {
    if (!playerStatsData || playerStatsData.length === 0) return;
    
    const players: PlayerStats[] = playerStatsData.map((data: any) => {
      const winRate = data.matches_played > 0 ? (data.wins / data.matches_played) * 100 : 0;
      
      return {
        player_id: data.player_id,
        name: data.player_name,
        team_name: data.team || 'Unassigned',
        matches_played: data.matches_played || 0,
        wins: data.wins || 0,
        draws: data.draws || 0,
        losses: data.losses || 0,
        goals: data.goals_scored || 0,
        goals_conceded: data.goals_conceded || 0,
        clean_sheets: data.clean_sheets || 0,
        potm: data.motm_awards || 0,
        win_rate: winRate,
        average_rating: 0,
        points: data.points || 0,
        base_points: data.base_points || 0,
        star_rating: data.star_rating || 3,
      };
    });

    setPlayerStats(players);
    setFilteredPlayers(players);
  }, [playerStatsData]);

  useEffect(() => {
    let filtered = [...playerStats];

    // Tab filter
    if (activeTab === 'golden-boot') {
      // Top 10 goal scorers
      filtered = filtered
        .filter(p => p.goals > 0)
        .sort((a, b) => b.goals - a.goals)
        .slice(0, 10);
    } else if (activeTab === 'golden-glove') {
      // Top 10 clean sheet keepers
      // Sort by: 1) Most clean sheets, 2) Fewest goals conceded (as tiebreaker)
      filtered = filtered
        .filter(p => p.matches_played > 0)
        .sort((a, b) => {
          // Primary: Clean sheets (descending)
          if (b.clean_sheets !== a.clean_sheets) {
            return b.clean_sheets - a.clean_sheets;
          }
          // Secondary: Goals conceded (ascending - fewer is better)
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
          points_change: p.points - (p.base_points || 0)
        }))
        .sort((a, b) => (b as any).points_change - (a as any).points_change)
        .slice(0, 10);
    }

    // Search filter (only for 'all' tab)
    if (activeTab === 'all' && searchTerm) {
      filtered = filtered.filter((p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.player_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.team_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sort (only for 'all' tab)
    if (activeTab === 'all') {
      filtered.sort((a, b) => {
        const aVal = a[sortField] || 0;
        const bVal = b[sortField] || 0;
        
        if (sortOrder === 'asc') {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });
    }

    setFilteredPlayers(filtered);
  }, [playerStats, searchTerm, sortField, sortOrder, activeTab]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const exportToExcel = async () => {
    try {
      // Dynamically import xlsx
      const XLSX = await import('xlsx');
      
      // Prepare data for export
      const exportData = filteredPlayers.map((player, index) => ({
        'Rank': index + 1,
        'Player Name': player.name,
        'Player ID': player.player_id,
        'Team': player.team_name,
        'Matches Played': player.matches_played,
        'Wins': player.wins,
        'Draws': player.draws,
        'Losses': player.losses,
        'Goals Scored': player.goals,
        'Goals Conceded': player.goals_conceded,
        'Clean Sheets': player.clean_sheets,
        'POTM Awards': player.potm,
        'Win Rate (%)': player.win_rate.toFixed(2),
        'Current Points': player.points,
        'Base Points': player.base_points || 0,
        'Points Change': player.base_points ? player.points - player.base_points : 0,
        'Star Rating': player.star_rating
      }));

      // Create worksheet
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      // Set column widths
      const columnWidths = [
        { wch: 6 },  // Rank
        { wch: 25 }, // Player Name
        { wch: 15 }, // Player ID
        { wch: 20 }, // Team
        { wch: 15 }, // Matches Played
        { wch: 8 },  // Wins
        { wch: 8 },  // Draws
        { wch: 8 },  // Losses
        { wch: 12 }, // Goals Scored
        { wch: 14 }, // Goals Conceded
        { wch: 12 }, // Clean Sheets
        { wch: 12 }, // POTM Awards
        { wch: 12 }, // Win Rate
        { wch: 14 }, // Current Points
        { wch: 12 }, // Base Points
        { wch: 14 }, // Points Change
        { wch: 12 }  // Star Rating
      ];
      worksheet['!cols'] = columnWidths;

      // Create workbook
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Player Stats');

      // Generate filename with tournament and date
      const tournamentName = tournament?.tournament_name || 'Tournament';
      const date = new Date().toISOString().split('T')[0];
      const filename = `${tournamentName}_Player_Stats_${date}.xlsx`;

      // Save file
      XLSX.writeFile(workbook, filename);
      
      console.log(`<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Exported ${exportData.length} players to ${filename}`);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export to Excel. Please try again.');
    }
  };

  if (loading || statsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading player stats console...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'committee_admin') {
    return null;
  }

  // Top performers
  const topScorer = [...playerStats].sort((a, b) => b.goals - a.goals)[0];
  const mostPOTM = [...playerStats].sort((a, b) => b.potm - a.potm)[0];
  const highestPoints = [...playerStats].sort((a, b) => b.points - a.points)[0];
  const highestStars = [...playerStats].sort((a, b) => b.star_rating - a.star_rating)[0];

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation & Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/committee/team-management"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Team Management
            </Link>
            <Link
              href="/dashboard/committee/team-management/team-standings"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-705 font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
            >
              <TrendingUp className="w-3.5 h-3.5 text-slate-600" /> View Team Standings
            </Link>
          </div>
          <div>
            <TournamentSelector />
          </div>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Activity className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">SYSTEM CONTROL</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Player Statistics
              </h1>
              <p className="text-xs text-slate-550 font-mono mt-1">
                Detailed metrics for all players across active tournaments.
              </p>
            </div>
          </div>
        </div>

        {/* Top Performers Highlights */}
        {playerStats.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {topScorer && topScorer.goals > 0 && (
              <div className="bg-yellow-50/10 border border-yellow-250/60 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <span className="p-1 rounded-md bg-yellow-500 text-white"><Flame className="w-3.5 h-3.5" /></span>
                  <h3 className="text-[10px] font-black uppercase text-yellow-800 tracking-wider">Top Scorer</h3>
                </div>
                <p className="font-extrabold text-sm text-slate-900 truncate mt-1">{topScorer.name}</p>
                <p className="text-xl font-black text-yellow-600 font-mono mt-1">{topScorer.goals} Goals</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">{topScorer.team_name}</p>
              </div>
            )}
            
            {mostPOTM && mostPOTM.potm > 0 && (
              <div className="bg-purple-50/10 border border-purple-250/60 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <span className="p-1 rounded-md bg-purple-500 text-white"><Award className="w-3.5 h-3.5" /></span>
                  <h3 className="text-[10px] font-black uppercase text-purple-800 tracking-wider">Most POTM</h3>
                </div>
                <p className="font-extrabold text-sm text-slate-900 truncate mt-1">{mostPOTM.name}</p>
                <p className="text-xl font-black text-purple-600 font-mono mt-1">{mostPOTM.potm} Awards</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">{mostPOTM.team_name}</p>
              </div>
            )}
            
            {highestPoints && highestPoints.points > 0 && (
              <div className="bg-emerald-50/10 border border-emerald-250/60 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <span className="p-1 rounded-md bg-emerald-500 text-white"><Crown className="w-3.5 h-3.5" /></span>
                  <h3 className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">Highest Points</h3>
                </div>
                <p className="font-extrabold text-sm text-slate-900 truncate mt-1">{highestPoints.name}</p>
                <p className="text-xl font-black text-emerald-600 font-mono mt-1">{highestPoints.points} Pts</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">{highestPoints.team_name} • {highestStars.star_rating}<Star className="w-4 h-4 inline-block text-amber-400 fill-amber-400 mr-1 align-text-bottom" /></p>
              </div>
            )}
            
            {highestStars && highestStars.star_rating > 0 && (
              <div className="bg-amber-50/10 border border-amber-250/60 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <span className="p-1 rounded-md bg-amber-500 text-white"><Star className="w-3.5 h-3.5 text-white" /></span>
                  <h3 className="text-[10px] font-black uppercase text-amber-800 tracking-wider">Top Rated</h3>
                </div>
                <p className="font-extrabold text-sm text-slate-900 truncate mt-1">{highestStars.name}</p>
                <p className="text-xl font-black text-amber-600 font-mono mt-1">{highestStars.star_rating} <Star className="w-4 h-4 inline-block text-amber-400 fill-amber-400 mr-1 align-text-bottom" /></p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">{highestStars.team_name} • {highestStars.points} Pts</p>
              </div>
            )}
          </div>
        )}

        {/* Tabs Selector */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-2 shadow-sm">
          <div className="flex gap-2 overflow-x-auto font-mono scrollbar-thin">
            {[
              { tab: 'all', label: '<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> All Players', activeClass: 'bg-slate-800 text-white border-slate-900' },
              { tab: 'golden-boot', label: '<Activity className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Golden Boot', activeClass: 'bg-yellow-500 text-white border-yellow-600' },
              { tab: 'golden-glove', label: '🧤 Golden Glove', activeClass: 'bg-emerald-600 text-white border-emerald-700' },
              { tab: 'rankings', label: '<Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Top Rankings', activeClass: 'bg-blue-600 text-white border-blue-700' },
              { tab: 'most-improved', label: '📈 Most Improved', activeClass: 'bg-pink-600 text-white border-pink-700' }
            ].map(({ tab, label, activeClass }) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as TabType)}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap border cursor-pointer ${
                  activeTab === tab
                    ? `${activeClass} shadow-sm`
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Search & Sort Panel */}
        {activeTab === 'all' && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Search players by name, ID, or team..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2.5 pl-11 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-405">
                  <Search className="w-4 h-4" />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                {[
                  { field: 'matches_played', label: 'MP' },
                  { field: 'goals', label: 'Goals' },
                  { field: 'win_rate', label: 'Win%' },
                  { field: 'points', label: 'Points' },
                  { field: 'star_rating', label: 'Stars' }
                ].map(({ field, label }) => (
                  <button
                    key={field}
                    onClick={() => handleSort(field as SortField)}
                    className={`px-3 py-2 text-xs font-extrabold uppercase rounded-xl transition-all border cursor-pointer ${
                      sortField === field
                        ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-900 shadow-sm'
                        : 'bg-white hover:bg-slate-100 text-slate-650 border-slate-200'
                    }`}
                  >
                    Sort by {label} {sortField === field && (sortOrder === 'desc' ? '↓' : '↑')}
                  </button>
                ))}
                <button
                  onClick={exportToExcel}
                  className="px-4 py-2 text-xs font-extrabold uppercase rounded-xl transition-all bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 flex items-center gap-1.5 cursor-pointer ml-auto md:ml-0"
                  title="Export to Excel"
                >
                  <Download className="w-3.5 h-3.5" /> Export Excel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Player Stats Table */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-950">
                {activeTab === 'golden-boot' && '<Activity className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Golden Boot - Top Scorers'}
                {activeTab === 'golden-glove' && '🧤 Golden Glove - Clean Sheet Leaders'}
                {activeTab === 'rankings' && '<Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Top 20 Rankings'}
                {activeTab === 'most-improved' && '📈 Most Improved Players'}
                {activeTab === 'all' && 'Player Performance'}
              </h2>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                {activeTab === 'golden-boot' && 'Top 10 players by goals scored'}
                {activeTab === 'golden-glove' && 'Top 10 players by clean sheets'}
                {activeTab === 'rankings' && 'Top 20 players by points'}
                {activeTab === 'most-improved' && 'Top 10 players with highest points gain'}
                {activeTab === 'all' && 'Detailed statistics for all players'}
                {roundRange !== 'all' && ` (Rounds ${roundRange})`}
              </p>
            </div>
            <div className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">
              <span className="text-slate-800 font-black">{filteredPlayers.length}</span> / {playerStats.length} Players
            </div>
          </div>

          {filteredPlayers.length === 0 ? (
            <div className="text-center py-12 text-slate-400 p-8">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-4">
                <Info className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">
                No Player Stats Found
              </h3>
              <p className="text-xs text-slate-550 font-mono">
                {searchTerm ? 'Try a different search term.' : 'Player statistics will appear once matches are completed.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="min-w-full divide-y divide-slate-100 font-mono text-xs">
                <thead className="bg-slate-50/50">
                  <tr className="text-slate-500 font-black uppercase text-[10px] tracking-wider">
                    <th className="px-6 py-4 text-left sticky left-0 bg-slate-50/90 backdrop-blur-sm z-15 border-r border-slate-100">Player</th>
                    <th className="px-6 py-4 text-left">Team</th>
                    <th className="px-4 py-4 text-center cursor-pointer hover:bg-slate-100" onClick={() => handleSort('matches_played')}>
                      MP {sortField === 'matches_played' && (sortOrder === 'desc' ? '↓' : '↑')}
                    </th>
                    <th className="px-4 py-4 text-center cursor-pointer hover:bg-slate-100" onClick={() => handleSort('wins')}>
                      W {sortField === 'wins' && (sortOrder === 'desc' ? '↓' : '↑')}
                    </th>
                    <th className="px-4 py-4 text-center">D</th>
                    <th className="px-4 py-4 text-center">L</th>
                    <th className="px-4 py-4 text-center cursor-pointer hover:bg-slate-100" onClick={() => handleSort('goals')}>
                      Goals {sortField === 'goals' && (sortOrder === 'desc' ? '↓' : '↑')}
                    </th>
                    <th className="px-4 py-4 text-center cursor-pointer hover:bg-slate-100" onClick={() => handleSort('goals_conceded')}>
                      GC {sortField === 'goals_conceded' && (sortOrder === 'desc' ? '↓' : '↑')}
                    </th>
                    <th className="px-4 py-4 text-center">CS</th>
                    <th className="px-4 py-4 text-center cursor-pointer hover:bg-slate-100" onClick={() => handleSort('potm')}>
                      POTM {sortField === 'potm' && (sortOrder === 'desc' ? '↓' : '↑')}
                    </th>
                    <th className="px-4 py-4 text-center cursor-pointer hover:bg-slate-100" onClick={() => handleSort('win_rate')}>
                      Win % {sortField === 'win_rate' && (sortOrder === 'desc' ? '↓' : '↑')}
                    </th>
                    <th className="px-4 py-4 text-center cursor-pointer hover:bg-slate-100" onClick={() => handleSort('points')}>
                      Points {sortField === 'points' && (sortOrder === 'desc' ? '↓' : '↑')}
                    </th>
                    <th className="px-4 py-4 text-center">Base</th>
                    <th className="px-4 py-4 text-center">Change</th>
                    <th className="px-6 py-4 text-center cursor-pointer hover:bg-slate-100" onClick={() => handleSort('star_rating')}>
                      Stars {sortField === 'star_rating' && (sortOrder === 'desc' ? '↓' : '↑')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredPlayers.map((player, index) => (
                    <tr key={player.player_id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap sticky left-0 bg-white border-r border-slate-100">
                        <div className="flex items-center gap-2">
                          {index === 0 && <span className="text-base flex-shrink-0"><Trophy className="w-4 h-4 inline-block text-amber-500 fill-amber-500 mr-1 align-text-bottom" /></span>}
                          {index === 1 && <span className="text-base flex-shrink-0"><Trophy className="w-4 h-4 inline-block text-slate-400 fill-slate-400 mr-1 align-text-bottom" /></span>}
                          {index === 2 && <span className="text-base flex-shrink-0"><Trophy className="w-4 h-4 inline-block text-amber-700 fill-amber-700 mr-1 align-text-bottom" /></span>}
                          <div>
                            <div className="text-xs font-bold text-slate-850">{player.name}</div>
                            <div className="text-[10px] text-slate-450 font-mono mt-0.5">{player.player_id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-700 font-bold uppercase">{player.team_name}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-center text-slate-900 font-black">{player.matches_played}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-center text-emerald-650 font-black">{player.wins}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-center text-slate-550 font-bold">{player.draws}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-center text-rose-600 font-black">{player.losses}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-yellow-50 text-yellow-800 border border-yellow-100 font-bold">
                          <Flame className="w-3 h-3 text-yellow-600" /> {player.goals}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-100 font-bold">
                          <Shield className="w-3 h-3 text-rose-500" /> {player.goals_conceded || 0}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-emerald-50/55 text-emerald-800 border border-emerald-100 font-bold">
                          <CheckCircle className="w-3 h-3 text-emerald-500" /> {player.clean_sheets}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-100 font-bold">
                          <Award className="w-3 h-3 text-purple-600" /> {player.potm}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <span className={`font-black ${player.win_rate >= 50 ? 'text-emerald-650' : 'text-slate-600'}`}>
                          {player.win_rate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-slate-800 text-white font-mono font-black">
                          {player.points}p
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center text-slate-500 font-bold font-mono">
                        {player.base_points || 0}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center font-mono">
                        {player.base_points !== undefined && player.base_points > 0 ? (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black ${
                            player.points - player.base_points > 0 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                              : player.points - player.base_points < 0
                              ? 'bg-rose-50 text-rose-750 border border-rose-100'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {player.points - player.base_points > 0 ? '↑' : player.points - player.base_points < 0 ? '↓' : '='} 
                            {player.points - player.base_points > 0 ? '+' : ''}{player.points - player.base_points}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-amber-50 text-amber-850 border border-amber-200 font-black font-mono">
                          {player.star_rating} <Star className="w-4 h-4 inline-block text-amber-400 fill-amber-400 mr-1 align-text-bottom" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Legend Notice */}
        <div className="console-card bg-slate-50 border border-slate-200 rounded-3xl p-5">
          <h3 className="text-xs font-black uppercase text-slate-850 tracking-wider flex items-center gap-1.5 mb-3">
            <Info className="w-4 h-4 text-slate-500" /> Glossary Legend
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-[10px] font-mono text-slate-550">
            <div><strong>MP</strong>: Matches Played</div>
            <div><strong>W</strong>: Wins</div>
            <div><strong>D</strong>: Draws</div>
            <div><strong>L</strong>: Losses</div>
            <div><strong>GC</strong>: Goals Conceded</div>
            <div><strong>CS</strong>: Clean Sheets</div>
            <div><strong>POTM</strong>: Player of Match</div>
            <div><strong>Win %</strong>: Win Percentage</div>
            <div><strong>Points</strong>: Current Points</div>
            <div><strong>Base</strong>: Starting Points</div>
            <div><strong>Change</strong>: Points Delta</div>
            <div><strong>Stars</strong>: Star Rating</div>
          </div>
        </div>
      </div>
    </div>
  );
}
