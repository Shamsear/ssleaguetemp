'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { AlertCircle, ArrowLeftRight, Calendar, Check, DollarSign, Filter, Search, Star, TrendingUp, Users, X, XCircle, Shield, Award, Activity, CheckCircle, ArrowLeft } from 'lucide-react';
import { normalizeStr } from '@/lib/utils/normalizeStr';
import AlertModal from '@/components/modals/AlertModal';
import { useModal } from '@/hooks/useModal';
import AuthGuard from '@/components/auth/AuthGuard';

interface Player {
  squad_id?: string;
  real_player_id: string;
  player_name: string;
  position: string;
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
  max_transfers_per_window: number;
  points_cost_per_transfer: number;
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
}

export default function TeamTransfersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [mySquad, setMySquad] = useState<Player[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null);
  const [transferWindow, setTransferWindow] = useState<TransferWindow | null>(null);
  const [transfersUsed, setTransfersUsed] = useState(0);
  
  const [selectedOut, setSelectedOut] = useState<Player | null>(null);
  const [selectedIn, setSelectedIn] = useState<Player | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isUpdatingCaptain, setIsUpdatingCaptain] = useState(false);
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
      
      setLeagueId(team.fantasy_league_id);

      // Get full squad data from fantasy_squad table
      const squadRes = await fetchWithTokenRefresh(`/api/fantasy/squad?team_id=${team.id}`);
      let squad = [];
      
      if (squadRes.ok) {
        const squadData = await squadRes.json();
        squad = squadData.squad || [];
      } else {
        // Fallback to players from my-team
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
        
        // Get league info for squad size limits
        const leagueRes = await fetchWithTokenRefresh(`/api/fantasy/leagues/${team.fantasy_league_id}`);
        let minSquadSize = 11;
        let maxSquadSize = 15;
        let totalBudget = 100;
        
        if (leagueRes.ok) {
          const leagueData = await leagueRes.json();
          const leagueDetails = leagueData.league;
          minSquadSize = Number(leagueDetails.min_squad_size || 11);
          maxSquadSize = Number(leagueDetails.max_squad_size || 15);
          totalBudget = Number(leagueDetails.budget_per_team || 100);
        }
        
        setTeamInfo({
          team_id: team.id,
          team_name: team.team_name,
          budget_remaining: Number(teamDetails.budget_remaining || 0),
          total_budget: totalBudget,
          squad_size: squad.length,
          min_squad_size: minSquadSize,
          max_squad_size: maxSquadSize,
          total_points: Number(teamDetails.total_points || 0),
        });
      }

      // Get active transfer window
      const windowRes = await fetchWithTokenRefresh(`/api/fantasy/transfer-windows?league_id=${team.fantasy_league_id}`);
      if (windowRes.ok) {
        const windowData = await windowRes.json();
        const activeWindow = (windowData.windows || []).find((w: TransferWindow) => w.is_active);
        
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

      // Get available players
      const playersRes = await fetchWithTokenRefresh(`/api/fantasy/players/available?league_id=${team.fantasy_league_id}`);
      if (playersRes.ok) {
        const playersData = await playersRes.json();
        setAvailablePlayers(playersData.available_players || []);
      }

    } catch (error) {
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

  const executeTransfer = async () => {
    if (!selectedOut && !selectedIn) {
      showAlert({
        type: 'error',
        title: 'Selection Required',
        message: 'Please select at least one player to release or sign.'
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
          player_out_id: selectedOut?.squad_id || null,
          player_in_id: selectedIn?.real_player_id || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || 'Transfer failed';
        const details = data.details ? ` Details: ${data.details}` : '';
        const message = data.message ? ` ${data.message}` : '';
        showAlert({
          type: 'error',
          title: 'Transfer Failed',
          message: `${errorMsg}${message}${details}`
        });
        return;
      }

      // Build success message
      let summary = 'Transfer completed successfully. ';
      if (data.transfer.player_out) {
        summary += `Released ${data.transfer.player_out.name} (+${data.transfer.player_out.refund} Cr). `;
      }
      if (data.transfer.player_in) {
        summary += `Signed ${data.transfer.player_in.name} (-${data.transfer.player_in.cost} Cr). `;
      }

      showAlert({
        type: 'success',
        title: 'Transfer Completed',
        message: `${summary} New Budget: ${data.transfer.new_budget} Cr. Transfers Remaining: ${data.transfer.transfers_remaining}`
      });

      // Reset selections and reload
      setSelectedOut(null);
      setSelectedIn(null);
      loadTransferData();

    } catch (error) {
      console.error('Transfer error:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: `Failed to execute transfer: ${error instanceof Error ? error.message : 'Unknown error'}`
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

    } catch (error) {
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

  const calculateNewBudget = () => {
    if (!teamInfo) return 0;
    
    let budget = teamInfo.budget_remaining;
    
    if (selectedOut) {
      budget += (selectedOut.purchase_price || 0);
    }
    
    if (selectedIn) {
      budget -= (selectedIn.current_price || selectedIn.draft_price || 0);
    }
    
    return budget;
  };

  const canExecuteTransfer = () => {
    if (!transferWindow || !transferWindow.is_active) return false;
    if (!teamInfo) return false;
    
    // Must have at least one action (release or sign)
    if (!selectedOut && !selectedIn) return false;
    
    const transfersRemaining = transferWindow.max_transfers_per_window - transfersUsed;
    if (transfersRemaining <= 0) return false;
    
    // Release-only transfer
    if (selectedOut && !selectedIn) {
      // Can only release if above minimum squad size
      if (teamInfo.squad_size <= teamInfo.min_squad_size) return false;
      return true;
    }
    
    // Sign-only or swap transfer
    if (selectedIn) {
      const newBudget = calculateNewBudget();
      if (newBudget < 0) return false;
      
      // If not releasing anyone, check squad size
      if (!selectedOut && teamInfo.squad_size >= teamInfo.max_squad_size) return false;
    }
    
    return true;
  };

  // Filter available players
  const filteredPlayers = availablePlayers.filter(player => {
    if (searchTerm && !normalizeStr(player.player_name).includes(normalizeStr(searchTerm))) {
      return false;
    }
    if (positionFilter !== 'all' && player.position !== positionFilter) {
      return false;
    }
    if (teamFilter !== 'all' && (player.real_team_name || player.team) !== teamFilter) {
      return false;
    }
    return true;
  });

  // Get unique positions and teams for filters
  const positions = Array.from(new Set(availablePlayers.map(p => p.position))).sort();
  const teams = Array.from(new Set(availablePlayers.map(p => p.real_team_name || p.team || 'Unknown'))).sort();

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold">Loading transfers dashboard...</p>
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
            You need to register for the fantasy league first to make transfers.
          </p>
          <Link href="/dashboard" className="px-6 py-3 bg-slate-800 border border-slate-900 hover:bg-slate-700 text-amber-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!transferWindow || !transferWindow.is_active) {
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
            <h2 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Transfer Window Closed</h2>
            <p className="text-xs text-slate-500 font-bold uppercase leading-normal mb-6">
              The transfer window is currently closed. Keep training and check back when the next window opens.
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

  const newBudget = calculateNewBudget();
  const transfersRemaining = transferWindow.max_transfers_per_window - transfersUsed;

  return (
    <AuthGuard requiredRole="team">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <AlertModal {...alertState} onClose={closeAlert} />

      <div className="max-w-6xl mx-auto relative z-10 space-y-6">
        {/* Navigation */}
        <div className="flex justify-between items-center">
          <Link
            href="/dashboard/team/fantasy/my-team"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to My Team
          </Link>
        </div>

        {/* Top Banner (Window Status & Telemetry Grid) */}
        <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase bg-amber-500 border border-amber-600 text-slate-900 px-2.5 py-0.5 rounded-lg font-black tracking-wider">
                  TRANSFER WINDOW ACTIVE
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase">{teamInfo.team_name}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-1.5 uppercase">{transferWindow.window_name}</h1>
            </div>

            <button
              onClick={() => setShowCaptainModal(true)}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-750 border border-slate-900 text-amber-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Star className="w-4 h-4" /> Change Captain / VC
            </button>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
              <p className="text-[9px] text-slate-400 uppercase font-black">Total Points</p>
              <p className="text-lg font-black text-slate-850 mt-1">{teamInfo.total_points}</p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
              <p className="text-[9px] text-slate-400 uppercase font-black">Budget</p>
              <p className={`text-lg font-black mt-1 ${teamInfo.budget_remaining < 0 ? 'text-rose-600' : 'text-emerald-650'}`}>
                {teamInfo.budget_remaining} Cr
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
              <p className="text-[9px] text-slate-400 uppercase font-black">Squad Size</p>
              <p className="text-lg font-black text-slate-850 mt-1">{teamInfo.squad_size}</p>
              <p className="text-[8px] text-slate-400 font-bold uppercase mt-0.5">{teamInfo.min_squad_size}-{teamInfo.max_squad_size} limit</p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
              <p className="text-[9px] text-slate-400 uppercase font-black">Transfers Left</p>
              <p className="text-lg font-black text-amber-650 mt-1">{transfersRemaining}</p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 col-span-2 sm:col-span-1">
              <p className="text-[9px] text-slate-400 uppercase font-black">Points Penalty</p>
              <p className="text-lg font-black text-slate-850 mt-1">{transferWindow.points_cost_per_transfer} pts</p>
            </div>
          </div>
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
                            {player.position} | {player.real_team_name}
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
                            {player.position} | {player.real_team_name}
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

        {/* Transfer Summary Widget */}
        {(selectedOut || selectedIn) && (
          <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Pending Transfer Transaction</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center mb-6">
              {/* Player Out */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
                <p className="text-[9px] text-slate-400 uppercase font-black mb-2">Releasing Player</p>
                {selectedOut ? (
                  <div>
                    <p className="text-xs font-black text-slate-850 uppercase">{selectedOut.player_name}</p>
                    <p className="text-[9px] font-bold text-slate-450 uppercase mt-0.5">{selectedOut.position} | {selectedOut.real_team_name}</p>
                    <p className="text-emerald-650 font-black text-xs mt-2.5">+{selectedOut.purchase_price} Cr</p>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 font-bold uppercase italic">No selection</p>
                )}
              </div>

              {/* Arrow */}
              <div className="flex items-center justify-center py-2 md:py-0">
                <ArrowLeftRight className="w-6 h-6 text-slate-400" />
              </div>

              {/* Player In */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
                <p className="text-[9px] text-slate-400 uppercase font-black mb-2">Signing Player</p>
                {selectedIn ? (
                  <div>
                    <p className="text-xs font-black text-slate-850 uppercase">{selectedIn.player_name}</p>
                    <p className="text-[9px] font-bold text-slate-450 uppercase mt-0.5">{selectedIn.position} | {selectedIn.real_team_name}</p>
                    <p className="text-rose-600 font-black text-xs mt-2.5">-{selectedIn.current_price || selectedIn.draft_price} Cr</p>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-450 font-bold uppercase italic">Release Only</p>
                )}
              </div>
            </div>

            {/* Impact Telemetry logs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 border border-slate-200/85 p-5 rounded-2xl">
              {/* Budget Section */}
              <div>
                <h4 className="text-[9px] font-black text-slate-400 uppercase mb-3">Budget Impact Summary</h4>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
                    <span>Current Budget:</span>
                    <span>{teamInfo.budget_remaining} Cr</span>
                  </div>
                  {selectedOut && (
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase text-emerald-650">
                      <span>+ Release {selectedOut.player_name}:</span>
                      <span>+{selectedOut.purchase_price} Cr</span>
                    </div>
                  )}
                  {selectedIn && (
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase text-rose-600">
                      <span>- Sign {selectedIn.player_name}:</span>
                      <span>-{selectedIn.current_price || selectedIn.draft_price} Cr</span>
                    </div>
                  )}
                  <div className="border-t border-slate-200 pt-2 mt-2 flex items-center justify-between text-xs font-black uppercase">
                    <span className="text-slate-800">New Budget:</span>
                    <span className={newBudget >= 0 ? 'text-emerald-650' : 'text-rose-600'}>
                      {newBudget} Cr
                    </span>
                  </div>
                </div>
              </div>

              {/* Points Section */}
              <div>
                <h4 className="text-[9px] font-black text-slate-400 uppercase mb-3">Points penalty Summary</h4>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
                    <span>Current points:</span>
                    <span>{teamInfo.total_points}</span>
                  </div>
                  {transferWindow.points_cost_per_transfer > 0 && (
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase text-rose-600">
                      <span>- Penalty Cost:</span>
                      <span>-{transferWindow.points_cost_per_transfer} pts</span>
                    </div>
                  )}
                  <div className="border-t border-slate-200 pt-2 mt-2 flex items-center justify-between text-xs font-black uppercase text-slate-850">
                    <span>New total points:</span>
                    <span>
                      {teamInfo.total_points - (transferWindow.points_cost_per_transfer || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Execute Button */}
            <button
              onClick={executeTransfer}
              disabled={!canExecuteTransfer() || isTransferring}
              className="w-full mt-4 px-6 py-3.5 bg-slate-850 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer border border-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTransferring ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {selectedOut && !selectedIn ? 'Confirm Release' : selectedIn && !selectedOut ? 'Confirm Signing' : 'Execute Exchange'}
                </>
              )}
            </button>

            {!canExecuteTransfer() && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-850 text-[9px] uppercase font-black">
                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  {selectedIn && newBudget < 0 && 'Insufficient budget Cr.'}
                  {transfersRemaining <= 0 && 'No transfers remaining in this window.'}
                  {selectedIn && !selectedOut && teamInfo.squad_size >= teamInfo.max_squad_size && 'Squad limit full - release a player first.'}
                  {selectedOut && !selectedIn && teamInfo.squad_size <= teamInfo.min_squad_size && `Cannot release - minimum squad size is ${teamInfo.min_squad_size} players.`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Content split grid (My Squad vs Available Pool) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* My Squad Card */}
          <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2 flex items-center justify-between">
              <span className="flex items-center gap-2"><Users className="w-4.5 h-4.5 text-slate-500" /> My Squad</span>
              <span className="text-[9px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{mySquad.length} Players</span>
            </h2>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {mySquad.map((player) => (
                <button
                  key={player.squad_id}
                  onClick={() => setSelectedOut(selectedOut?.squad_id === player.squad_id ? null : player)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                    selectedOut?.squad_id === player.squad_id
                      ? 'bg-rose-50 border-rose-400 text-rose-950 shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100/70 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-xs font-black uppercase truncate">{player.player_name}</p>
                      {player.is_captain && <span className="text-[8px] px-2 py-0.5 bg-amber-500 text-slate-900 rounded-lg font-black uppercase tracking-wider">C</span>}
                      {player.is_vice_captain && <span className="text-[8px] px-2 py-0.5 bg-slate-800 text-white rounded-lg font-black uppercase tracking-wider">VC</span>}
                    </div>
                    <p className={`text-[9px] font-bold uppercase ${selectedOut?.squad_id === player.squad_id ? 'text-rose-700' : 'text-slate-450'}`}>
                      {player.position || 'Unknown'} | {player.real_team_name || 'Unknown'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-black">{player.purchase_price || 0} Cr</p>
                    <p className={`text-[8px] font-bold uppercase mt-1 ${selectedOut?.squad_id === player.squad_id ? 'text-rose-700' : 'text-slate-400'}`}>
                      {player.total_points || 0} pts
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Available Players Pool Card */}
          <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2 flex items-center justify-between">
              <span className="flex items-center gap-2"><TrendingUp className="w-4.5 h-4.5 text-slate-500" /> Available pool</span>
              <span className="text-[9px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{filteredPlayers.length} matches</span>
            </h2>

            {/* Filters */}
            <div className="mb-4 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search available players..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-250 rounded-xl text-xs font-bold uppercase text-slate-850 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-250 rounded-xl text-[10px] font-bold uppercase text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="all">All Positions</option>
                  {positions.map(pos => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>

                <select
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-250 rounded-xl text-[10px] font-bold uppercase text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="all">All Teams</option>
                  {teams.map(team => (
                    <option key={team} value={team}>{team}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Available Players list */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredPlayers.map((player) => (
                <button
                  key={player.real_player_id}
                  onClick={() => setSelectedIn(selectedIn?.real_player_id === player.real_player_id ? null : player)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                    selectedIn?.real_player_id === player.real_player_id
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100/70 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-xs font-black uppercase truncate">{player.player_name}</p>
                      <div className="flex gap-0.5 shrink-0">
                        {Array.from({ length: player.star_rating || 0 }).map((_, i) => (
                          <Star key={`star-${player.real_player_id}-${i}`} className={`w-3 h-3 ${selectedIn?.real_player_id === player.real_player_id ? 'text-emerald-600 fill-emerald-600' : 'text-amber-500 fill-amber-500'}`} />
                        ))}
                      </div>
                    </div>
                    <p className={`text-[9px] font-bold uppercase ${selectedIn?.real_player_id === player.real_player_id ? 'text-emerald-700' : 'text-slate-450'}`}>
                      {player.position || 'Unknown'} | {player.real_team_name || player.team || 'Unknown'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-black">{player.current_price || player.draft_price || 0} Cr</p>
                  </div>
                </button>
              ))}

              {filteredPlayers.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-xs font-bold uppercase">
                  <Filter className="w-8 h-8 text-slate-350 mx-auto mb-2" />
                  <p>No matching available players found</p>
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
