'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { AlertCircle, Calendar, Check, Search, Star, Users, X, XCircle, Shield, ArrowLeft, Trash2, Send, Clock, Timer } from 'lucide-react';
import { normalizeStr } from '@/lib/utils/normalizeStr';
import AlertModal from '@/components/modals/AlertModal';
import { useModal } from '@/hooks/useModal';
import AuthGuard from '@/components/auth/AuthGuard';

const formatToIST = (dateStr?: string) => {
  if (!dateStr) return '—';
  try {
    const str = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
    const zStr = str.endsWith('Z') || str.includes('+') ? str : str + 'Z';
    return new Date(zStr).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }) + ' IST';
  } catch (e) {
    return new Date(dateStr).toLocaleString() + ' IST';
  }
};

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
  const [countdown, setCountdown] = useState<string>('');
  
  // Selection states for pending submit
  const [selectedSquadIds, setSelectedSquadIds] = useState<string[]>([]);
  const [releasePassiveTeam, setReleasePassiveTeam] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingReleases, setIsSubmittingReleases] = useState(false);
  const [leagueId, setLeagueId] = useState<string>('');

  const { alertState, showAlert, closeAlert } = useModal();

  useEffect(() => {
    if (!transferWindow?.closes_at) return;

    const updateTimer = () => {
      const closesStr = transferWindow.closes_at;
      const str = closesStr.includes('T') ? closesStr : closesStr.replace(' ', 'T');
      const zStr = str.endsWith('Z') || str.includes('+') ? str : str + 'Z';
      const closeTime = new Date(zStr).getTime();
      const diff = closeTime - Date.now();

      if (diff <= 0) {
        setCountdown('Deadline Passed');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setCountdown(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setCountdown(`${minutes}m ${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [transferWindow?.closes_at]);

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

      // Get team info with budget
      const teamInfoRes = await fetchWithTokenRefresh(`/api/fantasy/teams/${team.id}`);
      if (teamInfoRes.ok) {
        const teamInfoData = await teamInfoRes.json();
        const teamDetails = teamInfoData.team;
        
        const leagueRes = await fetchWithTokenRefresh(`/api/fantasy/leagues/${team.fantasy_league_id || team.league_id}`);
        let minSquadSize = 0;
        let maxSquadSize = 5;
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

  const maxTransfers = Number(transferWindow?.max_transfers_per_window ?? transferWindow?.max_releases ?? 1) || 1;
  const transfersRemaining = Math.max(0, maxTransfers - (Number(transfersUsed) || 0));

  const toggleSelectSquadPlayer = (squadId: string) => {
    if (selectedSquadIds.includes(squadId)) {
      setSelectedSquadIds(selectedSquadIds.filter(id => id !== squadId));
    } else {
      if (selectedSquadIds.length >= transfersRemaining) {
        showAlert({
          type: 'error',
          title: 'Release Limit Reached',
          message: `You can only select up to ${transfersRemaining} player(s) for release in this window.`
        });
        return;
      }
      setSelectedSquadIds([...selectedSquadIds, squadId]);
    }
  };

  const selectedPlayersList = mySquad.filter(p => p.squad_id && selectedSquadIds.includes(p.squad_id));
  const totalRefundAmount = selectedPlayersList.reduce((acc, p) => acc + (p.purchase_price || 0), 0);

  const executeBatchRelease = async () => {
    if (selectedSquadIds.length === 0 && !releasePassiveTeam) {
      showAlert({
        type: 'error',
        title: 'No Release Selected',
        message: 'Please select at least one player or your supported team to release before submitting.'
      });
      return;
    }

    if (!transferWindow) {
      showAlert({
        type: 'error',
        title: 'Window Closed',
        message: 'There is no active release window.'
      });
      return;
    }

    const confirmMsg = `Are you sure you want to submit your release choices?\n- Squad Players to Release: ${selectedPlayersList.map(p => p.player_name).join(', ') || 'None'}\n- Release Supported Team: ${releasePassiveTeam ? teamInfo?.supported_team_name : 'No'}\n- Total Refund: +${totalRefundAmount} Cr`;

    if (!confirm(confirmMsg)) return;

    setIsSubmittingReleases(true);

    try {
      let releasedCount = 0;
      let totalRefund = 0;

      // 1. Process player releases
      for (const squadId of selectedSquadIds) {
        const response = await fetchWithTokenRefresh('/api/fantasy/transfers/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user!.uid,
            player_out_id: squadId,
          }),
        });

        const data = await response.json();
        if (response.ok) {
          releasedCount++;
          if (data.transfer?.player_out?.refund) {
            totalRefund += Number(data.transfer.player_out.refund);
          }
        } else {
          console.error(`Failed to release player ${squadId}:`, data.error);
        }
      }

      // 2. Process passive team release if selected
      if (releasePassiveTeam && teamInfo?.supported_team_name) {
        await fetchWithTokenRefresh('/api/fantasy/supported-team/change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user!.uid,
            is_release: true,
          }),
        });
      }

      showAlert({
        type: 'success',
        title: 'Releases Submitted!',
        message: `Successfully released ${releasedCount} player(s)${releasePassiveTeam ? ' and your Supported Team' : ''}! Total ${totalRefund} Cr refunded to budget.`
      });

      // Clear selections and reload
      setSelectedSquadIds([]);
      setReleasePassiveTeam(false);
      loadTransferData();

    } catch (error: any) {
      console.error('Batch release error:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: `Failed to submit release selections: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setIsSubmittingReleases(false);
    }
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

  const hasSelections = selectedSquadIds.length > 0 || releasePassiveTeam;

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
        <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase bg-amber-500 border border-amber-600 text-slate-900 px-2.5 py-0.5 rounded-lg font-black tracking-wider">
                  RELEASE WINDOW ACTIVE
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase">{teamInfo.team_name}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-1.5 uppercase">{transferWindow.window_name}</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                Select the players and supported team to release, then click Submit to confirm. Releases receive 100% Cr refund.
              </p>
            </div>

            <Link
              href="/dashboard/team/fantasy/captain-selection"
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-750 border border-slate-900 text-amber-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              <Star className="w-4 h-4" /> Captain & VC Window →
            </Link>
          </div>

          {/* Start Time & Deadline Badge Bar */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs font-bold">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[9px] text-slate-400 uppercase font-black">Window Start Time</p>
                <p className="text-xs font-black text-slate-850">{formatToIST(transferWindow.opens_at)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[9px] text-rose-500 uppercase font-black">Deadline (Closes At)</p>
                <p className="text-xs font-black text-rose-900">{formatToIST(transferWindow.closes_at)}</p>
              </div>
            </div>

            {countdown && (
              <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-emerald-200 text-emerald-800 shadow-sm">
                <Timer className="w-4 h-4 text-emerald-600 animate-pulse shrink-0" />
                <div>
                  <p className="text-[8px] text-slate-400 uppercase font-black">Time Remaining</p>
                  <p className="text-xs font-black font-mono text-emerald-700">{countdown}</p>
                </div>
              </div>
            )}
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
              <p className="text-[9px] text-slate-400 uppercase font-black">Deadline</p>
              <p className="text-xs font-black text-rose-600 mt-1 truncate">{formatToIST(transferWindow.closes_at)}</p>
              <p className="text-[9px] text-emerald-600 font-black uppercase mt-0.5">⏱ {countdown || 'Active'}</p>
            </div>
          </div>
        </div>

        {/* Supported (Passive) Team Release Card */}
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
            <label className={`px-4 py-2.5 rounded-xl border font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all ${
              releasePassiveTeam
                ? 'bg-rose-50 border-rose-400 text-rose-900 shadow-sm ring-2 ring-rose-300'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
            }`}>
              <input
                type="checkbox"
                checked={releasePassiveTeam}
                onChange={() => setReleasePassiveTeam(!releasePassiveTeam)}
                className="w-4 h-4 accent-rose-600 rounded cursor-pointer"
              />
              <span>{releasePassiveTeam ? 'Selected for Release' : 'Select to Release Supported Team'}</span>
            </label>
          )}
        </div>

        {/* Selected Releases Pending Submission Banner */}
        {hasSelections && (
          <div className="console-card bg-rose-50/80 border border-rose-200 p-6 rounded-3xl shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-rose-100 pb-3">
              <div>
                <h3 className="text-xs font-black uppercase text-rose-900 tracking-wider flex items-center gap-2">
                  <Trash2 className="w-4.5 h-4.5 text-rose-600" /> Pending Release Selections
                </h3>
                <p className="text-[10px] uppercase font-bold text-rose-700 mt-0.5">
                  Review your selected releases below. Nothing is deleted from your team until you click Submit Releases.
                </p>
              </div>

              <button
                onClick={() => { setSelectedSquadIds([]); setReleasePassiveTeam(false); }}
                className="text-xs text-rose-600 font-bold uppercase hover:underline cursor-pointer"
              >
                Clear Selections
              </button>
            </div>

            <div className="space-y-2">
              {selectedPlayersList.map((player) => (
                <div key={`sel-${player.squad_id}`} className="flex items-center justify-between bg-white p-3 rounded-xl border border-rose-100 text-xs">
                  <div>
                    <span className="font-black uppercase text-slate-900">{player.player_name}</span>
                    <span className="text-[9px] text-slate-400 uppercase ml-2">({player.category || player.tier || player.position})</span>
                  </div>
                  <span className="font-black text-emerald-650">+{player.purchase_price || 0} Cr Refund</span>
                </div>
              ))}

              {releasePassiveTeam && teamInfo?.supported_team_name && (
                <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-rose-100 text-xs">
                  <div>
                    <span className="font-black uppercase text-slate-900">Supported Team: {teamInfo.supported_team_name}</span>
                    <span className="text-[9px] text-slate-400 uppercase ml-2">(Passive Team)</span>
                  </div>
                  <span className="font-black text-slate-500">Release Supported Team</span>
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-rose-100">
              <div>
                <p className="text-[9px] font-black uppercase text-slate-500">Total Refund Estimated</p>
                <p className="text-lg font-black text-emerald-650">+{totalRefundAmount} Cr</p>
              </div>

              <button
                onClick={executeBatchRelease}
                disabled={isSubmittingReleases}
                className="px-8 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer border border-rose-800 disabled:opacity-50"
              >
                {isSubmittingReleases ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Submitting Releases...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Submit Releases
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* My Squad Selection Roster */}
        <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-slate-500" /> Select Squad Players to Release
              </h2>
              <p className="text-[10px] uppercase font-bold text-slate-400 mt-0.5">
                Check/select the players you want to release. Click Submit Releases when ready.
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
            {filteredSquad.map((player) => {
              const isSelected = player.squad_id && selectedSquadIds.includes(player.squad_id);
              return (
                <button
                  key={player.squad_id}
                  onClick={() => player.squad_id && toggleSelectSquadPlayer(player.squad_id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer gap-3 ${
                    isSelected
                      ? 'bg-rose-50 border-rose-400 text-rose-950 shadow-sm ring-2 ring-rose-400'
                      : 'bg-slate-50 hover:bg-slate-100/70 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={!!isSelected}
                      onChange={() => {}} // handled by parent button click
                      className="w-4.5 h-4.5 accent-rose-600 rounded shrink-0 cursor-pointer"
                    />
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
                      <p className={`text-[9px] font-bold uppercase ${isSelected ? 'text-rose-700' : 'text-slate-450'}`}>
                        Category: {player.category || player.tier || player.position || 'Unknown'} | {player.real_team_name || 'Unknown'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs font-black">{player.purchase_price || 0} Cr</p>
                    <p className={`text-[8px] font-bold uppercase mt-1 ${isSelected ? 'text-rose-700 font-black' : 'text-emerald-600'}`}>
                      {isSelected ? 'SELECTED FOR RELEASE' : '100% Refund'}
                    </p>
                  </div>
                </button>
              );
            })}
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
