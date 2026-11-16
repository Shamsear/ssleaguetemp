'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTournamentContext } from '@/contexts/TournamentContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useCachedTeamSeasons } from '@/hooks/useCachedFirebase';
import Link from 'next/link';
import { 
  ArrowLeft, RefreshCw, ShieldAlert, CheckCircle, AlertTriangle, 
  User, ListFilter, Sparkles, Dices, Lock, Search, Check, DollarSign, ArrowRight 
} from 'lucide-react';
import AuthGuard from '@/components/auth/AuthGuard';

export default function PlayerReplacementPage() {
  const { seasonId: selectedSeason } = useTournamentContext();
  const { user, userSeasonId } = usePermissions();
  const activeSeasonId = userSeasonId || selectedSeason;
  const { data: teamSeasons, loading: teamsLoading } = useCachedTeamSeasons(
    activeSeasonId ? { seasonId: activeSeasonId } : undefined
  );

  // States
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [squad, setSquad] = useState<any[]>([]);
  const [squadLoading, setSquadLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);
  
  // Replacement Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'select' | 'random'>('select');
  const [candidateInfo, setCandidateInfo] = useState<any | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [drawnResult, setDrawnResult] = useState<any | null>(null);

  // Manual Candidate Selection States
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  const [customPrice, setCustomPrice] = useState<number | string>('');
  const [candidateSearch, setCandidateSearch] = useState<string>('');

  const filteredTeamSeasons = teamSeasons?.filter((t: any) => t.season_id === activeSeasonId) || [];
  const currentTeam = filteredTeamSeasons.find((t: any) => t.team_id === selectedTeamId);

  // Load squad when team is selected
  useEffect(() => {
    if (selectedTeamId && activeSeasonId) {
      fetchSquad();
    } else {
      setSquad([]);
    }
  }, [selectedTeamId, activeSeasonId]);

  const fetchSquad = async () => {
    setSquadLoading(true);
    try {
      const response = await fetch(
        `/api/players/database?limit=2000&assigned_only=true&team_id=${selectedTeamId}&season_id=${activeSeasonId}`
      );
      const data = await response.json();
      if (data.success) {
        setSquad(data.data?.players || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch squad:', err);
    } finally {
      setSquadLoading(false);
    }
  };

  // Open replacement modal and load info
  const handleOpenReplacement = async (player: any) => {
    setSelectedPlayer(player);
    setIsModalOpen(true);
    setInfoLoading(true);
    setCandidateInfo(null);
    setDrawnResult(null);
    setSelectedCandidate(null);
    setCustomPrice('');
    setCandidateSearch('');
    setActiveTab('select');
    setActionError(null);
    setActionSuccess(null);

    try {
      const response = await fetch(
        `/api/admin/player-replacement/info?player_id=${player.id}&season_id=${activeSeasonId}`
      );
      const resData = await response.json();
      if (resData.success) {
        setCandidateInfo(resData.data);
      } else {
        setActionError(resData.error || 'Failed to load replacement details.');
      }
    } catch (err: any) {
      console.error('Error fetching replacement details:', err);
      setActionError('An error occurred while loading replacement details.');
    } finally {
      setInfoLoading(false);
    }
  };

  // Candidate filtering for Manual Mode
  const { teamBidsList, otherUnsoldList } = useMemo(() => {
    if (!candidateInfo?.candidates) return { teamBidsList: [], otherUnsoldList: [] };

    const searchLower = candidateSearch.trim().toLowerCase();
    const all = candidateInfo.candidates;

    // Team's bids in this round (exclude the player being replaced)
    const bids = all.filter((c: any) => c.has_team_bid && c.player_id !== selectedPlayer?.id);

    // Other candidates (not in team's bids, unsold, not the replaced player)
    const others = all.filter(
      (c: any) => !c.has_team_bid && !c.is_sold && c.player_id !== selectedPlayer?.id
    );

    const filteredBids = searchLower
      ? bids.filter((c: any) => c.player_name.toLowerCase().includes(searchLower))
      : bids;

    const filteredOthers = searchLower
      ? others.filter((c: any) => c.player_name.toLowerCase().includes(searchLower)).slice(0, 50)
      : others.slice(0, 30);

    return { teamBidsList: filteredBids, otherUnsoldList: filteredOthers };
  }, [candidateInfo, candidateSearch, selectedPlayer]);

  const handleSelectCandidate = (candidate: any) => {
    if (candidate.is_sold) return;
    setSelectedCandidate(candidate);
    const suggestedPrice = candidate.team_bid_amount ?? candidate.base_price ?? candidateInfo?.originalPlayer?.purchase_price ?? 10;
    setCustomPrice(suggestedPrice);
  };

  // Financial preview values
  const origPrice = candidateInfo?.originalPlayer?.purchase_price || 0;
  const numCustomPrice = Number(customPrice) || 0;
  const priceDiff = numCustomPrice - origPrice; // e.g. 14 - 18 = -4
  const currentBudget = Number(currentTeam?.currency_system === 'dual' ? currentTeam?.football_budget : currentTeam?.budget) || 0;
  const currentSpent = Number(currentTeam?.total_spent) || 0;
  const newEstimatedBudget = currentBudget - priceDiff;
  const newEstimatedSpent = currentSpent + priceDiff;

  // Execute manual candidate replacement
  const handleExecuteManualReplacement = async () => {
    if (!selectedPlayer || !selectedCandidate || !selectedTeamId || !activeSeasonId || !candidateInfo) return;

    const diffText = priceDiff < 0 
      ? `Refund of £${Math.abs(priceDiff)}M to team` 
      : priceDiff > 0 
        ? `Additional cost of £${priceDiff}M from team` 
        : `No budget change (£0M)`;

    if (!confirm(
      `CONFIRM PLAYER REPLACEMENT & BALANCE UPDATE\n\n` +
      `Original Player: "${selectedPlayer.name}" (£${origPrice}M)\n` +
      `Replacement Player: "${selectedCandidate.player_name}" (£${numCustomPrice}M)\n\n` +
      `Financial Impact:\n` +
      `• Price Difference: ${priceDiff < 0 ? '-' : '+'}£${Math.abs(priceDiff)}M (${diffText})\n` +
      `• eCoin Balance: £${currentBudget.toLocaleString()}M -> £${newEstimatedBudget.toLocaleString()}M\n` +
      `• Squad Spent: £${currentSpent.toLocaleString()}M -> £${newEstimatedSpent.toLocaleString()}M\n\n` +
      `This action will update team squads, transactions, and balances across both databases.`
    )) {
      return;
    }

    setExecuting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const response = await fetch('/api/admin/player-replacement/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'manual',
          original_player_id: selectedPlayer.id,
          replacement_player_id: selectedCandidate.player_id,
          team_id: selectedTeamId,
          season_id: activeSeasonId,
          new_price: numCustomPrice
        })
      });

      const result = await response.json();
      if (result.success) {
        setActionSuccess(result.message || 'Player replaced successfully and balances updated!');
        setDrawnResult({
          mode: 'manual',
          newPlayer: {
            name: selectedCandidate.player_name,
            position: selectedCandidate.position,
            position_group: selectedCandidate.position_group,
            overall_rating: selectedCandidate.overall_rating,
            club: selectedCandidate.club
          },
          price: numCustomPrice,
          priceDiff,
          newBalance: newEstimatedBudget,
          newSpent: newEstimatedSpent
        });
        fetchSquad();
      } else {
        setActionError(result.error || 'Failed to execute player replacement.');
      }
    } catch (err: any) {
      console.error('Error executing replacement:', err);
      setActionError(err.message || 'An error occurred during replacement.');
    } finally {
      setExecuting(false);
    }
  };

  // Execute random replacement
  const handleExecuteRandomReplacement = async () => {
    if (!selectedPlayer || !selectedTeamId || !activeSeasonId || !candidateInfo) return;

    const posGroup = candidateInfo.originalPlayer.position_group || candidateInfo.round.position || selectedPlayer.position;
    const price = candidateInfo.originalPlayer.purchase_price;

    if (!confirm(
      `🎲 CONFIRM RANDOM DRAW & REPLACEMENT\n\n` +
      `Are you sure you want to revert "${selectedPlayer.name}" and randomly draw an unsold replacement player from position group "${posGroup}" at £${price.toLocaleString()}M?\n\n` +
      `• Manual selection is disabled per league fair-play rules.\n` +
      `• The server will pick a random unsold player from the ${candidateInfo.availablePoolCount || 0} eligible candidates.\n` +
      `• This action will immediately update the database.`
    )) {
      return;
    }

    setExecuting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const response = await fetch('/api/admin/player-replacement/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'random',
          original_player_id: selectedPlayer.id,
          team_id: selectedTeamId,
          season_id: activeSeasonId
        })
      });

      const result = await response.json();
      if (result.success) {
        setActionSuccess(result.message || 'Player replaced successfully via random draw!');
        setDrawnResult({
          ...result,
          mode: 'random'
        });
        fetchSquad();
      } else {
        setActionError(result.error || 'Failed to execute random replacement.');
      }
    } catch (err: any) {
      console.error('Error executing random replacement:', err);
      setActionError(err.message || 'An error occurred during replacement.');
    } finally {
      setExecuting(false);
    }
  };

  if (!user) {
    return <div className="p-8 text-center font-mono text-sm uppercase tracking-wider text-slate-500">Access denied.</div>;
  }

  return (
    <AuthGuard requiredRole="committee_admin">
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-12 px-4 sm:px-6">
        {/* Ambient Gold Glow */}
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
          {/* Header Back Button */}
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-amber-600 transition-colors gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> BACK TO DASHBOARD
          </Link>

          {/* Dashboard Title */}
          <div className="bg-white border border-slate-200/60 rounded-2xl p-6 md:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-wider uppercase mb-1 flex items-center gap-2">
                <Dices className="w-6 h-6 text-amber-500" /> Auction Player Replacement
              </h1>
              <p className="text-xs text-slate-500 font-bold uppercase">
                Revert and replace won players via round bids or fair-play random draws with automatic financial adjustments
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-amber-100 text-amber-800 text-[10px] font-black uppercase rounded-lg border border-amber-200">
                Season: {activeSeasonId || 'None'}
              </span>
            </div>
          </div>

          {/* Select Team Card */}
          <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
              <ListFilter className="w-4 h-4 text-amber-500" /> Select Target Team
            </h2>
            {teamsLoading ? (
              <div className="text-xs font-bold text-slate-400 py-2 uppercase">Loading registered teams...</div>
            ) : (
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full md:max-w-md px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-400 focus:bg-white text-slate-800 text-xs font-bold uppercase tracking-wider transition-colors outline-none cursor-pointer"
              >
                <option value="">-- CHOOSE A TEAM --</option>
                {filteredTeamSeasons.map((team: any) => (
                  <option key={team.team_id} value={team.team_id}>
                    {team.team_name}
                  </option>
                ))}
              </select>
            )}

            {currentTeam && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">eCoin Budget</div>
                  <div className="text-base font-black text-slate-800">
                    £{(currentTeam.currency_system === 'dual' ? currentTeam.football_budget : currentTeam.budget)?.toLocaleString()}M
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Squad Value</div>
                  <div className="text-base font-black text-slate-800">
                    £{currentTeam.total_spent?.toLocaleString()}M
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Total Players</div>
                  <div className="text-base font-black text-slate-800">
                    {currentTeam.players_count || 0}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Currency System</div>
                  <div className="text-xs font-black text-amber-600 uppercase mt-1">
                    {currentTeam.currency_system === 'dual' ? 'Dual Currency' : 'Single Currency'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Squad List Card */}
          {selectedTeamId && (
            <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <User className="w-4 h-4 text-amber-500" /> Team Squad & Auction Wins
                </h2>
                <button
                  onClick={fetchSquad}
                  className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-amber-600 transition-colors cursor-pointer"
                  title="Reload Squad"
                >
                  <RefreshCw className={`w-4 h-4 ${squadLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {squadLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-400 font-bold uppercase text-xs gap-3">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-500" /> Fetching squad roster...
                </div>
              ) : squad.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-bold uppercase text-xs">
                  No active players in squad.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-150 rounded-xl">
                  <table className="w-full text-left border-collapse font-sans text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150 font-mono text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        <th className="p-4">Player Name</th>
                        <th className="p-4">Position</th>
                        <th className="p-4">Rating</th>
                        <th className="p-4">Purchase Price</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {squad.map((player) => (
                        <tr key={player.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4 font-mono font-bold text-slate-900">{player.name}</td>
                          <td className="p-4">
                            <span className="px-2 py-1 bg-slate-100 text-slate-700 text-[10px] font-mono font-bold uppercase rounded-md border border-slate-200">
                              {player.position}
                            </span>
                          </td>
                          <td className="p-4 font-mono font-black text-slate-500">{player.overall_rating || '-'}</td>
                          <td className="p-4 font-mono font-black text-emerald-600">£{player.acquisition_value?.toLocaleString()}M</td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => handleOpenReplacement(player)}
                              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-mono text-[10px] font-black uppercase rounded-lg transition-colors tracking-wider flex items-center gap-1.5 ml-auto cursor-pointer"
                            >
                              <Dices className="w-3.5 h-3.5" /> Replace Player
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Replacement Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl font-mono relative">
              
              {/* Modal Header */}
              <div className="bg-slate-50 border-b border-slate-150 p-5 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Dices className="w-4 h-4 text-amber-500" /> Player Replacement & Financial Adjuster
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                    Reverting won player: <span className="text-slate-800 font-black">{selectedPlayer?.name}</span> (Round {candidateInfo?.round?.round_number || '-'} - {candidateInfo?.round?.position || selectedPlayer?.position})
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 font-bold p-1 transition-colors cursor-pointer"
                >
                  ✕ Close
                </button>
              </div>

              {/* Mode Tabs */}
              <div className="px-6 pt-4 bg-slate-50 border-b border-slate-150">
                <div className="flex border border-slate-200 bg-slate-200/50 p-1 rounded-xl gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('select')}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                      activeTab === 'select'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <User className="w-3.5 h-3.5 text-amber-500" /> Select From Round Bids
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('random')}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                      activeTab === 'random'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Dices className="w-3.5 h-3.5 text-amber-500" /> Random Draw
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Top Banner Errors/Success */}
                {actionError && (
                  <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 flex gap-3 text-rose-800 text-xs font-bold leading-relaxed">
                    <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="uppercase">Replacement Error</div>
                      <div className="text-[10px] text-rose-500 font-medium uppercase mt-0.5">{actionError}</div>
                    </div>
                  </div>
                )}

                {actionSuccess && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex gap-3 text-emerald-800 text-xs font-bold leading-relaxed">
                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="uppercase">Success</div>
                      <div className="text-[10px] text-emerald-600 font-medium uppercase mt-0.5">{actionSuccess}</div>
                    </div>
                  </div>
                )}

                {infoLoading && !candidateInfo && (
                  <div className="flex items-center justify-center py-20 text-slate-400 font-bold uppercase text-xs gap-3">
                    <RefreshCw className="w-5 h-5 animate-spin text-amber-500" /> Fetching replacement details...
                  </div>
                )}

                {candidateInfo && (
                  <div className="space-y-6">
                    {/* Header Summary of Reverted Player */}
                    <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Player Being Reverted</div>
                        <div className="text-base font-black text-slate-900 uppercase mt-0.5 flex items-center gap-2">
                          {candidateInfo.originalPlayer.player_name}
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[9px] font-black uppercase rounded border border-rose-200">
                            Revert to Unsold
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="text-[9px] text-slate-400 font-bold uppercase">Position</div>
                          <div className="text-xs font-bold text-slate-800 mt-0.5">
                            {candidateInfo.originalPlayer.position} ({candidateInfo.originalPlayer.position_group || candidateInfo.round.position || '-'})
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-400 font-bold uppercase">Purchase Price</div>
                          <div className="text-sm font-black text-emerald-600 mt-0.5">
                            £{origPrice.toLocaleString()}M
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* TAB 1: SELECT CANDIDATE FROM ROUND BIDS */}
                    {activeTab === 'select' && (
                      <div className="space-y-5">
                        {/* Team Bids Section */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <DollarSign className="w-4 h-4 text-amber-500" /> Bids Placed by This Team in Round {candidateInfo.round?.round_number || ''}
                            </h4>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">
                              {teamBidsList.length} Bids Total
                            </span>
                          </div>

                          {teamBidsList.length === 0 ? (
                            <div className="text-center py-6 bg-slate-50 border border-slate-100 rounded-xl text-slate-400 text-xs font-bold uppercase">
                              No bids recorded for this team in this round.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                              {teamBidsList.map((candidate: any) => {
                                const isSelected = selectedCandidate?.player_id === candidate.player_id;
                                const isSoldElsewhere = candidate.is_sold;

                                return (
                                  <div
                                    key={candidate.player_id}
                                    onClick={() => !isSoldElsewhere && handleSelectCandidate(candidate)}
                                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                                      isSelected
                                        ? 'bg-amber-50/70 border-amber-400 ring-2 ring-amber-400/20'
                                        : isSoldElsewhere
                                          ? 'bg-slate-50/60 border-slate-200/60 opacity-60 cursor-not-allowed'
                                          : 'bg-white border-slate-200 hover:border-amber-300 hover:bg-amber-50/20'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <div className="text-xs font-black text-slate-900 uppercase">
                                          {candidate.player_name}
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-bold mt-0.5">
                                          {candidate.position} • OVR {candidate.overall_rating || '-'} • {candidate.club || 'Free Agent'}
                                        </div>
                                      </div>
                                      <div>
                                        {isSoldElsewhere ? (
                                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-bold uppercase rounded border border-slate-200">
                                            Sold
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase rounded border border-emerald-200">
                                            Available
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 text-[10px]">
                                      <div className="font-bold text-slate-500">
                                        Bid Placed: <span className="font-black text-amber-700">£{candidate.team_bid_amount ?? candidate.base_price}M</span>
                                      </div>
                                      <div>
                                        {isSelected ? (
                                          <span className="text-amber-700 font-black flex items-center gap-1 uppercase">
                                            <Check className="w-3.5 h-3.5" /> Selected
                                          </span>
                                        ) : isSoldElsewhere ? (
                                          <span className="text-slate-400 font-bold uppercase">Unavailable</span>
                                        ) : (
                                          <span className="text-slate-600 hover:text-amber-600 font-black uppercase">
                                            Click to Pick
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Search Other Unsold Candidates */}
                        <div className="space-y-3 pt-2 border-t border-slate-150">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                              <Search className="w-3.5 h-3.5 text-slate-400" /> Search / Pick from Unsold Pool ({candidateInfo.availablePoolCount} available)
                            </h4>
                          </div>

                          <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                            <input
                              type="text"
                              value={candidateSearch}
                              onChange={(e) => setCandidateSearch(e.target.value)}
                              placeholder="Search player name..."
                              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-amber-400 focus:bg-white transition-colors"
                            />
                          </div>

                          {candidateSearch.trim() && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                              {otherUnsoldList.length === 0 ? (
                                <div className="col-span-2 text-center py-4 text-slate-400 text-xs font-bold uppercase">
                                  No matching unsold players found.
                                </div>
                              ) : (
                                otherUnsoldList.map((candidate: any) => {
                                  const isSelected = selectedCandidate?.player_id === candidate.player_id;
                                  return (
                                    <div
                                      key={candidate.player_id}
                                      onClick={() => handleSelectCandidate(candidate)}
                                      className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                                        isSelected
                                          ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/20'
                                          : 'bg-white border-slate-200 hover:border-amber-300'
                                      }`}
                                    >
                                      <div>
                                        <div className="font-bold text-slate-900">{candidate.player_name}</div>
                                        <div className="text-[10px] text-slate-500">
                                          {candidate.position} • OVR {candidate.overall_rating || '-'}
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-[10px] font-black text-amber-700">
                                          Base: £{candidate.base_price || 10}M
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>

                        {/* Selected Replacement & Financial Adjustment Preview */}
                        {selectedCandidate && (
                          <div className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border-2 border-amber-300 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center justify-between border-b border-amber-200 pb-3">
                              <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles className="w-4 h-4 text-amber-600" /> Replacement Proposal
                              </h4>
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black uppercase rounded border border-amber-200">
                                Selected Candidate
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Player Summary */}
                              <div className="space-y-2">
                                <div>
                                  <div className="text-[9px] text-slate-400 font-bold uppercase">Replacement Player</div>
                                  <div className="text-sm font-black text-slate-900 uppercase mt-0.5">
                                    {selectedCandidate.player_name}
                                  </div>
                                </div>
                                <div className="text-xs text-slate-600 font-bold">
                                  Position: <span className="text-slate-800 font-black">{selectedCandidate.position}</span> • OVR: <span className="text-slate-800 font-black">{selectedCandidate.overall_rating || '-'}</span>
                                </div>
                                <div className="text-xs text-slate-600 font-bold">
                                  Club: <span className="text-slate-800 font-black">{selectedCandidate.club || 'Free Agent'}</span>
                                </div>
                              </div>

                              {/* Price Input & Financial Impact */}
                              <div className="space-y-3 bg-white/80 border border-amber-200/70 rounded-xl p-3.5">
                                <div>
                                  <label className="text-[9px] text-slate-500 font-black uppercase block mb-1">
                                    Assigned Price (£M)
                                  </label>
                                  <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">£</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={customPrice}
                                      onChange={(e) => setCustomPrice(e.target.value)}
                                      className="w-full pl-7 pr-8 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 outline-none focus:border-amber-500"
                                    />
                                    <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">M</span>
                                  </div>
                                </div>

                                <div className="pt-2 border-t border-slate-100 space-y-1.5 text-[10px]">
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-500 font-bold">Price Paid for {selectedPlayer?.name}:</span>
                                    <span className="font-black text-slate-800">£{origPrice}M</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-500 font-bold">New Price for {selectedCandidate.player_name}:</span>
                                    <span className="font-black text-slate-800">£{numCustomPrice}M</span>
                                  </div>
                                  <div className="flex justify-between items-center pt-1 border-t border-slate-100 font-black">
                                    <span>Net Budget Difference:</span>
                                    <span className={priceDiff < 0 ? 'text-emerald-600' : priceDiff > 0 ? 'text-rose-600' : 'text-slate-700'}>
                                      {priceDiff < 0 ? `-£${Math.abs(priceDiff)}M (Refund)` : priceDiff > 0 ? `+£${priceDiff}M (Cost)` : '£0M'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Estimated Balances Preview */}
                            <div className="bg-white border border-amber-200/80 rounded-xl p-3 grid grid-cols-2 gap-4 text-xs">
                              <div>
                                <div className="text-[9px] text-slate-400 font-bold uppercase">Estimated Team eCoin Balance</div>
                                <div className="text-sm font-black text-slate-900 mt-0.5 flex items-center gap-1.5">
                                  <span className="text-slate-400">£{currentBudget.toLocaleString()}M</span>
                                  <ArrowRight className="w-3.5 h-3.5 text-amber-500" />
                                  <span className="text-emerald-600">£{newEstimatedBudget.toLocaleString()}M</span>
                                </div>
                              </div>
                              <div>
                                <div className="text-[9px] text-slate-400 font-bold uppercase">Estimated Squad Spent</div>
                                <div className="text-sm font-black text-slate-900 mt-0.5 flex items-center gap-1.5">
                                  <span className="text-slate-400">£{currentSpent.toLocaleString()}M</span>
                                  <ArrowRight className="w-3.5 h-3.5 text-amber-500" />
                                  <span className="text-slate-800">£{newEstimatedSpent.toLocaleString()}M</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 2: RANDOM DRAW */}
                    {activeTab === 'random' && (
                      <div className="space-y-6">
                        {/* Fair-Play Notice */}
                        <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-4 flex gap-3 text-amber-900 text-xs">
                          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <div className="font-black uppercase tracking-wider text-[11px] text-amber-800">Fair-Play Random Draw Rule</div>
                            <div className="text-[10px] text-amber-700 font-semibold leading-relaxed mt-1">
                              Per league rules, randomly assigned players are replaced strictly via a server-side random draw from the same position group at the exact same purchase price. Manual player selection is disabled to guarantee fair competition.
                            </div>
                          </div>
                        </div>

                        {/* Random Draw Specifications Card */}
                        <div className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border border-amber-200/70 rounded-2xl p-5 space-y-4">
                          <div className="flex items-center justify-between border-b border-amber-200/60 pb-3">
                            <h4 className="text-[11px] font-black text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Draw Criteria
                            </h4>
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-black uppercase rounded border border-amber-200 flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" /> Locked
                            </span>
                          </div>

                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-[9px] text-amber-800/70 font-bold uppercase">Target Position</div>
                                <div className="text-xs font-black text-slate-800 uppercase mt-0.5">
                                  {candidateInfo.originalPlayer.position}
                                </div>
                              </div>
                              <div>
                                <div className="text-[9px] text-amber-800/70 font-bold uppercase">Position Group</div>
                                <div className="text-xs font-black text-amber-700 uppercase mt-0.5">
                                  {candidateInfo.originalPlayer.position_group || candidateInfo.round.position || '-'}
                                </div>
                              </div>
                            </div>

                            <div>
                              <div className="text-[9px] text-amber-800/70 font-bold uppercase">Replacement Price</div>
                              <div className="text-sm font-black text-slate-800 mt-0.5 flex items-center gap-2">
                                £{candidateInfo.originalPlayer.purchase_price.toLocaleString()}M
                                <span className="text-[9px] text-slate-400 font-bold">(Net Diff: £0)</span>
                              </div>
                            </div>

                            <div>
                              <div className="text-[9px] text-amber-800/70 font-bold uppercase">Available Unsold Pool</div>
                              <div className="text-xs font-black text-amber-800 mt-0.5">
                                {candidateInfo.availablePoolCount || 0} Eligible Unsold Candidates
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Result Card (When Executed) */}
                    {drawnResult && (
                      <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-6 text-center space-y-3 animate-in fade-in zoom-in duration-300">
                        <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full border border-emerald-200 mx-auto">
                          <CheckCircle className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                            🎉 Player Replacement Complete
                          </div>
                          <div className="text-xl font-black text-slate-900 uppercase mt-1">
                            {drawnResult.newPlayer?.name}
                          </div>
                          <div className="flex items-center justify-center gap-3 mt-2 text-xs font-bold text-slate-600">
                            <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-800">
                              OVR: {drawnResult.newPlayer?.overall_rating || '-'}
                            </span>
                            <span>•</span>
                            <span>Club: {drawnResult.newPlayer?.club || 'Free Agent'}</span>
                            <span>•</span>
                            <span className="text-emerald-700 font-black">
                              Price: £{drawnResult.price?.toLocaleString()}M
                            </span>
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase pt-2 border-t border-emerald-200/60">
                          Assigned to <span className="text-slate-800 font-black">{currentTeam?.team_name}</span>. Team balances and transaction ledgers updated.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="bg-slate-50 border-t border-slate-150 p-5 flex items-center justify-between">
                <div className="text-[9px] text-slate-400 font-bold uppercase flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  Live update to Database rosters and transaction ledgers.
                </div>
                <div className="flex gap-3">
                  {drawnResult ? (
                    <button
                      onClick={() => setIsModalOpen(false)}
                      className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer"
                    >
                      Done & Close
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setIsModalOpen(false)}
                        className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                      >
                        Cancel
                      </button>

                      {activeTab === 'select' ? (
                        <button
                          disabled={executing || !selectedCandidate || !customPrice}
                          onClick={handleExecuteManualReplacement}
                          className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                        >
                          {executing ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Updating Balances...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-3.5 h-3.5" /> Confirm Replacement
                            </>
                          )}
                        </button>
                      ) : (
                        <button
                          disabled={executing || !candidateInfo || candidateInfo.availablePoolCount === 0}
                          onClick={handleExecuteRandomReplacement}
                          className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                        >
                          {executing ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Drawing & Replacing...
                            </>
                          ) : (
                            <>
                              <Dices className="w-3.5 h-3.5" /> Execute Random Replacement
                            </>
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
