'use client';

import { SoccerBallIcon } from '@/components/ui/CustomIcons';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import { ArrowLeftRight, Award, ChevronDown, Crown, Gift, Handshake, Shield as ShieldIcon, Star, Target, TrendingUp, Trophy, XCircle, Users, Activity, Clock, AlertTriangle, CheckCircle, ArrowLeft } from 'lucide-react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface FantasyTeam {
  id: string;
  team_name: string;
  owner_name: string;
  total_points: number;
  player_count: number;
  rank: number;
  supported_team_id?: string;
  supported_team_name?: string;
  passive_points?: number;
}

interface Player {
  draft_id: string;
  real_player_id: string;
  player_name: string;
  total_points: number;
  matches_played: number;
  average_points: number;
  position?: string;
  real_team_name?: string;
  purchase_price?: number;
  is_captain?: boolean;
  is_vice_captain?: boolean;
}

export default function FantasyTeamsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [leagueId, setLeagueId] = useState<string>('');

  const [league, setLeague] = useState<any>(null);
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<FantasyTeam | null>(null);
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);

  // Transferred players state
  const [transferredPlayers, setTransferredPlayers] = useState<any[]>([]);
  const [showTransferredPlayers, setShowTransferredPlayers] = useState(false);
  const [isLoadingTransferred, setIsLoadingTransferred] = useState(false);

  // Expandable player state
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [playerData, setPlayerData] = useState<any>(null);
  const [isLoadingPlayer, setIsLoadingPlayer] = useState(false);

  // Passive points breakdown state
  const [showPassiveBreakdown, setShowPassiveBreakdown] = useState(false);
  const [passiveData, setPassiveData] = useState<any>(null);
  const [isLoadingPassive, setIsLoadingPassive] = useState(false);

  // Scoring rules from database
  const [scoringRules, setScoringRules] = useState<any>(null);

  const { alertState, showAlert, closeAlert } = useModal();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Get league ID from user's team
  useEffect(() => {
    const getLeagueId = async () => {
      if (!user) return;

      try {
        const myTeamResponse = await fetchWithTokenRefresh(`/api/fantasy/teams/my-team?user_id=${user.uid}`);
        
        if (myTeamResponse.ok) {
          const myTeamData = await myTeamResponse.json();
          setLeagueId(myTeamData.team.fantasy_league_id);
        }
      } catch (error) {
        console.error('Error getting league ID:', error);
      }
    };

    if (user) {
      getLeagueId();
    }
  }, [user]);

  // Fetch scoring rules from database
  useEffect(() => {
    const loadScoringRules = async () => {
      try {
        const response = await fetchWithTokenRefresh(`/api/fantasy/scoring-rules?league_id=${leagueId}`);
        if (response.ok) {
          const data = await response.json();
          // Convert array to object for easy lookup
          const rulesMap: any = {};
          data.rules?.forEach((rule: any) => {
            if (rule.applies_to === 'player') {
              rulesMap[rule.rule_type] = rule.points_value;
            }
          });
          setScoringRules(rulesMap);
        }
      } catch (error) {
        console.error('Error loading scoring rules:', error);
        // Fallback to default values if API fails
        setScoringRules({
          goals_scored: 2,
          clean_sheet: 6,
          motm: 5,
          win: 3,
          draw: 1,
          match_played: 1,
          hat_trick: 5,
          concedes_4_plus_goals: -3,
        });
      }
    };

    if (leagueId) {
      loadScoringRules();
    }
  }, [leagueId]);

  const loadTeamPlayers = useCallback(async (team: FantasyTeam) => {
    setSelectedTeam(team);
    setIsLoadingPlayers(true);
    setShowTransferredPlayers(false); // Reset transferred players view

    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/teams/${team.id}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        // If team not found in Firebase, show empty state gracefully
        if (response.status === 404) {
          console.log('Team has not completed draft setup yet - showing empty state');
          setTeamPlayers([]);
          return;
        }
        
        console.error('API Error:', response.status, errorData);
        throw new Error(errorData.error || 'Failed to load team players');
      }

      const data = await response.json();
      setTeamPlayers(data.players || []);
    } catch (error) {
      console.error('Error loading team players:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to load team players',
      });
      setTeamPlayers([]);
    } finally {
      setIsLoadingPlayers(false);
    }
  }, [showAlert]);

  useEffect(() => {
    const loadLeagueData = async () => {
      if (!leagueId) return;

      try {
        const response = await fetchWithTokenRefresh(`/api/fantasy/leagues/${leagueId}`);
        if (!response.ok) throw new Error('Failed to load league');

        const data = await response.json();
        setLeague(data.league);
        setTeams(data.teams || []);
        
        // Auto-select first team
        if (data.teams && data.teams.length > 0) {
          loadTeamPlayers(data.teams[0]);
        }
      } catch (error) {
        console.error('Error loading league:', error);
        showAlert({
          type: 'error',
          title: 'Error',
          message: 'Failed to load fantasy league data',
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (user && leagueId) {
      loadLeagueData();
    }
  }, [user, leagueId, loadTeamPlayers, showAlert]);

  const loadTransferredPlayers = async () => {
    if (!selectedTeam) return;

    setIsLoadingTransferred(true);

    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/teams/${selectedTeam.id}/transferred-players`);
      
      if (!response.ok) {
        throw new Error('Failed to load transferred players');
      }

      const data = await response.json();
      setTransferredPlayers(data.transferred_players || []);
    } catch (error) {
      console.error('Error loading transferred players:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to load transferred players',
      });
      setTransferredPlayers([]);
    } finally {
      setIsLoadingTransferred(false);
    }
  };

  const toggleTransferredPlayers = () => {
    if (!showTransferredPlayers && transferredPlayers.length === 0) {
      loadTransferredPlayers();
    }
    setShowTransferredPlayers(!showTransferredPlayers);
  };

  const togglePlayerBreakdown = async (playerId: string) => {
    // If clicking the same player, collapse it
    if (expandedPlayer === playerId) {
      setExpandedPlayer(null);
      setPlayerData(null);
      return;
    }

    // Expand new player
    setExpandedPlayer(playerId);
    setIsLoadingPlayer(true);
    setPlayerData(null);

    try {
      // Fetch player match details from API - pass team_id to get correct data
      const teamId = selectedTeam?.id;
      if (!teamId) {
        throw new Error('No team selected');
      }
      
      const response = await fetchWithTokenRefresh(`/api/fantasy/players/${playerId}/matches?league_id=${leagueId}&team_id=${teamId}`);
      
      if (!response.ok) {
        throw new Error('Failed to load player match data');
      }

      const data = await response.json();
      setPlayerData(data);
    } catch (error) {
      console.error('Error loading player data:', error);
      setPlayerData({ error: true });
    } finally {
      setIsLoadingPlayer(false);
    }
  };

  const togglePassiveBreakdown = async () => {
    if (showPassiveBreakdown) {
      setShowPassiveBreakdown(false);
      setPassiveData(null);
      return;
    }

    if (!selectedTeam) return;

    setShowPassiveBreakdown(true);
    setIsLoadingPassive(true);
    setPassiveData(null);

    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/teams/${selectedTeam.id}/passive-breakdown`);
      
      if (!response.ok) {
        throw new Error('Failed to load passive points breakdown');
      }

      const data = await response.json();
      setPassiveData(data);
    } catch (error) {
      console.error('Error loading passive breakdown:', error);
      setPassiveData({ error: true });
    } finally {
      setIsLoadingPassive(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold">Loading league rosters...</p>
        </div>
      </div>
    );
  }

  if (!user || !league) return null;

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <AlertModal {...alertState} onClose={closeAlert} />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Navigation */}
        <div className="flex justify-between items-center">
          <Link
            href="/dashboard/team/fantasy/my-team"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to My Team
          </Link>
        </div>

        {/* Top Header Banner */}
        <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-slate-800 border border-slate-900 rounded-2xl text-amber-400 shadow-sm shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[9px] uppercase bg-amber-500 border border-amber-600 text-slate-900 px-2.5 py-0.5 rounded-lg font-black tracking-wider w-fit">
                LEAGUE ROSTERS
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-1 uppercase">{league.name}</h1>
            </div>
          </div>
        </div>

        {/* Split Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Teams List (Columns 1-4) */}
          <div className="lg:col-span-4 flex flex-col space-y-4">
            <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
                Teams Directory ({teams.length})
              </h2>
              
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {teams.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs font-bold uppercase">
                    <Users className="w-8 h-8 text-slate-350 mx-auto mb-2" />
                    <p>No teams registered yet</p>
                  </div>
                ) : (
                  teams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => loadTeamPlayers(team)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                        selectedTeam?.id === team.id
                          ? 'bg-amber-50 border-amber-400 text-amber-950 shadow-sm'
                          : 'bg-slate-50 hover:bg-slate-100/70 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black uppercase truncate">{team.team_name}</p>
                        <p className={`text-[9px] font-bold uppercase mt-1 ${selectedTeam?.id === team.id ? 'text-amber-800' : 'text-slate-450'}`}>
                          {team.owner_name}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black">{team.total_points} pts</p>
                        <p className={`text-[8px] font-bold uppercase mt-1 ${selectedTeam?.id === team.id ? 'text-amber-700' : 'text-slate-400'}`}>
                          {team.player_count} Players
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Selected Team Roster details (Columns 5-12) */}
          <div className="lg:col-span-8 flex flex-col space-y-4">
            <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
              {selectedTeam ? (
                <div className="space-y-6">
                  {/* Team Profile Overview */}
                  <div className="pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-black text-slate-900 uppercase">{selectedTeam.team_name}</h2>
                      <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">Manager: {selectedTeam.owner_name}</p>
                    </div>

                    <div className="flex gap-4 bg-slate-50 border border-slate-200/80 p-3 rounded-2xl w-fit">
                      <div className="text-center px-2">
                        <p className="text-[8px] text-slate-400 uppercase font-black">Points</p>
                        <p className="text-sm font-black text-indigo-600 mt-0.5">{selectedTeam.total_points}</p>
                      </div>
                      <div className="w-px bg-slate-200" />
                      <div className="text-center px-2">
                        <p className="text-[8px] text-slate-400 uppercase font-black">Squad</p>
                        <p className="text-sm font-black text-slate-850 mt-0.5">{selectedTeam.player_count}</p>
                      </div>
                      <div className="w-px bg-slate-200" />
                      <div className="text-center px-2">
                        <p className="text-[8px] text-slate-400 uppercase font-black">Rank</p>
                        <p className="text-sm font-black text-slate-850 mt-0.5">#{selectedTeam.rank || '-'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Passive points support team */}
                  {selectedTeam.supported_team_name && (
                    <div>
                      <button
                        onClick={togglePassiveBreakdown}
                        className="w-full p-4 bg-slate-50 border border-slate-250 rounded-2xl transition-all hover:bg-slate-100/60 flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-800 border border-slate-900 text-amber-400 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                            <ShieldIcon className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <p className="text-[8px] text-slate-400 uppercase font-black">Supported Tournament Team</p>
                            <p className="text-xs font-black text-slate-850 uppercase mt-0.5">{selectedTeam.supported_team_name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-[8px] text-slate-450 uppercase font-bold">Passive points</p>
                            <p className="text-sm font-black text-emerald-650 mt-0.5">+{selectedTeam.passive_points || 0}</p>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showPassiveBreakdown ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {/* Passive Points Logs Breakdown */}
                      {showPassiveBreakdown && (
                        <div className="mt-2 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                          {isLoadingPassive ? (
                            <div className="flex items-center justify-center py-6">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500"></div>
                            </div>
                          ) : passiveData && passiveData.stats ? (
                            <div className="space-y-4">
                              {/* Stats Overview */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div className="bg-white border border-slate-200 p-2.5 rounded-xl text-center">
                                  <p className="text-[8px] text-slate-400 uppercase font-bold">Total Passive</p>
                                  <p className="text-xs font-black text-emerald-650 mt-0.5">{passiveData.stats.total_passive_points}</p>
                                </div>
                                <div className="bg-white border border-slate-200 p-2.5 rounded-xl text-center">
                                  <p className="text-[8px] text-slate-400 uppercase font-bold">Team Bonuses</p>
                                  <p className="text-xs font-black text-slate-800 mt-0.5">
                                    {passiveData.rounds.reduce((sum: number, r: any) => sum + (r.total_bonus || 0), 0)}
                                  </p>
                                </div>
                                <div className="bg-white border border-slate-200 p-2.5 rounded-xl text-center">
                                  <p className="text-[8px] text-slate-400 uppercase font-bold">Admin Adjustment</p>
                                  <p className="text-xs font-black text-slate-800 mt-0.5">
                                    {passiveData.admin_bonuses?.reduce((sum: number, b: any) => sum + (b.points || 0), 0) || 0}
                                  </p>
                                </div>
                                <div className="bg-white border border-slate-200 p-2.5 rounded-xl text-center col-span-2 sm:col-span-1">
                                  <p className="text-[8px] text-slate-400 uppercase font-bold">Avg/Round</p>
                                  <p className="text-xs font-black text-slate-850 mt-0.5">{passiveData.stats.average_per_round}</p>
                                </div>
                              </div>

                              {/* Admin bonuses list */}
                              {passiveData.admin_bonuses && passiveData.admin_bonuses.length > 0 && (
                                <div className="space-y-2">
                                  <h4 className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1"><Gift className="w-3 h-3 text-amber-500" /> Admin Adjustments Log</h4>
                                  <div className="space-y-1.5">
                                    {passiveData.admin_bonuses.map((bonus: any) => (
                                      <div key={bonus.id} className="border border-amber-200 bg-amber-50/20 p-3 rounded-xl flex items-center justify-between text-[10px] uppercase font-bold">
                                        <div>
                                          <p className="text-slate-800">{bonus.reason}</p>
                                          <p className="text-[8px] text-slate-400 mt-0.5">
                                            {new Date(bonus.awarded_at).toLocaleDateString()}
                                          </p>
                                        </div>
                                        <span className="text-xs font-black text-amber-700">{bonus.points > 0 ? '+' : ''}{bonus.points} pts</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Round-by-Round List */}
                              <div className="space-y-2">
                                <h4 className="text-[9px] font-black text-slate-400 uppercase">Match Round Bonuses</h4>
                                {passiveData.rounds.length === 0 ? (
                                  <p className="text-center text-slate-450 text-[10px] font-bold uppercase py-2">No passive points recorded</p>
                                ) : (
                                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                    {passiveData.rounds.map((round: any, idx: number) => (
                                      <div key={idx} className="bg-white border border-slate-200 p-3 rounded-xl flex items-center justify-between text-[10px] uppercase font-bold gap-3">
                                        <div className="flex items-center gap-2.5">
                                          <span className="w-7 h-7 bg-slate-800 text-amber-400 border border-slate-900 rounded-lg flex items-center justify-center font-black text-[10px]">
                                            R{round.round_number}
                                          </span>
                                          <div>
                                            <p className="text-slate-800">{round.real_team_name}</p>
                                          </div>
                                        </div>
                                        <span className="text-xs font-black text-emerald-650">+{round.total_bonus} pts</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : passiveData?.error ? (
                            <p className="text-center text-rose-650 text-[10px] font-bold uppercase">Failed to load passive points logs</p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Players list breakdown */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1.5">Roster Squad Members</h3>
                    {isLoadingPlayers ? (
                      <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
                        <p className="mt-3 text-xs text-slate-400 uppercase font-black">Loading roster...</p>
                      </div>
                    ) : teamPlayers.length === 0 ? (
                      <div className="text-center py-12 text-slate-400 text-xs font-bold uppercase">
                        <AlertTriangle className="w-8 h-8 text-slate-350 mx-auto mb-2" />
                        <p>No squad drafted yet</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                        {teamPlayers.map((player, index) => (
                          <div key={player.draft_id} className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                            <button
                              onClick={() => togglePlayerBreakdown(player.real_player_id)}
                              className="w-full flex items-center justify-between p-4 hover:bg-slate-50/50 transition-all text-slate-800 cursor-pointer"
                            >
                              <div className="flex items-center gap-3.5 flex-1 min-w-0">
                                <div className="w-8 h-8 bg-slate-800 text-amber-400 border border-slate-900 rounded-lg flex items-center justify-center font-black text-xs shrink-0 shadow-sm">
                                  {index + 1}
                                </div>
                                <div className="text-left min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-xs font-black uppercase truncate">{player.player_name}</p>
                                    {player.is_captain && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                                    {player.is_vice_captain && <Star className="w-3.5 h-3.5 text-slate-500 fill-slate-400" />}
                                  </div>
                                  <p className="text-[9px] font-bold text-slate-450 uppercase mt-0.5">
                                    {player.real_team_name || 'Tournament Player'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 shrink-0">
                                <div className="text-right">
                                  <p className="text-xs font-black text-indigo-650">{player.total_points} pts</p>
                                  <p className="text-[8px] text-slate-400 uppercase font-black mt-0.5">Show matches</p>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedPlayer === player.real_player_id ? 'rotate-180' : ''}`} />
                              </div>
                            </button>

                            {/* Match performance breakdown logs */}
                            {expandedPlayer === player.real_player_id && (
                              <div className="border-t border-slate-100 bg-slate-50/30 p-5 space-y-4">
                                {isLoadingPlayer ? (
                                  <div className="flex items-center justify-center py-6">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500"></div>
                                  </div>
                                ) : playerData && playerData.stats ? (
                                  <div className="space-y-4">
                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                      <div className="bg-white border border-slate-200/80 rounded-xl p-3 text-center">
                                        <TrendingUp className="w-4 h-4 text-indigo-650 mx-auto mb-1" />
                                        <p className="text-sm font-black text-indigo-600 mt-0.5">{playerData.stats?.total_points || 0}</p>
                                        <p className="text-[8px] text-slate-400 uppercase font-black mt-0.5">Total Points</p>
                                      </div>
                                      <div className="bg-white border border-slate-200/80 rounded-xl p-3 text-center">
                                        <Target className="w-4 h-4 text-emerald-650 mx-auto mb-1" />
                                        <p className="text-sm font-black text-emerald-600 mt-0.5">{playerData.stats?.total_goals || 0}</p>
                                        <p className="text-[8px] text-slate-400 uppercase font-black mt-0.5">Goals</p>
                                      </div>
                                      <div className="bg-white border border-slate-200/80 rounded-xl p-3 text-center">
                                        <ShieldIcon className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                                        <p className="text-sm font-black text-blue-600 mt-0.5">{playerData.stats?.total_clean_sheets || 0}</p>
                                        <p className="text-[8px] text-slate-400 uppercase font-black mt-0.5">Clean Sheets</p>
                                      </div>
                                      <div className="bg-white border border-slate-200/80 rounded-xl p-3 text-center">
                                        <Award className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                                        <p className="text-sm font-black text-amber-600 mt-0.5">{playerData.stats?.total_motm || 0}</p>
                                        <p className="text-[8px] text-slate-400 uppercase font-black mt-0.5">MOTM Star</p>
                                      </div>
                                    </div>

                                    {/* Summary Stats footer row */}
                                    <div className="bg-white border border-slate-200 rounded-xl p-3 grid grid-cols-4 gap-2 text-center text-[10px] font-bold uppercase text-slate-500">
                                      <div>
                                        <p className="text-[8px] text-slate-400">Games</p>
                                        <p className="font-black text-slate-850 mt-0.5">{playerData.stats?.total_matches || 0}</p>
                                      </div>
                                      <div>
                                        <p className="text-[8px] text-slate-400">Avg Pts</p>
                                        <p className="font-black text-indigo-650 mt-0.5">{playerData.stats?.average_points || 0}</p>
                                      </div>
                                      <div>
                                        <p className="text-[8px] text-slate-400">Best</p>
                                        <p className="font-black text-emerald-650 mt-0.5">{playerData.stats.best_performance} pts</p>
                                      </div>
                                      <div>
                                        <p className="text-[8px] text-slate-400">Bonus</p>
                                        <p className="font-black text-amber-750 mt-0.5">{playerData.stats.total_bonus_points} pts</p>
                                      </div>
                                    </div>

                                    {/* Admin Adjustments Log for Player */}
                                    {playerData.admin_bonuses && playerData.admin_bonuses.length > 0 && (
                                      <div className="space-y-2">
                                        <h4 className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1"><Gift className="w-3 h-3 text-amber-500" /> Admin Adjustments Log</h4>
                                        <div className="space-y-1.5">
                                          {playerData.admin_bonuses.map((bonus: any) => (
                                            <div key={bonus.id} className="border border-amber-250 bg-amber-50/20 p-3 rounded-xl flex items-center justify-between text-[10px] uppercase font-bold">
                                              <div>
                                                <p className="text-slate-800">{bonus.reason}</p>
                                                <p className="text-[8px] text-slate-400 mt-0.5">
                                                  {new Date(bonus.awarded_at).toLocaleDateString()}
                                                </p>
                                              </div>
                                              <span className="text-xs font-black text-amber-700">{bonus.points > 0 ? '+' : ''}{bonus.points} pts</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Match History */}
                                    <div className="space-y-2">
                                      <h4 className="text-[9px] font-black text-slate-400 uppercase">Match History</h4>
                                      {playerData.matches.length === 0 ? (
                                        <p className="text-center text-slate-450 text-[10px] font-bold uppercase py-2">No match performance logged</p>
                                      ) : (
                                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                          {playerData.matches.map((match: any, idx: number) => {
                                            if (!scoringRules) return null;
                                            
                                            const playerGoals = match.goals_scored || 0;
                                            const opponentGoals = match.goals_conceded || 0;
                                            const won = playerGoals > opponentGoals;
                                            const draw = playerGoals === opponentGoals;
                                            const actualResult = won ? 'win' : draw ? 'draw' : 'loss';
                                            
                                            const goalPoints = playerGoals * (scoringRules.goals_scored || 0);
                                            const cleanSheetPoints = match.clean_sheet ? (scoringRules.clean_sheet || 0) : 0;
                                            const motmPoints = match.motm ? (scoringRules.motm || 0) : 0;
                                            const resultPoints = won ? (scoringRules.win || 0) : draw ? (scoringRules.draw || 0) : 0;
                                            const appearancePoints = scoringRules.match_played || 0;
                                            const hatTrickPoints = (playerGoals >= 3 && scoringRules.hat_trick) ? scoringRules.hat_trick : 0;
                                            const concedePoints = (opponentGoals >= 4 && scoringRules.concedes_4_plus_goals) ? scoringRules.concedes_4_plus_goals : 0;
                                            
                                            const basePoints = goalPoints + cleanSheetPoints + motmPoints + resultPoints + appearancePoints + hatTrickPoints + concedePoints;
                                            const multiplierValue = match.points_multiplier || 100;
                                            const multiplier = multiplierValue >= 100 ? multiplierValue / 100 : multiplierValue;
                                            const totalPoints = Math.round(basePoints * multiplier);

                                            return (
                                              <div key={idx} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                                {/* Header */}
                                                <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-slate-50/50 text-[10px] uppercase font-bold">
                                                  <div className="flex items-center gap-2">
                                                    <span className="w-7 h-7 bg-slate-800 text-amber-400 border border-slate-900 rounded-lg flex items-center justify-center font-black">
                                                      R{match.round_number}
                                                    </span>
                                                    <div>
                                                      <p className="text-slate-850 font-black truncate max-w-[120px] sm:max-w-[200px]">
                                                        {match.opponent_name || 'Opponent'}
                                                      </p>
                                                      <p className="text-[8px] text-slate-450 mt-0.5 flex items-center gap-1">
                                                        {actualResult === 'win' ? (
                                                          <span className="text-emerald-600 font-extrabold">WIN</span>
                                                        ) : actualResult === 'draw' ? (
                                                          <span className="text-slate-500 font-extrabold">DRAW</span>
                                                        ) : (
                                                          <span className="text-rose-600 font-extrabold">LOSS</span>
                                                        )}
                                                        <span>• {playerGoals} - {opponentGoals}</span>
                                                      </p>
                                                    </div>
                                                  </div>
                                                  <div className="text-right">
                                                    <p className="text-sm font-black text-indigo-650">{totalPoints} pts</p>
                                                  </div>
                                                </div>

                                                {/* Breakdown */}
                                                <div className="p-3 grid grid-cols-2 gap-1.5 text-[9px] font-bold uppercase text-slate-600">
                                                  {goalPoints !== 0 && (
                                                    <div className="flex items-center justify-between bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                                      <span className="flex items-center gap-1"><Target className="w-3 h-3 text-emerald-650" /> Goals ({match.goals_scored})</span>
                                                      <span className="font-black text-slate-800">+{goalPoints}</span>
                                                    </div>
                                                  )}
                                                  {hatTrickPoints !== 0 && (
                                                    <div className="flex items-center justify-between bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                                      <span>Bonus Hat-trick</span>
                                                      <span className="font-black text-slate-800">+{hatTrickPoints}</span>
                                                    </div>
                                                  )}
                                                  {cleanSheetPoints !== 0 && (
                                                    <div className="flex items-center justify-between bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                                      <span className="flex items-center gap-1"><ShieldIcon className="w-3 h-3 text-blue-600" /> Clean Sheet</span>
                                                      <span className="font-black text-slate-800">+{cleanSheetPoints}</span>
                                                    </div>
                                                  )}
                                                  {concedePoints !== 0 && (
                                                    <div className="flex items-center justify-between bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                                      <span>Conceded 4+ goals</span>
                                                      <span className="font-black text-rose-600">{concedePoints}</span>
                                                    </div>
                                                  )}
                                                  {motmPoints !== 0 && (
                                                    <div className="flex items-center justify-between bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                                      <span className="flex items-center gap-1"><Award className="w-3 h-3 text-amber-500" /> MOTM Star</span>
                                                      <span className="font-black text-slate-800">+{motmPoints}</span>
                                                    </div>
                                                  )}
                                                  {resultPoints !== 0 && (
                                                    <div className="flex items-center justify-between bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                                      <span>Team Result</span>
                                                      <span className="font-black text-slate-800">+{resultPoints}</span>
                                                    </div>
                                                  )}
                                                  {appearancePoints !== 0 && (
                                                    <div className="flex items-center justify-between bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                                      <span className="flex items-center gap-1"><SoccerBallIcon className="w-3.5 h-3.5" /> Appearance</span>
                                                      <span className="font-black text-slate-800">+{appearancePoints}</span>
                                                    </div>
                                                  )}
                                                  {multiplier !== 1 && (
                                                    <div className="flex items-center justify-between bg-slate-50 px-2 py-1 rounded border border-slate-100 col-span-2">
                                                      <span className="flex items-center gap-1">
                                                        {multiplierValue === 200 || multiplier === 2 ? (
                                                          <><Crown className="w-3 h-3 text-amber-500" /> Captain Multiplier</>
                                                        ) : (
                                                          <><Star className="w-3 h-3 text-slate-400" /> VC Multiplier</>
                                                        )}
                                                      </span>
                                                      <span className="font-black text-indigo-650">x{multiplier}</span>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-center text-rose-600 text-[10px] font-bold uppercase py-2">Failed to load player matches</p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Transferred Players Section */}
                  {selectedTeam && (
                    <div className="pt-4 border-t border-slate-100">
                      <button
                        onClick={toggleTransferredPlayers}
                        className="w-full p-4 bg-slate-50 border border-slate-250 rounded-2xl transition-all hover:bg-slate-100/60 flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-800 border border-slate-900 text-amber-400 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                            <ArrowLeftRight className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <p className="text-xs font-black text-slate-950 uppercase">Transferred Out Players</p>
                            <p className="text-[9px] text-slate-455 font-bold uppercase mt-0.5">View players who left this squad</p>
                          </div>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showTransferredPlayers ? 'rotate-180' : ''}`} />
                      </button>

                      {showTransferredPlayers && (
                        <div className="mt-2 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
                          {isLoadingTransferred ? (
                            <div className="text-center py-6">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500 mx-auto"></div>
                            </div>
                          ) : transferredPlayers.length === 0 ? (
                            <p className="text-center text-slate-450 text-[10px] font-bold uppercase py-2">No players have been released yet</p>
                          ) : (
                            <div className="space-y-1.5">
                              {transferredPlayers.map((player: any, index: number) => (
                                <div key={`transferred-${player.player_id}-${index}`} className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between text-[10px] uppercase font-bold gap-3 shadow-sm">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-slate-800 text-amber-400 border border-slate-900 rounded-lg flex items-center justify-center font-black">
                                      <ArrowLeftRight className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <p className="text-slate-850 font-black">{player.player_name}</p>
                                      <p className="text-[8px] text-slate-450 mt-0.5">
                                        Transferred: {new Date(player.transferred_at).toLocaleDateString()}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs font-black text-orange-655">{player.total_points} pts</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400 text-xs font-bold uppercase">
                  <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p>Select a team from the directory to view roster</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}