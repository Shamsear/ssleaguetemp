'use client'

import Link from 'next/link';
import HeroSection from './components/HeroSection';
import HallOfFameSelector from '././components/HallOfFameSelector';
import { useEffect, useState } from 'react';
import { useResolvedTeamData } from '@/hooks/useResolveTeamNames';
import { Activity, ArrowRight, Award, Crown, Flame, Medal, RotateCcw, Shield, Star, Target, TrendingUp, Trophy, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leagueStats, setLeagueStats] = useState<any>(null);
  const [hallOfFame, setHallOfFame] = useState<any>(null);
  const [records, setRecords] = useState<any>(null);
  const [champions, setChampions] = useState<any[]>([]);
  const [cupWinners, setCupWinners] = useState<any[]>([]);
  const [totalChampions, setTotalChampions] = useState(0);
  const [awardWinners, setAwardWinners] = useState<any>({});
  const [currentSeason, setCurrentSeason] = useState<any>(null);
  const [topTeams, setTopTeams] = useState<any[]>([]);
  
  // Selected team index for detailed stats
  const [selectedPodiumTeam, setSelectedPodiumTeam] = useState<number>(0);

  // Category expansion for "Show More" functionality on awards
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Mock kill-feed transfer log
  const [killFeedLogs] = useState([
    { type: 'SIGNING', team: 'Kopites', detail: 'signed Erling Haaland for 85M', time: '5m ago' },
    { type: 'BID', team: 'ASGARD', detail: 'bid 40M on Bukayo Saka', time: '42m ago' },
    { type: 'RELEASE', team: 'Galacticos', detail: 'released Gabriel Magalhães', time: '2h ago' },
    { type: 'SYSTEM', team: 'League', detail: 'Auction Round 12 Finalized', time: '1d ago' },
    { type: 'STATUS', team: 'System', detail: 'Season 17 is now active', time: '2d ago' },
  ]);

  const displayTopTeams = topTeams || [];
  const displayChampions = champions || [];
  const displayCupWinners = cupWinners || [];

  // Redirect to dashboard if logged in
  useEffect(() => {
    if (!authLoading && user) {
      let targetUrl = '/dashboard';
      if (user.role === 'super_admin') {
        targetUrl = '/dashboard/superadmin';
      } else if (user.role === 'committee_admin') {
        targetUrl = '/dashboard/committee';
      } else if (user.role === 'team') {
        targetUrl = '/dashboard/team';
      }
      console.log('[Home] User is logged in, redirecting to:', targetUrl);
      router.replace(targetUrl);
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Check and finalize expired rounds (background task)
        fetch('/api/public/check-rounds').catch(() => { });

        // Fetch all data in parallel
        const [
          leagueStatsRes,
          hallOfFameRes,
          recordsRes,
          championsRes,
          awardsRes,
          seasonRes
        ] = await Promise.all([
          fetch('/api/public/league-stats'),
          fetch('/api/public/hall-of-fame'),
          fetch('/api/public/league-records'),
          fetch('/api/public/champions'),
          fetch('/api/public/award-winners'),
          fetch('/api/public/current-season')
        ]);

        const [
          leagueStatsData,
          hallOfFameData,
          recordsData,
          championsData,
          awardsData,
          seasonData
        ] = await Promise.all([
          leagueStatsRes.json(),
          hallOfFameRes.json(),
          recordsRes.json(),
          championsRes.json(),
          awardsRes.json(),
          seasonRes.json()
        ]);

        // Extract data
        setLeagueStats(leagueStatsData.success ? leagueStatsData.data : null);
        setHallOfFame(hallOfFameData.success ? hallOfFameData.data : null);
        setRecords(recordsData.success ? recordsData.data : null);
        setChampions(championsData.success ? championsData.data.champions : []);
        setCupWinners(championsData.success ? championsData.data.cupWinners : []);
        setTotalChampions(championsData.success ? championsData.data.totalChampions : 0);
        setAwardWinners(awardsData.success ? awardsData.data.awardWinners : {});
        const season = seasonData.success ? seasonData.data : null;
        setCurrentSeason(season);

        // Fetch current season standings from Neon tournament table
        if (season) {
          try {
            const tournamentsRes = await fetch(`/api/tournaments?season_id=${season.id}`);
            const tournamentsData = await tournamentsRes.json();
            
            if (tournamentsData.success && tournamentsData.tournaments?.length > 0) {
              const activeTournament = tournamentsData.tournaments.find((t: any) => t.is_primary) || tournamentsData.tournaments[0];
              const standingsRes = await fetch(`/api/tournaments/${activeTournament.id}/standings?t=${Date.now()}`);
              const standingsData = await standingsRes.json();
              
              if (standingsData.success) {
                if (standingsData.format === 'league' && standingsData.standings) {
                  setTopTeams(standingsData.standings.slice(0, 6));
                } else if (standingsData.format === 'group_stage' && standingsData.groupStandings) {
                  const groupNames = Object.keys(standingsData.groupStandings);
                  if (groupNames.length > 0) {
                    const firstGroupTeams = standingsData.groupStandings[groupNames[0]] || [];
                    setTopTeams(firstGroupTeams.slice(0, 6));
                  }
                }
              }
            }
          } catch (err) {
            console.error('Error fetching tournament standings:', err);
          }
        }
      } catch (error) {
        console.error('Error fetching homepage data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Prevent flash of content during redirect
  if (authLoading || user) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">
            {user ? 'Redirecting to your dashboard...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  // Removed podium order

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 pb-8 sm:pt-24 sm:pb-12 px-4 sm:px-6">
      
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-10">
        {/* Hero Section */}
        <HeroSection />

        {/* Dashboard Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT PANEL: 3D Standings Podium (7 Cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm relative overflow-hidden">
            
            {/* Header info */}
            <div className="mb-6 flex justify-between items-start">
              <div>
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">League Standings</span>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
                  {loading ? 'Standings Room' : (currentSeason ? currentSeason.name : 'Season Standings')}
                </h2>
              </div>
              <div className="flex items-center gap-1.5 bg-[#D4AF37]/10 px-2.5 py-1 rounded-full font-mono text-[9px] font-bold text-amber-700">
                <Flame className="w-3.5 h-3.5 text-[#D4AF37] animate-pulse" /> CHAMPIONSHIP RACE
              </div>
            </div>

            {/* 3D-Style Leaderboard Podium */}
            {loading ? (
              /* Standings Skeleton Loader */
              <div className="border border-slate-100 rounded-xl bg-slate-50/50 p-6 flex flex-col justify-between h-[380px] shadow-inner relative animate-pulse">
                <div className="podium-container relative mt-12 mb-4">
                  <div className="podium-step w-full bg-slate-200 h-[120px] rounded-t-xl"></div>
                  <div className="podium-step w-full bg-slate-300 h-[170px] rounded-t-xl"></div>
                  <div className="podium-step w-full bg-slate-200 h-[90px] rounded-t-xl"></div>
                </div>
                <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-md h-20"></div>
              </div>
            ) : displayTopTeams.length > 0 ? (
              <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-mono tracking-wider">
                        <th className="p-3 font-semibold text-center w-10">Pos</th>
                        <th className="p-3 font-semibold">Team</th>
                        <th className="p-3 font-semibold text-center hidden sm:table-cell">Pld</th>
                        <th className="p-3 font-semibold text-center hidden sm:table-cell">W</th>
                        <th className="p-3 font-semibold text-center hidden sm:table-cell">D</th>
                        <th className="p-3 font-semibold text-center hidden sm:table-cell">L</th>
                        <th className="p-3 font-semibold text-center hidden sm:table-cell">GD</th>
                        <th className="p-3 font-bold text-amber-700 text-center">Pts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayTopTeams.map((team: any, index: number) => {
                        const isTop = index === 0;
                        return (
                          <tr 
                            key={team.team_id} 
                            className={`hover:bg-slate-50 transition-colors ${isTop ? 'bg-amber-50/30' : ''}`}
                          >
                            <td className="p-3 text-center">
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                index === 0 ? 'bg-amber-100 text-amber-700' : 
                                index === 1 ? 'bg-slate-200 text-slate-700' :
                                index === 2 ? 'bg-amber-900/10 text-amber-900' :
                                'text-slate-500'
                              }`}>
                                {index + 1}
                              </span>
                            </td>
                            <td className="p-3">
                              <Link href={`/teams/${team.team_id}`} className="font-bold text-slate-900 text-sm hover:text-amber-600 transition-colors flex items-center gap-2">
                                {team.team_name}
                                {isTop && <Crown className="w-3.5 h-3.5 inline text-amber-500 fill-amber-500" />}
                              </Link>
                            </td>
                            <td className="p-3 text-center text-xs text-slate-600 hidden sm:table-cell">{team.matches_played}</td>
                            <td className="p-3 text-center text-xs text-slate-600 hidden sm:table-cell">{team.wins}</td>
                            <td className="p-3 text-center text-xs text-slate-600 hidden sm:table-cell">{team.draws}</td>
                            <td className="p-3 text-center text-xs text-slate-600 hidden sm:table-cell">{team.losses}</td>
                            <td className="p-3 text-center text-xs text-slate-600 hidden sm:table-cell">
                              {team.goal_difference > 0 ? `+${team.goal_difference}` : team.goal_difference}
                            </td>
                            <td className="p-3 text-center font-bold text-amber-600 text-sm">{team.points}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="border border-slate-100 rounded-xl bg-slate-50 p-12 text-center text-slate-400 font-mono text-sm">
                No standings data recorded for this season.
              </div>
            )}
            
            {/* Action buttons */}
            {!loading && currentSeason && (
              <div className="mt-4 flex justify-end">
                <Link
                  href="/season/current"
                  className="inline-flex items-center gap-2 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 px-5 py-2.5 rounded-xl text-xs font-bold transition-all"
                >
                  Inspect Complete Standings Room
                  <ArrowRight className="w-4 h-4 text-slate-500" />
                </Link>
              </div>
            )}
          </div>

          {/* RIGHT PANEL: eSports Event Log & Stats (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Live event feed (kill-feed style) */}
            <div className="kill-feed-container relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#D4AF37] animate-pulse" />
                  <span className="font-bold text-slate-900 text-sm">LEAGUE_EVENT_LOG</span>
                </div>
                <span className="bg-emerald-100 border border-emerald-200 text-emerald-800 text-[8px] font-mono font-bold px-2 py-0.5 rounded">
                  LIVE FEED
                </span>
              </div>

              {/* logs list */}
              <div className="space-y-3 font-mono text-xs">
                {killFeedLogs.map((log, index) => (
                  <div 
                    key={index} 
                    className={`kill-feed-item ${
                      log.type === 'SIGNING' ? 'kill-feed-signing' :
                      log.type === 'BID' ? 'kill-feed-bid' :
                      log.type === 'RELEASE' ? 'kill-feed-release' : ''
                    }`}
                  >
                    <div>
                      <span className="font-bold text-slate-900">{log.team}</span>{' '}
                      <span className="text-slate-600 text-[10px]">{log.detail}</span>
                    </div>
                    <span className="text-[9px] text-slate-400 ml-3 whitespace-nowrap">{log.time}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 text-[9px] font-mono text-slate-400 flex justify-between items-center select-none">
                <span>* CONSOLE ONLINE *</span>
                <span>SS_LEAGUE_SYSTEM</span>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">League Ledger</span>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5 mb-6">Historical Metrics</h3>

              {loading ? (
                /* Stats Skeleton Loader */
                <div className="grid grid-cols-1 gap-4 animate-pulse">
                  <div className="bg-slate-100 rounded-xl h-20"></div>
                  <div className="bg-slate-100 rounded-xl h-20"></div>
                  <div className="bg-slate-100 rounded-xl h-20"></div>
                </div>
              ) : leagueStats ? (
                <div className="grid grid-cols-1 gap-4">
                  <div className="console-card rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wide">Total Seasons</div>
                      <div className="text-2xl font-black text-slate-900 mt-1">
                        {leagueStats.league.total_seasons}
                      </div>
                    </div>
                    <Trophy className="w-8 h-8 text-amber-500/20" />
                  </div>

                  <div className="console-card rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wide">Goals Recorded</div>
                      <div className="text-2xl font-black text-slate-900 mt-1">
                        {leagueStats.league.total_goals.toLocaleString()}
                      </div>
                    </div>
                    <Target className="w-8 h-8 text-amber-500/20" />
                  </div>

                  <div className="console-card rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wide">Registered Managers</div>
                      <div className="text-2xl font-black text-slate-900 mt-1">
                        {leagueStats.players.total_players}+
                      </div>
                    </div>
                    <Shield className="w-8 h-8 text-amber-500/20" />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Hall of Fame Selector */}
        <HallOfFameSelector hallOfFame={hallOfFame || { topScorers: [], topAssisters: [], cleanSheetKings: [], mostAppearances: [], mostPoints: [], bestWinRate: [] }} />

        {/* League Records Section */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
          <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">Honours Ledger</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5 mb-8 tracking-tight">
            <TrendingUp className="w-6 h-6 inline-block text-amber-500 mr-2 align-text-bottom" /> League Records & Milestones
          </h2>

          {loading ? (
            /* Records Skeleton Loader */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-pulse">
              <div className="bg-slate-100 rounded-xl h-60"></div>
              <div className="bg-slate-100 rounded-xl h-60"></div>
            </div>
          ) : records ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Team Records */}
              <div className="border border-slate-100 rounded-xl p-5 bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200/60 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#D4AF37]" /> Team Records
                </h3>
                <div className="space-y-4">
                  {records.team.highestPoints && (
                    <div className="console-card rounded-xl p-4">
                      <div className="text-[9px] font-mono text-slate-400 uppercase">Highest Points in a Season</div>
                      <div className="font-bold text-slate-900 mt-1">{records.team.highestPoints.team_name}</div>
                      <div className="text-lg font-black text-amber-600 mt-0.5">
                        {records.team.highestPoints.points} points
                      </div>
                      <div className="text-[9px] font-mono text-slate-400 mt-1">{records.team.highestPoints.season_id}</div>
                    </div>
                  )}
                  {records.team.mostGoals && (
                    <div className="console-card rounded-xl p-4">
                      <div className="text-[9px] font-mono text-slate-400 uppercase">Most Goals in a Season</div>
                      <div className="font-bold text-slate-900 mt-1">{records.team.mostGoals.team_name}</div>
                      <div className="text-lg font-black text-amber-600 mt-0.5">
                        {records.team.mostGoals.goals} goals
                      </div>
                      <div className="text-[9px] font-mono text-slate-400 mt-1">{records.team.mostGoals.season_id}</div>
                    </div>
                  )}
                  {records.team.longestWinStreak && (
                    <div className="console-card rounded-xl p-4">
                      <div className="text-[9px] font-mono text-slate-400 uppercase">Longest Win Streak</div>
                      <div className="font-bold text-slate-900 mt-1">{records.team.longestWinStreak.team_name}</div>
                      <div className="text-lg font-black text-amber-600 mt-0.5">
                        {records.team.longestWinStreak.win_streak} wins
                      </div>
                      <div className="text-[9px] font-mono text-slate-400 mt-1">{records.team.longestWinStreak.season_id}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Player Records */}
              <div className="border border-slate-100 rounded-xl p-5 bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200/60 flex items-center gap-2">
                  <Award className="w-4 h-4 text-[#D4AF37]" /> Player Records
                </h3>
                <div className="space-y-4">
                  {records.player.mostGoals && (
                    <div className="console-card rounded-xl p-4">
                      <div className="text-[9px] font-mono text-slate-400 uppercase">Most Goals in a Season</div>
                      <div className="font-bold text-slate-900 mt-1">{records.player.mostGoals.player_name}</div>
                      <div className="text-lg font-black text-amber-600 mt-0.5">
                        {records.player.mostGoals.goals_scored} goals
                      </div>
                      <div className="text-[9px] font-mono text-slate-400 mt-1">
                        {records.player.mostGoals.team} • {records.player.mostGoals.season_id}
                      </div>
                    </div>
                  )}
                  {records.player.mostCleanSheets && (
                    <div className="console-card rounded-xl p-4">
                      <div className="text-[9px] font-mono text-slate-400 uppercase">Most Clean Sheets in a Season</div>
                      <div className="font-bold text-slate-900 mt-1">{records.player.mostCleanSheets.player_name}</div>
                      <div className="text-lg font-black text-amber-600 mt-0.5">
                        {records.player.mostCleanSheets.clean_sheets} clean sheets
                      </div>
                      <div className="text-[9px] font-mono text-slate-400 mt-1">
                        {records.player.mostCleanSheets.team} • {records.player.mostCleanSheets.season_id}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Trophy Cabinet - Champions */}
        {!loading && displayChampions.length > 0 && (
          <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">Trophy Cabinet</span>
            <div className="flex items-center justify-between mb-8 flex-wrap gap-4 mt-0.5">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                  <Trophy className="w-6 h-6 inline-block text-amber-500 mr-2 align-text-bottom" /> League Hall of Champions
                </h2>
                <p className="text-slate-500 text-xs mt-1">Celebrating our historical league champions.</p>
              </div>
              <div className="text-right bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl font-mono">
                <div className="text-2xl font-black text-[#D4AF37]">{totalChampions}</div>
                <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Unique Champions</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayChampions.slice(0, 6).map((champion: any, index: number) => (
                <div
                  key={champion.team_id}
                  className="console-card rounded-xl p-5 relative border border-slate-200 hover:border-amber-400/40"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <span className="text-[9px] font-mono text-slate-400">CHAMPION SQUAD</span>
                      <h3 className="font-bold text-lg text-slate-900 mt-0.5">
                        {champion.team_name}
                      </h3>
                    </div>
                    <div className="text-2xl text-amber-500">
                      <Trophy className="w-6 h-6" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-slate-950">
                        {champion.championship_count}
                      </span>
                      <span className="text-xs font-semibold text-slate-500 font-mono">Championships</span>
                    </div>

                    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 font-mono">
                      <div className="text-[9px] text-slate-400 mb-0.5 uppercase tracking-wide">Winning Seasons</div>
                      <div className="text-xs font-semibold text-slate-700">
                        {champion.seasons_won.join(', ')}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 font-mono text-center">
                      <div>
                        <div className="text-xs font-bold text-slate-800">{champion.best_points}</div>
                        <div className="text-[9px] text-slate-400">Best Pts</div>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800">{champion.total_wins}</div>
                        <div className="text-[9px] text-slate-400">Total Wins</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {totalChampions > 6 && (
              <div className="mt-8 text-center">
                <Link
                  href="/seasons"
                  className="inline-flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold font-mono text-xs hover:bg-slate-800 hover:shadow-lg transition-all"
                >
                  View All {totalChampions} Champions
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Cup Winners */}
        {!loading && displayCupWinners && displayCupWinners.length > 0 && (
          <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">Shield Honours</span>
            <h2 className="text-2xl font-bold text-slate-900 mt-0.5 mb-6 tracking-tight">
              <Medal className="w-6 h-6 inline-block text-amber-500 mr-2 align-text-bottom" /> Tournament Cup Winners
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayCupWinners.slice(0, 6).map((team: any) => (
                <div
                  key={team.team_id}
                  className="console-card rounded-xl p-4 flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-bold text-slate-900">{team.team_name}</h3>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      Seasons: {team.seasons.join(', ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-amber-600">{team.cup_count}×</div>
                    <div className="text-[9px] font-mono text-slate-400 uppercase">Cups</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Player Awards */}
        {!loading && Object.keys(awardWinners).length > 0 && (
          <div className="space-y-6">
            {Object.entries(awardWinners).map(([awardName, winners]: [string, any]) => {
              const isExpanded = expandedCategories[awardName] || false;
              const displayedWinners = isExpanded ? winners : winners.slice(0, 6);
              
              return (
                <div key={awardName} className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
                  <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">Individual Stats</span>
                  <h2 className="text-xl font-bold text-slate-900 mt-0.5 mb-6 flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-500" /> {awardName}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayedWinners.map((win: any, idx: number) => {
                      const seasonName = win.season_id ? win.season_id.replace('SSPSLS', 'Season ') : 'Unknown Season';
                      return (
                        <div
                          key={`${win.player_id}-${win.season_id}-${win.round_number || idx}`}
                          className="console-card rounded-xl p-4 flex items-center justify-between hover:border-amber-400/40 transition-all"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] font-mono font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded uppercase">
                                {seasonName}
                              </span>
                              {win.round_number && (
                                <span className="text-[9px] font-mono font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded uppercase">
                                  Round {win.round_number}
                                </span>
                              )}
                              {win.category && (
                                <span className="text-[9px] font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded uppercase">
                                  {win.category}
                                </span>
                              )}
                            </div>
                            
                            <h3 className="font-bold text-slate-900 truncate mt-2 hover:underline">
                              <Link href={`/players/${win.player_id}`}>
                                {win.player_name || 'Anonymous Player'}
                              </Link>
                            </h3>
                            {win.team_name && (
                              <div className="text-[10px] font-bold text-slate-600 mt-0.5">
                                {win.team_name}
                              </div>
                            )}
                            {win.notes && !win.notes.includes('Auto-awarded') && (
                              <p className="text-[10px] text-slate-500 italic mt-1 truncate max-w-full" title={win.notes}>
                                {win.notes}
                              </p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <div className="text-amber-400 flex justify-end"><Star className="w-4 h-4 fill-amber-400" /></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {winners.length > 6 && (
                    <div className="mt-6 flex justify-center">
                      <button
                        onClick={() => setExpandedCategories(prev => ({ ...prev, [awardName]: !prev[awardName] }))}
                        className="inline-flex items-center gap-1.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        {isExpanded ? 'Show Less' : `Show More (${winners.length - 6} more)`}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Quick Links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link href="/players" className="console-card rounded-xl p-5 hover:border-amber-400/40 group">
            <div className="w-10 h-10 rounded-lg bg-amber-500/5 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <Zap className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="font-bold text-slate-900">Browse Players</h3>
            <p className="text-slate-500 text-xs mt-1">Explore all players and statistics</p>
          </Link>

          <Link href="/teams" className="console-card rounded-xl p-5 hover:border-amber-400/40 group">
            <div className="w-10 h-10 rounded-lg bg-amber-500/5 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <Shield className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="font-bold text-slate-900">View Teams</h3>
            <p className="text-slate-500 text-xs mt-1">Check team rosters and standings</p>
          </Link>

          <Link href="/polls" className="console-card rounded-xl p-5 hover:border-amber-400/40 group">
            <div className="w-10 h-10 rounded-lg bg-amber-500/5 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <Target className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="font-bold text-slate-900">Fan Polls</h3>
            <p className="text-slate-500 text-xs mt-1">Vote for your favorite team tactics</p>
          </Link>

          <Link href="/seasons" className="console-card rounded-xl p-5 hover:border-amber-400/40 group">
            <div className="w-10 h-10 rounded-lg bg-amber-500/5 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <RotateCcw className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="font-bold text-slate-900">Season Archive</h3>
            <p className="text-slate-500 text-xs mt-1">Explore past seasons and ledger history</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
