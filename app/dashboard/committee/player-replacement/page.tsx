'use client';

import { useState, useEffect, useRef } from 'react';
import { useTournamentContext } from '@/contexts/TournamentContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useCachedTeamSeasons } from '@/hooks/useCachedFirebase';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Search, ShieldAlert, CheckCircle, AlertTriangle, User, DollarSign, ListFilter } from 'lucide-react';

export default function PlayerReplacementPage() {
  const { seasonId: selectedSeason } = useTournamentContext();
  const { user } = usePermissions();
  const { data: teamSeasons, loading: teamsLoading } = useCachedTeamSeasons(
    selectedSeason ? { seasonId: selectedSeason } : undefined
  );

  // States
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [squad, setSquad] = useState<any[]>([]);
  const [squadLoading, setSquadLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);
  
  // Replacement Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [candidateInfo, setCandidateInfo] = useState<any | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [newPrice, setNewPrice] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'bids' | 'all'>('bids');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentTeam = teamSeasons?.find((t: any) => t.team_id === selectedTeamId);

  // Load squad when team is selected
  useEffect(() => {
    if (selectedTeamId && selectedSeason) {
      fetchSquad();
    } else {
      setSquad([]);
    }
  }, [selectedTeamId, selectedSeason]);

  const fetchSquad = async () => {
    setSquadLoading(true);
    try {
      const response = await fetch(
        `/api/players/database?limit=2000&assigned_only=true&team_id=${selectedTeamId}&season_id=${selectedSeason}`
      );
      const data = await response.json();
      if (data.success) {
        setSquad(data.data || []);
      }
    } catch (err) {
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
    setSelectedCandidateId('');
    setNewPrice(0);
    setSearchQuery('');
    setActionError(null);
    setActionSuccess(null);
    setActiveTab('bids');

    try {
      const response = await fetch(
        `/api/admin/player-replacement/info?player_id=${player.id}&season_id=${selectedSeason}`
      );
      const resData = await response.json();
      if (resData.success) {
        setCandidateInfo(resData.data);
        if (resData.data.round?.round_type === 'bulk') {
          setActiveTab('bids');
        }
      } else {
        setActionError(resData.error || 'Failed to load replacement options.');
      }
    } catch (err) {
      console.error('Error fetching replacement details:', err);
      setActionError('An error occurred while loading replacement details.');
    } finally {
      setInfoLoading(false);
    }
  };

  // Handle bulk round search query change with debounce
  useEffect(() => {
    if (!selectedPlayer || !selectedSeason || !isModalOpen || !candidateInfo) return;
    if (candidateInfo.round?.round_type !== 'bulk') return;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setInfoLoading(true);
      try {
        const response = await fetch(
          `/api/admin/player-replacement/info?player_id=${selectedPlayer.id}&season_id=${selectedSeason}&search=${encodeURIComponent(searchQuery)}`
        );
        const resData = await response.json();
        if (resData.success) {
          setCandidateInfo(resData.data);
        }
      } catch (err) {
        console.error('Failed to search bulk candidates:', err);
      } finally {
        setInfoLoading(false);
      }
    }, 500);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  // Handle candidate selection
  const handleSelectCandidate = (candidate: any) => {
    if (candidate.is_sold && candidate.current_team_id !== selectedTeamId) {
      // Cannot select owned player
      return;
    }
    setSelectedCandidateId(candidate.player_id);
    // Set default price
    if (candidate.has_team_bid && candidate.team_bid_amount !== null) {
      setNewPrice(candidate.team_bid_amount);
    } else {
      setNewPrice(candidate.base_price || 10);
    }
  };

  // Submit replacement execution
  const handleExecuteReplacement = async () => {
    if (!selectedPlayer || !selectedCandidateId || !selectedTeamId || !selectedSeason) return;

    if (!confirm('Are you sure you want to replace this player? This will permanently modify database rosters, transaction ledgers, position counts, and team budgets.')) {
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
          original_player_id: selectedPlayer.id,
          replacement_player_id: selectedCandidateId,
          team_id: selectedTeamId,
          season_id: selectedSeason,
          new_price: newPrice
        })
      });
      const result = await response.json();
      if (result.success) {
        setActionSuccess(result.message || 'Player replaced successfully!');
        // Refresh team squad
        fetchSquad();
        // Wait 1.5 seconds and close modal
        setTimeout(() => {
          setIsModalOpen(false);
          setSelectedPlayer(null);
        }, 1500);
      } else {
        setActionError(result.error || 'Failed to replace player.');
      }
    } catch (err: any) {
      console.error('Error executing replacement:', err);
      setActionError(err.message || 'An error occurred during replacement.');
    } finally {
      setExecuting(false);
    }
  };

  if (!user) {
    return <div className="p-8 text-center font-mono text-sm uppercase tracking-wider text-slate-500">Access denied.</div>;
  }

  // Filter candidates for normal rounds tab view
  const getFilteredCandidates = () => {
    if (!candidateInfo?.candidates) return [];
    if (candidateInfo.round?.round_type === 'bulk') {
      if (activeTab === 'bids') {
        return candidateInfo.candidates.filter((c: any) => c.has_team_bid);
      }
      return candidateInfo.candidates;
    } else {
      if (activeTab === 'bids') {
        return candidateInfo.candidates.filter((c: any) => c.has_team_bid);
      }
      return candidateInfo.candidates;
    }
  };

  return (
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
            <h1 className="text-xl font-black text-slate-900 tracking-wider uppercase mb-1">
              🏆 Auction Player Replacement
            </h1>
            <p className="text-xs text-slate-500 font-bold uppercase">
              Replace won auction players with other round candidates and adjust ledger finances
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-amber-100 text-amber-800 text-[10px] font-black uppercase rounded-lg border border-amber-200">
              Season: {selectedSeason || 'None'}
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
              {teamSeasons?.map((team: any) => (
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
                className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-amber-600 transition-colors"
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
                            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-mono text-[10px] font-black uppercase rounded-lg transition-colors tracking-wider"
                          >
                            Replace Player
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
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl font-mono relative">
            
            {/* Modal Header */}
            <div className="bg-slate-50 border-b border-slate-150 p-6 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                  🔄 Configure Replacement
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                  Swapping out won player: {selectedPlayer?.name}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 transition-colors"
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Top Banner Errors/Success */}
              {actionError && (
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 flex gap-3 text-rose-800 text-xs font-bold leading-relaxed">
                  <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0" />
                  <div>
                    <div className="uppercase">Replacement Error</div>
                    <div className="text-[10px] text-rose-500 font-medium uppercase mt-0.5">{actionError}</div>
                  </div>
                </div>
              )}

              {actionSuccess && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex gap-3 text-emerald-800 text-xs font-bold leading-relaxed">
                  <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <div>
                    <div className="uppercase">Success</div>
                    <div className="text-[10px] text-emerald-500 font-medium uppercase mt-0.5">{actionSuccess}</div>
                  </div>
                </div>
              )}

              {infoLoading && !candidateInfo && (
                <div className="flex items-center justify-center py-20 text-slate-400 font-bold uppercase text-xs gap-3">
                  <RefreshCw className="w-5 h-5 animate-spin text-amber-500" /> Fetching replacement candidates...
                </div>
              )}

              {candidateInfo && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Left Column - Original Details & New Price Input */}
                  <div className="lg:col-span-1 space-y-4">
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Original Win details</h4>
                      <div className="space-y-2">
                        <div>
                          <div className="text-[9px] text-slate-400 font-bold uppercase">Player name</div>
                          <div className="text-xs font-bold text-slate-800 uppercase">{candidateInfo.originalPlayer.player_name}</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-400 font-bold uppercase">Position</div>
                          <div className="text-xs font-mono font-bold text-slate-700 uppercase mt-0.5">
                            <span className="px-1.5 py-0.5 bg-slate-200 border border-slate-300 rounded text-[9px]">{candidateInfo.originalPlayer.position}</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-400 font-bold uppercase">Original Price Paid</div>
                          <div className="text-xs font-bold text-slate-800">£{candidateInfo.originalPlayer.purchase_price}M</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-400 font-bold uppercase">Round info</div>
                          <div className="text-xs font-bold text-slate-700 uppercase mt-0.5">
                            Position: {candidateInfo.round.position || 'Bulk Round'} ({candidateInfo.round.round_type})
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-amber-50/40 border border-amber-100/60 rounded-2xl p-4 space-y-4">
                      <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-wider">Replacement Price</h4>
                      <div>
                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">New Purchase Price (£M)</label>
                        <div className="relative">
                          <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="number"
                            value={newPrice}
                            onChange={(e) => setNewPrice(Number(e.target.value))}
                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-amber-400 text-slate-800 font-mono font-black text-xs outline-none"
                            placeholder="Price"
                          />
                        </div>
                      </div>

                      <div className="text-[9px] text-slate-400 font-bold uppercase leading-relaxed">
                        ⚠️ Budget will be adjusted by <span className="font-black text-slate-700">£{(newPrice - candidateInfo.originalPlayer.purchase_price)}M</span>.
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Replacement Candidate Selector */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        Select Replacement Candidate
                      </h4>
                      
                      {/* Search Bar for Bulk Rounds */}
                      {candidateInfo.round.round_type === 'bulk' && (
                        <div className="relative w-full sm:max-w-xs">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:border-amber-400 focus:bg-white text-[10px] font-bold uppercase tracking-wider outline-none"
                            placeholder="SEARCH PLAYER..."
                          />
                        </div>
                      )}
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setActiveTab('bids')}
                        className={`px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg border transition-colors ${
                          activeTab === 'bids'
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        Placed Bids ({candidateInfo.candidates.filter((c: any) => c.has_team_bid).length})
                      </button>
                      <button
                        onClick={() => setActiveTab('all')}
                        className={`px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg border transition-colors ${
                          activeTab === 'all'
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {candidateInfo.round.round_type === 'bulk' ? 'Search Results' : 'All Round Players'} ({candidateInfo.candidates.length})
                      </button>
                    </div>

                    {/* Candidate List Container */}
                    <div className="border border-slate-150 rounded-2xl overflow-hidden max-h-[350px] overflow-y-auto">
                      {infoLoading ? (
                        <div className="flex items-center justify-center py-12 text-slate-400 font-bold uppercase text-[10px] gap-2">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" /> Searching...
                        </div>
                      ) : getFilteredCandidates().length === 0 ? (
                        <div className="text-center py-12 text-slate-400 font-bold uppercase text-[10px]">
                          {activeTab === 'bids' ? 'No bids placed on other players.' : 'No candidate players found.'}
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {getFilteredCandidates().map((candidate: any) => {
                            const isSelected = selectedCandidateId === candidate.player_id;
                            const isOwned = candidate.is_sold && candidate.current_team_id !== selectedTeamId;
                            
                            return (
                              <div
                                key={candidate.player_id}
                                onClick={() => handleSelectCandidate(candidate)}
                                className={`p-4 flex items-center justify-between transition-colors ${
                                  isOwned 
                                    ? 'bg-slate-50/50 cursor-not-allowed opacity-50' 
                                    : isSelected
                                      ? 'bg-amber-50/60 border-l-4 border-amber-500 cursor-pointer'
                                      : 'hover:bg-slate-50/50 cursor-pointer'
                                }`}
                              >
                                <div>
                                  <div className="text-xs font-bold text-slate-900 uppercase flex items-center gap-2">
                                    {candidate.player_name}
                                    {candidate.overall_rating && (
                                      <span className="text-[10px] text-slate-400 font-black">({candidate.overall_rating})</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-1.5 font-mono text-[9px] text-slate-400 font-bold uppercase">
                                    <span>Club: {candidate.club || '-'}</span>
                                    <span>•</span>
                                    <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600">{candidate.position}</span>
                                  </div>
                                </div>
                                <div className="text-right flex items-center gap-3">
                                  <div className="space-y-1">
                                    {candidate.has_team_bid && (
                                      <div className="text-[9px] text-amber-600 font-bold uppercase">
                                        Bid: £{candidate.team_bid_amount}M
                                      </div>
                                    )}
                                    <div className="text-[9px] text-slate-400 font-bold uppercase">
                                      Base: £{candidate.base_price || 10}M
                                    </div>
                                  </div>
                                  
                                  {/* Availability Badges */}
                                  {isOwned ? (
                                    <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[9px] font-black uppercase rounded border border-rose-200">
                                      SOLD
                                    </span>
                                  ) : candidate.player_id === selectedPlayer.id ? (
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-black uppercase rounded border border-slate-200">
                                      CURRENT
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase rounded border border-emerald-200 font-bold">
                                      AVAILABLE
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-150 p-6 flex items-center justify-between">
              <div className="text-[9px] text-slate-400 font-bold uppercase flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                This executes live updates directly to Firestore & Neon.
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  disabled={!selectedCandidateId || executing}
                  onClick={handleExecuteReplacement}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-2"
                >
                  {executing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Replacing...
                    </>
                  ) : (
                    'Execute Replacement'
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
