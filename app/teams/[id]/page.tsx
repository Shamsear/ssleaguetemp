'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Activity, Award as AwardIcon, ChevronRight, Crown, Flame, Medal, Shield, Star, Target, TrendingUp, Trophy, Trophy as TrophyIcon, Users, Zap } from 'lucide-react';

interface FootballPlayer {
  player_id: string;
  player_name: string;
  position: string;
  position_group: string;
  overall_rating: number;
  club: string;
  nationality: string;
  age: number;
  playing_style: string;
  purchase_price: number;
  acquired_at: string;
  speed: number;
  acceleration: number;
  ball_control: number;
  dribbling: number;
  finishing: number;
}

interface RealPlayer {
  player_id: string;
  player_name: string;
  team_name: string;
  season_id: string;
  category: string;
  star_rating: number;
  matches_played: number;
  goals_scored: number;
  assists: number;
  wins: number;
  draws: number;
  losses: number;
  clean_sheets: number;
  motm_awards: number;
  points: number;
  data_source?: string;
}

interface TeamSeasonData {
  id: string;
  team_id: string;
  team_name: string;
  team_code: string;
  season_id: string;
  season_name: string;
  logo_url?: string;
  manager_name?: string;

  stats: {
    matches_played: number;
    wins: number;
    draws: number;
    losses: number;
    goals_for: number;
    goals_against: number;
    goal_difference: number;
    points: number;
    clean_sheets: number;
    position?: number;
    form?: string;
  };
  trophies?: any;

  players?: Array<{
    player_id: string;
    player_name: string;
    matches_played: number;
    goals: number;
    assists: number;
  }>;
}

function TeamDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const querySeasonId = searchParams.get('season');
  const [team, setTeam] = useState<TeamSeasonData | null>(null);
  const [allSeasonData, setAllSeasonData] = useState<TeamSeasonData[]>([]);
  const [footballPlayers, setFootballPlayers] = useState<FootballPlayer[]>([]);
  const [realPlayers, setRealPlayers] = useState<RealPlayer[]>([]);
  const [loadingFootballPlayers, setLoadingFootballPlayers] = useState(false);
  const [loadingRealPlayers, setLoadingRealPlayers] = useState(false);
  const [awards, setAwards] = useState<any[]>([]);
  const [loadingAwards, setLoadingAwards] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedView, setSelectedView] = useState<'overall' | 'all-seasons' | 'season'>('overall');
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);

  const teamId = params.id as string;

  useEffect(() => {
    if (allSeasonData.length > 0) {
      if (querySeasonId && allSeasonData.some(s => s.season_id === querySeasonId)) {
        setSelectedView('season');
        setSelectedSeasonId(querySeasonId);
      } else {
        setSelectedView('overall');
        setSelectedSeasonId(null);
      }
    }
  }, [allSeasonData, querySeasonId]);

  useEffect(() => {
    fetchTeamData();
  }, [teamId]);

  useEffect(() => {
    if (selectedView === 'season' && selectedSeasonId) {
      const seasonNum = parseInt(selectedSeasonId?.match(/\d+/)?.[0] || '0');
      const isModernSeason = seasonNum === 16 || seasonNum === 17;

      if (isModernSeason) {
        fetchFootballPlayers(selectedSeasonId);
      } else {
        setFootballPlayers([]);
      }

      fetchRealPlayers(selectedSeasonId);

      if (isModernSeason) {
        fetchAwards(selectedSeasonId);
      } else {
        setAwards([]);
      }
    } else {
      setFootballPlayers([]);
      setRealPlayers([]);
      setAwards([]);
    }
  }, [selectedView, selectedSeasonId, teamId]);

  const fetchTeamData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/teams/${teamId}/all-seasons`);
      const data = await response.json();

      if (!data.success || !data.seasons || data.seasons.length === 0) {
        setError('No team data found');
        return;
      }

      setAllSeasonData(data.seasons);
      setTeam(data.seasons[0]); 
    } catch (err) {
      console.error('Error fetching team data:', err);
      setError('Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  const fetchFootballPlayers = async (seasonId: string) => {
    try {
      setLoadingFootballPlayers(true);
      const response = await fetch(`/api/teams/${teamId}/football-players?season_id=${seasonId}`);
      const data = await response.json();

      if (data.success && data.data && data.data.players) {
        setFootballPlayers(data.data.players);
      } else {
        setFootballPlayers([]);
      }
    } catch (err) {
      console.error('Error fetching football players:', err);
      setFootballPlayers([]);
    } finally {
      setLoadingFootballPlayers(false);
    }
  };

  const fetchRealPlayers = async (seasonId: string) => {
    try {
      setLoadingRealPlayers(true);
      const response = await fetch(`/api/teams/${teamId}/real-players?seasonId=${seasonId}`);
      const data = await response.json();

      if (data.success && data.data && data.data.players) {
        setRealPlayers(data.data.players);
      } else {
        setRealPlayers([]);
      }
    } catch (err) {
      console.error('Error fetching real players:', err);
      setRealPlayers([]);
    } finally {
      setLoadingRealPlayers(false);
    }
  };

  const fetchAwards = async (seasonId: string) => {
    try {
      setLoadingAwards(true);
      const response = await fetch(`/api/teams/${teamId}/awards?seasonId=${seasonId}`);
      const data = await response.json();

      if (data.success && data.data && data.data.awards) {
        setAwards(data.data.awards);
      } else {
        setAwards([]);
      }
    } catch (err) {
      console.error('Error fetching awards:', err);
      setAwards([]);
    } finally {
      setLoadingAwards(false);
    }
  };

  const calculateOverallStats = () => {
    if (allSeasonData.length === 0) return {
      matches_played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
      goal_difference: 0,
      points: 0,
      clean_sheets: 0,
    };

    return allSeasonData.reduce((acc, season) => {
      const s = season.stats;
      return {
        matches_played: acc.matches_played + Number(s.matches_played || 0),
        wins: acc.wins + Number(s.wins || 0),
        draws: acc.draws + Number(s.draws || 0),
        losses: acc.losses + Number(s.losses || 0),
        goals_for: acc.goals_for + Number(s.goals_for || 0),
        goals_against: acc.goals_against + Number(s.goals_against || 0),
        goal_difference: acc.goal_difference + Number(s.goal_difference || 0),
        points: acc.points + Number(s.points || 0),
        clean_sheets: acc.clean_sheets + Number(s.clean_sheets || 0),
      };
    }, {
      matches_played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
      goal_difference: 0,
      points: 0,
      clean_sheets: 0,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-slate-500 font-mono text-xs">Loading Team Profile...</p>
        </div>
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center max-w-md p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
          <Shield className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">Profile Error</h2>
          <p className="text-sm text-slate-500 font-mono">{error || 'Team profile not found'}</p>
          <Link
            href={querySeasonId ? `/teams?season=${querySeasonId}` : '/teams'}
            className="inline-flex items-center gap-1.5 border border-slate-250 bg-slate-50 hover:bg-slate-100 text-slate-700 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm font-mono"
          >
            {"<-"} BACK TO TEAMS
          </Link>
        </div>
      </div>
    );
  }

  const overallStats = calculateOverallStats();

  let displayStats;
  let currentSeasonData = team;

  if (selectedView === 'overall') {
    displayStats = overallStats;
  } else if (selectedView === 'all-seasons') {
    displayStats = overallStats;
  } else if (selectedView === 'season' && selectedSeasonId) {
    const selectedSeason = allSeasonData.find(s => s.season_id === selectedSeasonId);
    if (selectedSeason) {
      currentSeasonData = selectedSeason;
      displayStats = selectedSeason.stats;
    } else {
      displayStats = team.stats;
    }
  } else {
    displayStats = team.stats;
  }

  const stats = displayStats;
  const winRate = stats.matches_played > 0
    ? Math.round((stats.wins / stats.matches_played) * 100)
    : 0;
  const goalsPerGame = stats.matches_played > 0
    ? (stats.goals_for / stats.matches_played).toFixed(2)
    : '0.00';
  const concededPerGame = stats.matches_played > 0
    ? (stats.goals_against / stats.matches_played).toFixed(2)
    : '0.00';

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        
        {/* Header Panel */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link
            href={querySeasonId ? `/teams?season=${querySeasonId}` : '/teams'}
            className="inline-flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm font-mono"
          >
            {"<-"} BACK TO TEAMS
          </Link>

          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-xl font-bold">
              TEAM_ID: {team.team_id}
            </span>
            {allSeasonData.length > 1 && (
              <span className="bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-amber-700 px-3 py-1.5 rounded-xl font-bold">
                {allSeasonData.length} SEASONS ACTIVE
              </span>
            )}
          </div>
        </div>

        {/* View Tabs */}
        {allSeasonData.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-slate-200/60 pb-3">
            <button
              onClick={() => {
                setSelectedView('overall');
                setSelectedSeasonId(null);
              }}
              className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all ${
                selectedView === 'overall'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                  : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm'
              }`}
            >
              OVERALL STATS
            </button>

            <button
              onClick={() => {
                setSelectedView('all-seasons');
                setSelectedSeasonId(null);
              }}
              className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all ${
                selectedView === 'all-seasons'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                  : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm'
              }`}
            >
              ALL SEASONS ({allSeasonData.length})
            </button>

            {allSeasonData.length > 0 && (
              <div className="h-8 w-px bg-slate-200 self-center hidden sm:block mx-1"></div>
            )}

            {allSeasonData.map((seasonData, index) => {
              const isCurrentSeason = index === 0;
              const isSelected = selectedView === 'season' && selectedSeasonId === seasonData.season_id;

              return (
                <button
                  key={`${seasonData.team_id}-${seasonData.season_id}-${index}`}
                  onClick={() => {
                    setSelectedView('season');
                    setSelectedSeasonId(seasonData.season_id);
                  }}
                  className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                      : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm'
                  }`}
                >
                  {seasonData.season_name?.toUpperCase() || `SEASON ${allSeasonData.length - index}`}
                  {isCurrentSeason && (
                    <span className="ml-1.5 inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Left Column - Team Logo & Overview */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Team Info Card */}
            <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm text-center space-y-4">
              
              {/* Logo Frame */}
              <div className="relative w-40 h-40 mx-auto rounded-xl shadow-sm border border-slate-200 bg-white flex items-center justify-center p-3 overflow-hidden">
                {team.logo_url ? (
                  <img
                    src={team.logo_url}
                    alt={team.team_name}
                    className="object-contain w-full h-full"
                  />
                ) : (
                  <div className="bg-[#D4AF37]/10 w-full h-full flex items-center justify-center rounded-lg">
                    <Shield className="w-12 h-12 text-amber-600" />
                  </div>
                )}
              </div>

              {/* Basic Info */}
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 mb-1">{currentSeasonData.team_name}</h2>
                <p className="text-xs font-mono font-bold text-slate-400 uppercase">{team.team_code}</p>

                {currentSeasonData.manager_name && (
                  <div className="mt-3">
                    <span className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase">
                      Manager: {currentSeasonData.manager_name}
                    </span>
                  </div>
                )}

                {selectedView === 'season' && selectedSeasonId && (
                  <div className="mt-3">
                    <span className="inline-flex items-center gap-1.5 bg-purple-50 border border-purple-200 text-purple-700 px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase">
                      {currentSeasonData.season_name}
                    </span>
                  </div>
                )}
              </div>

              {/* League position */}
              {selectedView === 'season' && currentSeasonData.stats.position !== undefined && currentSeasonData.stats.position !== null && (
                <div className="mt-4 p-3 bg-amber-50/20 border border-amber-200/50 rounded-xl flex items-center justify-between font-mono text-xs">
                  <span className="font-bold text-amber-800">LEAGUE POSITION</span>
                  <span className="text-xl font-black text-amber-600">
                    {currentSeasonData.stats.position > 0 ? `#${currentSeasonData.stats.position}` : 'N/A'}
                  </span>
                </div>
              )}
            </div>

            {/* Record Card */}
            <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
                <Shield className="w-4 h-4 mr-2 text-[#D4AF37]" /> Record Ledger
              </h3>

              <div className="grid grid-cols-3 gap-2 font-mono">
                <div className="border border-emerald-100 rounded-xl p-3 bg-emerald-50/20 text-center">
                  <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Wins</p>
                  <p className="text-2xl font-black text-emerald-600 mt-1">{stats.wins}</p>
                </div>
                <div className="border border-amber-100 rounded-xl p-3 bg-amber-50/20 text-center">
                  <p className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Draws</p>
                  <p className="text-2xl font-black text-amber-600 mt-1">{stats.draws}</p>
                </div>
                <div className="border border-rose-100 rounded-xl p-3 bg-rose-50/20 text-center">
                  <p className="text-[10px] text-rose-700 font-bold uppercase tracking-wider">Losses</p>
                  <p className="text-2xl font-black text-rose-600 mt-1">{stats.losses}</p>
                </div>
              </div>

              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg">
                  <span className="text-slate-400 uppercase tracking-wide text-[9px]">Goals For (GF)</span>
                  <span className="font-bold text-slate-800">{stats.goals_for}</span>
                </div>
                <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg">
                  <span className="text-slate-400 uppercase tracking-wide text-[9px]">Goals Against (GA)</span>
                  <span className="font-bold text-slate-800">{stats.goals_against}</span>
                </div>
                <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg">
                  <span className="text-slate-400 uppercase tracking-wide text-[9px]">Goal Difference (GD)</span>
                  <span className={`font-bold ${stats.goal_difference > 0 ? 'text-emerald-600' : stats.goal_difference < 0 ? 'text-red-600' : 'text-slate-655'}`}>
                    {stats.goal_difference > 0 ? '+' : ''}{stats.goal_difference}
                  </span>
                </div>
                <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg">
                  <span className="text-slate-400 uppercase tracking-wide text-[9px]">Clean Sheets</span>
                  <span className="font-bold text-blue-600">{stats.clean_sheets}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Stats / Breakdown */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* Season-by-Season Tab */}
            {selectedView === 'all-seasons' && allSeasonData.length > 0 && (
              <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm space-y-6">
                <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
                  <Activity className="w-4 h-4 mr-2 text-purple-600" /> Season-by-Season Breakdown
                </h3>

                <div className="space-y-4">
                  {allSeasonData.map((seasonData, index) => {
                    const isCurrentSeason = index === 0;
                    const s = seasonData.stats;

                    return (
                      <div
                        key={`all-seasons-${seasonData.team_id}-${seasonData.season_id}-${index}`}
                        className={`rounded-2xl p-5 border transition-all ${
                          isCurrentSeason
                            ? 'border-2 border-amber-500/80 bg-amber-50/10 shadow-sm'
                            : 'border-slate-200 bg-white/50 hover:border-amber-400/40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                              isCurrentSeason ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {allSeasonData.length - index}
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-900 text-sm">
                                {seasonData.season_name || `Season ${allSeasonData.length - index}`}
                              </h4>
                              {s.position && (
                                <p className="text-xs text-slate-500 font-semibold mt-0.5">Position: #{s.position}</p>
                              )}
                            </div>
                          </div>
                          {isCurrentSeason && (
                            <span className="px-2.5 py-1 bg-amber-600 text-white text-[9px] font-mono font-bold rounded-full uppercase tracking-wider">
                              Active
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                          <div className="bg-slate-50/85 rounded-lg p-3 text-center border border-slate-100">
                            <p className="text-[9px] text-slate-400 uppercase">Matches</p>
                            <p className="text-lg font-black text-slate-900 mt-0.5">{s.matches_played}</p>
                          </div>
                          <div className="bg-slate-50/85 rounded-lg p-3 text-center border border-slate-100">
                            <p className="text-[9px] text-slate-400 uppercase">Record</p>
                            <p className="text-xs font-bold text-slate-900 mt-1.5">
                              {s.wins}W-{s.draws}D-{s.losses}L
                            </p>
                          </div>
                          <div className="bg-slate-50/85 rounded-lg p-3 text-center border border-slate-100">
                            <p className="text-[9px] text-slate-400 uppercase">Goals</p>
                            <p className="text-lg font-black text-purple-600 mt-0.5">{s.goals_for}</p>
                          </div>
                          <div className="bg-slate-50/85 rounded-lg p-3 text-center border border-slate-100">
                            <p className="text-[9px] text-slate-400 uppercase">Points</p>
                            <p className="text-lg font-black text-amber-600 mt-0.5">{s.points}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Statistics Display */}
            {selectedView !== 'all-seasons' && (
              <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm space-y-6">
                <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
                  <Activity className="w-4 h-4 mr-2 text-primary" />
                  {selectedView === 'overall' ? 'Overall Statistics' : `Statistics - ${currentSeasonData.season_name}`}
                </h3>

                {/* Main Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Matches</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{stats.matches_played || 0}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold text-purple-600">Goals For</p>
                    <p className="text-2xl font-black text-purple-600 mt-1">{stats.goals_for || 0}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold text-emerald-600">CS</p>
                    <p className="text-2xl font-black text-emerald-600 mt-1">{stats.clean_sheets || 0}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">GD</p>
                    <p className={`text-2xl font-black ${stats.goal_difference > 0 ? 'text-emerald-600' :
                      stats.goal_difference < 0 ? 'text-red-600' : 'text-slate-600'
                      } mt-1`}>
                      {stats.goal_difference > 0 ? '+' : ''}{stats.goal_difference || 0}
                    </p>
                  </div>
                </div>

                {/* Secondary Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 font-mono">
                  <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Win Rate</p>
                    <p className="text-2xl font-black text-emerald-600 mt-1">{winRate}%</p>
                  </div>
                  <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold text-purple-600">Goals/Game</p>
                    <p className="text-2xl font-black text-purple-600 mt-1">{goalsPerGame}</p>
                  </div>
                  <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold text-red-600">GC/Game</p>
                    <p className="text-2xl font-black text-red-600 mt-1">{concededPerGame}</p>
                  </div>
                </div>

                {/* Performance Progress */}
                <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider mb-4">Performance Metrics</h4>
                  <div>
                    <div className="flex justify-between items-center mb-1 text-xs">
                      <span className="text-slate-500 font-mono">WIN PERCENTAGE</span>
                      <span className="font-bold font-mono text-slate-700">{winRate}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200/40">
                      <div
                        className="h-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full"
                        style={{ width: `${winRate}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Real Players Section */}
            {selectedView === 'season' && selectedSeasonId && (
              <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
                  <Users className="w-4 h-4 mr-2 text-blue-600" /> Real Players {realPlayers.length > 0 && `(${realPlayers.length})`}
                </h3>

                {loadingRealPlayers ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto"></div>
                    <p className="text-xs text-slate-400 font-mono mt-2">Loading squad...</p>
                  </div>
                ) : realPlayers.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-900 font-bold">No Squad Members Found</p>
                    <p className="text-xs text-slate-400 font-mono mt-1">NO PLAYERS REGISTERED THIS SEASON</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      {(() => {
                        const seasonNum = parseInt(selectedSeasonId?.match(/\d+/)?.[0] || '0');
                        const isModernSeason = seasonNum === 16 || seasonNum === 17;
                        const hasCategory = isModernSeason
                          ? realPlayers.some(p => p.category && p.category.trim() !== '')
                          : true;

                        return (
                          <table className="w-full text-center border-collapse">
                            <thead>
                              <tr className="border-b border-slate-100 font-mono text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                                <th className="text-left py-3 px-4">Player</th>
                                {hasCategory && <th className="py-3 px-4">Category</th>}
                                {isModernSeason && <th className="py-3 px-4">Rating</th>}
                                <th className="py-3 px-4">Matches</th>
                                <th className="py-3 px-4 text-purple-650">Goals</th>
                                <th className="py-3 px-4 text-amber-600">Points</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 font-mono text-xs text-slate-700">
                              {realPlayers
                                .sort((a, b) => (b.points || 0) - (a.points || 0))
                                .map((player, index) => (
                                  <tr
                                    key={`${player.player_id}-${player.season_id}-${index}`}
                                    className="hover:bg-slate-50/50 transition-colors"
                                  >
                                    <td className="py-3 px-4 text-left font-bold text-slate-900">
                                      <Link
                                        href={`/players/${player.player_id}`}
                                        className="hover:text-amber-650 hover:underline flex items-center gap-1.5"
                                      >
                                        {index < 3 && <Star className="w-4 h-4 text-amber-500 fill-amber-500 inline" />}
                                        {player.player_name}
                                      </Link>
                                    </td>
                                    {hasCategory && (
                                      <td className="py-3 px-4">
                                        <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border ${
                                          (() => {
                                            const cat = player.category?.toLowerCase();
                                            switch (cat) {
                                              case 'red':
                                                return 'bg-red-100 text-red-800 border-red-200';
                                              case 'black':
                                                return 'bg-gray-900 text-white border-gray-800';
                                              case 'blue':
                                                return 'bg-blue-100 text-blue-800 border-blue-200';
                                              case 'white':
                                                return 'bg-gray-50 text-gray-800 border-gray-300';
                                              case 'legend':
                                                return 'bg-amber-100 text-amber-800 border-amber-200';
                                              case 'classic':
                                                return 'bg-blue-100 text-blue-800 border-blue-200';
                                              default:
                                                return 'bg-gray-100 text-gray-700 border-gray-200';
                                            }
                                          })()
                                        }`}>
                                          {player.category || 'N/A'}
                                        </span>
                                      </td>
                                    )}
                                    {isModernSeason && (
                                      <td className="py-3 px-4">
                                        <span className="font-bold text-slate-800">
                                          {player.star_rating || 0}
                                        </span>
                                      </td>
                                    )}
                                    <td className="py-3 px-4 text-slate-500">{player.matches_played || 0}</td>
                                    <td className="py-3 px-4 text-purple-600 font-bold">{player.goals_scored || 0}</td>
                                    <td className="py-3 px-4 text-amber-600 font-black">{player.points || 0}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        );
                      })()}
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-center text-xs">
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <p className="text-[9px] text-slate-400 uppercase">Total Squad</p>
                          <p className="text-lg font-black text-slate-900 mt-0.5">{realPlayers.length}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <p className="text-[9px] text-slate-400 uppercase">Squad Goals</p>
                          <p className="text-lg font-black text-purple-650 mt-0.5">
                            {realPlayers.reduce((sum, p) => sum + (p.goals_scored || 0), 0)}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <p className="text-[9px] text-slate-400 uppercase">Squad Points</p>
                          <p className="text-lg font-black text-amber-650 mt-0.5">
                            {realPlayers.reduce((sum, p) => sum + (p.points || 0), 0)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Awards Section */}
            {selectedView === 'season' && selectedSeasonId && (() => {
              const seasonNum = parseInt(selectedSeasonId?.match(/\d+/)?.[0] || '0');
              return seasonNum === 16 || seasonNum === 17;
            })() && (
              <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
                  <AwardIcon className="w-4 h-4 mr-2 text-amber-500" /> Season Awards Won
                </h3>

                {loadingAwards ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto"></div>
                    <p className="text-xs text-slate-400 font-mono mt-2">Loading awards...</p>
                  </div>
                ) : awards.length === 0 ? (
                  <div className="text-center py-8">
                    <AwardIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-900 font-bold">No Individual Awards</p>
                    <p className="text-xs text-slate-400 font-mono mt-1">NO AWARDS GRANTED THIS SEASON</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {awards.map((award: any, index: number) => {
                      const awardTypeLabels: Record<string, string> = {
                        'season_player': 'Player of the Season',
                        'season_team': 'Team of the Season',
                        'potm': 'Player of the Month',
                        'totw': 'Team of the Week',
                        'TOD': 'Team of the Day',
                        'TOW': 'Team of the Week',
                        'POTD': 'Player of the Day',
                        'POTW': 'Player of the Week'
                      };

                      const isWinner = award.award_type.toLowerCase().includes('season') || award.award_type.toLowerCase().includes('player');
                      return (
                        <div
                          key={award.id || index}
                          className={`fut-card p-4 flex flex-col justify-between ${
                            isWinner ? 'fut-card-gold' : 'fut-card-silver'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <span className="text-[8px] font-mono text-slate-400 uppercase block">AWARD</span>
                            <AwardIcon className="w-4 h-4 text-amber-500" />
                          </div>

                          <div className="text-center py-2">
                            <AwardIcon className="w-9 h-9 text-amber-500/80 mx-auto mb-1.5" />
                            <h4 className="font-bold text-slate-900 text-xs text-center mx-auto px-2">
                              {awardTypeLabels[award.award_type] || award.award_type}
                            </h4>
                            {award.player_name && (
                              <p className="text-[10px] text-slate-600 font-bold mt-1 font-mono">{award.player_name}</p>
                            )}
                            {award.round_number && (
                              <p className="text-[9px] text-slate-400 font-mono">Round {award.round_number}</p>
                            )}
                          </div>

                          <div className="border-t border-slate-200/50 pt-2 flex justify-between items-center text-[8px] font-mono">
                            <span className="text-slate-400">TYPE:</span>
                            <span className="font-bold text-amber-700 uppercase">WINNER</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Football Players (eFootball) */}
            {selectedView === 'season' && selectedSeasonId && (() => {
              const seasonNum = parseInt(selectedSeasonId?.match(/\d+/)?.[0] || '0');
              const isModernSeason = seasonNum === 16 || seasonNum === 17;
              return isModernSeason;
            })() && (
              <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
                  <Target className="w-4 h-4 mr-2 text-green-600" /> Football Players (eFootball) {footballPlayers.length > 0 && `(${footballPlayers.length})`}
                </h3>

                {loadingFootballPlayers ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto"></div>
                    <p className="text-xs text-slate-400 font-mono mt-2">Loading acquisitions...</p>
                  </div>
                ) : footballPlayers.length === 0 ? (
                  <div className="text-center py-8">
                    <Target className="w-12 h-12 text-slate-355 mx-auto mb-4" />
                    <p className="text-slate-900 font-bold">No Football Players Found</p>
                    <p className="text-xs text-slate-400 font-mono mt-1">NO ACQUISITIONS RECORDED THIS SEASON</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-center border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 font-mono text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                          <th className="text-left py-3 px-4">Player</th>
                          <th>Position</th>
                          <th>Rating</th>
                          <th>Club</th>
                          <th>Style</th>
                          <th className="text-amber-600">Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 font-mono text-xs text-slate-700">
                        {footballPlayers
                          .sort((a, b) => b.purchase_price - a.purchase_price)
                          .map((player, index) => (
                            <tr
                              key={player.player_id}
                              className="hover:bg-slate-50/50 transition-colors"
                            >
                              <td className="py-3 px-4 text-left">
                                <div className="font-bold text-slate-900">{player.player_name}</div>
                                {player.nationality && (
                                  <div className="text-[9px] text-slate-400 font-semibold">{player.nationality.toUpperCase()}</div>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold bg-green-50 border border-green-200 text-green-700">
                                  {player.position || 'N/A'}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-bold">
                                <span className={player.overall_rating >= 85 ? 'text-purple-650' : player.overall_rating >= 80 ? 'text-blue-600' : 'text-slate-800'}>
                                  {player.overall_rating}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-500 text-[10px]">{player.club || 'Free Agent'}</td>
                              <td className="py-3 px-4 text-slate-450 text-[10px]">{player.playing_style || '-'}</td>
                              <td className="py-3 px-4 text-amber-600 font-black">€{player.purchase_price}M</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Trophies Section */}
            {((selectedView === 'overall' && allSeasonData.some(s => s.trophies && s.trophies.length > 0)) ||
              (selectedView === 'season' && currentSeasonData.trophies && currentSeasonData.trophies.length > 0)) && (
                <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm space-y-6">
                  <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
                    <TrophyIcon className="w-4 h-4 mr-2 text-amber-500" />
                    {selectedView === 'overall' ? 'All Trophies Won' : 'Trophies Won This Season'}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {selectedView === 'overall' ? (
                      allSeasonData.flatMap(seasonData =>
                        (seasonData.trophies || []).map((trophy: any) => ({
                          ...trophy,
                          season: seasonData.season_name
                        }))
                      ).map((trophy: any) => (
                        <div
                          key={trophy.id}
                          className="fut-card fut-card-gold p-4 flex flex-col justify-between"
                        >
                          <div className="flex justify-between items-start">
                            <span className="text-[8px] font-mono text-slate-400 uppercase block">TROPHY</span>
                            <TrophyIcon className="w-4 h-4 text-amber-500" />
                          </div>

                          <div className="text-center py-2">
                            <TrophyIcon className="w-9 h-9 text-amber-500/80 mx-auto mb-1.5" />
                            <h4 className="font-bold text-slate-900 text-xs text-center mx-auto px-2">{trophy.trophy_name}</h4>
                            <p className="text-[9px] text-slate-500 font-mono mt-0.5">{trophy.season}</p>
                          </div>

                          <div className="border-t border-slate-200/50 pt-2 flex justify-between items-center text-[8px] font-mono">
                            <span className="text-slate-400">RANK:</span>
                            <span className="font-bold text-amber-700 uppercase">{trophy.trophy_position || `#${trophy.position}`}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      currentSeasonData.trophies?.map((trophy: any) => (
                        <div
                          key={trophy.id}
                          className="fut-card fut-card-gold p-4 flex flex-col justify-between"
                        >
                          <div className="flex justify-between items-start">
                            <span className="text-[8px] font-mono text-slate-400 uppercase block">TROPHY</span>
                            <TrophyIcon className="w-4 h-4 text-amber-500" />
                          </div>

                          <div className="text-center py-2">
                            <TrophyIcon className="w-9 h-9 text-amber-500/80 mx-auto mb-1.5" />
                            <h4 className="font-bold text-slate-900 text-xs text-center mx-auto px-2">{trophy.trophy_name}</h4>
                          </div>

                          <div className="border-t border-slate-200/50 pt-2 flex justify-between items-center text-[8px] font-mono">
                            <span className="text-slate-400">RANK:</span>
                            <span className="font-bold text-amber-700 uppercase">{trophy.trophy_position || `#${trophy.position}`}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TeamDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-slate-500 font-mono text-xs">Loading Team Details...</p>
        </div>
      </div>
    }>
      <TeamDetailContent />
    </Suspense>
  );
}
