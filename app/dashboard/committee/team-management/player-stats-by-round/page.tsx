'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTournamentContext } from '@/contexts/TournamentContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import TournamentSelector from '@/components/TournamentSelector';
import PosterStudio from '@/components/PosterStudio';
import { 
  BarChart2, 
  ArrowLeft, 
  Calendar, 
  Search, 
  Trophy, 
  Users, 
  Award, 
  FileSpreadsheet, 
  Download, 
  ClipboardList 
} from 'lucide-react';

interface PlayerStats {
  player_id: string;
  player_name: string;
  team_name: string;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_scored: number;
  goals_conceded: number;
  goal_difference: number;
  clean_sheets: number;
  motm_awards: number;
  win_rate: number;
  points: number;
  rounds_played: number[];
  photo_url?: string;  // Player photo from Firebase
  team_logo?: string;  // Team logo from Firebase
}

interface PlayerAward {
  id: string;
  award_type: string;
  player_id?: string;
  player_name?: string;
  team_id?: string;
  team_name?: string;
  round_number?: number;
  week_number?: number;
  matchday?: number;
  week?: number;
  performance_stats?: any;
  player_photo?: string;  // Player photo
  team_logo?: string;      // Team logo
}

export default function PlayerStatsByRoundPage() {
  const { user, loading } = useAuth();
  const { selectedTournamentId } = useTournamentContext();
  const { userSeasonId } = usePermissions();
  const router = useRouter();

  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
  const [playerAwards, setPlayerAwards] = useState<PlayerAward[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [playerSearchTerm, setPlayerSearchTerm] = useState('');
  const [teamSearchTerm, setTeamSearchTerm] = useState('');
  const [selectedRound, setSelectedRound] = useState<string>('all');
  const [maxRounds, setMaxRounds] = useState(0);
  const [activeTab, setActiveTab] = useState<'all' | 'golden-boot' | 'golden-glove' | 'golden-ball' | 'top-20' | 'by-week'>('all');
  const [selectedWeek, setSelectedWeek] = useState<number>(1);

  // Define week ranges
  const weekRanges = [
    { week: 1, start: 1, end: 7 },
    { week: 2, start: 8, end: 13 },
    { week: 3, start: 14, end: 20 },
    { week: 4, start: 21, end: 26 },
  ];

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch max rounds
  useEffect(() => {
    const fetchMaxRounds = async () => {
      if (!selectedTournamentId) return;

      try {
        const response = await fetchWithTokenRefresh(`/api/fixtures/season?tournament_id=${selectedTournamentId}`);
        const result = await response.json();

        if (result.fixtures && result.fixtures.length > 0) {
          const maxRound = Math.max(...result.fixtures.map((f: any) => f.round_number || 0));
          setMaxRounds(maxRound);
        }
      } catch (err) {
        console.error('Error fetching rounds:', err);
      }
    };

    fetchMaxRounds();
  }, [selectedTournamentId]);

  // Fetch player awards (POTD and POTW)
  useEffect(() => {
    const fetchAwards = async () => {
      if (!selectedTournamentId || !userSeasonId) return;

      try {
        const response = await fetchWithTokenRefresh(
          `/api/awards?tournament_id=${selectedTournamentId}&season_id=${userSeasonId}`
        );
        const result = await response.json();

        if (result.success && result.data) {
          // Transform award_type from 'POTD'/'POTW'/'TOW' to 'player_of_day'/'player_of_week'/'team_of_week'
          // and add matchday/week fields for compatibility
          const transformedAwards = result.data.map((award: any) => ({
            ...award,
            award_type: award.award_type === 'POTD' ? 'player_of_day' : 
                       award.award_type === 'POTW' ? 'player_of_week' : 
                       award.award_type === 'TOW' ? 'team_of_week' :
                       award.award_type === 'TOD' ? 'team_of_day' :
                       award.award_type,
            matchday: award.round_number, // Map round_number to matchday for POTD and TOD
            week: award.week_number,      // Map week_number to week for POTW and TOW
            // For TOW and TOD, include team info and performance stats
            team_name: award.team_name,
            team_logo: award.team_logo,
            player_photo: award.player_photo,
            performance_stats: award.performance_stats,
            // For TOD (Team of Day), include fixture data if available
            home_team: award.home_team,
            home_team_logo: award.home_team_logo,
            home_score: award.home_score,
            away_team: award.away_team,
            away_team_logo: award.away_team_logo,
            away_score: award.away_score,
          }));
          setPlayerAwards(transformedAwards);
          console.log('Fetched and transformed awards:', transformedAwards);
        }
      } catch (err) {
        console.error('Error fetching awards:', err);
      }
    };

    fetchAwards();
  }, [selectedTournamentId, userSeasonId]);

  // Load player stats
  useEffect(() => {
    const loadStats = async () => {
      if (!userSeasonId) return;
      
      const urlParams = new URLSearchParams(window.location.search);
      const viewMode = urlParams.get('view');

      setIsLoading(true);
      try {
        let url;
        
        if (viewMode === 'full-season') {
          // Full season view - aggregate all tournaments
          url = `/api/committee/player-stats-by-round?season_id=${userSeasonId}&view=full-season`;
          
          if (activeTab === 'by-week') {
            const weekRange = weekRanges.find(w => w.week === selectedWeek);
            if (weekRange) {
              url += `&start_round=${weekRange.start}&end_round=${weekRange.end}`;
            }
          } else {
            url += `&round_number=${selectedRound}`;
          }
        } else {
          // Tournament-specific view
          if (!selectedTournamentId) return;
          url = `/api/committee/player-stats-by-round?tournament_id=${selectedTournamentId}&season_id=${userSeasonId}`;

          if (activeTab === 'by-week') {
            const weekRange = weekRanges.find(w => w.week === selectedWeek);
            if (weekRange) {
              url += `&start_round=${weekRange.start}&end_round=${weekRange.end}`;
            }
          } else {
            url += `&round_number=${selectedRound}`;
          }
        }

        const response = await fetchWithTokenRefresh(url);

        if (response.ok) {
          const data = await response.json();
          console.log('[Player Stats By Round Page] Received data from API:', {
            totalPlayers: data.players?.length,
            samplePlayer: data.players?.[0] ? {
              player_name: data.players[0].player_name,
              team_name: data.players[0].team_name,
              photo_url: data.players[0].photo_url,
              team_logo: data.players[0].team_logo,
              allKeys: Object.keys(data.players[0])
            } : 'No players'
          });
          setPlayerStats(data.players || []);
        }
      } catch (error) {
        console.error('Error loading player stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, [selectedTournamentId, userSeasonId, selectedRound, activeTab, selectedWeek]);

  // Filter players based on active tab
  let filteredPlayers = playerStats.filter((player) => {
    // For 'By Week' tab, use separate search terms
    if (activeTab === 'by-week') {
      const matchesPlayer = !playerSearchTerm || player.player_name.toLowerCase().includes(playerSearchTerm.toLowerCase());
      const matchesTeam = !teamSearchTerm || player.team_name.toLowerCase().includes(teamSearchTerm.toLowerCase());
      return matchesPlayer && matchesTeam;
    }
    
    // For 'All' tab, use combined search
    return player.player_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           player.team_name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Apply tab filters
  if (activeTab === 'golden-boot') {
    filteredPlayers = filteredPlayers
      .filter(p => p.goals_scored > 0)
      .map(player => ({
        ...player,
        goals_per_match: player.matches_played > 0
          ? Math.round((player.goals_scored / player.matches_played) * 100) / 100
          : 0
      }))
      .sort((a: any, b: any) => {
        // Sort by goals first, then by goals per match ratio
        if (b.goals_scored !== a.goals_scored) {
          return b.goals_scored - a.goals_scored;
        }
        return b.goals_per_match - a.goals_per_match;
      })
      .slice(0, 10);
  } else if (activeTab === 'golden-glove') {
    filteredPlayers = filteredPlayers
      .filter(p => p.matches_played > 0)
      .map(player => ({
        ...player,
        clean_sheet_ratio: player.matches_played > 0
          ? Math.round((player.clean_sheets / player.matches_played) * 100)
          : 0
      }))
      .sort((a: any, b: any) => {
        // Sort by clean sheets first, then by clean sheet ratio, then by fewest goals conceded
        if (b.clean_sheets !== a.clean_sheets) {
          return b.clean_sheets - a.clean_sheets;
        }
        if (b.clean_sheet_ratio !== a.clean_sheet_ratio) {
          return b.clean_sheet_ratio - a.clean_sheet_ratio;
        }
        return a.goals_conceded - b.goals_conceded;
      })
      .slice(0, 10);
  } else if (activeTab === 'golden-ball') {
    // Golden Ball: Best overall players based on multiple criteria
    // Scoring system: Points (40%), Goals (20%), Win Rate (20%), MOTM (10%), Clean Sheets (10%)
    filteredPlayers = filteredPlayers
      .filter(p => p.matches_played >= 3) // Minimum 3 matches played
      .map(player => {
        // Normalize each stat to 0-100 scale
        const maxPoints = Math.max(...playerStats.map(p => p.points));
        const maxGoals = Math.max(...playerStats.map(p => p.goals_scored));
        const maxMotm = Math.max(...playerStats.map(p => p.motm_awards));
        const maxCleanSheets = Math.max(...playerStats.map(p => p.clean_sheets));

        const pointsScore = maxPoints > 0 ? (player.points / maxPoints) * 100 : 0;
        const goalsScore = maxGoals > 0 ? (player.goals_scored / maxGoals) * 100 : 0;
        const winRateScore = player.win_rate; // Already 0-100
        const motmScore = maxMotm > 0 ? (player.motm_awards / maxMotm) * 100 : 0;
        const cleanSheetScore = maxCleanSheets > 0 ? (player.clean_sheets / maxCleanSheets) * 100 : 0;

        // Weighted average
        const overallScore = (
          pointsScore * 0.40 +
          goalsScore * 0.20 +
          winRateScore * 0.20 +
          motmScore * 0.10 +
          cleanSheetScore * 0.10
        );

        return {
          ...player,
          overallScore: Math.round(overallScore * 10) / 10
        };
      })
      .sort((a: any, b: any) => b.overallScore - a.overallScore)
      .slice(0, 20);
  } else if (activeTab === 'top-20') {
    filteredPlayers = filteredPlayers
      .sort((a, b) => b.points - a.points)
      .slice(0, 20);
  }

  const exportToExcel = async () => {
    try {
      const XLSX = await import('xlsx');

      const exportData = filteredPlayers.map((player, index) => ({
        'Rank': index + 1,
        'Player Name': player.player_name,
        'Team': player.team_name,
        'Points': player.points,
        'Matches Played': player.matches_played,
        'Wins': player.wins,
        'Draws': player.draws,
        'Losses': player.losses,
        'Goals Scored': player.goals_scored,
        'Goals Conceded': player.goals_conceded,
        'Goal Difference': player.goal_difference,
        'Clean Sheets': player.clean_sheets,
        'MOTM Awards': player.motm_awards,
        'Win Rate (%)': player.win_rate.toFixed(1),
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();

      const sheetName = selectedRound === 'all'
        ? 'All Rounds'
        : `Rounds 1-${selectedRound}`;

      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

      const fileName = selectedRound === 'all'
        ? `player_stats_all_rounds_${new Date().toISOString().split('T')[0]}.xlsx`
        : `player_stats_rounds_1_to_${selectedRound}_${new Date().toISOString().split('T')[0]}.xlsx`;

      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export to Excel');
    }
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading player statistics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Back Link */}
        <Link
          href="/dashboard/committee"
          className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5 text-slate-650" />
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
                  Player Stats By Round
                </h1>
                <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                  View cumulative player performance up to any round
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Selectors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* View Mode Selector */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="w-4 h-4 text-amber-500" />
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">View Mode</h3>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => {
                    window.location.href = '/dashboard/committee/team-management/player-stats-by-round?view=full-season';
                  }}
                  className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer ${
                    new URLSearchParams(window.location.search).get('view') === 'full-season'
                      ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                      : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
                  }`}
                >
                  Full Season Stats
                </button>
                <button
                  onClick={() => {
                    window.location.href = '/dashboard/committee/team-management/player-stats-by-round';
                  }}
                  className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer ${
                    new URLSearchParams(window.location.search).get('view') !== 'full-season'
                      ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                      : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
                  }`}
                >
                  By Tournament
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mt-3">
              {new URLSearchParams(window.location.search).get('view') === 'full-season'
                ? 'Showing combined stats from all tournaments in the season'
                : 'Showing stats for the selected tournament only'}
            </p>
          </div>

          {/* Tournament Selector */}
          <div className={`console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono flex flex-col justify-between transition-all duration-300 ${
            new URLSearchParams(window.location.search).get('view') === 'full-season'
              ? 'opacity-40 pointer-events-none select-none'
              : ''
          }`}>
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Select Tournament</h3>
                </div>
                {new URLSearchParams(window.location.search).get('view') === 'full-season' && (
                  <span className="text-[8px] bg-slate-100 text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded font-mono uppercase font-bold tracking-wider">
                    Season View Active
                  </span>
                )}
              </div>
              <TournamentSelector />
            </div>
            <p className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mt-3">
              {new URLSearchParams(window.location.search).get('view') === 'full-season'
                ? 'Tournament selection is disabled during season view'
                : 'Stats will filter by the active tournament'}
            </p>
          </div>
        </div>

        {/* Round Selector (hidden for By Week tab) */}
        {activeTab !== 'by-week' && (
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Select Round (Cumulative Stats)</h3>
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 mb-3">
              Shows cumulative statistics from Round 1 up to the selected round
            </p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-nowrap pb-1.5 -mx-1 px-1">
              <button
                onClick={() => setSelectedRound('all')}
                className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer shrink-0 ${
                  selectedRound === 'all'
                    ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                    : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
                }`}
              >
                All Rounds
              </button>
              {Array.from({ length: maxRounds }, (_, i) => i + 1).map((round) => (
                <button
                  key={round}
                  onClick={() => setSelectedRound(round.toString())}
                  className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer shrink-0 ${
                    selectedRound === round.toString()
                      ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                      : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
                  }`}
                >
                  Up to R{round}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap font-mono">
          {[
            { id: 'all', label: 'All Players', icon: <Users className="w-3.5 h-3.5 mr-1.5" /> },
            { id: 'by-week', label: 'By Week', icon: <Calendar className="w-3.5 h-3.5 mr-1.5" /> },
            { id: 'golden-boot', label: 'Golden Boot', icon: <Trophy className="w-3.5 h-3.5 mr-1.5 text-amber-500" /> },
            { id: 'golden-glove', label: 'Golden Glove', icon: <Award className="w-3.5 h-3.5 mr-1.5 text-emerald-500" /> },
            { id: 'golden-ball', label: 'Golden Ball', icon: <Award className="w-3.5 h-3.5 mr-1.5 text-amber-500" /> },
            { id: 'top-20', label: 'Top 20', icon: <Trophy className="w-3.5 h-3.5 mr-1.5 text-purple-500" /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer flex items-center ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                  : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-slate-200/60'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Week Selector (only for By Week tab) */}
        {activeTab === 'by-week' && (
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm font-mono">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Select Week</h3>
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-nowrap pb-1.5 -mx-1 px-1">
              {weekRanges.map((weekRange) => (
                <button
                  key={weekRange.week}
                  onClick={() => setSelectedWeek(weekRange.week)}
                  className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer shrink-0 ${
                    selectedWeek === weekRange.week
                      ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                      : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
                  }`}
                >
                  Week {weekRange.week}
                  <span className="block text-[10px] opacity-80 mt-0.5">R{weekRange.start}-{weekRange.end}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search and Export */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono">
          {activeTab === 'all' && (
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm md:col-span-2 flex flex-col justify-between">
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
            </div>
          )}
          {activeTab === 'by-week' && (
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm md:col-span-2 space-y-4">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-amber-500" />
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Search Players & Teams</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search player..."
                    value={playerSearchTerm}
                    onChange={(e) => setPlayerSearchTerm(e.target.value)}
                    className="w-full py-2 px-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                  />
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search team..."
                    value={teamSearchTerm}
                    onChange={(e) => setTeamSearchTerm(e.target.value)}
                    className="w-full py-2 px-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                  />
                </div>
              </div>
            </div>
          )}
          {activeTab !== 'all' && activeTab !== 'by-week' && (
            <div className="md:col-span-2"></div>
          )}

          {/* Export Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-3">
              <FileSpreadsheet className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Export Data</h3>
            </div>
            <button
              onClick={exportToExcel}
              disabled={filteredPlayers.length === 0}
              className="w-full py-2 bg-emerald-600 text-white font-extrabold text-xs rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 uppercase tracking-wider shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Export Excel
            </button>
          </div>
        </div>

        {/* Poster Studio - Full Width Below Search */}
        <div className="mb-6">
          <PosterStudio
            players={filteredPlayers}
            roundOptions={Array.from({ length: maxRounds }, (_, i) => i + 1)}
            weekOptions={weekRanges.map(w => w.week)}
            playerAwards={playerAwards}
            tournamentId={selectedTournamentId}
            seasonId={userSeasonId}
          />
        </div>

        {/* Stats Table */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl overflow-hidden font-mono shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/40 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">📋</span>
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Player Stats & Awards</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Cumulative stats calculated across selected rounds</p>
              </div>
            </div>
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-center font-mono">
              <thead className="bg-slate-50/50 border-b border-slate-100 text-[10px] text-slate-550 font-extrabold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3.5 text-center">Rank</th>
                  <th className="px-4 py-3.5 text-left font-bold uppercase tracking-wider">Player</th>
                  <th className="px-4 py-3.5 text-left font-bold uppercase tracking-wider">Team</th>
                  {activeTab === 'golden-ball' && (
                    <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-center">Score</th>
                  )}
                  {activeTab === 'golden-boot' && (
                    <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-center">G/M</th>
                  )}
                  {activeTab === 'golden-glove' && (
                    <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-center">CS%</th>
                  )}
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-center">Pts</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-center">MP</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-center">W</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-center">D</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-center">L</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-center">GF</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-center">GA</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-center">GD</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-center">CS</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-center">MOTM</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-center">Win%</th>
                </tr>
              </thead>
              <tbody className="bg-white/40 divide-y divide-slate-100/60">
                {filteredPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === 'golden-ball' || activeTab === 'golden-boot' || activeTab === 'golden-glove' ? 18 : 17} className="px-4 py-12 text-center text-slate-400">
                      <span className="text-4xl mb-3 block">👤</span>
                      <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">No Data Available</h3>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">No players match the current filters for this selection</p>
                    </td>
                  </tr>
                ) : (
                  filteredPlayers.map((player, index) => (
                    <tr key={player.player_id} className="hover:bg-slate-50/50 transition-colors text-center">
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="w-6 h-6 bg-slate-800 border border-slate-900 rounded-lg flex items-center justify-center text-amber-400 font-extrabold text-xs shadow-md mx-auto">
                          {index + 1}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-left whitespace-nowrap font-bold text-slate-800">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-8 h-8 bg-slate-800 border border-slate-900 rounded-xl flex items-center justify-center text-amber-400 font-extrabold text-xs shadow-md overflow-hidden">
                            {player.photo_url ? (
                              <img src={player.photo_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              player.player_name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <span className="text-xs font-black text-slate-800">{player.player_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-left whitespace-nowrap text-xs font-extrabold text-slate-500 uppercase">
                        <div className="flex items-center gap-2">
                          {player.team_logo && (
                            <img src={player.team_logo} alt="" className="w-5 h-5 object-contain" />
                          )}
                          <span>{player.team_name}</span>
                        </div>
                      </td>
                      {activeTab === 'golden-ball' && (
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black bg-amber-50 text-amber-700 border border-amber-200/50">
                            {(player as any).overallScore}
                          </span>
                        </td>
                      )}
                      {activeTab === 'golden-boot' && (
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black bg-orange-50 text-orange-700 border border-orange-200/50">
                            {(player as any).goals_per_match}
                          </span>
                        </td>
                      )}
                      {activeTab === 'golden-glove' && (
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                            {(player as any).clean_sheet_ratio}%
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-black border bg-slate-800 text-amber-400 border-slate-900 shadow-md">
                          {player.points}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-extrabold text-slate-700 whitespace-nowrap">{player.matches_played}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200/40">
                          {player.wins}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black bg-slate-50 text-slate-505 border border-slate-200/40">
                          {player.draws}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200/40">
                          {player.losses}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200/40">
                          {player.goals_scored}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-rose-600 whitespace-nowrap">{player.goals_conceded}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black border ${
                          player.goal_difference > 0 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
                            : player.goal_difference < 0
                            ? 'bg-rose-50 text-rose-700 border-rose-200/50'
                            : 'bg-slate-50 text-slate-600 border-slate-200/50'
                        }`}>
                          {player.goal_difference > 0 ? '+' : ''}{player.goal_difference}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200/40">
                          {player.clean_sheets}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200/40">
                          {player.motm_awards}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-extrabold text-slate-800 whitespace-nowrap">
                        {player.win_rate}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile View */}
          <div className="sm:hidden space-y-4 px-3 pb-4 pt-2">
            {filteredPlayers.length === 0 ? (
              <div className="text-center py-8 text-slate-400 bg-white border border-slate-200/60 rounded-xl font-mono">
                <Users className="w-10 h-10 mx-auto text-slate-350 mb-2" />
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-1">No Data Available</h3>
              </div>
            ) : (
              filteredPlayers.map((player, index) => (
                <div 
                  key={player.player_id} 
                  className="console-card bg-white border border-slate-200/60 rounded-xl p-4 shadow-sm relative overflow-hidden font-mono"
                >
                  {/* Player Card Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex-shrink-0 w-8 h-8 bg-slate-800 border border-slate-900 rounded-xl flex items-center justify-center text-amber-400 font-extrabold text-xs shadow-md overflow-hidden">
                        {player.photo_url ? (
                          <img src={player.photo_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          player.player_name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div>
                        <h3 className="text-xs font-black text-slate-800">{player.player_name}</h3>
                        <div className="flex items-center gap-1 mt-0.5">
                          {player.team_logo && (
                            <img src={player.team_logo} alt="" className="w-3.5 h-3.5 object-contain" />
                          )}
                          <span className="block text-[9px] text-slate-400 font-bold uppercase">{player.team_name}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black border uppercase tracking-wider bg-slate-800 text-amber-400 border-slate-900">
                        {player.points || 0}
                      </span>
                    </div>
                  </div>

                  {/* Quick Stats Grid */}
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 text-center text-xs font-mono">
                    <div className="bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                      <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Played</p>
                      <p className="font-extrabold text-slate-800">{player.matches_played || 0}</p>
                    </div>
                    <div className="bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                      <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Goals</p>
                      <p className="font-extrabold text-emerald-700">{player.goals_scored || 0}</p>
                    </div>
                    <div className="bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                      <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">GD</p>
                      <p className={`font-extrabold ${player.goal_difference > 0 ? 'text-emerald-650' : player.goal_difference < 0 ? 'text-rose-650' : 'text-slate-655'}`}>
                        {player.goal_difference > 0 ? '+' : ''}{player.goal_difference || 0}
                      </p>
                    </div>
                  </div>

                  {/* Additional Stats Row */}
                  <div className="grid grid-cols-3 gap-2 mt-2 text-center text-xs font-mono">
                    <div className="bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                      <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">W-D-L</p>
                      <p className="font-extrabold text-[10px] text-slate-700">
                        {player.wins}-{player.draws}-{player.losses}
                      </p>
                    </div>
                    <div className="bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                      <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">CS</p>
                      <p className="font-extrabold text-slate-800">{player.clean_sheets || 0}</p>
                    </div>
                    <div className="bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/40">
                      <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">MOTM</p>
                      <p className="font-extrabold text-slate-800">{player.motm_awards || 0}</p>
                    </div>
                  </div>

                  {/* Tab-specific Stat Previews on Mobile */}
                  {activeTab === 'golden-ball' && (
                    <div className="mt-2 p-2 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-lg border border-amber-200 text-[10px] flex justify-between items-center font-mono">
                      <span className="font-bold text-amber-800 uppercase">Golden Ball Score:</span>
                      <span className="font-black text-amber-950">{(player as any).overallScore}</span>
                    </div>
                  )}
                  {activeTab === 'golden-boot' && (
                    <div className="mt-2 p-2 bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg border border-orange-200 text-[10px] flex justify-between items-center font-mono">
                      <span className="font-bold text-orange-800 uppercase">Goals/Match Ratio:</span>
                      <span className="font-black text-orange-950">{(player as any).goals_per_match}</span>
                    </div>
                  )}
                  {activeTab === 'golden-glove' && (
                    <div className="mt-2 p-2 bg-gradient-to-r from-emerald-50 to-emerald-100 rounded-lg border border-emerald-200 text-[10px] flex justify-between items-center font-mono">
                      <span className="font-bold text-emerald-800 uppercase">Clean Sheet Ratio:</span>
                      <span className="font-black text-emerald-950">{(player as any).clean_sheet_ratio}%</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Summary Card */}
        <div className="console-card bg-slate-50 border border-slate-200/60 rounded-2xl p-5 shadow-sm font-mono mt-6">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Summary Info</h3>
          </div>
          <p className="text-xs text-slate-600 font-semibold leading-relaxed">
            <span className="text-slate-800 font-extrabold">{filteredPlayers.length}</span> players shown
            {activeTab === 'by-week' && (() => {
              const weekRange = weekRanges.find(w => w.week === selectedWeek);
              return weekRange ? ` • Week ${selectedWeek} (Rounds ${weekRange.start}-${weekRange.end})` : '';
            })()}
            {activeTab === 'golden-boot' && ' • Top 10 goal scorers (sorted by goals, then goals/match ratio)'}
            {activeTab === 'golden-glove' && ' • Top 10 clean sheet leaders (sorted by clean sheets, then CS%, then fewest GA)'}
            {activeTab === 'golden-ball' && ' • Top 20 best overall players (min. 3 matches)'}
            {activeTab === 'top-20' && ' • Top 20 by points'}
            {activeTab !== 'by-week' && selectedRound !== 'all' && ` • Cumulative stats from Round 1 to Round ${selectedRound}`}
            {activeTab !== 'by-week' && selectedRound === 'all' && ` • All rounds (complete season)`}
          </p>
          {activeTab === 'golden-ball' && (
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">
              Scoring: Points (40%) • Goals (20%) • Win Rate (20%) • MOTM (10%) • Clean Sheets (10%)
            </p>
          )}
          {activeTab === 'golden-boot' && (
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">
              G/M = Goals per Match ratio
            </p>
          )}
          {activeTab === 'golden-glove' && (
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">
              CS% = Clean Sheet percentage (clean sheets / matches played × 100)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
