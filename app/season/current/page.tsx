'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  Trophy as TrophyIcon, 
  Activity, 
  ArrowRight, 
  Zap,
  Shield, 
  Award as AwardIcon,
  Flame,
  Target,
  RotateCcw,
  Calendar,
  Layers,
  ChevronDown
} from 'lucide-react';

interface Season {
  id: string;
  name: string;
  status: string;
  season_start?: any;
  season_end?: any;
}

interface TeamStat {
  team_id: string;
  team_name: string;
  rank: number;
  points: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_scored: number;
  goals_conceded: number;
  logo_url?: string;
}

interface PlayerStat {
  player_id: string;
  player_name: string;
  team_id: string;
  team_name: string;
  category?: string;
  star_rating?: number;
  rating?: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_scored: number;
  goals_conceded: number;
  clean_sheets: number;
  points: number;
}

interface PlayerAward {
  id: string;
  player_id: string;
  player_name: string;
  team_id?: string;
  team_name?: string;
  award_category: string;
  award_type: string;
  award_position?: string;
  player_category?: string;
  round_number?: number | null;
  week_number?: number | null;
  notes?: string | null;
}

interface Trophy {
  id: string;
  team_id: string;
  team_name: string;
  trophy_type: string;
  trophy_name: string;
  trophy_position?: string;
  position?: number;
}

export default function CurrentSeasonPage() {
  const [season, setSeason] = useState<Season | null>(null);
  const seasonNum = season ? (parseInt(season.id.replace(/\D/g, '')) || 0) : 0;
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<any>(null);
  const [standingsFormat, setStandingsFormat] = useState<string>('league');
  const [teams, setTeams] = useState<TeamStat[]>([]);
  const [groupStandings, setGroupStandings] = useState<any>(null);
  const [knockoutFixtures, setKnockoutFixtures] = useState<any>(null);
  const [playoffSpots, setPlayoffSpots] = useState<number>(4);
  
  const [players, setPlayers] = useState<PlayerStat[]>([]);
  const [playerAwards, setPlayerAwards] = useState<PlayerAward[]>([]);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [tournamentLoading, setTournamentLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'standings' | 'players' | 'awards' | 'trophies'>('standings');
  const [sortBy, setSortBy] = useState<'rank' | 'points' | 'goals'>('rank');
  const [awardsSubTab, setAwardsSubTab] = useState<'season' | 'weekly'>('season');
  const [expandedRounds, setExpandedRounds] = useState<Set<string>>(new Set());

  const toggleRound = (roundKey: string) => {
    setExpandedRounds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(roundKey)) {
        newSet.delete(roundKey);
      } else {
        newSet.add(roundKey);
      }
      return newSet;
    });
  };

  useEffect(() => {
    fetchSeasonData();
  }, []);

  const fetchSeasonData = async () => {
    try {
      setLoading(true);
      
      // Fetch current season
      const seasonRes = await fetch('/api/public/current-season');
      const seasonData = await seasonRes.json();
      
      if (seasonData.success) {
        setSeason(seasonData.data);
        const seasonId = seasonData.data.id;

        // Fetch team & player stats, awards, trophies for this season in parallel
        const [statsRes, awardsRes, trophiesRes, tournamentsRes] = await Promise.all([
          fetch(`/api/seasons/${seasonId}/stats`),
          fetch(`/api/player-awards?season_id=${seasonId}`),
          fetch(`/api/trophies?season_id=${seasonId}`),
          fetch(`/api/tournaments?season_id=${seasonId}`)
        ]);
        
        const [statsData, awardsData, trophiesData, tournamentsData] = await Promise.all([
          statsRes.json(),
          awardsRes.json(),
          trophiesRes.json(),
          tournamentsRes.json()
        ]);
        
        if (statsData.success && statsData.data) {
          setPlayers(statsData.data.players || []);
        }

        console.log('[CurrentSeasonPage] statsData:', statsData);
        console.log('[CurrentSeasonPage] awardsData:', awardsData);
        if (awardsData.success) {
          console.log('[CurrentSeasonPage] Setting player awards:', awardsData.awards);
          setPlayerAwards(awardsData.awards || []);
        }

        if (trophiesData.success) {
          setTrophies(trophiesData.trophies || []);
        }

        if (tournamentsData.success && tournamentsData.tournaments) {
          setTournaments(tournamentsData.tournaments);
          if (tournamentsData.tournaments.length > 0) {
            const primary = tournamentsData.tournaments.find((t: any) => t.is_primary) || tournamentsData.tournaments[0];
            setSelectedTournament(primary);
            await fetchTournamentStandings(primary.id);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching season data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTournamentStandings = async (tournamentId: string) => {
    try {
      setTournamentLoading(true);
      const standingsRes = await fetch(`/api/tournaments/${tournamentId}/standings`);
      const standingsData = await standingsRes.json();

      if (standingsData.success) {
        setStandingsFormat(standingsData.format);
        setPlayoffSpots(standingsData.playoff_spots || 4);

        if (standingsData.format === 'league' && standingsData.standings) {
          const mappedTeams = standingsData.standings.map((team: any, index: number) => ({
            team_id: team.team_id,
            team_name: team.team_name,
            rank: index + 1,
            points: team.points || 0,
            matches_played: team.matches_played || 0,
            wins: team.wins || 0,
            draws: team.draws || 0,
            losses: team.losses || 0,
            goals_scored: team.goals_for || 0,
            goals_conceded: team.goals_against || 0,
            logo_url: team.team_logo || null
          }));
          setTeams(mappedTeams);
          setGroupStandings(null);
          setKnockoutFixtures(null);
        } else if (standingsData.format === 'group_stage' && standingsData.groupStandings) {
          setGroupStandings(standingsData.groupStandings);
          setKnockoutFixtures(standingsData.knockoutFixtures || null);
          setTeams([]);
        } else if (standingsData.format === 'knockout') {
          setKnockoutFixtures(standingsData.knockoutFixtures || null);
          setTeams([]);
          setGroupStandings(null);
        }
      }
    } catch (error) {
      console.error('Error fetching tournament standings:', error);
    } finally {
      setTournamentLoading(false);
    }
  };

  const handleTournamentChange = async (tournamentId: string) => {
    const tournament = tournaments.find(t => t.id === tournamentId);
    if (tournament) {
      setSelectedTournament(tournament);
      await fetchTournamentStandings(tournamentId);
    }
  };

  const getSortedTeams = () => {
    const sorted = [...teams];
    switch (sortBy) {
      case 'rank':
        return sorted.sort((a, b) => a.rank - b.rank);
      case 'points':
        return sorted.sort((a, b) => b.points - a.points);
      case 'goals':
        return sorted.sort((a, b) => b.goals_scored - a.goals_scored);
      default:
        return sorted;
    }
  };

  const getRankBadgeClass = (rank: number) => {
    if (rank === 1) return 'bg-amber-500 text-white';
    if (rank === 2) return 'bg-slate-400 text-white';
    if (rank === 3) return 'bg-amber-700 text-white';
    return 'bg-[#D4AF37]/10 text-amber-700';
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
  };

  if (loading) {
    return (
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-slate-500 font-mono text-xs">Loading League Portal...</p>
        </div>
      </div>
    );
  }

  if (!season) {
    return (
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center max-w-md p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <Shield className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-900 text-lg font-bold mb-2">No active season found</p>
          <Link href="/" className="text-amber-600 hover:text-amber-700 font-bold text-sm inline-flex items-center gap-1">
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const sortedTeams = getSortedTeams();

  const seasonAwards = playerAwards.filter(award => !award.round_number && !award.week_number);
  const weeklyAwards = playerAwards.filter(award => award.round_number || award.week_number);
  
  // Group weekly awards by round/week with proper ordering
  const groupedWeeklyAwards = weeklyAwards.reduce((acc, award) => {
    const key = award.round_number ? `Round ${award.round_number}` : award.week_number ? `Week ${award.week_number}` : 'Other';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(award);
    return acc;
  }, {} as Record<string, PlayerAward[]>);

  // Calculate sort value for proper ordering (weeks come after specific rounds based on season)
  const getSortValue = (groupKey: string) => {
    const roundMatch = groupKey.match(/Round (\d+)/);
    const weekMatch = groupKey.match(/Week (\d+)/);
    
    if (roundMatch) {
      return parseInt(roundMatch[1]);
    } else if (weekMatch) {
      const weekNum = parseInt(weekMatch[1]);
      // For S16/S17: week 1 after round 7, week 2 after round 13, week 3 after round 20, etc
      // For S18+: week 1 after round 7, week 2 after round 14, week 3 after round 21, etc
      const isOldSeason = seasonNum === 16 || seasonNum === 17;
      
      if (isOldSeason) {
        // S16/S17: 7, 13, 20, 26 pattern (differences: 6, 7, 6, 7...)
        // Week 1 = 7 + 0.5, Week 2 = 13 + 0.5, Week 3 = 20 + 0.5, Week 4 = 26 + 0.5
        if (weekNum === 1) return 7.5;
        if (weekNum === 2) return 13.5;
        if (weekNum === 3) return 20.5;
        if (weekNum === 4) return 26.5;
        // Continue pattern for more weeks if needed
        return 26 + ((weekNum - 4) * 6.5) + 0.5;
      } else {
        // S18+: week 1 after round 7, week 2 after round 14, etc (interval of 7)
        return 7 + (7 * (weekNum - 1)) + 0.5;
      }
    }
    return 0;
  };

  const displayedAwards = awardsSubTab === 'season' ? seasonAwards : weeklyAwards;

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      
      {/* Glow overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-8">
        
        {/* Season Header */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">Current Season</span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              {season.name}
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-1">
              STATUS: <span className="text-emerald-600 font-bold">🟢 ACTIVE</span>
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href={`/players?season=${season.id}`}
              className="inline-flex items-center gap-1.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-all"
            >
              <Zap className="w-4 h-4 text-amber-500" /> View All Players
            </Link>
            <Link
              href={`/teams?season=${season.id}`}
              className="inline-flex items-center gap-1.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-all"
            >
              <Shield className="w-4 h-4 text-amber-500" /> View All Teams
            </Link>
          </div>
        </div>

        {/* Dashboard Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200/60 pb-3">
          <button
            onClick={() => setActiveTab('standings')}
            className={`px-5 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'standings'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600'
            }`}
          >
            <TrophyIcon className="w-3.5 h-3.5" /> STANDINGS
          </button>
          <button
            onClick={() => setActiveTab('players')}
            className={`px-5 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'players'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600'
            }`}
          >
            <Flame className="w-3.5 h-3.5" /> PLAYER STATS
          </button>
          <button
            onClick={() => setActiveTab('awards')}
            className={`px-5 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'awards'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600'
            }`}
          >
            <AwardIcon className="w-3.5 h-3.5" /> AWARDS
          </button>
          <button
            onClick={() => setActiveTab('trophies')}
            className={`px-5 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'trophies'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600'
            }`}
          >
            <Shield className="w-3.5 h-3.5" /> TROPHIES
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'standings' && (
          <div className="space-y-6">
            
            {/* Tournament Selector */}
            {tournaments.length > 1 && (
              <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex items-center gap-4">
                <span className="font-mono text-xs text-slate-400 font-bold">SELECT TOURNAMENT:</span>
                <div className="flex flex-wrap gap-2">
                  {tournaments.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleTournamentChange(t.id)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        selectedTournament?.id === t.id
                          ? 'bg-amber-500/10 text-amber-700 border border-amber-400/30'
                          : 'border border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      {t.tournament_name} {t.is_primary && '👑'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading Indicator for Standings Fetch */}
            {tournamentLoading ? (
              <div className="bg-white border border-slate-200/60 rounded-2xl p-12 text-center shadow-sm">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto mb-4"></div>
                <p className="text-xs text-slate-400 font-mono">Recalculating tournament ledger...</p>
              </div>
            ) : (
              <>
                {/* 3D Podium (Only for League format with enough teams) */}
                {standingsFormat === 'league' && sortedTeams.length >= 3 && (
                  <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
                    <h2 className="text-center font-bold text-slate-900 text-lg mb-6 flex items-center justify-center gap-2">
                      <TrophyIcon className="w-5 h-5 text-amber-500" /> Championship Podium
                    </h2>
                    <div className="podium-container relative mt-8 mb-4 max-w-2xl mx-auto">
                      {/* 2nd Place (Silver) */}
                      {sortedTeams[1] && (
                        <Link
                          href={`/teams/${sortedTeams[1].team_id}`}
                          className="podium-step podium-silver w-full group relative flex flex-col items-center justify-end"
                        >
                          <div className="text-center px-2 z-10 select-none pb-4">
                            <h4 className="font-bold text-xs text-white truncate max-w-[120px] mb-1 group-hover:underline">
                              {sortedTeams[1].team_name}
                            </h4>
                            <span className="text-[10px] text-white/80 font-mono font-bold block">
                              {sortedTeams[1].points} PTS
                            </span>
                          </div>
                          <div className="text-4xl font-black text-white/20 select-none mb-1">2</div>
                        </Link>
                      )}

                      {/* 1st Place (Gold) */}
                      {sortedTeams[0] && (
                        <Link
                          href={`/teams/${sortedTeams[0].team_id}`}
                          className="podium-step podium-gold w-full group relative flex flex-col items-center justify-end"
                        >
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-amber-300 animate-bounce">
                            <TrophyIcon className="w-6 h-6 fill-amber-300" />
                          </div>
                          <div className="text-center px-2 z-10 select-none pb-4">
                            <h4 className="font-bold text-sm text-white truncate max-w-[130px] mb-1 group-hover:underline">
                              {sortedTeams[0].team_name}
                            </h4>
                            <span className="text-[10px] text-white/80 font-mono font-bold block">
                              {sortedTeams[0].points} PTS
                            </span>
                          </div>
                          <div className="text-5xl font-black text-white/20 select-none mb-1">1</div>
                        </Link>
                      )}

                      {/* 3rd Place (Bronze) */}
                      {sortedTeams[2] && (
                        <Link
                          href={`/teams/${sortedTeams[2].team_id}`}
                          className="podium-step podium-bronze w-full group relative flex flex-col items-center justify-end"
                        >
                          <div className="text-center px-2 z-10 select-none pb-4">
                            <h4 className="font-bold text-xs text-white truncate max-w-[120px] mb-1 group-hover:underline">
                              {sortedTeams[2].team_name}
                            </h4>
                            <span className="text-[10px] text-white/80 font-mono font-bold block">
                              {sortedTeams[2].points} PTS
                            </span>
                          </div>
                          <div className="text-4xl font-black text-white/20 select-none mb-1">3</div>
                        </Link>
                      )}
                    </div>
                  </div>
                )}

                {/* Render Standings Details Based on Selected format */}
                {standingsFormat === 'league' && (
                  <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-xl font-bold text-slate-900">Full Standings Table</h2>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'rank' | 'points' | 'goals')}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-700 bg-slate-50 focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="rank">Sort: Rank</option>
                        <option value="points">Sort: Points</option>
                        <option value="goals">Sort: Goals</option>
                      </select>
                    </div>

                    {sortedTeams.length === 0 ? (
                      <div className="border border-slate-100 rounded-xl bg-slate-50/50 p-8 text-center text-slate-400 font-mono text-xs">
                        No matches recorded in this tournament league stage yet.
                      </div>
                    ) : (
                      <>
                        {/* Desktop view */}
                        <div className="hidden lg:block overflow-x-auto">
                          <table className="w-full text-slate-700 border-collapse">
                            <thead>
                              <tr className="border-b border-slate-100 font-mono text-[10px] text-slate-400 font-bold uppercase tracking-wider text-center">
                                <th className="text-left py-4 px-4">Rank</th>
                                <th className="text-left py-4 px-4">Team</th>
                                <th className="py-4 px-2">MP</th>
                                <th className="py-4 px-2">W</th>
                                <th className="py-4 px-2">D</th>
                                <th className="py-4 px-2">L</th>
                                <th className="py-4 px-2">GF</th>
                                <th className="py-4 px-2">GA</th>
                                <th className="py-4 px-2">GD</th>
                                <th className="py-4 px-4 text-amber-600">Pts</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedTeams.map((team, index) => {
                                const isPlayoff = index < playoffSpots;
                                return (
                                  <tr 
                                    key={team.team_id} 
                                    className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors text-center ${
                                      isPlayoff ? 'bg-amber-500/[0.01]' : ''
                                    }`}
                                  >
                                    <td className="py-4 px-4 text-left">
                                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold font-mono text-xs ${getRankBadgeClass(team.rank)}`}>
                                        {team.rank}
                                      </div>
                                    </td>
                                    <td className="py-4 px-4 text-left font-bold text-slate-900">
                                      <Link href={`/teams/${team.team_id}`} className="flex items-center gap-3 group">
                                        {team.logo_url && (
                                          <div className="w-8 h-8 rounded bg-white p-1 border border-slate-100 flex items-center justify-center">
                                            <img
                                              src={team.logo_url}
                                              alt={team.team_name}
                                              className="object-contain max-w-full max-h-full"
                                            />
                                          </div>
                                        )}
                                        <span className="group-hover:text-amber-600 transition-colors text-sm truncate max-w-[180px]">
                                          {team.team_name}
                                        </span>
                                      </Link>
                                    </td>
                                    <td className="py-4 px-2 font-mono text-xs text-slate-600">{team.matches_played}</td>
                                    <td className="py-4 px-2 font-mono text-xs text-emerald-600 font-bold">{team.wins}</td>
                                    <td className="py-4 px-2 font-mono text-xs text-slate-500">{team.draws}</td>
                                    <td className="py-4 px-2 font-mono text-xs text-red-500 font-bold">{team.losses}</td>
                                    <td className="py-4 px-2 font-mono text-xs text-slate-600">{team.goals_scored}</td>
                                    <td className="py-4 px-2 font-mono text-xs text-slate-600">{team.goals_conceded}</td>
                                    <td className="py-4 px-2 font-mono text-xs font-bold text-slate-900">
                                      {team.goals_scored - team.goals_conceded > 0 ? '+' : ''}
                                      {team.goals_scored - team.goals_conceded}
                                    </td>
                                    <td className="py-4 px-4 font-mono font-black text-amber-600 text-sm">{team.points}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile view */}
                        <div className="lg:hidden space-y-4">
                          {sortedTeams.map((team) => (
                            <Link
                              key={team.team_id}
                              href={`/teams/${team.team_id}`}
                              className="block console-card rounded-xl p-4"
                            >
                              <div className="flex items-center gap-3 mb-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${getRankBadgeClass(team.rank)}`}>
                                  {team.rank}
                                </div>
                                {team.logo_url && (
                                  <div className="w-10 h-10 rounded bg-white border border-slate-100 flex items-center justify-center p-1">
                                    <img
                                      src={team.logo_url}
                                      alt={team.team_name}
                                      className="object-contain max-w-full max-h-full"
                                    />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-slate-900 text-sm truncate">{team.team_name}</div>
                                  <div className="text-xs text-amber-600 font-mono font-bold mt-0.5">{team.points} PTS</div>
                                </div>
                              </div>
                              <div className="grid grid-cols-4 gap-2 text-[10px] text-center text-slate-500 font-mono pt-2 border-t border-slate-100">
                                <div>
                                  <div>MP</div>
                                  <div className="font-bold text-slate-800 mt-0.5">{team.matches_played}</div>
                                </div>
                                <div>
                                  <div>W-D-L</div>
                                  <div className="font-bold text-slate-800 mt-0.5">{team.wins}-{team.draws}-{team.losses}</div>
                                </div>
                                <div>
                                  <div>Goals</div>
                                  <div className="font-bold text-slate-800 mt-0.5">{team.goals_scored}-{team.goals_conceded}</div>
                                </div>
                                <div>
                                  <div>GD</div>
                                  <div className="font-bold text-slate-800 mt-0.5">
                                    {team.goals_scored - team.goals_conceded > 0 ? '+' : ''}
                                    {team.goals_scored - team.goals_conceded}
                                  </div>
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {standingsFormat === 'group_stage' && groupStandings && (
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {Object.entries(groupStandings).map(([groupName, groupTeams]: [string, any]) => (
                        <div key={groupName} className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
                          <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-3 mb-4 font-mono text-sm uppercase tracking-wider flex items-center gap-1.5">
                            <Shield className="w-4 h-4 text-amber-500" /> {groupName}
                          </h3>
                          <div className="overflow-x-auto">
                            <table className="w-full text-slate-700 text-center border-collapse">
                              <thead>
                                <tr className="border-b border-slate-100 font-mono text-[9px] text-slate-400 font-bold uppercase tracking-wider text-center">
                                  <th className="text-left py-2 px-2">Pos</th>
                                  <th className="text-left py-2 px-2">Team</th>
                                  <th className="py-2 px-1">MP</th>
                                  <th className="py-2 px-1">W-D-L</th>
                                  <th className="py-2 px-1">GD</th>
                                  <th className="py-2 px-2 text-amber-600">Pts</th>
                                </tr>
                              </thead>
                              <tbody>
                                {groupTeams.map((team: any) => (
                                  <tr 
                                    key={team.team_id} 
                                    className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${
                                      team.qualifies ? 'bg-emerald-500/[0.01]' : ''
                                    }`}
                                  >
                                    <td className="py-3 px-2 text-left">
                                      <span className={`w-6 h-6 rounded-md flex items-center justify-center font-mono text-xs font-bold ${
                                        team.qualifies ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                      }`}>
                                        {team.position}
                                      </span>
                                    </td>
                                    <td className="py-3 px-2 text-left font-bold text-slate-900">
                                      <Link href={`/teams/${team.team_id}`} className="flex items-center gap-2 group text-xs">
                                        {team.team_logo && (
                                          <div className="w-6 h-6 rounded bg-white p-0.5 border border-slate-100 flex items-center justify-center flex-shrink-0">
                                            <img
                                              src={team.team_logo}
                                              alt={team.team_name}
                                              className="object-contain max-w-full max-h-full"
                                            />
                                          </div>
                                        )}
                                        <span className="group-hover:text-amber-600 transition-colors truncate max-w-[120px]">
                                          {team.team_name}
                                        </span>
                                      </Link>
                                    </td>
                                    <td className="py-3 px-1 font-mono text-xs text-slate-600">{team.matches_played}</td>
                                    <td className="py-3 px-1 font-mono text-[10px] text-slate-500">
                                      {team.wins}-{team.draws}-{team.losses}
                                    </td>
                                    <td className="py-3 px-1 font-mono text-xs text-slate-700">
                                      {team.goal_difference > 0 ? '+' : ''}
                                      {team.goal_difference}
                                    </td>
                                    <td className="py-3 px-2 font-mono font-black text-amber-600 text-xs">{team.points}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Group Stage Knockout Stage Link if present */}
                    {knockoutFixtures && Object.keys(knockoutFixtures).length > 0 && (
                      <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
                        <h3 className="font-bold text-slate-900 mb-6 font-mono text-sm uppercase tracking-wider flex items-center gap-2">
                          <Layers className="w-5 h-5 text-amber-500" /> Playoff Stage Brackets
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {Object.entries(knockoutFixtures).map(([roundName, roundMatches]: [string, any]) => (
                            <div key={roundName} className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
                              <h4 className="font-mono text-xs font-bold text-slate-400 uppercase border-b border-slate-200/60 pb-2 mb-3">
                                {roundName.replace('_', ' ')}
                              </h4>
                              <div className="space-y-3">
                                {roundMatches.map((match: any) => (
                                  <div key={match.id} className="bg-white border border-slate-200/60 rounded-lg p-3 flex justify-between items-center text-xs">
                                    <div className="flex-1 space-y-1">
                                      <div className="flex justify-between items-center">
                                        <span className="font-semibold text-slate-700">{match.home_team}</span>
                                        <span className="font-mono font-bold bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px]">
                                          {match.status === 'completed' ? match.home_score : '-'}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center">
                                        <span className="font-semibold text-slate-700">{match.away_team}</span>
                                        <span className="font-mono font-bold bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px]">
                                          {match.status === 'completed' ? match.away_score : '-'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {standingsFormat === 'knockout' && knockoutFixtures && (
                  <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
                    <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                      <TrophyIcon className="w-5 h-5 text-amber-500" /> Bracket Room
                    </h2>
                    {Object.keys(knockoutFixtures).length === 0 ? (
                      <div className="border border-slate-100 rounded-xl bg-slate-50/50 p-8 text-center text-slate-400 font-mono text-xs">
                        No knockout matches scheduled yet.
                      </div>
                    ) : (
                      <div className="space-y-8">
                        {Object.entries(knockoutFixtures).map(([roundName, roundMatches]: [string, any]) => (
                          <div key={roundName} className="space-y-4">
                            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2 font-mono text-xs uppercase tracking-wider">
                              {roundName.replace('_', ' ')}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {roundMatches.map((match: any) => (
                                <div key={match.id} className="console-card rounded-xl p-4 flex items-center justify-between">
                                  <div className="flex-1 space-y-2">
                                    <div className="flex justify-between items-center text-xs">
                                      <span className={`font-semibold ${match.result === 'home_win' ? 'text-amber-600 font-bold' : 'text-slate-700'}`}>
                                        {match.home_team}
                                      </span>
                                      <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-mono font-bold">
                                        {match.status === 'completed' ? match.home_score : '-'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                      <span className={`font-semibold ${match.result === 'away_win' ? 'text-amber-600 font-bold' : 'text-slate-700'}`}>
                                        {match.away_team}
                                      </span>
                                      <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-mono font-bold">
                                        {match.status === 'completed' ? match.away_score : '-'}
                                      </span>
                                    </div>
                                  </div>
                                  {match.status === 'completed' && (
                                    <div className="ml-4 text-[9px] bg-amber-50 text-amber-700 border border-amber-200/50 font-bold px-2 py-1 rounded font-mono">
                                      FINAL
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'players' && (
          <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-6">Player Leaderboard</h2>
            {players.length === 0 ? (
              <div className="border border-slate-100 rounded-xl bg-slate-50/50 p-8 text-center text-slate-400 font-mono text-xs">
                No player statistics recorded for this season yet.
              </div>
            ) : (
              <>
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-slate-700 border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 font-mono text-[10px] text-slate-400 font-bold uppercase tracking-wider text-center">
                        <th className="text-left py-4 px-4">Rank</th>
                        <th className="text-left py-4 px-4">Player</th>
                        <th className="text-left py-4 px-4">Squad</th>
                        {(seasonNum === 16 || seasonNum === 17) ? (
                          <th className="py-4 px-2 text-amber-500">Rating</th>
                        ) : (
                          <th className="py-4 px-2">Cat</th>
                        )}
                        <th className="py-4 px-2">MP</th>
                        <th className="py-4 px-2 text-emerald-600">W</th>
                        <th className="py-4 px-2 text-slate-500">D</th>
                        <th className="py-4 px-2 text-red-500">L</th>
                        <th className="py-4 px-2 text-purple-600">GS</th>
                        <th className="py-4 px-2 text-slate-600">GC</th>
                        <th className="py-4 px-2 font-bold text-slate-900">GD</th>
                        <th className="py-4 px-2 text-emerald-600 font-bold">CS</th>
                        <th className="py-4 px-4 text-amber-600">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((player, index) => (
                        <tr key={player.player_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors text-center">
                          <td className="py-4 px-4 text-left">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold font-mono text-xs">
                              {index + 1}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-left font-bold text-slate-900 text-sm">
                            <Link href={`/players/${player.player_id}`} className="hover:text-amber-600 transition-colors">
                              {player.player_name}
                            </Link>
                          </td>
                          <td className="py-4 px-4 text-left text-slate-600 text-xs">
                            {player.team_name}
                          </td>
                          <td className="py-4 px-2 text-center">
                            {(seasonNum === 16 || seasonNum === 17) ? (
                              player.star_rating ? (
                                <span className="text-amber-500 text-sm font-bold tracking-wider">
                                  {'★'.repeat(player.star_rating)}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono">-</span>
                              )
                            ) : (
                              player.category && (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                                  player.category.toLowerCase() === 'legend'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200/20'
                                    : 'bg-blue-100 text-blue-800 border border-blue-200/20'
                                }`}>
                                  {player.category}
                                </span>
                              )
                            )}
                          </td>
                          <td className="py-4 px-2 font-mono text-xs text-slate-500">{player.matches_played}</td>
                          <td className="py-4 px-2 font-mono text-xs text-emerald-600 font-bold">{player.wins}</td>
                          <td className="py-4 px-2 font-mono text-xs text-slate-500">{player.draws}</td>
                          <td className="py-4 px-2 font-mono text-xs text-red-500 font-bold">{player.losses}</td>
                          <td className="py-4 px-2 font-mono text-xs text-purple-600 font-bold">{player.goals_scored}</td>
                          <td className="py-4 px-2 font-mono text-xs text-slate-600">{player.goals_conceded}</td>
                          <td className="py-4 px-2 font-mono text-xs font-bold text-slate-900">
                            {player.goals_scored - player.goals_conceded > 0 ? '+' : ''}
                            {player.goals_scored - player.goals_conceded}
                          </td>
                          <td className="py-4 px-2 font-mono text-xs text-emerald-600 font-bold">{player.clean_sheets}</td>
                          <td className="py-4 px-4 font-mono font-black text-amber-600 text-sm">{player.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="lg:hidden space-y-4">
                  {players.map((player, index) => (
                    <Link
                      key={player.player_id}
                      href={`/players/${player.player_id}`}
                      className="block console-card rounded-xl p-4"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold font-mono text-xs">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-slate-900 text-sm truncate">{player.player_name}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{player.team_name}</div>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-black text-amber-600 font-mono">{player.points} PTS</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-[10px] text-center text-slate-500 font-mono pt-3 border-t border-slate-100">
                        <div>
                          <div className="text-[9px] uppercase">MP</div>
                          <div className="font-bold text-slate-800 mt-0.5">{player.matches_played}</div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase">W-D-L</div>
                          <div className="font-bold text-slate-800 mt-0.5">{player.wins}-{player.draws}-{player.losses}</div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase">GS-GC</div>
                          <div className="font-bold text-purple-600 mt-0.5">{player.goals_scored}-{player.goals_conceded}</div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase">GD</div>
                          <div className="font-bold text-slate-900 mt-0.5">
                            {player.goals_scored - player.goals_conceded > 0 ? '+' : ''}
                            {player.goals_scored - player.goals_conceded}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase">CS</div>
                          <div className="font-bold text-emerald-600 mt-0.5">{player.clean_sheets}</div>
                        </div>
                        <div>
                          {(seasonNum === 16 || seasonNum === 17) ? (
                            <>
                              <div className="text-[9px] uppercase text-amber-500 font-bold">Rating</div>
                              <div className="font-bold text-amber-500 mt-0.5">
                                {player.star_rating ? '★'.repeat(player.star_rating) : '-'}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-[9px] uppercase">Cat</div>
                              <div className="font-bold text-slate-800 mt-0.5">{player.category || '-'}</div>
                            </>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'awards' && (
          <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <AwardIcon className="w-5 h-5 text-amber-500" /> Individual Honours
              </h2>
              {/* Sub-tabs menu */}
              <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-2 sm:border-0 sm:pb-0">
                <button
                  onClick={() => setAwardsSubTab('season')}
                  className={`px-4 py-2 rounded-xl font-mono text-[10px] font-bold transition-all flex items-center gap-1.5 ${
                    awardsSubTab === 'season'
                      ? 'bg-amber-500/10 text-amber-700 border border-amber-400/30'
                      : 'bg-slate-50 border border-slate-200/60 hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  <TrophyIcon className="w-3 h-3" /> SEASON_AWARDS ({seasonAwards.length})
                </button>
                <button
                  onClick={() => setAwardsSubTab('weekly')}
                  className={`px-4 py-2 rounded-xl font-mono text-[10px] font-bold transition-all flex items-center gap-1.5 ${
                    awardsSubTab === 'weekly'
                      ? 'bg-amber-500/10 text-amber-700 border border-amber-400/30'
                      : 'bg-slate-50 border border-slate-200/60 hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  <Calendar className="w-3 h-3" /> WEEKLY_AWARDS ({weeklyAwards.length})
                </button>
              </div>
            </div>

            {awardsSubTab === 'season' ? (
              // Season Awards Display
              seasonAwards.length === 0 ? (
                <div className="border border-slate-100 rounded-xl bg-slate-50/50 p-8 text-center text-slate-400 font-mono text-xs">
                  No individual season awards recorded.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 justify-items-center">
                  {seasonAwards.map((award) => {
                    const isWinner = award.award_position?.toLowerCase().includes('winner');
                    const isRunnerUp = award.award_position?.toLowerCase().includes('runner');
                    const isThird = award.award_position?.toLowerCase().includes('third');
                    
                    let cardClass = 'fut-card p-5 flex flex-col justify-between';
                    let positionLabel = 'NOMINEE';
                    let positionClass = 'text-slate-500';
                    
                    if (isWinner) {
                      cardClass += ' fut-card-gold';
                      positionLabel = award.award_position;
                      positionClass = 'text-amber-700 font-extrabold';
                    } else if (isRunnerUp) {
                      cardClass += ' fut-card-silver';
                      positionLabel = award.award_position;
                      positionClass = 'text-slate-700 font-extrabold';
                    } else if (isThird) {
                      cardClass += ' fut-card-bronze';
                      positionLabel = award.award_position;
                      positionClass = 'text-amber-900 font-extrabold';
                    } else {
                      positionLabel = award.award_position || 'NOMINEE';
                    }

                    return (
                      <div key={award.id} className={cardClass}>
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[8px] font-mono text-slate-400 uppercase tracking-wider block">Award Category</span>
                            <h4 className="font-bold text-slate-900 text-xs sm:text-sm truncate max-w-[120px] mt-0.5">
                              {award.award_type || award.award_category}
                            </h4>
                          </div>
                          <AwardIcon className="w-4 h-4 text-amber-500 fill-amber-500/20" />
                        </div>
                        
                        <div className="text-center py-4 flex flex-col items-center">
                          <AwardIcon className={`w-12 h-12 mb-2 ${
                            cardClass.includes('gold') ? 'text-amber-500' :
                            cardClass.includes('silver') ? 'text-slate-400' :
                            cardClass.includes('bronze') ? 'text-amber-700' : 'text-slate-300'
                          }`} />
                          <h3 className="font-black text-slate-955 text-xs sm:text-sm tracking-tight hover:underline truncate max-w-[150px]">
                            <Link href={`/players/${award.player_id}`}>
                              {award.player_name}
                            </Link>
                          </h3>
                          {award.team_name && (
                            <>
                              {(award.award_category?.toLowerCase().includes('tod') || award.award_category?.toLowerCase().includes('totw')) ? (
                                <h4 className="font-black text-slate-955 text-xs sm:text-sm tracking-tight hover:underline truncate max-w-[150px] mt-1">
                                  <Link href={`/teams/${award.team_id}`} className="hover:text-amber-600 transition-colors">
                                    {award.team_name}
                                  </Link>
                                </h4>
                              ) : (
                                <span className="text-[10px] font-bold font-mono text-slate-500 uppercase mt-0.5">
                                  <Link href={`/teams/${award.team_id}`} className="hover:text-amber-600 transition-colors">
                                    {award.team_name}
                                  </Link>
                                </span>
                              )}
                            </>
                          )}
                          {award.player_category && (
                            <span className="text-[9px] font-bold font-mono text-slate-400 uppercase mt-0.5">
                              {award.player_category}
                            </span>
                          )}
                          {award.notes && (
                            <p className="text-[10px] text-slate-500 italic mt-1 max-w-[150px] truncate" title={award.notes}>
                              {award.notes}
                            </p>
                          )}
                        </div>

                        <div className="border-t border-slate-200/50 pt-2 flex justify-between items-center text-[9px] font-mono">
                          <span className="text-slate-400">DETAIL:</span>
                          <span className={positionClass}>
                            {positionLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              // Weekly Awards Display - Grouped by Round/Week (Collapsible)
              weeklyAwards.length === 0 ? (
                <div className="border border-slate-100 rounded-xl bg-slate-50/50 p-8 text-center text-slate-400 font-mono text-xs">
                  No weekly / matchday awards recorded.
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(groupedWeeklyAwards)
                    .sort((a, b) => {
                      // Sort using proper round/week ordering (ascending - chronological order)
                      const aValue = getSortValue(a[0]);
                      const bValue = getSortValue(b[0]);
                      return aValue - bValue;
                    })
                    .map(([groupKey, awards]) => {
                      const isExpanded = expandedRounds.has(groupKey);
                      
                      return (
                        <div key={groupKey} className="border border-slate-200/60 rounded-xl overflow-hidden bg-white shadow-sm">
                          {/* Collapsible Header */}
                          <button
                            onClick={() => toggleRound(groupKey)}
                            className="w-full flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-1.5">
                                <h3 className="font-black text-amber-700 font-mono text-xs uppercase tracking-wider">
                                  {groupKey}
                                </h3>
                              </div>
                              <span className="text-xs text-slate-400 font-mono">
                                {awards.length} {awards.length === 1 ? 'Award' : 'Awards'}
                              </span>
                            </div>
                            <ChevronDown 
                              className={`w-5 h-5 text-amber-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </button>
                        
                          {/* Collapsible Content */}
                          {isExpanded && (
                            <div className="p-4 pt-0 border-t border-slate-100">
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 justify-items-center">
                                {awards.map((award) => {
                                  const cardClass = 'fut-card fut-card-gold p-5 flex flex-col justify-between';
                                  const positionLabel = award.round_number ? `ROUND ${award.round_number}` : award.week_number ? `WEEK ${award.week_number}` : 'WEEKLY WINNER';
                                  const positionClass = 'text-amber-700 font-extrabold';
                                  const isTODorTOTW = award.award_category?.toLowerCase().includes('tod') || award.award_category?.toLowerCase().includes('totw');

                                  return (
                                    <div key={award.id} className={cardClass}>
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <span className="text-[8px] font-mono text-slate-400 uppercase tracking-wider block">Award Category</span>
                                          <h4 className="font-bold text-slate-900 text-xs sm:text-sm truncate max-w-[120px] mt-0.5">
                                            {award.award_type || award.award_category}
                                    </h4>
                                  </div>
                                  <AwardIcon className="w-4 h-4 text-amber-500 fill-amber-500/20" />
                                </div>
                                
                                <div className="text-center py-4 flex flex-col items-center">
                                  <AwardIcon className="w-12 h-12 mb-2 text-amber-500" />
                                  <h3 className="font-black text-slate-955 text-xs sm:text-sm tracking-tight hover:underline truncate max-w-[150px]">
                                    <Link href={`/players/${award.player_id}`}>
                                      {award.player_name}
                                    </Link>
                                  </h3>
                                  {award.team_name && (
                                    <>
                                      {(award.award_category?.toLowerCase().includes('tod') || award.award_category?.toLowerCase().includes('totw')) ? (
                                        <h4 className="font-black text-slate-955 text-xs sm:text-sm tracking-tight hover:underline truncate max-w-[150px] mt-1">
                                          <Link href={`/teams/${award.team_id}`} className="hover:text-amber-600 transition-colors">
                                            {award.team_name}
                                          </Link>
                                        </h4>
                                      ) : (
                                        <span className="text-[10px] font-bold font-mono text-slate-500 uppercase mt-0.5">
                                          <Link href={`/teams/${award.team_id}`} className="hover:text-amber-600 transition-colors">
                                            {award.team_name}
                                          </Link>
                                        </span>
                                      )}
                                    </>
                                  )}
                                  {award.player_category && (
                                    <span className="text-[9px] font-bold font-mono text-slate-400 uppercase mt-0.5">
                                      {award.player_category}
                                    </span>
                                  )}
                                  {award.notes && (
                                    <p className="text-[10px] text-slate-500 italic mt-1 max-w-[150px] truncate" title={award.notes}>
                                      {award.notes}
                                    </p>
                                  )}
                                </div>

                                <div className="border-t border-slate-200/50 pt-2 flex justify-between items-center text-[9px] font-mono">
                                  <span className="text-slate-400">DETAIL:</span>
                                  <span className={positionClass}>
                                    {positionLabel}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            )
          )}
          </div>
        )}

        {activeTab === 'trophies' && (
          <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <TrophyIcon className="w-5 h-5 text-amber-500" /> Tournament Honours
            </h2>
            {trophies.length === 0 ? (
              <div className="border border-slate-100 rounded-xl bg-slate-50/50 p-8 text-center text-slate-400 font-mono text-xs">
                No trophies cabinet records for this season yet.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 justify-items-center">
                {trophies.map((trophy) => {
                  const isChampion = trophy.position === 1 || trophy.trophy_position?.toLowerCase().includes('champion');
                  const isRunnerUp = trophy.position === 2 || trophy.trophy_position?.toLowerCase().includes('runner');
                  const isThird = trophy.position === 3 || trophy.trophy_position?.toLowerCase().includes('third');
                  
                  return (
                    <div
                      key={trophy.id}
                      className={`fut-card p-5 flex flex-col justify-between ${
                        isChampion ? 'fut-card-gold' :
                        isRunnerUp ? 'fut-card-silver' :
                        isThird ? 'fut-card-bronze' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[8px] font-mono text-slate-400 uppercase tracking-wider block">Shield Title</span>
                          <h4 className="font-bold text-slate-900 text-xs sm:text-sm truncate max-w-[150px] mt-0.5">
                            {trophy.trophy_name}
                          </h4>
                        </div>
                        <TrophyIcon className={`w-5 h-5 ${
                          isChampion ? 'text-amber-500' :
                          isRunnerUp ? 'text-slate-400' :
                          isThird ? 'text-amber-700' : 'text-slate-300'
                        }`} />
                      </div>
                      
                      <div className="text-center py-4 flex flex-col items-center">
                        <TrophyIcon className="w-12 h-12 text-amber-500 mb-2 fill-amber-500/10" />
                        <h3 className="font-black text-slate-955 text-base tracking-tight hover:underline">
                          <Link href={`/teams/${trophy.team_id}`}>
                            {trophy.team_name}
                          </Link>
                        </h3>
                        {trophy.trophy_position && (
                          <span className="text-[10px] font-bold font-mono text-slate-500 uppercase mt-0.5">
                            {trophy.trophy_position}
                          </span>
                        )}
                      </div>

                      <div className="border-t border-slate-200/50 pt-2 flex justify-between items-center text-[9px] font-mono">
                        <span className="text-slate-400">HONOUR:</span>
                        <span className={`font-bold uppercase ${
                          isChampion ? 'text-amber-700' :
                          isRunnerUp ? 'text-slate-700' : 'text-slate-600'
                        }`}>
                          {trophy.trophy_type.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
