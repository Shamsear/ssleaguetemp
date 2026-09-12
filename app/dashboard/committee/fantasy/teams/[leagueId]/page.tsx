'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import { Activity, AlertTriangle, Award, BarChart2, CheckCircle, ChevronDown, Crown, Gift, Handshake, Shield as ShieldIcon, Star, Target, TrendingUp, Trophy, XCircle, ArrowLeft, Filter } from 'lucide-react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import ShareableTeamCard from '@/components/fantasy/ShareableTeamCard';
import AuthGuard from '@/components/auth/AuthGuard';

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
  budget_remaining?: number;
}

interface WindowOption {
  id: string;
  label: string;
  start_round: number | null;
  end_round: number | null;
  is_current?: boolean;
}

interface Player {
  draft_id: string;
  real_player_id: string;
  player_name: string;
  total_points: number;
  matches_played: number;
  average_points: number;
  position?: string;
  category?: string;
  real_team_name?: string;
  purchase_price?: number;
  is_captain?: boolean;
  is_vice_captain?: boolean;
  is_released?: boolean;
  goals_scored?: number;
  clean_sheets?: number;
  motm?: number;
  photo_url?: string | null;
}

export default function FantasyTeamsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [league, setLeague] = useState<any>(null);
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<FantasyTeam | null>(null);
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);

  // Available windows and active window state
  const [availableWindows, setAvailableWindows] = useState<WindowOption[]>([]);
  const [availableRoundsList, setAvailableRoundsList] = useState<number[]>([]);
  const [selectedWindow, setSelectedWindow] = useState<WindowOption | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'week' | 'round'>('all');

  // Squad search & filter state
  const [playerSearch, setPlayerSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

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
      } catch (error: any) {
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

  const loadLeagueData = async (win?: WindowOption | null) => {
    if (!leagueId) return;

    try {
      let url = `/api/fantasy/leagues/${leagueId}`;
      if (win && win.start_round !== null && win.end_round !== null) {
        url += `?start_round=${win.start_round}&end_round=${win.end_round}`;
      }

      const response = await fetchWithTokenRefresh(url);
      if (!response.ok) throw new Error('Failed to load league');

      const data = await response.json();
      setLeague(data.league);
      setTeams(data.teams || []);
      
      if (data.available_rounds && data.available_rounds.length > 0) {
        setAvailableRoundsList(data.available_rounds);
      }
      if (data.available_windows && data.available_windows.length > 0) {
        setAvailableWindows(data.available_windows);
        if (!selectedWindow && !win) {
          const defWin = data.available_windows.find((w: any) => w.id === 'all') || data.available_windows[0];
          setSelectedWindow(defWin);
        }
      }
      
      // Auto-select or update currently selected team
      if (data.teams && data.teams.length > 0) {
        const currentTargetId = selectedTeam?.id;
        const matchingTeam = currentTargetId 
          ? data.teams.find((t: any) => t.id === currentTargetId) || data.teams[0]
          : data.teams[0];
        loadTeamPlayers(matchingTeam, win || selectedWindow);
      }
    } catch (error: any) {
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

  useEffect(() => {
    if (user && leagueId) {
      loadLeagueData();
    }
  }, [user, leagueId]);

  const loadTeamPlayers = async (team: FantasyTeam, win?: WindowOption | null) => {
    setSelectedTeam(team);
    setIsLoadingPlayers(true);

    const activeWin = win !== undefined ? win : selectedWindow;

    try {
      let url = `/api/fantasy/teams/${team.id}?league_id=${leagueId}`;
      if (activeWin && activeWin.start_round !== null && activeWin.end_round !== null) {
        url += `&start_round=${activeWin.start_round}&end_round=${activeWin.end_round}`;
      }

      const response = await fetchWithTokenRefresh(url);
      
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
      if (data.team) {
        setSelectedTeam((prev) => ({
          ...(prev || team),
          ...data.team,
        }));
      }
      setTeamPlayers(data.players || []);
      if (data.available_windows && availableWindows.length === 0) {
        setAvailableWindows(data.available_windows);
      }
    } catch (error: any) {
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
  };

  const handleWindowChange = (win: WindowOption) => {
    setSelectedWindow(win);
    setExpandedPlayer(null);
    setPlayerData(null);
    setShowPassiveBreakdown(false);
    setPassiveData(null);
    loadLeagueData(win);
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
      // Fetch player match details from API - pass team_id and window to get correct data
      const teamId = selectedTeam?.id;
      if (!teamId) {
        throw new Error('No team selected');
      }
      
      let url = `/api/fantasy/players/${playerId}/matches?league_id=${leagueId}&team_id=${teamId}`;
      if (selectedWindow && selectedWindow.start_round !== null && selectedWindow.end_round !== null) {
        url += `&start_round=${selectedWindow.start_round}&end_round=${selectedWindow.end_round}`;
      }

      const response = await fetchWithTokenRefresh(url);
      
      if (!response.ok) {
        throw new Error('Failed to load player match data');
      }

      const data = await response.json();
      setPlayerData(data);
    } catch (error: any) {
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
      let url = `/api/fantasy/teams/${selectedTeam.id}/passive-breakdown`;
      if (selectedWindow && selectedWindow.start_round !== null && selectedWindow.end_round !== null) {
        url += `?start_round=${selectedWindow.start_round}&end_round=${selectedWindow.end_round}`;
      }

      const response = await fetchWithTokenRefresh(url);
      
      if (!response.ok) {
        throw new Error('Failed to load passive points breakdown');
      }

      const data = await response.json();
      setPassiveData(data);
    } catch (error: any) {
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
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading team rosters...</p>
        </div>
      </div>
    );
  }

  if (!user || !league) return null;

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <AlertModal {...alertState} onClose={closeAlert} />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Navigation */}
        <div>
          <Link
            href={`/dashboard/committee/fantasy/${leagueId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">FANTASY CONSOLE</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
              Fantasy Team Rosters
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              {league.name} — Manager Squad breakdown by Transfer Window &amp; Week Block
            </p>
          </div>
          <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center text-amber-400 shadow-sm shrink-0">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
        </div>

        {/* Universal Filter Console */}
        <div className="console-card bg-white border border-slate-200/60 p-5 rounded-3xl shadow-sm space-y-4 font-mono">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setFilterTab('all');
                  const allWin = availableWindows.find(w => w.id === 'all') || { id: 'all', label: 'All Rounds', start_round: null, end_round: null };
                  handleWindowChange(allWin);
                }}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                  filterTab === 'all'
                    ? 'bg-slate-900 text-amber-400 border border-slate-950 shadow-md'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                }`}
              >
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>All Rounds (Full Season)</span>
              </button>

              <button
                onClick={() => {
                  setFilterTab('week');
                  const firstWeek = availableWindows.find(w => w.id !== 'all') || availableWindows[0];
                  if (firstWeek) handleWindowChange(firstWeek);
                }}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                  filterTab === 'week'
                    ? 'bg-slate-900 text-amber-400 border border-slate-950 shadow-md'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                }`}
              >
                <Filter className="w-4 h-4 text-amber-400" />
                <span>Weekly / Transfer Blocks</span>
              </button>

              <button
                onClick={() => {
                  setFilterTab('round');
                  const r1 = availableRoundsList[0] || 1;
                  handleWindowChange({ id: `round_${r1}`, label: `Round ${r1}`, start_round: r1, end_round: r1 });
                }}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                  filterTab === 'round'
                    ? 'bg-slate-900 text-amber-400 border border-slate-950 shadow-md'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                }`}
              >
                <BarChart2 className="w-4 h-4 text-amber-400" />
                <span>Round Breakdown</span>
              </button>
            </div>

            <span className="text-[10px] font-extrabold text-amber-600 uppercase tracking-wider bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
              Viewing: {selectedWindow?.label || 'All Rounds'}
            </span>
          </div>

          {/* Sub-pills depending on active filter tab */}
          {filterTab === 'all' && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-slate-500 font-bold uppercase">Viewing cumulative standings across all completed rounds.</span>
            </div>
          )}

          {filterTab === 'week' && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {availableWindows.filter(w => w.id !== 'all').map((win) => {
                const isSelected = selectedWindow?.id === win.id || (selectedWindow?.start_round === win.start_round && selectedWindow?.end_round === win.end_round && win.start_round !== win.end_round);
                return (
                  <button
                    key={win.id}
                    onClick={() => handleWindowChange(win)}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 font-extrabold border border-amber-600 shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/60'
                    }`}
                  >
                    {win.label}
                  </button>
                );
              })}
            </div>
          )}

          {filterTab === 'round' && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {availableRoundsList.map((rd) => {
                const isSelected = selectedWindow?.start_round === rd && selectedWindow?.end_round === rd;
                return (
                  <button
                    key={rd}
                    onClick={() => handleWindowChange({
                      id: `round_${rd}`,
                      label: `Round ${rd}`,
                      start_round: rd,
                      end_round: rd
                    })}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 font-extrabold border border-amber-600 shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/60'
                    }`}
                  >
                    Round {rd}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Teams List */}
          <div className="lg:col-span-1">
            <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">Teams ({teams.length})</h2>
                <span className="text-[9px] font-bold text-amber-600 uppercase">
                  {selectedWindow?.start_round ? `R${selectedWindow.start_round}–R${selectedWindow.end_round}` : 'All Rds'}
                </span>
              </div>
              
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {teams.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <p className="text-xs font-bold uppercase mb-1">No teams registered yet</p>
                    <p className="text-[10px] uppercase font-semibold text-slate-400">Rosters will appear here once managers register</p>
                  </div>
                ) : (
                  teams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => loadTeamPlayers(team, selectedWindow)}
                      className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                        selectedTeam?.id === team.id
                          ? 'bg-slate-800 border-slate-900 text-amber-400 shadow-sm'
                          : 'bg-slate-50 border-slate-100 hover:border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-bold text-xs uppercase">{team.team_name}</p>
                          <p className={`text-[10px] font-bold uppercase mt-0.5 ${selectedTeam?.id === team.id ? 'text-amber-300' : 'text-slate-450'}`}>
                            {team.owner_name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black font-mono">{team.total_points}</p>
                          <p className={`text-[9px] font-bold uppercase ${selectedTeam?.id === team.id ? 'text-amber-300' : 'text-slate-400'}`}>
                            {team.player_count} players
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Team Roster */}
          <div className="lg:col-span-2">
            <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
              {selectedTeam ? (
                <>
                  <div className="mb-6 pb-4 border-b border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-sm font-black text-slate-850 uppercase tracking-wider">{selectedTeam.team_name}</h2>
                          {selectedWindow && (
                            <span className="px-2 py-0.5 bg-amber-100 border border-amber-300 text-amber-800 text-[9px] font-black rounded-md uppercase">
                              {selectedWindow.label}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Owner: {selectedTeam.owner_name}</p>
                      </div>
                      <ShareableTeamCard
                        teamName={selectedTeam.team_name}
                        ownerName={selectedTeam.owner_name}
                        totalPoints={selectedTeam.total_points}
                        supportedTeamName={selectedTeam.supported_team_name}
                        passivePoints={selectedTeam.passive_points}
                        players={teamPlayers}
                        leagueName={league?.name}
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <p className="text-[9px] text-slate-450 font-bold uppercase mb-0.5">Total Points</p>
                        <p className="text-lg font-black text-amber-600">{selectedTeam.total_points}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <p className="text-[9px] text-slate-450 font-bold uppercase mb-0.5">Players</p>
                        <p className="text-lg font-black text-slate-800">{selectedTeam.player_count}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <p className="text-[9px] text-slate-450 font-bold uppercase mb-0.5">Rank</p>
                        <p className="text-lg font-black text-slate-800">#{selectedTeam.rank || '-'}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <p className="text-[9px] text-slate-450 font-bold uppercase mb-0.5">Budget Remaining</p>
                        <p className={`text-lg font-black ${(selectedTeam.budget_remaining ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          ₹{(selectedTeam.budget_remaining ?? 0).toFixed(1)} credits
                        </p>
                      </div>
                    </div>

                    {/* Supported Team (Passive Points) */}
                    {selectedTeam.supported_team_name && (
                      <div className="mt-4">
                        <button
                          onClick={togglePassiveBreakdown}
                          className="w-full p-4 bg-slate-50 border border-emerald-200/50 hover:border-emerald-300 rounded-xl transition-all cursor-pointer group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg flex items-center justify-center">
                                <ShieldIcon className="w-4 h-4" />
                              </div>
                              <div className="text-left font-mono">
                                <p className="text-[9px] text-slate-400 font-bold uppercase">Supported Team (Passive Points)</p>
                                <p className="text-xs font-bold text-slate-800 uppercase">{selectedTeam.supported_team_name}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 font-mono">
                              <div className="text-right">
                                <p className="text-[9px] text-slate-400 font-bold uppercase">Passive Points</p>
                                <p className="text-sm font-black text-emerald-650">{selectedTeam.passive_points || 0}</p>
                              </div>
                              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${
                                showPassiveBreakdown ? 'rotate-180' : ''
                              }`} />
                            </div>
                          </div>
                        </button>

                        {/* Passive Points Breakdown */}
                        {showPassiveBreakdown && (
                          <div className="mt-2 p-4 bg-white border border-emerald-200 rounded-xl space-y-4">
                            {isLoadingPassive ? (
                              <div className="flex items-center justify-center py-6">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                              </div>
                            ) : passiveData && passiveData.stats ? (
                              <>
                                {/* Stats Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                  <div className="bg-slate-800 border border-slate-900 rounded-lg p-3 text-center text-amber-400">
                                    <p className="text-base font-black font-mono">{passiveData.stats.total_passive_points}</p>
                                    <p className="text-[9px] uppercase font-bold text-amber-300">Total Passive</p>
                                  </div>
                                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
                                    <p className="text-base font-black text-slate-800">
                                      {passiveData.stats?.total_match_bonus !== undefined ? Number(passiveData.stats.total_match_bonus) : passiveData.rounds.reduce((sum: number, r: any) => sum + (Number(r.total_bonus) || 0), 0)}
                                    </p>
                                    <p className="text-[9px] uppercase font-bold text-slate-450">Team Bonuses</p>
                                  </div>
                                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
                                    <p className="text-base font-black text-slate-800">
                                      {passiveData.stats?.total_admin_bonus !== undefined ? Number(passiveData.stats.total_admin_bonus) : (passiveData.admin_bonuses?.reduce((sum: number, b: any) => sum + (Number(b.points) || 0), 0) || 0)}
                                    </p>
                                    <p className="text-[9px] uppercase font-bold text-slate-450">Admin Bonuses</p>
                                  </div>
                                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
                                    <p className="text-base font-black text-slate-800">{passiveData.stats.total_rounds}</p>
                                    <p className="text-[9px] uppercase font-bold text-slate-450">Rounds</p>
                                  </div>
                                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
                                    <p className="text-base font-black text-slate-800">{passiveData.stats.average_per_round}</p>
                                    <p className="text-[9px] uppercase font-bold text-slate-450">Avg/Round</p>
                                  </div>
                                </div>

                                {/* Admin Bonus Points */}
                                {passiveData.admin_bonuses && passiveData.admin_bonuses.length > 0 && (
                                  <div className="space-y-2 pt-2 border-t border-slate-100">
                                    <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1">
                                      <Gift className="w-3.5 h-3.5 text-rose-500" /> Admin Bonus Points
                                    </h4>
                                    <div className="grid gap-2">
                                      {passiveData.admin_bonuses.map((bonus: any) => (
                                        <div key={bonus.id} className="border border-slate-200/80 rounded-xl p-3 bg-slate-50 flex items-center justify-between">
                                          <div>
                                            <p className="font-bold text-xs uppercase text-slate-800">{bonus.reason}</p>
                                            <p className="text-[9px] text-slate-400 font-bold mt-0.5">
                                              Awarded: {new Date(bonus.awarded_at).toLocaleDateString()}
                                            </p>
                                          </div>
                                          <div className="text-right">
                                            <p className="text-base font-black text-amber-600">{bonus.points > 0 ? '+' : ''}{bonus.points}</p>
                                            <p className="text-[9px] text-slate-405 font-bold uppercase">bonus pts</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Round-by-Round Breakdown */}
                                <div className="space-y-2 pt-2 border-t border-slate-100">
                                  <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-wider">Round-by-Round Bonuses</h4>
                                  {passiveData.rounds.length === 0 ? (
                                    <p className="text-center text-slate-400 py-4 text-[10px] font-bold uppercase">No passive points earned yet</p>
                                  ) : (
                                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                                      {passiveData.rounds.map((round: any, idx: number) => {
                                        const breakdown = round.bonus_breakdown || {};
                                        const bonusTypes = Object.keys(breakdown);
                                        
                                        return (
                                          <div key={idx} className="border border-slate-150 rounded-xl p-3 bg-slate-50/50 flex flex-col gap-2">
                                            <div className="flex items-center justify-between">
                                              <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 bg-slate-800 text-amber-400 rounded-lg flex items-center justify-center font-bold text-xs font-mono">
                                                  R{round.round_number}
                                                </div>
                                                <div>
                                                  <p className="font-bold text-xs uppercase text-slate-805">Round {round.round_number}</p>
                                                  <p className="text-[9px] text-slate-400 font-bold uppercase">
                                                    {round.real_team_name} {round.opponent_name ? `vs ${round.opponent_name}` : ''} {round.score ? `(${round.score})` : ''}
                                                  </p>
                                                </div>
                                              </div>
                                              <div className="text-right">
                                                <p className="text-sm font-black text-emerald-650">{round.total_bonus > 0 ? '+' : ''}{round.total_bonus}</p>
                                                <p className="text-[9px] text-slate-400 font-bold uppercase">bonus pts</p>
                                              </div>
                                            </div>

                                            {/* Bonus Breakdown */}
                                            {bonusTypes.length > 0 && (
                                              <div className="grid grid-cols-2 gap-2 text-[10px] font-bold uppercase pt-2 border-t border-slate-150">
                                                {bonusTypes.map((type) => (
                                                  <div key={type} className="flex items-center justify-between px-2.5 py-1 bg-white border border-slate-100 rounded-lg text-slate-650">
                                                    <span>{type.replace(/_/g, ' ')}</span>
                                                    <span className="text-emerald-650 font-black">{breakdown[type] > 0 ? '+' : ''}{breakdown[type]}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </>
                            ) : passiveData?.error ? (
                              <p className="text-center text-rose-600 py-4 text-xs font-bold uppercase">Failed to load passive points breakdown</p>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Squad Filter Bar */}
                  {teamPlayers.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center gap-3 mb-4 font-mono">
                      <div className="relative flex-1 w-full">
                        <input
                          type="text"
                          placeholder="Search squad by player or real team..."
                          value={playerSearch}
                          onChange={(e) => setPlayerSearch(e.target.value)}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 font-bold"
                        />
                      </div>
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="w-full sm:w-auto px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-500 font-bold uppercase cursor-pointer"
                      >
                        <option value="all">All Categories ({teamPlayers.length})</option>
                        {Array.from(new Set(teamPlayers.map((p) => p.category).filter(Boolean))).map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {isLoadingPlayers ? (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500 mx-auto"></div>
                      <p className="mt-3 text-xs text-slate-450 uppercase font-bold tracking-wider">Loading players...</p>
                    </div>
                  ) : teamPlayers.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <svg className="w-10 h-10 text-slate-350 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                      <p className="text-xs font-bold uppercase mb-1">No players drafted yet</p>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">This team hasn't participated in the draft</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                      {teamPlayers
                        .filter((p) => {
                          const matchesSearch = !playerSearch || 
                            p.player_name.toLowerCase().includes(playerSearch.toLowerCase()) || 
                            (p.real_team_name || '').toLowerCase().includes(playerSearch.toLowerCase());
                          const matchesCat = categoryFilter === 'all' || 
                            (p.category && p.category.toLowerCase() === categoryFilter.toLowerCase());
                          return matchesSearch && matchesCat;
                        })
                        .map((player, index) => (
                        <div key={player.draft_id} className="border border-slate-200/80 rounded-xl overflow-hidden bg-slate-50/50">
                          <button
                            onClick={() => togglePlayerBreakdown(player.real_player_id)}
                            className="w-full flex items-center justify-between p-4 hover:bg-slate-100/50 transition-all cursor-pointer group"
                          >
                            <div className="flex items-center gap-4 flex-1">
                              <div className="w-8 h-8 bg-slate-800 text-amber-400 border border-slate-700 rounded-lg flex items-center justify-center font-bold font-mono text-xs shadow-sm">
                                {index + 1}
                              </div>
                              <div className="flex-1 text-left font-mono">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-bold text-xs uppercase text-slate-800">{player.player_name}</p>
                                  {player.is_captain && (
                                    <span title="Captain (2x points)" className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-500 text-slate-950 font-black text-[9px] rounded uppercase shadow-sm">
                                      <Crown className="w-3 h-3 text-slate-950 fill-amber-300" /> C (2x)
                                    </span>
                                  )}
                                  {player.is_vice_captain && (
                                    <span title="Vice-Captain (1.5x points)" className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 text-amber-300 font-black text-[9px] rounded uppercase shadow-sm">
                                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> VC (1.5x)
                                    </span>
                                  )}
                                  {player.is_released && (
                                    <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 border border-rose-300 font-black text-[9px] rounded uppercase">
                                      Released W1
                                    </span>
                                  )}
                                </div>
                                <p className="text-[9px] text-slate-400 font-bold uppercase">
                                  {player.category ? `${player.category} • ` : ''}{player.real_team_name || 'Real Player'}
                                  {player.matches_played !== undefined ? ` • ${player.matches_played} matches` : ''}
                                  {player.goals_scored !== undefined && player.goals_scored > 0 ? ` • ${player.goals_scored} goals` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 font-mono">
                              <div className="text-right">
                                <p className="text-sm font-black text-amber-600">{player.total_points}</p>
                                <p className="text-[9px] font-bold text-slate-450 uppercase group-hover:text-amber-505 transition">
                                  {player.purchase_price ? `₹${player.purchase_price} credits` : 'Click for details'}
                                </p>
                              </div>
                              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${
                                expandedPlayer === player.real_player_id ? 'rotate-180' : ''
                              }`} />
                            </div>
                          </button>

                          {/* Expanded Player Breakdown */}
                          {expandedPlayer === player.real_player_id && (
                            <div className="border-t border-slate-150 bg-white p-5 space-y-4">
                              {isLoadingPlayer ? (
                                <div className="flex items-center justify-center py-6">
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500"></div>
                                </div>
                              ) : playerData && playerData.stats ? (
                                <>
                                  {/* Stats Grid */}
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
                                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                                      <TrendingUp className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                                      <p className="text-lg font-black text-amber-600">{playerData.stats?.total_points || 0}</p>
                                      <p className="text-[9px] uppercase font-bold text-slate-450">Total Points</p>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                                      <Target className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                                      <p className="text-lg font-black text-slate-800">{playerData.stats?.total_goals || 0}</p>
                                      <p className="text-[9px] uppercase font-bold text-slate-450">Goals</p>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                                      <ShieldIcon className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                                      <p className="text-lg font-black text-slate-800">{playerData.stats?.total_clean_sheets || 0}</p>
                                      <p className="text-[9px] uppercase font-bold text-slate-450">Clean Sheets</p>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                                      <Award className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                                      <p className="text-lg font-black text-slate-800">{playerData.stats?.total_motm || 0}</p>
                                      <p className="text-[9px] uppercase font-bold text-slate-450">MOTM</p>
                                    </div>
                                  </div>

                                  {/* Additional Stats */}
                                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 grid grid-cols-5 gap-3 text-center text-[10px] font-mono font-bold uppercase">
                                    <div>
                                      <p className="text-slate-400 mb-0.5">Price</p>
                                      <p className="font-bold text-slate-800">₹{player.purchase_price || 0} credits</p>
                                    </div>
                                    <div>
                                      <p className="text-slate-400 mb-0.5">Matches</p>
                                      <p className="font-bold text-slate-800">{playerData.stats?.total_matches || 0}</p>
                                    </div>
                                    <div>
                                      <p className="text-slate-400 mb-0.5">Avg Points</p>
                                      <p className="font-bold text-amber-600">{playerData.stats?.average_points || 0}</p>
                                    </div>
                                    <div>
                                      <p className="text-slate-400 mb-0.5">Best Game</p>
                                      <p className="font-bold text-slate-800">{playerData.stats.best_performance}</p>
                                    </div>
                                    <div>
                                      <p className="text-slate-400 mb-0.5">Bonus</p>
                                      <p className="font-bold text-slate-800">{playerData.stats.total_bonus_points}</p>
                                    </div>
                                  </div>

                                  {/* Match History */}
                                  <div className="space-y-2 pt-2 border-t border-slate-100">
                                    <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-wider">Match-by-Match Performance</h4>
                                    {playerData.matches.length === 0 ? (
                                      <p className="text-center text-slate-400 py-4 text-[10px] font-bold uppercase">No match data yet</p>
                                    ) : (
                                      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
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
                                          const multiplier = match.is_captain ? 2 : match.is_vice_captain ? 1.5 : 1;
                                          const totalPoints = Math.round(basePoints * multiplier);

                                          return (

                                            <div key={idx} className="border border-slate-150 rounded-xl overflow-hidden font-mono">
                                              {/* Match Header */}
                                              <div className="flex items-center justify-between p-3 bg-slate-50">
                                                <div className="flex items-center gap-3">
                                                  <div className="w-8 h-8 bg-slate-800 text-amber-450 border border-slate-700 rounded-lg flex items-center justify-center font-bold text-xs">
                                                    R{match.round_number}
                                                  </div>
                                                  <div>
                                                    <p className="font-bold text-xs uppercase text-slate-805">
                                                      {match.opponent_name || 'vs Opponent'}
                                                    </p>
                                                    <p className="text-[9px] text-slate-400 font-bold uppercase flex items-center gap-1.5 mt-0.5">
                                                      <span className="flex items-center gap-0.5">
                                                        {actualResult === 'win' ? (
                                                          <span className="text-emerald-600 font-black">WIN</span>
                                                        ) : actualResult === 'draw' ? (
                                                          <span className="text-slate-550 font-black">DRAW</span>
                                                        ) : (
                                                          <span className="text-rose-600 font-black">LOSS</span>
                                                        )}
                                                      </span>
                                                      <span>•</span>
                                                      <span>{playerGoals}-{opponentGoals}</span>
                                                    </p>
                                                  </div>
                                                </div>
                                                <div className="text-right">
                                                  <p className="text-sm font-black text-amber-600">{totalPoints}</p>
                                                  <p className="text-[9px] text-slate-405 font-bold uppercase">pts</p>
                                                </div>
                                              </div>

                                              {/* Points Breakdown */}
                                              <div className="p-3 bg-white space-y-2 text-[10px] font-bold uppercase">
                                                <div className="grid grid-cols-2 gap-2">
                                                  {goalPoints !== 0 && (
                                                    <div className="flex items-center justify-between px-2.5 py-1 bg-slate-50 border border-slate-100 rounded-lg text-slate-650">
                                                      <span className="flex items-center gap-1">
                                                        <Target className="w-3 h-3 text-slate-500" />
                                                        Goals ({match.goals_scored})
                                                      </span>
                                                      <span className="text-slate-800 font-black">{goalPoints}pts</span>
                                                    </div>
                                                  )}
                                                  {hatTrickPoints !== 0 && (
                                                    <div className="flex items-center justify-between px-2.5 py-1 bg-slate-50 border border-slate-100 rounded-lg text-slate-650">
                                                      <span className="flex items-center gap-1">
                                                        <TrendingUp className="w-3 h-3 text-slate-500" />
                                                        Hat-trick Bonus
                                                      </span>
                                                      <span className="text-slate-805 font-black">{hatTrickPoints}pts</span>
                                                    </div>
                                                  )}
                                                  {cleanSheetPoints !== 0 && (
                                                    <div className="flex items-center justify-between px-2.5 py-1 bg-slate-50 border border-slate-100 rounded-lg text-slate-650">
                                                      <span className="flex items-center gap-1">
                                                        <ShieldIcon className="w-3 h-3 text-slate-500" />
                                                        Clean Sheet
                                                      </span>
                                                      <span className="text-slate-805 font-black">{cleanSheetPoints}pts</span>
                                                    </div>
                                                  )}
                                                  {concedePoints !== 0 && (
                                                    <div className="flex items-center justify-between px-2.5 py-1 bg-slate-50 border border-slate-100 rounded-lg text-slate-650">
                                                      <span className="flex items-center gap-1">
                                                        <AlertTriangle className="w-3 h-3 text-slate-500" />
                                                        Conceded 4+ Goals
                                                      </span>
                                                      <span className="text-rose-600 font-black">{concedePoints}pts</span>
                                                    </div>
                                                  )}
                                                  {motmPoints !== 0 && (
                                                    <div className="flex items-center justify-between px-2.5 py-1 bg-slate-50 border border-slate-100 rounded-lg text-slate-650">
                                                      <span className="flex items-center gap-1">
                                                        <Award className="w-3 h-3 text-slate-500" />
                                                        MOTM
                                                      </span>
                                                      <span className="text-slate-805 font-black">{motmPoints}pts</span>
                                                    </div>
                                                  )}
                                                  {resultPoints !== 0 && (
                                                    <div className="flex items-center justify-between px-2.5 py-1 bg-slate-50 border border-slate-100 rounded-lg text-slate-650">
                                                      <span>
                                                        {actualResult === 'win' ? 'WIN BONUS' : 'DRAW BONUS'}
                                                      </span>
                                                      <span className="text-slate-805 font-black">{resultPoints}pts</span>
                                                    </div>
                                                  )}
                                                  {appearancePoints !== 0 && (
                                                    <div className="flex items-center justify-between px-2.5 py-1 bg-slate-50 border border-slate-100 rounded-lg text-slate-650">
                                                      <span className="flex items-center gap-1">
                                                        <Activity className="w-3 h-3 text-slate-500" /> Appearance
                                                      </span>
                                                      <span className="text-slate-800 font-black">{appearancePoints}pt</span>
                                                    </div>
                                                  )}
                                                </div>

                                                {/* Multiplier & Total */}
                                                <div className="pt-2 border-t border-slate-150">
                                                  <div className="flex items-center justify-between text-slate-500 text-[9px] font-bold uppercase">
                                                    <span>Base Points</span>
                                                    <span className="text-slate-800 font-black">{basePoints}pts</span>
                                                  </div>
                                                  {multiplier !== 1 && (
                                                    <>
                                                      <div className="flex items-center justify-between text-slate-500 text-[9px] font-bold uppercase mt-1">
                                                        <span className="flex items-center gap-1">
                                                          {match.points_multiplier === 200 || multiplier === 2 ? (
                                                            <>
                                                              <Crown className="w-3 h-3 text-amber-500 fill-amber-500" />
                                                              Captain Multiplier
                                                            </>
                                                          ) : (
                                                            <>
                                                              <Star className="w-3 h-3 text-amber-405 fill-amber-405" />
                                                              Vice-Captain Multiplier
                                                            </>
                                                          )}
                                                        </span>
                                                        <span className="text-amber-600 font-black">×{multiplier}</span>
                                                      </div>
                                                      <div className="flex items-center justify-between text-xs font-black mt-2 pt-2 border-t border-slate-150">
                                                        <span className="text-slate-900">Final Points</span>
                                                        <span className="text-amber-600">{totalPoints}pts</span>
                                                      </div>
                                                    </>
                                                  )}
                                                </div>
                                              </div>
                                            </div>

  );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <p className="text-center text-rose-600 py-4 text-[10px] font-bold uppercase">Failed to load player details</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <svg className="w-10 h-10 text-slate-350 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <p className="text-xs font-bold uppercase">Select a team to view roster</p>
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