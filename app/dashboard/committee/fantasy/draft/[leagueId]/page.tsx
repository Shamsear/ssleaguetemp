'use client';
import { Crown, Star, ArrowLeft, RefreshCw, Shield } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import { useWebSocket } from '@/hooks/useWebSocket';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

interface FantasyTeam {
  id: string;
  team_name: string;
  owner_name: string;
  player_count: number;
  draft_submitted: boolean;
}

interface DraftedPlayer {
  draft_id: string;
  real_player_id: string;
  player_name: string;
  star_rating: number;
  draft_price: number;
  total_points: number;
  matches_played: number;
}

interface TierResult {
  tier_id: string;
  tier_number: number;
  tier_name: string;
  player_count: number;
  min_points: number;
  max_points: number;
  avg_points: number;
  total_bids: number;
  won_bids: number;
  lost_bids_count: number;
  skipped_bids: number;
  results: Array<{
    bid_id: string;
    player_name: string;
    real_player_id: string;
    winning_team: string;
    team_id: string;
    owner_name: string;
    bid_amount: number;
    submitted_at: Date;
    processed_at: Date;
  }>;
  lost_bids: Array<{
    bid_id: string;
    player_name: string;
    team_name: string;
    team_id: string;
    bid_amount: number;
  }>;
  skipped_teams: Array<{
    team_name: string;
    team_id: string;
  }>;
}

export default function DraftResultsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [league, setLeague] = useState<any>(null);
  const [fantasyTeams, setFantasyTeams] = useState<FantasyTeam[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<Record<string, DraftedPlayer[]>>({});
  const [teamDetails, setTeamDetails] = useState<Record<string, any>>({});
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [starPricing, setStarPricing] = useState<Record<number, number>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<'by-team' | 'by-tier'>('by-tier');
  const [tierResults, setTierResults] = useState<TierResult[]>([]);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);

  const { alertState, showAlert, closeAlert } = useModal();

  // Firebase Realtime Database listener for live updates
  const { isConnected } = useWebSocket({
    channel: `fantasy/leagues/${leagueId}`,
    enabled: !!leagueId && !!user,
    onMessage: useCallback((message: any) => {
      console.log('[Draft Results] Firebase update:', message);
      
      // Reload data when draft updates occur
      if (message.type === 'draft_update' || 
          message.type === 'team_update' ||
          message.type === 'player_drafted' ||
          message.type === 'draft_submitted') {
        loadData();
      }
    }, []),
  });

  const loadData = useCallback(async () => {
      if (!leagueId) return;

      try {
        // Get league details and teams
        const leagueResponse = await fetchWithTokenRefresh(`/api/fantasy/leagues/${leagueId}`);
        if (!leagueResponse.ok) throw new Error('League not found');
        
        const leagueData = await leagueResponse.json();
        setLeague(leagueData.league);
        setFantasyTeams(leagueData.teams);

        // Get tier-by-tier results
        const tierResultsResponse = await fetchWithTokenRefresh(`/api/fantasy/draft/tier-results?league_id=${leagueId}`);
        if (tierResultsResponse.ok) {
          const tierData = await tierResultsResponse.json();
          setTierResults(tierData.tiers || []);
          if (tierData.tiers && tierData.tiers.length > 0 && selectedTier === null) {
            setSelectedTier(tierData.tiers[0].tier_number);
          }
        }

        // Get star rating pricing
        const pricingResponse = await fetchWithTokenRefresh(`/api/fantasy/pricing/${leagueId}`);
        if (pricingResponse.ok) {
          const pricingData = await pricingResponse.json();
          const priceMap: Record<number, number> = {};
          pricingData.pricing.forEach((p: any) => {
            priceMap[p.stars] = p.price;
          });
          setStarPricing(priceMap);
        }

        // Get drafted players for all teams
        const draftedResponse = await fetchWithTokenRefresh(`/api/fantasy/players/drafted?league_id=${leagueId}`);
        if (draftedResponse.ok) {
          const draftedData = await draftedResponse.json();
          const playersByTeam: Record<string, DraftedPlayer[]> = {};
          
          draftedData.drafted_players.forEach((player: any) => {
            if (!playersByTeam[player.fantasy_team_id]) {
              playersByTeam[player.fantasy_team_id] = [];
            }
            playersByTeam[player.fantasy_team_id].push(player);
          });
          
          setTeamPlayers(playersByTeam);
          
          // Get team details (passive team, captain, VC) for all teams
          const detailsMap: Record<string, any> = {};
          await Promise.all(
            leagueData.teams.map(async (team: any) => {
              try {
                const detailsResponse = await fetchWithTokenRefresh(`/api/fantasy/teams/${team.id}`);
                if (detailsResponse.ok) {
                  const details = await detailsResponse.json();
                  detailsMap[team.id] = details;
                }
              } catch (err) {
                console.error(`Failed to load details for team ${team.id}`);
              }
            })
          );
          setTeamDetails(detailsMap);
          
          // Auto-select first team if not already selected
          if (!selectedTeam && leagueData.teams.length > 0) {
            setSelectedTeam(leagueData.teams[0].id);
          }
        }
        
        setLastUpdated(new Date());
      } catch (error) {
        console.error('Error loading data:', error);
        showAlert({
          type: 'error',
          title: 'Error',
          message: 'Failed to load fantasy league data',
        });
      } finally {
        setIsLoading(false);
      }
    }, [leagueId, selectedTeam, selectedTier]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  const currentTeamPlayers = teamPlayers[selectedTeam] || [];
  const selectedTeamData = fantasyTeams.find(t => t.id === selectedTeam);
  const currentTeamDetails = teamDetails[selectedTeam];
  
  const totalSpent = currentTeamPlayers.reduce((sum, p) => sum + (p.draft_price || 0), 0);
  const totalPoints = currentTeamPlayers.reduce((sum, p) => sum + p.total_points, 0);
  
  const captain = currentTeamDetails?.players?.find((p: any) => p.is_captain);
  const viceCaptain = currentTeamDetails?.players?.find((p: any) => p.is_vice_captain);
  const passiveTeam = currentTeamDetails?.team?.supported_team_name;

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading draft results...</p>
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
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">FANTASY CONSOLE</span>
              {isConnected && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-full">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="text-[9px] font-black text-emerald-700 uppercase">Live</span>
                </div>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
              Draft Results
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              {league.name} - Tier-by-tier blind bid results
            </p>
            {lastUpdated && (
              <p className="text-[9px] text-slate-450 font-mono mt-1">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center text-amber-400 shadow-sm shrink-0">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('by-tier')}
            className={`px-4 py-2 rounded-xl font-bold font-mono text-xs uppercase tracking-wider transition-all border cursor-pointer ${
              viewMode === 'by-tier'
                ? 'bg-slate-800 text-amber-400 border-slate-900 shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200/60'
            }`}
          >
            View by Tier
          </button>
          <button
            onClick={() => setViewMode('by-team')}
            className={`px-4 py-2 rounded-xl font-bold font-mono text-xs uppercase tracking-wider transition-all border cursor-pointer ${
              viewMode === 'by-team'
                ? 'bg-slate-800 text-amber-400 border-slate-900 shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200/60'
            }`}
          >
            View by Team
          </button>
        </div>

        {/* By Tier View */}
        {viewMode === 'by-tier' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Tier Selector */}
            <div>
              <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm sticky top-4">
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4">Draft Tiers</h2>
                
                {tierResults.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <p className="text-xs font-bold uppercase">No tiers generated yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tierResults.map((tier) => (
                      <button
                        key={tier.tier_id}
                        onClick={() => setSelectedTier(tier.tier_number)}
                        className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                          selectedTier === tier.tier_number
                            ? 'bg-slate-800 border-slate-900 text-amber-400 shadow-sm'
                            : 'bg-slate-50 border-slate-100 hover:border-slate-200 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="font-bold text-xs uppercase">Tier {tier.tier_number}: {tier.tier_name}</div>
                        <div className={`text-[10px] font-bold uppercase mt-1 ${
                          selectedTier === tier.tier_number ? 'text-amber-300' : 'text-slate-500'
                        }`}>
                          {tier.won_bids} players drafted
                        </div>
                        <div className={`text-[9px] font-semibold uppercase mt-0.5 ${
                          selectedTier === tier.tier_number ? 'text-slate-400' : 'text-slate-400'
                        }`}>
                          {tier.min_points}-{tier.max_points} pts
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Tier Results */}
            <div className="lg:col-span-3">
              {selectedTier !== null && tierResults.length > 0 && (
                (() => {
                  const tier = tierResults.find(t => t.tier_number === selectedTier);
                  if (!tier) return null;

                  return (
                    <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
                      <div className="mb-6 pb-4 border-b border-slate-100">
                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                          Tier {tier.tier_number}: {tier.tier_name}
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Players Drafted</p>
                            <p className="text-lg font-black text-slate-800">{tier.won_bids}</p>
                          </div>
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Total Bids</p>
                            <p className="text-lg font-black text-slate-800">{tier.total_bids}</p>
                          </div>
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Points Range</p>
                            <p className="text-lg font-black text-amber-600">
                              {tier.min_points}-{tier.max_points}
                            </p>
                          </div>
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Avg Points</p>
                            <p className="text-lg font-black text-slate-800">{tier.avg_points.toFixed(1)}</p>
                          </div>
                        </div>
                      </div>

                      {tier.results.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                          <svg className="w-10 h-10 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                          </svg>
                          <p className="text-xs font-bold uppercase">No players drafted from this tier</p>
                          <p className="text-[10px] uppercase font-semibold text-slate-400 mt-1">All teams skipped this tier</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-150">
                                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Player</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Winning Team</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Owner</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Bid Amount</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {tier.results.map((result) => (
                                <tr key={result.bid_id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-3">
                                    <p className="font-bold text-xs uppercase text-slate-800">{result.player_name}</p>
                                  </td>
                                  <td className="px-4 py-3">
                                    <p className="font-bold text-xs uppercase text-amber-600">{result.winning_team}</p>
                                  </td>
                                  <td className="px-4 py-3 text-xs uppercase text-slate-650 font-bold">{result.owner_name}</td>
                                  <td className="px-4 py-3">
                                    <span className="font-mono text-xs font-bold text-emerald-600">₹{result.bid_amount.toFixed(1)}</span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-705 border border-emerald-200 text-[9px] font-black rounded-lg uppercase tracking-wider">
                                      Won
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Lost Bids Section */}
                      {tier.lost_bids.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-slate-100">
                          <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider mb-3">
                            Unsuccessful Bids ({tier.lost_bids.length})
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {tier.lost_bids.map((bid) => (
                              <div key={bid.bid_id} className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl">
                                <p className="font-bold text-xs uppercase text-slate-800">{bid.player_name}</p>
                                <p className="text-[10px] font-bold text-rose-600 uppercase mt-0.5">
                                  {bid.team_name} - ₹{bid.bid_amount.toFixed(1)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Skipped Teams Section */}
                      {tier.skipped_teams.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-slate-100">
                          <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider mb-3">
                            Teams That Skipped ({tier.skipped_teams.length})
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {tier.skipped_teams.map((team) => (
                              <span
                                key={team.team_id}
                                className="px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-bold uppercase rounded-lg"
                              >
                                {team.team_name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}

        {/* By Team View */}
        {viewMode === 'by-team' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Team Selector */}
            <div>
              <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm sticky top-4">
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4">Teams</h2>
                
                <div className="space-y-2">
                  {fantasyTeams.map((team) => {
                    const players = teamPlayers[team.id] || [];
                    const spent = players.reduce((sum, p) => sum + (p.draft_price || 0), 0);
                    
                    return (

                      <button
                        key={team.id}
                        onClick={() => setSelectedTeam(team.id)}
                        className={`w-full text-left p-4 rounded-xl border transition-all relative cursor-pointer ${
                          selectedTeam === team.id
                            ? 'bg-slate-800 border-slate-900 text-amber-400 shadow-sm'
                            : 'bg-slate-50 border-slate-100 hover:border-slate-200 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-xs uppercase">{team.team_name}</div>
                          {team.draft_submitted && (
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase ${
                              selectedTeam === team.id 
                                ? 'bg-amber-400 text-slate-900' 
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-255'
                            }`}>
                              Submitted
                            </span>
                          )}
                        </div>
                        <div className={`text-[10px] font-bold uppercase mt-1.5 ${
                          selectedTeam === team.id ? 'text-amber-300' : 'text-slate-500'
                        }`}>
                          {players.length} players • {spent.toFixed(1)} credits
                        </div>
                      </button>

  );
                  })}
                </div>
              </div>
            </div>

            {/* Team Squad */}
            <div className="lg:col-span-3">
              <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
                {selectedTeamData && (
                  <>
                    <div className="mb-6 pb-4 border-b border-slate-100">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                        <div>
                          <h2 className="text-sm font-black text-slate-850 uppercase tracking-wider">{selectedTeamData.team_name}</h2>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Owner: {selectedTeamData.owner_name}</p>
                        </div>
                        <div>
                          {selectedTeamData.draft_submitted ? (
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-705 border border-emerald-200 text-[10px] font-black rounded-lg uppercase tracking-wider flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              Draft Submitted
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-amber-50 text-amber-705 border border-amber-200 text-[10px] font-black rounded-lg uppercase tracking-wider flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                              </svg>
                              Not Submitted
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Captain, VC, and Passive Team */}
                      {(captain || viceCaptain || passiveTeam) && (
                        <div className="flex flex-wrap gap-2 mt-3 mb-4">
                          {captain && (
                            <div className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-slate-700 text-[10px] font-bold uppercase rounded-lg">
                              <span className="font-black text-amber-750"><Crown className="w-3.5 h-3.5 inline-block text-amber-500 fill-amber-500 mr-1 align-text-bottom" /> Captain:</span>
                              <span className="ml-1 text-slate-900 font-extrabold">{captain.player_name}</span>
                            </div>
                          )}
                          {viceCaptain && (
                            <div className="px-2.5 py-1 bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-bold uppercase rounded-lg">
                              <span className="font-black text-slate-600"><Star className="w-3.5 h-3.5 inline-block text-slate-400 fill-slate-400 mr-1 align-text-bottom" /> Vice-Captain:</span>
                              <span className="ml-1 text-slate-900 font-extrabold">{viceCaptain.player_name}</span>
                            </div>
                          )}
                          {passiveTeam && (
                            <div className="px-2.5 py-1 bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-bold uppercase rounded-lg">
                              <span className="font-black text-slate-600"><Shield className="w-3 h-3 inline text-slate-500 mr-1" /> Passive Team:</span>
                              <span className="ml-1 text-slate-900 font-extrabold">{passiveTeam}</span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-3 gap-4 mt-4">
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                          <p className="text-[9px] text-slate-450 font-bold uppercase mb-0.5">Squad Size</p>
                          <p className="text-lg font-black text-slate-800">{currentTeamPlayers.length}</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                          <p className="text-[9px] text-slate-450 font-bold uppercase mb-0.5">Total Spent</p>
                          <p className="text-lg font-black text-slate-800">{totalSpent.toFixed(1)} credits</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                          <p className="text-[9px] text-slate-450 font-bold uppercase mb-0.5">Total Points</p>
                          <p className="text-lg font-black text-amber-600">{totalPoints}</p>
                        </div>
                      </div>
                    </div>

                    {currentTeamPlayers.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">
                        <svg className="w-10 h-10 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        <p className="text-xs font-bold uppercase">No players drafted yet</p>
                        <p className="text-[10px] font-semibold text-slate-450 mt-1">This team hasn't drafted any players</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-150">
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Player</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rating</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Draft Price</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Matches</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Points</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {currentTeamPlayers.map((player) => (
                              <tr key={player.draft_id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3">
                                  <p className="font-bold text-xs uppercase text-slate-800">{player.player_name}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1 text-slate-700 text-xs font-bold font-mono">
                                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 align-text-bottom" />
                                    <span>{player.star_rating}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="font-mono text-xs font-bold text-slate-700">{player.draft_price?.toFixed(1) || 0} credits</span>
                                </td>
                                <td className="px-4 py-3 text-xs font-bold text-slate-650 font-mono">{player.matches_played}</td>
                                <td className="px-4 py-3">
                                  <span className="font-mono text-xs font-bold text-amber-600">{player.total_points}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  
    </AuthGuard>
  );
}
