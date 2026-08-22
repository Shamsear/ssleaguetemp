'use client';

import { SoccerBallIcon } from '@/components/ui/CustomIcons';
import { Crown, Gift, Star, Trophy, User, Users, ArrowLeft, ArrowUp, ArrowDown, Info, ShieldAlert, Award, Plus, RefreshCw, Shield, Activity, Target } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface FantasyTeam {
  id: string;
  team_name: string;
  total_points: number;
  rank: number;
  player_count: number;
  supported_team_id?: string;
  supported_team_name?: string;
  supported_team_logo?: string;
  passive_points?: number;
  budget_remaining?: number;
}

interface Player {
  draft_id: string;
  real_player_id: string;
  player_name: string;
  draft_order: number;
  total_points: number;
  matches_played: number;
  average_points: number;
  is_captain?: boolean;
  is_vice_captain?: boolean;
}

interface PlayerMatchStats {
  match_id: string;
  round_number: number;
  opponent: string;
  goals_scored: number;
  goals_conceded: number;
  clean_sheet: boolean;
  motm: boolean;
  total_points: number;
}

interface PlayerStatsData {
  stats: {
    total_points: number;
    total_matches: number;
    average_points: string;
    total_admin_bonus: number;
  };
  admin_bonuses: Array<{
    id: number;
    points: number;
    reason: string;
    awarded_at: string;
  }>;
  matches: PlayerMatchStats[];
}

interface RoundPoints {
  round: number;
  points: number;
}

interface OtherTeam {
  id: string;
  team_name: string;
  owner_name: string;
  total_points: number;
  player_count: number;
  rank: number;
}

export default function MyFantasyTeamPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [fantasyTeam, setFantasyTeam] = useState<FantasyTeam | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [recentRounds, setRecentRounds] = useState<RoundPoints[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [leagueId, setLeagueId] = useState<string>('');
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [playerMatchStats, setPlayerMatchStats] = useState<Record<string, PlayerStatsData>>({});
  const [otherTeams, setOtherTeams] = useState<OtherTeam[]>([]);
  const [showOtherTeams, setShowOtherTeams] = useState(false);
  const [loadingPlayerStats, setLoadingPlayerStats] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const [canRegister, setCanRegister] = useState(false);
  const [registrationInfo, setRegistrationInfo] = useState<any>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    const loadFantasyTeam = async () => {
      if (!user) return;

      try {
        // First, get the current season and fantasy league
        const response = await fetchWithTokenRefresh(`/api/fantasy/teams/my-team?user_id=${user.uid}`);

        if (response.status === 404) {
          const errorData = await response.json();
          setCanRegister(errorData.can_register || false);
          setRegistrationInfo(errorData.registration_info || null);
          setIsLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to load fantasy team');
        }

        const data = await response.json();
        setFantasyTeam(data.team);
        setPlayers(data.players);
        setRecentRounds(data.recent_rounds || []);
        setLeagueId(data.team.fantasy_league_id);

        // Load other teams
        if (data.team.fantasy_league_id) {
          loadOtherTeams(data.team.fantasy_league_id, data.team.id);
        }
      } catch (error) {
        console.error('Error loading fantasy team:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (user) {
      loadFantasyTeam();
    }
  }, [user]);

  const loadOtherTeams = async (leagueId: string, myTeamId: string) => {
    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/leaderboard/${leagueId}`);
      if (!response.ok) return;

      const data = await response.json();
      const others = data.leaderboard.filter((team: OtherTeam) => team.id !== myTeamId);
      setOtherTeams(others);
    } catch (error) {
      console.error('Error loading other teams:', error);
    }
  };

  const loadPlayerMatchStats = async (playerId: string) => {
    if (playerMatchStats[playerId]) {
      // Already loaded
      setExpandedPlayer(expandedPlayer === playerId ? null : playerId);
      return;
    }

    setLoadingPlayerStats({ ...loadingPlayerStats, [playerId]: true });

    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/players/${playerId}/matches?league_id=${leagueId}`);
      if (!response.ok) {
        const errorData = await response.text();
        console.error('API Error:', response.status, errorData);
        throw new Error(`Failed to load player stats: ${response.status}`);
      }

      const data = await response.json();

      // Store the full data including admin bonuses
      setPlayerMatchStats({
        ...playerMatchStats,
        [playerId]: {
          stats: data.stats || {},
          admin_bonuses: data.admin_bonuses || [],
          matches: (data.match_history || data.matches || []).map((match: any) => ({
            match_id: match.fixture_id || match.match_id,
            round_number: match.round_number,
            opponent: match.opponent || 'Unknown',
            goals_scored: match.goals_scored || 0,
            goals_conceded: match.goals_conceded || 0,
            clean_sheet: match.is_clean_sheet || match.clean_sheet || false,
            motm: match.is_motm || match.motm || false,
            total_points: match.total_points || 0,
          }))
        }
      });
      setExpandedPlayer(playerId);
    } catch (error) {
      console.error('Error loading player stats:', error);
    } finally {
      setLoadingPlayerStats({ ...loadingPlayerStats, [playerId]: false });
    }
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading team details...</p>
        </div>
      </div>
    );
  }

  const handleRegister = async () => {
    if (!user || !canRegister) return;

    setIsRegistering(true);
    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/teams/my-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.uid,
          league_id: registrationInfo?.league_id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'Failed to register');
      }

      // Reload the page to show the newly created team
      window.location.reload();
    } catch (error) {
      console.error('Error registering for fantasy:', error);
      alert(error instanceof Error ? error.message : 'Failed to register for fantasy league');
    } finally {
      setIsRegistering(false);
    }
  };

  if (!user) return null;

  if (!fantasyTeam) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="max-w-md w-full bg-white border border-slate-200/60 p-8 rounded-3xl text-center shadow-sm relative z-10">
          <div className="w-16 h-16 bg-slate-800 border border-slate-700 text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow">
            <Trophy className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">
            {canRegister ? 'Join Fantasy League' : 'No Fantasy League Yet'}
          </h2>
          <p className="text-xs text-slate-455 font-bold uppercase leading-normal mb-6">
            {canRegister
              ? `Register your squad for the season and compete for the championship!`
              : 'The league administrator has not opened the fantasy league for registrations yet.'}
          </p>
          {canRegister ? (
            <div className="space-y-3">
              <button
                onClick={handleRegister}
                disabled={isRegistering}
                className="w-full px-6 py-3.5 bg-slate-800 border border-slate-900 hover:bg-slate-700 text-amber-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-black"
              >
                {isRegistering ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-400"></div>
                    Registering...
                  </span>
                ) : (
                  'Register My Team'
                )}
              </button>
              <Link
                href="/dashboard/team"
                className="inline-block w-full px-6 py-3.5 bg-slate-100 hover:bg-slate-250 border border-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
              >
                Back to Dashboard
              </Link>
            </div>
          ) : (
            <Link
              href="/dashboard/team"
              className="inline-block px-6 py-3.5 bg-slate-850 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
            >
              Back to Dashboard
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/team"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-4 sm:p-6 md:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
            <div className="flex items-center gap-3 sm:gap-5 flex-1 min-w-0">
              {fantasyTeam.supported_team_logo ? (
                <img
                  src={fantasyTeam.supported_team_logo}
                  alt={`${fantasyTeam.team_name} logo`}
                  className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl object-cover border border-slate-250 shadow-sm shrink-0"
                  style={{
                    objectPosition: `${(fantasyTeam as any).logo_position_x_circle ?? 50}% ${(fantasyTeam as any).logo_position_y_circle ?? 50}%`,
                    transform: `scale(${(fantasyTeam as any).logo_scale_circle ?? 1})`,
                    transformOrigin: `${(fantasyTeam as any).logo_position_x_circle ?? 50}% ${(fantasyTeam as any).logo_position_y_circle ?? 50}%`,
                  }}
                />
              ) : (
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-800 border border-slate-700 text-amber-400 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
                  <Users className="w-6 h-6 sm:w-8 sm:h-8" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">MY ROSTER</span>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase break-words">
                  {fantasyTeam.team_name}
                </h1>
              </div>
            </div>
            <Link
              href="/dashboard/team/fantasy/draft"
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-amber-500 hover:bg-amber-450 border border-amber-600 text-slate-900 font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer sm:shrink-0 w-full sm:w-auto"
            >
              <Plus className="w-3.5 h-3.5" /> Manage Squad
            </Link>
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <Link
            href={`/dashboard/team/fantasy/transfers`}
            className="group flex items-center gap-3 p-4 bg-white border border-slate-200/60 rounded-2xl shadow-sm hover:border-amber-300 hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 bg-slate-800 border border-slate-700 text-amber-400 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-amber-500 group-hover:text-white group-hover:border-amber-600 transition-all">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider truncate">Transfers</h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Swap players</p>
            </div>
          </Link>

          <Link
            href={`/dashboard/team/fantasy/captain-selection`}
            className="group flex items-center gap-3 p-4 bg-white border border-slate-200/60 rounded-2xl shadow-sm hover:border-amber-300 hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 bg-amber-50 border border-amber-200 text-amber-600 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-amber-500 group-hover:text-white group-hover:border-amber-600 transition-all">
              <Crown className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider truncate">Captain</h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Assign roles</p>
            </div>
          </Link>

          <Link
            href={`/dashboard/team/fantasy/all-players-points`}
            className="group flex items-center gap-3 p-4 bg-white border border-slate-200/60 rounded-2xl shadow-sm hover:border-amber-300 hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 bg-blue-50 border border-blue-200 text-blue-600 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-amber-500 group-hover:text-white group-hover:border-amber-600 transition-all">
              <Target className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider truncate">All Players</h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">View scores</p>
            </div>
          </Link>

          <Link
            href={`/dashboard/team/fantasy/all-teams`}
            className="group flex items-center gap-3 p-4 bg-white border border-slate-200/60 rounded-2xl shadow-sm hover:border-amber-300 hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 bg-slate-100 border border-slate-200 text-slate-600 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-amber-500 group-hover:text-white group-hover:border-amber-600 transition-all">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider truncate">All Teams</h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Compare squads</p>
            </div>
          </Link>

          <Link
            href={`/dashboard/team/fantasy/leaderboard`}
            className="group flex items-center gap-3 p-4 bg-white border border-slate-200/60 rounded-2xl shadow-sm hover:border-amber-300 hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-amber-500 group-hover:text-white group-hover:border-amber-600 transition-all">
              <Trophy className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider truncate">Leaderboard</h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">See standings</p>
            </div>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="console-card bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-sm text-center">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Rank</span>
            <h4 className="text-2xl font-black text-amber-400 mt-1">
              {fantasyTeam.rank && fantasyTeam.rank < 999 ? `#${fantasyTeam.rank}` : '—'}
            </h4>
          </div>

          <div className="console-card bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm text-center">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Points</span>
            <h4 className="text-2xl font-black text-slate-800 mt-1">{fantasyTeam.total_points}</h4>
          </div>

          <div className="console-card bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm text-center">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Budget</span>
            <h4 className={`text-2xl font-black mt-1 ${Number(fantasyTeam.budget_remaining || 0) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {fantasyTeam.budget_remaining || 0}
            </h4>
            <span className="text-[9px] text-slate-400 font-bold uppercase">credits</span>
          </div>

          <div className="console-card bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm text-center">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Squad</span>
            <h4 className="text-2xl font-black text-slate-800 mt-1">
              {fantasyTeam.player_count}<span className="text-sm text-slate-400 font-bold"> / 5</span>
            </h4>
          </div>
        </div>

        {/* Supported Team (Passive Points) */}
        {fantasyTeam.supported_team_name && (
          <div className="console-card bg-gradient-to-r from-emerald-50/50 to-blue-50/50 border border-slate-200/80 p-6 rounded-3xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-4">
              {fantasyTeam.supported_team_logo ? (
                <img
                  src={fantasyTeam.supported_team_logo}
                  alt={`${fantasyTeam.supported_team_name} logo`}
                  className="w-14 h-14 rounded-full object-cover border border-slate-200"
                  style={{
                    objectPosition: `${(fantasyTeam as any).logo_position_x_circle ?? 50}% ${(fantasyTeam as any).logo_position_y_circle ?? 50}%`,
                    transform: `scale(${(fantasyTeam as any).logo_scale_circle ?? 1})`,
                    transformOrigin: `${(fantasyTeam as any).logo_position_x_circle ?? 50}% ${(fantasyTeam as any).logo_position_y_circle ?? 50}%`,
                  }}
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-emerald-600 text-white font-bold text-lg flex items-center justify-center">
                  {fantasyTeam.supported_team_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">SUPPORTED REAL TEAM</span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5 uppercase">{fantasyTeam.supported_team_name}</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Earns passive points based on real team performance</p>
              </div>
            </div>

            <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-4 md:pt-0">
              <div className="text-left md:text-right font-mono">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Passive Points Earned</span>
                <h4 className="text-2xl font-black text-emerald-600 mt-0.5">{fantasyTeam.passive_points || 0} pts</h4>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Link
                  href={`/dashboard/team/fantasy/points-breakdown`}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-mono font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-sm"
                >
                  <Activity className="w-3 h-3" /> Breakdown Log
                </Link>

                <Link
                  href={`/dashboard/team/fantasy/change-supported-team`}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-white font-mono font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-sm"
                >
                  <RefreshCw className="w-3 h-3" /> Change Team
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Recent Performance */}
        {recentRounds.length > 0 && (
          <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-4">Recent Round Performance</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {recentRounds.map((round) => (
                <div key={round.round} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-center">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Round {round.round}</p>
                  <p className="text-xl font-black text-slate-850 mt-1">{round.points} <span className="text-[10px] text-slate-400 font-bold">PTS</span></p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Captain & Vice-Captain Summary */}
        {players.some(p => p.is_captain || p.is_vice_captain) && (
          <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">Active Captaincy Roles</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {players.find(p => p.is_captain) && (
                <div className="flex items-center gap-3.5 p-4 bg-amber-50/50 border border-amber-200 rounded-2xl shadow-sm">
                  <div className="p-2.5 bg-amber-500 border border-amber-600 text-white rounded-xl">
                    <Crown className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[9px] text-amber-700 font-bold uppercase tracking-wider">Captain (2x Points multiplier)</span>
                    <h4 className="font-extrabold text-slate-800 text-sm mt-0.5 uppercase">
                      {players.find(p => p.is_captain)?.player_name}
                    </h4>
                  </div>
                </div>
              )}
              {players.find(p => p.is_vice_captain) && (
                <div className="flex items-center gap-3.5 p-4 bg-blue-50/50 border border-blue-250 rounded-2xl shadow-sm">
                  <div className="p-2.5 bg-slate-800 border border-slate-900 text-amber-400 rounded-xl">
                    <Star className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Vice-Captain (1.5x Points fallback)</span>
                    <h4 className="font-extrabold text-slate-800 text-sm mt-0.5 uppercase">
                      {players.find(p => p.is_vice_captain)?.player_name}
                    </h4>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Players List Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <div>
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">Drafted Players Squad</h2>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Click on a player row to view match-by-match score telemetry</p>
            </div>
            <Link
              href="/dashboard/team/fantasy/all-teams"
              className="text-xs font-black text-slate-800 hover:text-amber-600 uppercase tracking-wider font-bold"
            >
              Detailed Stats →
            </Link>
          </div>

          {players.length === 0 ? (
            <div className="text-center py-16 font-mono text-slate-400 uppercase font-bold text-xs">
              No players currently drafted to your roster.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {players.map((player, index) => {
                const isExpanded = expandedPlayer === player.real_player_id;
                const stats = playerMatchStats[player.real_player_id];
                const isLoaderActive = loadingPlayerStats[player.real_player_id];

                return (
                  <div key={player.draft_id} className="transition-colors hover:bg-slate-50/40">
                    {/* Player Row Toggle */}
                    <button
                      onClick={() => loadPlayerMatchStats(player.real_player_id)}
                      className="w-full flex flex-col md:flex-row justify-between items-start md:items-center p-5 text-left transition-all gap-4"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-9 h-9 bg-slate-800 border border-slate-700 text-amber-450 rounded-xl flex items-center justify-center text-xs font-black shadow-sm shrink-0">
                          {index + 1}
                        </div>
                        <div>
                          <div className="flex items-center flex-wrap gap-2">
                            <h4 className="font-bold text-slate-900 text-sm uppercase">{player.player_name}</h4>
                            {player.is_captain && (
                              <span className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-black rounded-lg uppercase tracking-wider flex items-center gap-1">
                                <Crown className="w-3 h-3 text-amber-500 fill-amber-500" /> C
                              </span>
                            )}
                            {player.is_vice_captain && (
                              <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 text-[9px] font-black rounded-lg uppercase tracking-wider flex items-center gap-1">
                                <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> VC
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Draft order: #{player.draft_order}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end text-xs font-mono border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                        <div className="text-center">
                          <span className="text-[9px] text-slate-400 font-bold uppercase block">Total Points</span>
                          <span className="text-sm font-black text-amber-600 mt-0.5 block">{player.total_points}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-[9px] text-slate-400 font-bold uppercase block">Matches</span>
                          <span className="text-sm font-black text-slate-800 mt-0.5 block">{player.matches_played}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-[9px] text-slate-400 font-bold uppercase block">Average</span>
                          <span className="text-sm font-black text-green-600 mt-0.5 block">{player.average_points}</span>
                        </div>
                        <div className="pl-4 shrink-0 text-slate-400">
                          <svg
                            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </button>

                    {/* Expandable performance section */}
                    {isExpanded && (
                      <div className="bg-slate-50/50 border-t border-slate-100 p-6 space-y-4">
                        {isLoaderActive ? (
                          <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
                            <p className="mt-3 text-[10px] text-slate-400 font-bold uppercase">Loading match score sheets...</p>
                          </div>
                        ) : stats ? (
                          <div className="space-y-5">
                            {/* Points Grid cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                              <div className="bg-white border border-slate-200/60 p-4 rounded-xl text-center shadow-sm">
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Total Points</span>
                                <h4 className="text-lg font-black text-slate-800 mt-0.5">{stats.stats.total_points || 0}</h4>
                              </div>
                              <div className="bg-white border border-slate-200/60 p-4 rounded-xl text-center shadow-sm">
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Matchday Points</span>
                                <h4 className="text-lg font-black text-emerald-600 mt-0.5">
                                  {(stats.stats.total_points || 0) - (stats.stats.total_admin_bonus || 0)}
                                </h4>
                              </div>
                              <div className="bg-white border border-slate-200/60 p-4 rounded-xl text-center shadow-sm">
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Admin Adjustments</span>
                                <h4 className={`text-lg font-black mt-0.5 ${(stats.stats.total_admin_bonus || 0) !== 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                                  {stats.stats.total_admin_bonus || 0}
                                </h4>
                              </div>
                              <div className="bg-white border border-slate-200/60 p-4 rounded-xl text-center shadow-sm">
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Total Matches</span>
                                <h4 className="text-lg font-black text-blue-650 mt-0.5">{stats.stats.total_matches || 0}</h4>
                              </div>
                            </div>

                            {/* Admin adjustments */}
                            {stats.admin_bonuses && stats.admin_bonuses.length > 0 && (
                              <div className="space-y-2">
                                <h5 className="text-[10px] text-slate-455 font-black uppercase tracking-wider flex items-center gap-1.5">
                                  <Gift className="w-4 h-4 text-amber-500" /> Admin Adjustment Logs
                                </h5>
                                <div className="space-y-2">
                                  {stats.admin_bonuses.map((bonus) => (
                                    <div key={bonus.id} className="bg-white border border-amber-250 p-3.5 rounded-xl flex items-center justify-between shadow-sm">
                                      <div>
                                        <p className="font-bold text-slate-800 text-xs uppercase">{bonus.reason}</p>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">
                                          Awarded: {new Date(bonus.awarded_at).toLocaleDateString()}
                                        </p>
                                      </div>
                                      <span className="font-black text-amber-650 text-xs">
                                        {bonus.points > 0 ? '+' : ''}{bonus.points} Points
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Match Logs */}
                            <div className="space-y-2">
                              <h5 className="text-[10px] text-slate-455 font-black uppercase tracking-wider flex items-center gap-1.5">
                                <Award className="w-4 h-4 text-blue-500" /> Match Score Logs
                              </h5>
                              {stats.matches && stats.matches.length > 0 ? (
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                  {stats.matches.map((match, idx) => (
                                    <div key={idx} className="bg-white border border-slate-150 p-3.5 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm hover:border-slate-250 transition-colors">
                                      <div>
                                        <h5 className="font-bold text-slate-800 text-xs uppercase">Round {match.round_number}</h5>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">opponent: {match.opponent}</p>
                                      </div>
                                      
                                      <div className="flex flex-wrap gap-1.5">
                                        {match.goals_scored > 0 && (
                                          <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-250 text-emerald-700 text-[9px] font-black rounded-lg uppercase flex items-center gap-1">
                                            <SoccerBallIcon className="w-3 h-3 text-emerald-600" /> {match.goals_scored} Goals
                                          </span>
                                        )}
                                        {match.clean_sheet && (
                                          <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 text-[9px] font-black rounded-lg uppercase flex items-center gap-1">
                                            <Shield className="w-3 h-3 text-blue-600" /> Clean Sheet
                                          </span>
                                        )}
                                        {match.motm && (
                                          <span className="px-2 py-0.5 bg-amber-50 border border-amber-250 text-amber-700 text-[9px] font-black rounded-lg uppercase flex items-center gap-1">
                                            <Star className="w-3 h-3 text-amber-500 fill-amber-500" /> MOTM
                                          </span>
                                        )}
                                        {match.goals_conceded > 0 && (
                                          <span className="px-2 py-0.5 bg-rose-50 border border-rose-250 text-rose-700 text-[9px] font-black rounded-lg uppercase flex items-center gap-1">
                                            <ShieldAlert className="w-3 h-3 text-rose-600" /> {match.goals_conceded} Conceded
                                          </span>
                                        )}
                                      </div>

                                      <div className="text-right font-mono ml-auto sm:ml-0 shrink-0">
                                        <span className="text-[9px] text-slate-400 font-bold uppercase block">Match Points</span>
                                        <span className="text-sm font-black text-amber-600 mt-0.5 block">{match.total_points}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[10px] text-slate-400 font-bold uppercase italic p-4 bg-white border rounded-xl text-center shadow-sm">No matches recorded for this player.</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-400 font-bold uppercase italic text-center p-4">No performance logs retrieved.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Other Teams Section */}
        {otherTeams.length > 0 && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div>
                <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">Other League Competitors</h2>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Toggle to view standings of other squads in this league</p>
              </div>
              <button
                onClick={() => setShowOtherTeams(!showOtherTeams)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-amber-400 border border-slate-900 font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer"
              >
                {showOtherTeams ? 'Hide Standings' : `Show Competitors (${otherTeams.length})`}
              </button>
            </div>

            {showOtherTeams && (
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {otherTeams.map((team) => (
                  <div
                    key={team.id}
                    className="p-4 flex items-center justify-between hover:bg-slate-50/30 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-lg border font-black text-xs flex items-center justify-center shadow-sm ${
                        team.rank === 1 ? 'bg-amber-50 border-amber-250 text-amber-700' :
                        team.rank === 2 ? 'bg-slate-100 border-slate-200 text-slate-600' :
                        team.rank === 3 ? 'bg-orange-50 border-orange-200 text-orange-700' :
                        'bg-slate-50 border-slate-100 text-slate-450'
                      }`}>
                        #{team.rank >= 999 ? '—' : team.rank}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-xs uppercase">{team.team_name}</h4>
                        <p className="text-[9px] text-slate-455 font-bold uppercase mt-0.5">owner: {team.owner_name}</p>
                      </div>
                    </div>

                    <div className="flex gap-6 text-xs font-mono">
                      <div className="text-center">
                        <span className="text-[8px] text-slate-400 font-bold uppercase block">Points</span>
                        <span className="text-xs font-black text-amber-600 mt-0.5 block">{team.total_points}</span>
                      </div>
                      <div className="text-center">
                        <span className="text-[8px] text-slate-400 font-bold uppercase block">Squad</span>
                        <span className="text-xs font-bold text-slate-700 mt-0.5 block">{team.player_count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
