'use client';

import { SoccerBallIcon } from '@/components/ui/CustomIcons';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import {
  ArrowLeftRight, Award, ChevronDown, Crown, Gift, Handshake,
  Shield as ShieldIcon, Star, Target, TrendingUp, Trophy, XCircle,
  Users, Activity, Clock, AlertTriangle, CheckCircle, ArrowLeft
} from 'lucide-react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

/* ── Types ─────────────────────────────────────────────────────────────────── */

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

/* ── Page ──────────────────────────────────────────────────────────────────── */

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

  const [transferredPlayers, setTransferredPlayers] = useState<any[]>([]);
  const [showTransferredPlayers, setShowTransferredPlayers] = useState(false);
  const [isLoadingTransferred, setIsLoadingTransferred] = useState(false);

  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [playerData, setPlayerData] = useState<any>(null);
  const [isLoadingPlayer, setIsLoadingPlayer] = useState(false);

  const [showPassiveBreakdown, setShowPassiveBreakdown] = useState(false);
  const [passiveData, setPassiveData] = useState<any>(null);
  const [isLoadingPassive, setIsLoadingPassive] = useState(false);

  const [scoringRules, setScoringRules] = useState<any>(null);

  const { alertState, showAlert, closeAlert } = useModal();

  /* ── Auth ──────────────────────────────────────────────────────────────── */

  /* ── Get league ID ─────────────────────────────────────────────────────── */

  useEffect(() => {
    const getLeagueId = async () => {
      if (!user) return;
      try {
        const res = await fetchWithTokenRefresh(`/api/fantasy/teams/my-team?user_id=${user.uid}`);
        if (res.ok) {
          const data = await res.json();
          setLeagueId(data.team.fantasy_league_id);
        }
      } catch (e) { console.error('Error getting league ID:', e); }
    };
    if (user) getLeagueId();
  }, [user]);

  /* ── Scoring rules ─────────────────────────────────────────────────────── */

  useEffect(() => {
    const load = async () => {
      if (!leagueId) return;
      try {
        const res = await fetchWithTokenRefresh(`/api/fantasy/scoring-rules?league_id=${leagueId}`);
        if (res.ok) {
          const data = await res.json();
          const map: any = {};
          data.rules?.forEach((r: any) => { if (r.applies_to === 'player') map[r.rule_type] = r.points_value; });
          setScoringRules(map);
        }
      } catch { setScoringRules({ goals_scored: 2, clean_sheet: 6, motm: 5, win: 3, draw: 1, match_played: 1, hat_trick: 5, concedes_4_plus_goals: -3 }); }
    };
    load();
  }, [leagueId]);

  /* ── Load team players ─────────────────────────────────────────────────── */

  const loadTeamPlayers = useCallback(async (team: FantasyTeam) => {
    setSelectedTeam(team);
    setIsLoadingPlayers(true);
    setShowTransferredPlayers(false);
    try {
      const res = await fetchWithTokenRefresh(`/api/fantasy/teams/${team.id}`);
      if (!res.ok) {
        if (res.status === 404) { setTeamPlayers([]); return; }
        throw new Error((await res.json().catch(() => ({ error: 'Unknown' }))).error);
      }
      setTeamPlayers((await res.json()).players || []);
    } catch (e) {
      showAlert({ type: 'error', title: 'Error', message: e instanceof Error ? e.message : 'Failed to load team players' });
      setTeamPlayers([]);
    } finally { setIsLoadingPlayers(false); }
  }, [showAlert]);

  /* ── Load league data ──────────────────────────────────────────────────── */

  useEffect(() => {
    const load = async () => {
      if (!leagueId) return;
      try {
        const res = await fetchWithTokenRefresh(`/api/fantasy/leagues/${leagueId}`);
        if (!res.ok) throw new Error('Failed to load league');
        const data = await res.json();
        setLeague(data.league);
        setTeams(data.teams || []);
        if (data.teams?.length > 0) loadTeamPlayers(data.teams[0]);
      } catch (e) {
        showAlert({ type: 'error', title: 'Error', message: 'Failed to load fantasy league data' });
      } finally { setIsLoading(false); }
    };
    if (user && leagueId) load();
  }, [user, leagueId, loadTeamPlayers, showAlert]);

  /* ── Transferred players ───────────────────────────────────────────────── */

  const loadTransferredPlayers = async () => {
    if (!selectedTeam) return;
    setIsLoadingTransferred(true);
    try {
      const res = await fetchWithTokenRefresh(`/api/fantasy/teams/${selectedTeam.id}/transferred-players`);
      if (!res.ok) throw new Error('Failed to load transferred players');
      setTransferredPlayers((await res.json()).transferred_players || []);
    } catch {
      showAlert({ type: 'error', title: 'Error', message: 'Failed to load transferred players' });
      setTransferredPlayers([]);
    } finally { setIsLoadingTransferred(false); }
  };

  const toggleTransferredPlayers = () => {
    if (!showTransferredPlayers && transferredPlayers.length === 0) loadTransferredPlayers();
    setShowTransferredPlayers(!showTransferredPlayers);
  };

  /* ── Player breakdown ──────────────────────────────────────────────────── */

  const togglePlayerBreakdown = async (playerId: string) => {
    if (expandedPlayer === playerId) { setExpandedPlayer(null); setPlayerData(null); return; }
    setExpandedPlayer(playerId);
    setIsLoadingPlayer(true);
    setPlayerData(null);
    try {
      const teamId = selectedTeam?.id;
      if (!teamId) throw new Error('No team selected');
      const res = await fetchWithTokenRefresh(`/api/fantasy/players/${playerId}/matches?league_id=${leagueId}&team_id=${teamId}`);
      if (!res.ok) throw new Error('Failed to load player match data');
      setPlayerData(await res.json());
    } catch { setPlayerData({ error: true }); }
    finally { setIsLoadingPlayer(false); }
  };

  /* ── Passive breakdown ─────────────────────────────────────────────────── */

  const togglePassiveBreakdown = async () => {
    if (showPassiveBreakdown) { setShowPassiveBreakdown(false); setPassiveData(null); return; }
    if (!selectedTeam) return;
    setShowPassiveBreakdown(true);
    setIsLoadingPassive(true);
    setPassiveData(null);
    try {
      const res = await fetchWithTokenRefresh(`/api/fantasy/teams/${selectedTeam.id}/passive-breakdown`);
      if (!res.ok) throw new Error('Failed to load passive points breakdown');
      setPassiveData(await res.json());
    } catch { setPassiveData({ error: true }); }
    finally { setIsLoadingPassive(false); }
  };

  /* ── Loading / Empty states ────────────────────────────────────────────── */

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto" />
          <p className="mt-3 text-xs text-slate-500 uppercase tracking-wider font-bold">Loading league rosters…</p>
        </div>
      </div>
    );
  }

  if (!user || !league) return null;

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <AuthGuard requiredRole="team">
    <div className="min-h-screen bg-slate-50 relative pb-12">
      <AlertModal {...alertState} onClose={closeAlert} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 lg:pt-24 space-y-5">
        {/* Navigation */}
        <Link
          href="/dashboard/team/fantasy/my-team"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to My Team
        </Link>

        {/* Header */}
        <div className="bg-white border border-slate-200/60 p-4 sm:p-6 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 sm:p-3 bg-slate-800 border border-slate-900 rounded-xl text-amber-400 shadow-sm shrink-0">
              <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="text-[9px] uppercase bg-amber-500 border border-amber-600 text-slate-900 px-2 py-0.5 rounded-lg font-black tracking-wider w-fit">
                LEAGUE ROSTERS
              </div>
              <h1 className="text-lg sm:text-2xl font-black text-slate-900 mt-1 uppercase">{league.name}</h1>
            </div>
          </div>
        </div>

        {/* ── Split Section ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

          {/* ── Teams List ──────────────────────────────────────────── */}
          <div className="lg:col-span-4">
            <div className="bg-white border border-slate-200/60 p-4 sm:p-5 rounded-2xl shadow-sm">
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-3 border-b border-slate-100 pb-2">
                Teams Directory ({teams.length})
              </h2>
              <div className="space-y-2 max-h-[400px] lg:max-h-[500px] overflow-y-auto pr-1">
                {teams.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs font-bold uppercase">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p>No teams registered yet</p>
                  </div>
                ) : teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => loadTeamPlayers(team)}
                    className={`w-full text-left p-3 sm:p-4 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                      selectedTeam?.id === team.id
                        ? 'bg-amber-50 border-amber-400 text-amber-950 shadow-sm'
                        : 'bg-slate-50 hover:bg-slate-100/70 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black uppercase truncate">{team.team_name}</p>
                      <p className={`text-[9px] font-bold uppercase mt-0.5 truncate ${selectedTeam?.id === team.id ? 'text-amber-800' : 'text-slate-400'}`}>
                        {team.owner_name}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black">{team.total_points} pts</p>
                      <p className={`text-[8px] font-bold uppercase mt-0.5 ${selectedTeam?.id === team.id ? 'text-amber-700' : 'text-slate-400'}`}>
                        {team.player_count} Players
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Roster Panel ────────────────────────────────────────── */}
          <div className="lg:col-span-8">
            <div className="bg-white border border-slate-200/60 p-4 sm:p-5 rounded-2xl shadow-sm">
              {selectedTeam ? (
                <RosterPanel
                  team={selectedTeam}
                  players={teamPlayers}
                  isLoadingPlayers={isLoadingPlayers}
                  expandedPlayer={expandedPlayer}
                  isLoadingPlayer={isLoadingPlayer}
                  playerData={playerData}
                  scoringRules={scoringRules}
                  onTogglePlayer={togglePlayerBreakdown}
                  showTransferredPlayers={showTransferredPlayers}
                  transferredPlayers={transferredPlayers}
                  isLoadingTransferred={isLoadingTransferred}
                  onToggleTransferred={toggleTransferredPlayers}
                  showPassiveBreakdown={showPassiveBreakdown}
                  passiveData={passiveData}
                  isLoadingPassive={isLoadingPassive}
                  onTogglePassive={togglePassiveBreakdown}
                />
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
  
    </AuthGuard>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   RosterPanel — selected team detail
   ════════════════════════════════════════════════════════════════════════════ */

function RosterPanel({
  team, players, isLoadingPlayers,
  expandedPlayer, isLoadingPlayer, playerData, scoringRules, onTogglePlayer,
  showTransferredPlayers, transferredPlayers, isLoadingTransferred, onToggleTransferred,
  showPassiveBreakdown, passiveData, isLoadingPassive, onTogglePassive,
}: {
  team: FantasyTeam;
  players: Player[];
  isLoadingPlayers: boolean;
  expandedPlayer: string | null;
  isLoadingPlayer: boolean;
  playerData: any;
  scoringRules: any;
  onTogglePlayer: (id: string) => void;
  showTransferredPlayers: boolean;
  transferredPlayers: any[];
  isLoadingTransferred: boolean;
  onToggleTransferred: () => void;
  showPassiveBreakdown: boolean;
  passiveData: any;
  isLoadingPassive: boolean;
  onTogglePassive: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Team Profile Overview */}
      <div className="pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-black text-slate-900 uppercase">{team.team_name}</h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">Manager: {team.owner_name}</p>
        </div>
        <div className="flex gap-3 sm:gap-4 bg-slate-50 border border-slate-200 p-2.5 sm:p-3 rounded-xl w-fit">
          <StatBadge label="Points" value={team.total_points} color="text-indigo-600" />
          <div className="w-px bg-slate-200" />
          <StatBadge label="Squad" value={team.player_count} color="text-slate-800" />
          <div className="w-px bg-slate-200" />
          <StatBadge label="Rank" value={`#${team.rank || '-'}`} color="text-slate-800" />
        </div>
      </div>

      {/* Passive points */}
      {team.supported_team_name && (
        <PassiveBreakdown
          team={team}
          show={showPassiveBreakdown}
          data={passiveData}
          isLoading={isLoadingPassive}
          onToggle={onTogglePassive}
        />
      )}

      {/* Players roster */}
      <PlayersRoster
        players={players}
        isLoading={isLoadingPlayers}
        expandedPlayer={expandedPlayer}
        isLoadingPlayer={isLoadingPlayer}
        playerData={playerData}
        scoringRules={scoringRules}
        onToggle={onTogglePlayer}
      />

      {/* Transferred Players */}
      <div className="pt-3 border-t border-slate-100">
        <button
          onClick={onToggleTransferred}
          className="w-full p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-xl transition-all hover:bg-slate-100/60 flex items-center justify-between gap-3 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-800 border border-slate-900 text-amber-400 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
              <ArrowLeftRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-black text-slate-900 uppercase">Transferred Out Players</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">View players who left this squad</p>
            </div>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showTransferredPlayers ? 'rotate-180' : ''}`} />
        </button>

        {showTransferredPlayers && (
          <div className="mt-2 p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            {isLoadingTransferred ? (
              <div className="text-center py-5">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500 mx-auto" />
              </div>
            ) : transferredPlayers.length === 0 ? (
              <p className="text-center text-slate-400 text-[10px] font-bold uppercase py-2">No players have been released yet</p>
            ) : (
              <div className="space-y-1.5">
                {transferredPlayers.map((p: any, idx: number) => (
                  <div key={`tr-${p.player_id}-${idx}`} className="bg-white border border-slate-200 p-3 rounded-xl flex items-center justify-between text-[10px] uppercase font-bold gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 bg-slate-800 text-amber-400 border border-slate-900 rounded-lg flex items-center justify-center shrink-0">
                        <ArrowLeftRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-slate-800 font-black truncate">{p.player_name}</p>
                        <p className="text-[8px] text-slate-400 mt-0.5">
                          Transferred: {new Date(p.transferred_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-black text-orange-500 shrink-0">{p.total_points} pts</span>
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

/* ════════════════════════════════════════════════════════════════════════════
   Sub-components
   ════════════════════════════════════════════════════════════════════════════ */

function StatBadge({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="text-center px-1.5 sm:px-2">
      <p className="text-[8px] text-slate-400 uppercase font-black">{label}</p>
      <p className={`text-sm font-black ${color} mt-0.5`}>{value}</p>
    </div>
  );
}

/* ── Passive Breakdown ─────────────────────────────────────────────────────── */

function PassiveBreakdown({ team, show, data, isLoading, onToggle }: {
  team: FantasyTeam; show: boolean; data: any; isLoading: boolean; onToggle: () => void;
}) {
  return (
    <div>
      <button onClick={onToggle}
        className="w-full p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-xl transition-all hover:bg-slate-100/60 flex items-center justify-between gap-3 cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-800 border border-slate-900 text-amber-400 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
            <ShieldIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-[8px] text-slate-400 uppercase font-black">Supported Tournament Team</p>
            <p className="text-xs font-black text-slate-800 uppercase mt-0.5 truncate">{team.supported_team_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="text-right">
            <p className="text-[8px] text-slate-400 uppercase font-bold">Passive points</p>
            <p className="text-sm font-black text-emerald-600 mt-0.5">+{team.passive_points || 0}</p>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${show ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {show && (
        <div className="mt-2 p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-5">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500" />
            </div>
          ) : data?.stats ? (
            <div className="space-y-3">
              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <MiniCard label="Total Passive" value={data.stats.total_passive_points} color="text-emerald-600" />
                <MiniCard label="Team Bonuses" value={data.rounds.reduce((s: number, r: any) => s + (r.total_bonus || 0), 0)} />
                <MiniCard label="Admin Adj." value={data.admin_bonuses?.reduce((s: number, b: any) => s + (b.points || 0), 0) || 0} />
                <MiniCard label="Avg/Round" value={data.stats.average_per_round} />
              </div>

              {/* Admin bonuses */}
              {data.admin_bonuses?.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                    <Gift className="w-3 h-3 text-amber-500" /> Admin Adjustments Log
                  </h4>
                  {data.admin_bonuses.map((b: any) => (
                    <div key={b.id} className="border border-amber-200 bg-amber-50/20 p-2.5 rounded-xl flex items-center justify-between text-[10px] uppercase font-bold gap-2">
                      <div className="min-w-0">
                        <p className="text-slate-800 truncate">{b.reason}</p>
                        <p className="text-[8px] text-slate-400 mt-0.5">{new Date(b.awarded_at).toLocaleDateString()}</p>
                      </div>
                      <span className="text-xs font-black text-amber-700 shrink-0">{b.points > 0 ? '+' : ''}{b.points} pts</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Round bonuses */}
              <div className="space-y-1.5">
                <h4 className="text-[9px] font-black text-slate-400 uppercase">Match Round Bonuses</h4>
                {data.rounds.length === 0 ? (
                  <p className="text-center text-slate-400 text-[10px] font-bold uppercase py-2">No passive points recorded</p>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {data.rounds.map((r: any, idx: number) => (
                      <div key={idx} className="bg-white border border-slate-200 p-2.5 rounded-xl flex items-center justify-between text-[10px] uppercase font-bold gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-7 h-7 bg-slate-800 text-amber-400 border border-slate-900 rounded-lg flex items-center justify-center font-black text-[10px] shrink-0">
                            R{r.round_number}
                          </span>
                          <p className="text-slate-800 truncate">{r.real_team_name}</p>
                        </div>
                        <span className="text-xs font-black text-emerald-600 shrink-0">+{r.total_bonus} pts</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : data?.error ? (
            <p className="text-center text-rose-500 text-[10px] font-bold uppercase">Failed to load passive points logs</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ── Players Roster ────────────────────────────────────────────────────────── */

function PlayersRoster({ players, isLoading, expandedPlayer, isLoadingPlayer, playerData, scoringRules, onToggle }: {
  players: Player[]; isLoading: boolean; expandedPlayer: string | null; isLoadingPlayer: boolean;
  playerData: any; scoringRules: any; onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1.5">Roster Squad Members</h3>
      {isLoading ? (
        <div className="text-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto" />
          <p className="mt-3 text-xs text-slate-400 uppercase font-bold">Loading roster…</p>
        </div>
      ) : players.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-xs font-bold uppercase">
          <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p>No squad drafted yet</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {players.map((player, idx) => (
            <div key={player.draft_id} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <button
                onClick={() => onToggle(player.real_player_id)}
                className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-slate-50/50 transition-all text-slate-800 cursor-pointer gap-2"
              >
                <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 bg-slate-800 text-amber-400 border border-slate-900 rounded-lg flex items-center justify-center font-black text-[10px] sm:text-xs shrink-0 shadow-sm">
                    {idx + 1}
                  </div>
                  <div className="text-left min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <p className="text-xs font-black uppercase truncate">{player.player_name}</p>
                      {player.is_captain && <Crown className="w-3 h-3 text-amber-500 shrink-0" />}
                      {player.is_vice_captain && <Star className="w-3 h-3 text-slate-400 fill-slate-300 shrink-0" />}
                    </div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5 truncate">
                      {player.real_team_name || 'Tournament Player'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs font-black text-indigo-600">{player.total_points} pts</p>
                    <p className="text-[8px] text-slate-400 uppercase font-bold mt-0.5">Show matches</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedPlayer === player.real_player_id ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {/* Expanded player detail */}
              {expandedPlayer === player.real_player_id && (
                <PlayerExpandedDetail
                  isLoading={isLoadingPlayer}
                  data={playerData}
                  scoringRules={scoringRules}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Player Expanded Detail ────────────────────────────────────────────────── */

function PlayerExpandedDetail({ isLoading, data, scoringRules }: {
  isLoading: boolean; data: any; scoringRules: any;
}) {
  return (
    <div className="border-t border-slate-100 bg-slate-50/30 p-3 sm:p-4 space-y-3">
      {isLoading ? (
        <div className="flex items-center justify-center py-5">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500" />
        </div>
      ) : data?.stats ? (
        <div className="space-y-3">
          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <PlayerStatCard icon={<TrendingUp className="w-4 h-4 text-indigo-500" />} value={data.stats?.total_points || 0} label="Total Points" color="text-indigo-600" />
            <PlayerStatCard icon={<Target className="w-4 h-4 text-emerald-500" />} value={data.stats?.total_goals || 0} label="Goals" color="text-emerald-600" />
            <PlayerStatCard icon={<ShieldIcon className="w-4 h-4 text-blue-500" />} value={data.stats?.total_clean_sheets || 0} label="Clean Sheets" color="text-blue-600" />
            <PlayerStatCard icon={<Award className="w-4 h-4 text-amber-500" />} value={data.stats?.total_motm || 0} label="MOTM Star" color="text-amber-600" />
          </div>

          {/* Summary row */}
          <div className="bg-white border border-slate-200 rounded-xl p-2.5 grid grid-cols-4 gap-2 text-center text-[10px] font-bold uppercase text-slate-500">
            <div>
              <p className="text-[8px] text-slate-400">Games</p>
              <p className="font-black text-slate-800 mt-0.5">{data.stats?.total_matches || 0}</p>
            </div>
            <div>
              <p className="text-[8px] text-slate-400">Avg Pts</p>
              <p className="font-black text-indigo-600 mt-0.5">{data.stats?.average_points || 0}</p>
            </div>
            <div>
              <p className="text-[8px] text-slate-400">Best</p>
              <p className="font-black text-emerald-600 mt-0.5">{data.stats?.best_performance || 0} pts</p>
            </div>
            <div>
              <p className="text-[8px] text-slate-400">Bonus</p>
              <p className="font-black text-amber-600 mt-0.5">{data.stats?.total_bonus_points || 0} pts</p>
            </div>
          </div>

          {/* Admin adjustments */}
          {data.admin_bonuses?.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                <Gift className="w-3 h-3 text-amber-500" /> Admin Adjustments Log
              </h4>
              {data.admin_bonuses.map((b: any) => (
                <div key={b.id} className="border border-amber-200 bg-amber-50/20 p-2.5 rounded-xl flex items-center justify-between text-[10px] uppercase font-bold gap-2">
                  <div className="min-w-0">
                    <p className="text-slate-800 truncate">{b.reason}</p>
                    <p className="text-[8px] text-slate-400 mt-0.5">{new Date(b.awarded_at).toLocaleDateString()}</p>
                  </div>
                  <span className="text-xs font-black text-amber-700 shrink-0">{b.points > 0 ? '+' : ''}{b.points} pts</span>
                </div>
              ))}
            </div>
          )}

          {/* Match history */}
          <div className="space-y-1.5">
            <h4 className="text-[9px] font-black text-slate-400 uppercase">Match History</h4>
            {!data.matches?.length ? (
              <p className="text-center text-slate-400 text-[10px] font-bold uppercase py-2">No match performance logged</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {data.matches.map((match: any, idx: number) => (
                  <MatchCard key={idx} match={match} scoringRules={scoringRules} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-center text-rose-500 text-[10px] font-bold uppercase py-2">Failed to load player matches</p>
      )}
    </div>
  );
}

/* ── Match Card ────────────────────────────────────────────────────────────── */

function MatchCard({ match, scoringRules }: { match: any; scoringRules: any }) {
  if (!scoringRules) return null;

  const playerGoals = match.goals_scored || 0;
  const opponentGoals = match.goals_conceded || 0;
  const won = playerGoals > opponentGoals;
  const draw = playerGoals === opponentGoals;
  const actualResult = won ? 'win' : draw ? 'draw' : 'loss';

  const goalPts = playerGoals * (scoringRules.goals_scored || 0);
  const csPts = match.clean_sheet ? (scoringRules.clean_sheet || 0) : 0;
  const motmPts = match.motm ? (scoringRules.motm || 0) : 0;
  const resultPts = won ? (scoringRules.win || 0) : draw ? (scoringRules.draw || 0) : 0;
  const appPts = scoringRules.match_played || 0;
  const htPts = (playerGoals >= 3 && scoringRules.hat_trick) ? scoringRules.hat_trick : 0;
  const concPts = (opponentGoals >= 4 && scoringRules.concedes_4_plus_goals) ? scoringRules.concedes_4_plus_goals : 0;

  const basePoints = goalPts + csPts + motmPts + resultPts + appPts + htPts + concPts;
  const multiplierValue = match.points_multiplier || 100;
  const multiplier = multiplierValue >= 100 ? multiplierValue / 100 : multiplierValue;
  const totalPoints = Math.round(basePoints * multiplier);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-2.5 sm:p-3 border-b border-slate-100 bg-slate-50/50 text-[10px] uppercase font-bold gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 bg-slate-800 text-amber-400 border border-slate-900 rounded-lg flex items-center justify-center font-black text-[10px] shrink-0">
            R{match.round_number}
          </span>
          <div className="min-w-0">
            <p className="text-slate-800 font-black truncate">{match.opponent_name || 'Opponent'}</p>
            <p className="text-[8px] text-slate-400 mt-0.5 flex items-center gap-1">
              <span className={
                actualResult === 'win' ? 'text-emerald-600 font-extrabold'
                  : actualResult === 'draw' ? 'text-slate-500 font-extrabold'
                  : 'text-rose-500 font-extrabold'
              }>{actualResult.toUpperCase()}</span>
              <span>• {playerGoals} - {opponentGoals}</span>
            </p>
          </div>
        </div>
        <span className="text-sm font-black text-indigo-600 shrink-0">{totalPoints} pts</span>
      </div>

      {/* Breakdown */}
      <div className="p-2.5 grid grid-cols-2 gap-1.5 text-[9px] font-bold uppercase text-slate-600">
        {goalPts !== 0 && <BreakdownBadge icon={<Target className="w-3 h-3 text-emerald-500" />} label={`Goals (${match.goals_scored})`} pts={`+${goalPts}`} />}
        {htPts !== 0 && <BreakdownBadge label="Bonus Hat-trick" pts={`+${htPts}`} />}
        {csPts !== 0 && <BreakdownBadge icon={<ShieldIcon className="w-3 h-3 text-blue-500" />} label="Clean Sheet" pts={`+${csPts}`} />}
        {concPts !== 0 && <BreakdownBadge label="Conceded 4+ goals" pts={`${concPts}`} ptsColor="text-rose-500" />}
        {motmPts !== 0 && <BreakdownBadge icon={<Award className="w-3 h-3 text-amber-500" />} label="MOTM Star" pts={`+${motmPts}`} />}
        {resultPts !== 0 && <BreakdownBadge label="Team Result" pts={`+${resultPts}`} />}
        {appPts !== 0 && <BreakdownBadge icon={<SoccerBallIcon className="w-3.5 h-3.5" />} label="Appearance" pts={`+${appPts}`} />}
        {multiplier !== 1 && (
          <div className="flex items-center justify-between bg-slate-50 px-2 py-1 rounded border border-slate-100 col-span-2">
            <span className="flex items-center gap-1">
              {multiplierValue === 200 || multiplier === 2
                ? <><Crown className="w-3 h-3 text-amber-500" /> Captain Multiplier</>
                : <><Star className="w-3 h-3 text-slate-400" /> VC Multiplier</>
              }
            </span>
            <span className="font-black text-indigo-600">x{multiplier}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Small helper components ───────────────────────────────────────────────── */

function MiniCard({ label, value, color = 'text-slate-800' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white border border-slate-200 p-2 rounded-xl text-center">
      <p className="text-[8px] text-slate-400 uppercase font-bold">{label}</p>
      <p className={`text-xs font-black ${color} mt-0.5`}>{value}</p>
    </div>
  );
}

function PlayerStatCard({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center">
      <div className="mb-0.5">{icon}</div>
      <p className={`text-sm font-black ${color}`}>{value}</p>
      <p className="text-[8px] text-slate-400 uppercase font-bold mt-0.5">{label}</p>
    </div>
  );
}

function BreakdownBadge({ icon, label, pts, ptsColor = 'text-slate-800' }: {
  icon?: React.ReactNode; label: string; pts: string; ptsColor?: string;
}) {
  return (

    <div className="flex items-center justify-between bg-slate-50 px-2 py-1 rounded border border-slate-100">
      <span className="flex items-center gap-1 truncate">
        {icon} {label}
      </span>
      <span className={`font-black shrink-0 ${ptsColor}`}>{pts}</span>
    </div>

  );
}
