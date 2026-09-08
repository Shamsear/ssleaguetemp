'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { AlertCircle, Calendar, Check, Search, Star, Users, X, XCircle, Shield, CheckCircle, ArrowLeft, Trash2, RefreshCw } from 'lucide-react';
import { normalizeStr } from '@/lib/utils/normalizeStr';
import AlertModal from '@/components/modals/AlertModal';
import { useModal } from '@/hooks/useModal';
import AuthGuard from '@/components/auth/AuthGuard';

interface Player {
  squad_id?: string;
  real_player_id: string;
  player_name: string;
  position: string;
  category?: string;
  tier?: string;
  real_team_name?: string;
  team?: string;
  team_id?: string;
  star_rating: number;
  purchase_price?: number;
  current_price?: number;
  draft_price?: number;
  total_points?: number;
  is_captain?: boolean;
  is_vice_captain?: boolean;
  is_available?: boolean;
}

interface TransferWindow {
  window_id: string;
  window_name: string;
  opens_at: string;
  closes_at: string;
  is_active: boolean;
  max_transfers_per_window?: number;
  max_releases?: number;
  max_swaps?: number;
  points_cost_per_transfer?: number;
  status?: string;
}

interface TeamInfo {
  team_id: string;
  team_name: string;
  budget_remaining: number;
  total_budget: number;
  squad_size: number;
  min_squad_size: number;
  max_squad_size: number;
  total_points: number;
  supported_team_id?: string | null;
  supported_team_name?: string | null;
}

export default function TeamTransfersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [mySquad, setMySquad] = useState<Player[]>([]);
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null);
  const [transferWindow, setTransferWindow] = useState<TransferWindow | null>(null);
  const [transfersUsed, setTransfersUsed] = useState(0);
  
  const [selectedOut, setSelectedOut] = useState<Player | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isUpdatingCaptain, setIsUpdatingCaptain] = useState(false);
  const [isReleasingPassiveTeam, setIsReleasingPassiveTeam] = useState(false);
  const [leagueId, setLeagueId] = useState<string>('');
  
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [viceCaptainId, setViceCaptainId] = useState<string | null>(null);
  const [showCaptainModal, setShowCaptainModal] = useState(false);

  const { alertState, showAlert, closeAlert } = useModal();

  const loadTransferData = useCallback(async () => {
    if (!user) return;
    try {
      setIsLoading(true);

      // Get my fantasy team
      const teamRes = await fetchWithTokenRefresh(`/api/fantasy/teams/my-team?user_id=${user.uid}`);
      if (teamRes.status === 404) {
        setIsLoading(false);
        return;
      }
      
      const teamData = await teamRes.json();
      const team = teamData.team;
      
      setLeagueId(team.fantasy_league_id || team.league_id);

      // Get full squad data from fantasy_squad table
      const squadRes = await fetchWithTokenRefresh(`/api/fantasy/squad?team_id=${team.id}`);
      let squad: Player[] = [];
      
      if (squadRes.ok) {
        const squadData = await squadRes.json();
        squad = squadData.squad || [];
      } else {
        squad = teamData.players || [];
      }
      
      setMySquad(squad);

      // Set current captain and vice-captain
      const captain = squad.find((p: Player) => p.is_captain);
      const viceCaptain = squad.find((p: Player) => p.is_vice_captain);
      if (captain) setCaptainId(captain.real_player_id);
      if (viceCaptain) setViceCaptainId(viceCaptain.real_player_id);

      // Get team info with budget
      const teamInfoRes = await fetchWithTokenRefresh(`/api/fantasy/teams/${team.id}`);
      if (teamInfoRes.ok) {
        const teamInfoData = await teamInfoRes.json();
        const teamDetails = teamInfoData.team;
        
        const leagueRes = await fetchWithTokenRefresh(`/api/fantasy/leagues/${team.fantasy_league_id || team.league_id}`);
        let minSquadSize = 5;
        let maxSquadSize = 15;
        let totalBudget = 100;
        
        if (leagueRes.ok) {
          const leagueData = await leagueRes.json();
          const leagueDetails = leagueData.league;
          minSquadSize = Number(leagueDetails.min_squad_size ?? 0);
          maxSquadSize = Number(leagueDetails.max_squad_size || 5);
          totalBudget = Number(leagueDetails.budget_per_team || 100);
        }
        
        const squadSpent = squad.reduce((acc: number, p: Player) => acc + Number(p.purchase_price || 0), 0);
        const remainingBudget = Number(
          teamDetails.budget_remaining ?? team.budget_remaining ?? Math.max(0, totalBudget - squadSpent)
        );
        
        setTeamInfo({
          team_id: team.id,
          team_name: team.team_name,
          budget_remaining: remainingBudget,
          total_budget: totalBudget,
          squad_size: squad.length,
          min_squad_size: minSquadSize,
          max_squad_size: maxSquadSize,
          total_points: Number(teamDetails.total_points || team.total_points || 0),
          supported_team_id: team.supported_team_id || teamDetails.supported_team_id || null,
          supported_team_name: team.supported_team_name || teamDetails.supported_team_name || null,
        });
      }

      // Get active transfer window
      const windowRes = await fetchWithTokenRefresh(`/api/fantasy/transfer-windows?league_id=${team.fantasy_league_id || team.league_id}`);
      if (windowRes.ok) {
        const windowData = await windowRes.json();
        const activeWindow = (windowData.windows || []).find((w: TransferWindow) => w.is_active || w.status === 'active');
        
        if (activeWindow) {
          setTransferWindow(activeWindow);

          // Get transfers used in this window
          const transfersRes = await fetchWithTokenRefresh(`/api/fantasy/transfers/history?team_id=${team.id}&window_id=${activeWindow.window_id}`);
          if (transfersRes.ok) {
            const transfersData = await transfersRes.json();
            setTransfersUsed((transfersData.transfers || []).length);
          }
        }
      }

    } catch (error: any) {
      console.error('Error loading transfer data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadTransferData();
    }
  }, [user, loadTransferData]);

  const releaseSupportedTeam = async () => {
    if (!teamInfo?.supported_team_name) return;
    if (!confirm(`Are you sure you want to release your Supported Team (${teamInfo.supported_team_name})?`)) return;

    setIsReleasingPassiveTeam(true);
    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/supported-team/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user!.uid,
          is_release: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        showAlert({
          type: 'error',
          title: 'Release Failed',
          message: data.error || 'Failed to release supported team',
        });
        return;
      }

      showAlert({
        type: 'success',
        title: 'Supported Team Released',
        message: `Your supported team (${teamInfo.supported_team_name}) has been released.`,
      });

      loadTransferData();
    } catch (error: any) {
      console.error('Release supported team error:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: `Failed to release supported team: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsReleasingPassiveTeam(false);
    }
  };

  const executeRelease = async () => {
    if (!selectedOut) {
      showAlert({
        type: 'error',
        title: 'Selection Required',
        message: 'Please select a player to release.'
      });
      return;
    }

    if (!transferWindow) {
      showAlert({
        type: 'error',
        title: 'Window Closed',
        message: 'There is no active transfer window.'
      });
      return;
    }

    setIsTransferring(true);

    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/transfers/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user!.uid,
          player_out_id: selectedOut.squad_id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || 'Release failed';
        showAlert({
          type: 'error',
          title: 'Release Failed',
          message: errorMsg
        });
        return;
      }

      showAlert({
        type: 'success',
        title: 'Player Released',
        message: `Successfully released ${selectedOut.player_name}. ${selectedOut.purchase_price || 0} Cr (100%) refunded to budget!`
      });

      setSelectedOut(null);
      loadTransferData();

    } catch (error: any) {
      console.error('Release error:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: `Failed to release player: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const updateCaptains = async () => {
    if (!user) return;

    setIsUpdatingCaptain(true);

    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/squad/set-captain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.uid,
          captain_player_id: captainId,
          vice_captain_player_id: viceCaptainId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        showAlert({
          type: 'error',
          title: 'Update Failed',
          message: data.error || 'Failed to update captain roles.'
        });
        return;
      }

      showAlert({
        type: 'success',
        title: 'Captains Updated',
        message: 'Captain and Vice-Captain roles updated successfully.'
      });
      setShowCaptainModal(false);
      loadTransferData();

    } catch (error: any) {
      console.error('Captain update error:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: `Failed to update captains: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setIsUpdatingCaptain(false);
    }
  };

  const maxTransfers = Number(transferWindow?.max_transfers_per_window ?? transferWindow?.max_releases ?? 1) || 1;
  const transfersRemaining = Math.max(0, maxTransfers - (Number(transfersUsed) || 0));

  const canExecuteRelease = () => {
    if (!transferWindow || (!transferWindow.is_active && transferWindow.status !== 'active')) return false;
    if (!teamInfo || !selectedOut) return false;
    if (transfersRemaining <= 0) return false;
    if (teamInfo.squad_size <= teamInfo.min_squad_size) return false;
    return true;
  };

  const filteredSquad = mySquad.filter(player => {
    if (!searchTerm) return true;
    const term = normalizeStr(searchTerm);
    return normalizeStr(player.player_name).includes(term) ||
           normalizeStr(player.category || player.tier || player.position || '').includes(term) ||
           normalizeStr(player.real_team_name || '').includes(term);
  });

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold">Loading releases console...</p>
        </div>
      </div>
    );
  }

  if (!user || !teamInfo) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="max-w-md w-full bg-white border border-slate-200/60 p-8 rounded-3xl text-center shadow-sm relative z-10">
          <div className="w-16 h-16 bg-slate-800 border border-slate-700 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">No Fantasy Team</h3>
          <p className="text-xs text-slate-455 font-bold uppercase leading-normal mb-6">
            You need to register for the fantasy league first.
          </p>
          <Link href="/dashboard" className="px-6 py-3 bg-slate-800 border border-slate-900 hover:bg-slate-700 text-amber-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!transferWindow || (!transferWindow.is_active && transferWindow.status !== 'active')) {
    return (
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="max-w-xl mx-auto relative z-10 space-y-6">
          <Link
            href="/dashboard/team/fantasy/my-team"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to My Team
          </Link>

          <div className="console-card bg-white border border-slate-200/60 p-8 rounded-3xl text-center shadow-sm">
            <Calendar className="w-16 h-16 text-slate-400 mx-auto mb-6" />
            <h2 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Release Window Closed</h2>
            <p className="text-xs text-slate-500 font-bold uppercase leading-normal mb-6">
              The player release window is currently closed.
            </p>
            <Link
              href="/dashboard/team/fantasy/my-team"
              className="inline-block px-6 py-3 bg-slate-800 border border-slate-900 hover:bg-slate-700 text-amber-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm"
            >
              View My Team
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthGuard requiredRole="team">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <AlertModal {...alertState} onClose={closeAlert} />

      <div className="max-w-5xl mx-auto relative z-10 space-y-6">
        {/* Navigation */}
        <div className="flex flex-wrap justify-between items-center gap-3">
          <Link
            href="/dashboard/team/fantasy/my-team"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to My Team
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/team/fantasy/releases"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs uppercase tracking-wider hover:bg-rose-100 transition-all"
            >
              My Release Log
            </Link>
            <Link
              href="/dashboard/team/fantasy/draft"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-sm"
            >
              Post-Release Draft
            </Link>
          </div>
        </div>

        {/* Top Banner (Window Status & Stats Grid) */}
        <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase bg-amber-500 border border-amber-600 text-slate-900 px-2.5 py-0.5 rounded-lg font-black tracking-wider">
                  RELEASE WINDOW ACTIVE
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase">{teamInfo.team_name}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-1.5 uppercase">{transferWindow.window_name}</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                Release players to receive 100% Cr refund. Replacement players are acquired via Post-Release Draft.
              </p>
            </div>

            <button
              onClick={() => setShowCaptainModal(true)}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-750 border border-slate-900 text-amber-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Star className="w-4 h-4" /> Change Captain / VC
            </button>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
              <p className="text-[9px] text-slate-400 uppercase font-black">Budget</p>
              <p className="text-lg font-black mt-1 text-emerald-650">
                {teamInfo.budget_remaining} Cr
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
              <p className="text-[9px] text-slate-400 uppercase font-black">Squad Size</p>
              <p className="text-lg font-black text-slate-850 mt-1">{teamInfo.squad_size}</p>
              <p className="text-[8px] text-slate-400 font-bold uppercase mt-0.5">{teamInfo.min_squad_size}-{teamInfo.max_squad_size} limit</p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
              <p className="text-[9px] text-slate-400 uppercase font-black">Releases Left</p>
              <p className="text-lg font-black text-amber-650 mt-1">{transfersRemaining}</p>
            </div>
          </div>
        </div>

        {/* Supported (Passive) Team Release Banner */}
        <div className="console-card bg-white border border-slate-200/60 p-5 rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[9px] text-slate-400 font-black uppercase">Supported Team (Passive Team)</p>
              <p className="text-sm font-black text-slate-900 uppercase">
                {teamInfo.supported_team_name ? teamInfo.supported_team_name : 'No Supported Team Assigned'}
              </p>
            </div>
          </div>

          {teamInfo.supported_team_name && (
            <button
              onClick={releaseSupportedTeam}
              disabled={isReleasingPassiveTeam}
              className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
            >
              {isReleasingPassiveTeam ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-rose-700/30 border-t-rose-700 rounded-full animate-spin" />
                  Releasing...
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" /> Release Supported Team
                </>
              )}
            </button>
          )}
        </div>

        {/* Captain Selection Modal */}
        {showCaptainModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 font-mono">
            <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden">
              <div className="bg-slate-800 border-b border-slate-900 text-white p-5 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
                    <Star className="w-4.5 h-4.5" /> Captaincy Settings
                  </h2>
                  <p className="text-[9px] text-slate-400 uppercase font-bold mt-1">
                    Captain (2x Points) | Vice-Captain (1.5x Points)
                  </p>
                </div>
                <button
                  onClick={() => setShowCaptainModal(false)}
                  className="p-1 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                {/* Captain Selection */}
                <div>
                  <h3 className="text-[10px] font-black text-slate-400 uppercase mb-2">
                    Select Captain (2x Points)
                  </h3>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {mySquad.map((player) => (
                      <button
                        key={`captain-${player.real_player_id}`}
                        onClick={() => setCaptainId(player.real_player_id)}
                        disabled={viceCaptainId === player.real_player_id}
                        className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                          captainId === player.real_player_id
                            ? 'bg-amber-50 border-amber-400 text-amber-900 shadow-sm'
                            : viceCaptainId === player.real_player_id
                            ? 'bg-slate-50 border-slate-100 text-slate-350 cursor-not-allowed opacity-60'
                            : 'bg-white border-slate-200 hover:border-slate-350 text-slate-800'
                        }`}
                      >
                        <div>
                          <p className="text-xs font-black uppercase">{player.player_name}</p>
                          <p className="text-[9px] font-bold text-slate-450 uppercase mt-0.5">
                            {player.category || player.tier || player.position} | {player.real_team_name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black">{player.total_points || 0} pts</p>
                          {captainId === player.real_player_id && <Check className="w-4 h-4 ml-auto text-amber-600 mt-1" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Vice-Captain Selection */}
                <div>
                  <h3 className="text-[10px] font-black text-slate-400 uppercase mb-2">
                    Select Vice-Captain (1.5x Points)
                  </h3>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {mySquad.map((player) => (
                      <button
                        key={`vc-${player.real_player_id}`}
                        onClick={() => setViceCaptainId(player.real_player_id)}
                        disabled={captainId === player.real_player_id}
                        className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                          viceCaptainId === player.real_player_id
                            ? 'bg-slate-50 border-indigo-400 text-slate-850 shadow-sm'
                            : captainId === player.real_player_id
                            ? 'bg-slate-50 border-slate-100 text-slate-350 cursor-not-allowed opacity-60'
                            : 'bg-white border-slate-200 hover:border-slate-350 text-slate-800'
                        }`}
                      >
                        <div>
                          <p className="text-xs font-black uppercase">{player.player_name}</p>
                          <p className="text-[9px] font-bold text-slate-450 uppercase mt-0.5">
                            {player.category || player.tier || player.position} | {player.real_team_name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black">{player.total_points || 0} pts</p>
                          {viceCaptainId === player.real_player_id && <Check className="w-4 h-4 ml-auto text-indigo-650 mt-1" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {captainId === viceCaptainId && captainId && (
                  <div className="p-3.5 bg-rose-50 border border-rose-250 rounded-xl flex items-center gap-2 text-rose-750 text-[10px] uppercase font-bold">
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    Captain and Vice-Captain must be different players.
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setShowCaptainModal(false)}
                    className="flex-1 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs uppercase border border-slate-200 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={updateCaptains}
                    disabled={isUpdatingCaptain || !captainId || !viceCaptainId || captainId === viceCaptainId}
                    className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs uppercase rounded-xl border border-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isUpdatingCaptain ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Save Captains
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Selected Player Release Confirmation Card */}
        {selectedOut && (
          <div className="console-card bg-rose-50/70 border border-rose-200 p-6 rounded-3xl shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-rose-100 pb-3">
              <div>
                <h3 className="text-xs font-black uppercase text-rose-900 tracking-wider flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-rose-600" /> Selected Player for Release
                </h3>
                <p className="text-[10px] uppercase font-bold text-rose-700 mt-0.5">
                  Confirm releasing this player. 100% of purchase price ({selectedOut.purchase_price || 0} Cr) will be credited to budget.
                </p>
              </div>

              <button
                onClick={() => setSelectedOut(null)}
                className="p-1 text-rose-400 hover:text-rose-700 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center bg-white border border-rose-100 p-4 rounded-2xl">
              <div>
                <p className="text-[8px] text-slate-400 font-bold uppercase mb-1">Player Name</p>
                <p className="text-sm font-black uppercase text-slate-900">{selectedOut.player_name}</p>
                <p className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">
                  Category: {selectedOut.category || selectedOut.tier || selectedOut.position || 'Unknown'} | Team: {selectedOut.real_team_name || 'Unknown'}
                </p>
              </div>

              <div>
                <p className="text-[8px] text-slate-400 font-bold uppercase mb-1">Refund Telemetry</p>
                <p className="text-xs font-black uppercase text-emerald-650">+{selectedOut.purchase_price || 0} Cr (100% Refund)</p>
                <p className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">
                  New Budget: {(teamInfo.budget_remaining + (selectedOut.purchase_price || 0))} Cr
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={executeRelease}
                  disabled={!canExecuteRelease() || isTransferring}
                  className="w-full sm:w-auto px-6 py-3 bg-rose-600 hover:bg-rose-700 border border-rose-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isTransferring ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Releasing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" /> Confirm Release
                    </>
                  )}
                </button>
              </div>
            </div>

            {!canExecuteRelease() && (
              <div className="p-3 bg-rose-100/80 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-800 text-[9px] uppercase font-black">
                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  {transfersRemaining <= 0 && 'No release allowance remaining in this window.'}
                  {teamInfo.squad_size <= teamInfo.min_squad_size && `Cannot release - minimum squad size is ${teamInfo.min_squad_size} players.`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* My Squad Card */}
        <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-slate-500" /> Select Squad Player to Release
              </h2>
              <p className="text-[10px] uppercase font-bold text-slate-400 mt-0.5">
                Click any player from your active roster to release them.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search squad..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-250 rounded-xl text-xs font-bold uppercase text-slate-850 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredSquad.map((player) => (
              <button
                key={player.squad_id}
                onClick={() => setSelectedOut(selectedOut?.squad_id === player.squad_id ? null : player)}
                className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer gap-3 ${
                  selectedOut?.squad_id === player.squad_id
                    ? 'bg-rose-50 border-rose-400 text-rose-950 shadow-sm ring-2 ring-rose-400'
                    : 'bg-slate-50 hover:bg-slate-100/70 border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {(player as any).photo_url ? (
                    <img
                      src={(player as any).photo_url}
                      alt={player.player_name}
                      className="w-10 h-10 rounded-xl object-cover border border-slate-200 shadow-sm shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-slate-800 border border-slate-700 text-amber-400 rounded-xl flex items-center justify-center text-[10px] font-black shadow-sm shrink-0">
                      {(player.player_name || '').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-xs font-black uppercase truncate">{player.player_name}</p>
                      {player.is_captain && <span className="text-[8px] px-2 py-0.5 bg-amber-500 text-slate-900 rounded-lg font-black uppercase tracking-wider">C</span>}
                      {player.is_vice_captain && <span className="text-[8px] px-2 py-0.5 bg-slate-800 text-white rounded-lg font-black uppercase tracking-wider">VC</span>}
                    </div>
                    <p className={`text-[9px] font-bold uppercase ${selectedOut?.squad_id === player.squad_id ? 'text-rose-700' : 'text-slate-450'}`}>
                      Category: {player.category || player.tier || player.position || 'Unknown'} | {player.real_team_name || 'Unknown'}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-xs font-black">{player.purchase_price || 0} Cr</p>
                  <p className={`text-[8px] font-bold uppercase mt-1 ${selectedOut?.squad_id === player.squad_id ? 'text-rose-700 font-black' : 'text-emerald-600'}`}>
                    {selectedOut?.squad_id === player.squad_id ? 'SELECTED' : '100% Refund'}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {filteredSquad.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-xs font-bold uppercase">
              <Users className="w-8 h-8 text-slate-350 mx-auto mb-2" />
              <p>No squad members found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  
    </AuthGuard>
  );
}
