'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface PlayerBid {
  team_id: string;
  team_name: string;
  amount: number;
  status: string;
  is_you: boolean;
  is_winner: boolean;
}

interface Player {
  player_id: string;
  player_name: string;
  position: string;
  overall_rating: number;
  player_team: string;
  phase: 'phase1' | 'phase2' | 'phase3';
  phase_note: string | null;
  winning_bid: {
    amount: number;
    team_id: string;
    team_name: string;
    is_you: boolean;
  };
  your_bid: {
    amount: number;
    status: string;
    won: boolean;
    lost_by: number;
  } | null;
  all_bids: PlayerBid[];
  total_bids: number;
}

interface RoundResult {
  round_id: string;
  round_number: number;
  position: string;
  round_type: string;
  status: string;
  end_time: string;
  created_at: string;
  players: Player[];
  total_players: number;
  your_wins: number;
  your_losses: number;
  no_bids: number;
}

export default function AuctionResultsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [rounds, setRounds] = useState<RoundResult[]>([]);
  const [selectedRound, setSelectedRound] = useState<string>('all');
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(new Set());
  const [expandedOthers, setExpandedOthers] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'amount' | 'status' | 'name'>('amount');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchSeasonAndResults = async () => {
      if (!user) return;

      try {
        // Get active season
        const seasonsQuery = query(
          collection(db, 'seasons'),
          where('isActive', '==', true),
          limit(1)
        );
        const seasonsSnapshot = await getDocs(seasonsQuery);

        if (seasonsSnapshot.empty) {
          setIsLoading(false);
          return;
        }

        const activeSeason = seasonsSnapshot.docs[0].id;
        setSeasonId(activeSeason);

        // Fetch auction results
        const response = await fetchWithTokenRefresh(
          `/api/team/auction-results?season_id=${activeSeason}`
        );
        const result = await response.json();

        if (result.success) {
          console.log('Auction results data:', result.data);
          setRounds(result.data.rounds);
          if (result.data.rounds.length > 0) {
            setSelectedRound(result.data.rounds[0].round_id);
          }
        } else {
          console.error('Failed to fetch auction results:', result.error);
        }
      } catch (error) {
        console.error('Error fetching auction results:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSeasonAndResults();
  }, [user]);

  const togglePlayerExpand = (playerId: string) => {
    setExpandedPlayers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(playerId)) {
        newSet.delete(playerId);
      } else {
        newSet.add(playerId);
      }
      return newSet;
    });
  };

  const toggleOthersExpand = (roundId: string) => {
    setExpandedOthers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(roundId)) {
        newSet.delete(roundId);
      } else {
        newSet.add(roundId);
      }
      return newSet;
    });
  };

  const filteredRounds = selectedRound === 'all' 
    ? rounds 
    : rounds.filter(r => r.round_id === selectedRound);

  const sortPlayers = (players: Player[]) => {
    const sorted = [...players];
    switch (sortBy) {
      case 'amount':
        return sorted.sort((a, b) => b.winning_bid.amount - a.winning_bid.amount);
      case 'status':
        return sorted.sort((a, b) => {
          if (a.your_bid?.won && !b.your_bid?.won) return -1;
          if (!a.your_bid?.won && b.your_bid?.won) return 1;
          return 0;
        });
      case 'name':
        return sorted.sort((a, b) => a.player_name.localeCompare(b.player_name));
      default:
        return sorted;
    }
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Results...</p>
        </div>
      </div>
    );
  }

  if (rounds.length === 0) {
    return (
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="max-w-xl mx-auto relative z-10 font-mono">
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center shadow-sm">
            <div className="inline-flex items-center justify-center p-4 bg-slate-50 border border-slate-200/60 rounded-full mb-4">
              <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-2">No Completed Rounds Yet</h2>
            <p className="text-xs text-slate-500 uppercase font-semibold mb-6">Auction results will appear here after rounds are completed</p>
            <Link
              href="/dashboard/team"
              className="inline-flex items-center justify-center px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-sm w-full"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-6">
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap font-mono">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wider text-slate-800">Auction Results</h1>
              <p className="text-xs text-slate-500 uppercase font-semibold mt-1">{rounds.length} completed rounds</p>
            </div>
            <Link
              href="/dashboard/team"
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-bold"
            >
              Back
            </Link>
          </div>

          {/* Round Filter Pills */}
          <div className="mb-6 font-mono">
            <h3 className="text-[10px] uppercase font-bold text-slate-400 mb-3 tracking-wider">Filter by Round</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedRound('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                  selectedRound === 'all'
                    ? 'bg-slate-800 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-500 border-slate-200/60 hover:bg-slate-50'
                }`}
              >
                All Rounds
              </button>
              {rounds.map(round => (
                <button
                  key={round.round_id}
                  onClick={() => setSelectedRound(round.round_id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                    selectedRound === round.round_id
                      ? 'bg-slate-800 text-white border-slate-900 shadow-sm'
                      : 'bg-white text-slate-500 border-slate-200/60 hover:bg-slate-50'
                  }`}
                >
                  Round {round.round_number} ({round.position})
                </button>
              ))}
            </div>
          </div>

          {/* Results for each round */}
          {filteredRounds.map(round => (
            <div key={round.round_id} className="mb-8">
              {/* Round Header */}
              <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 mb-4 font-mono">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-800 uppercase tracking-wider">
                      Round {round.round_number} ({round.position})
                    </h2>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1.5">
                      Ended {new Date(round.end_time).toLocaleDateString()} • 
                      {' '}{round.total_players} Players • 
                      {' '}{round.total_players > 0 ? Math.round((round.total_players - round.no_bids) / round.total_players * 100) : 0}% Participation
                    </p>
                  </div>
                  <div className="flex gap-2 text-xs font-bold uppercase tracking-wider">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700">
                      Won: {round.your_wins}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-100 text-rose-700">
                      Lost: {round.your_losses}
                    </span>
                  </div>
                </div>
              </div>

              {/* Sort Controls */}
              <div className="flex items-center justify-between mb-4 font-mono">
                <p className="text-xs text-slate-400 uppercase font-bold">
                  {round.players.length} player{round.players.length !== 1 ? 's' : ''} in round
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 uppercase font-bold">Sort by:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200/60 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-bold uppercase tracking-wider text-[11px]"
                  >
                    <option value="amount">Bid Amount</option>
                    <option value="status">Status</option>
                    <option value="name">Player Name</option>
                  </select>
                </div>
              </div>

              {/* Players List */}
              <div className="space-y-3">
                {sortPlayers(round.players).map(player => {
                  const isExpanded = expandedPlayers.has(player.player_id);
                  const statusColor = player.your_bid?.won 
                    ? 'border-l-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/30' 
                    : player.your_bid 
                    ? 'border-l-rose-500 bg-rose-50/20 hover:bg-rose-50/30' 
                    : 'border-l-slate-400 bg-slate-50/30 hover:bg-slate-50/50';

                  return (
                    <div key={player.player_id} className={`bg-white border border-slate-200/60 rounded-2xl border-l-4 ${statusColor} overflow-hidden transition-all duration-200 font-mono`}>
                      {/* Player Card Header */}
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {/* Position Badge */}
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center border font-bold text-xs uppercase tracking-wider shrink-0 ${
                              player.your_bid?.won 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : player.your_bid 
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}>
                              {player.position}
                            </div>

                            {/* Player Info */}
                            <div className="flex-1 min-w-0 font-mono">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-extrabold text-slate-800 text-base uppercase tracking-wide">{player.player_name}</h3>
                                <span className="text-xs font-black text-amber-500">
                                  ★ {player.overall_rating}
                                </span>
                                {player.player_team && (
                                  <span className="text-xs text-slate-400 uppercase font-bold">{player.player_team}</span>
                                )}
                                {/* Phase Badge */}
                                {player.phase && (
                                  <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border ${
                                    player.phase === 'phase1' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' :
                                    player.phase === 'phase2' ? 'bg-amber-50 text-amber-700 border-amber-200/60' :
                                    'bg-purple-50 text-purple-700 border-purple-200/60'
                                  }`}>
                                    {player.phase === 'phase1' ? 'Regular' :
                                     player.phase === 'phase2' ? 'Incomplete' :
                                     'Random'}
                                  </span>
                                )}
                              </div>

                              {/* Phase Note */}
                              {player.phase_note && (
                                <div className="mt-2 p-2 rounded-lg bg-yellow-50 border border-yellow-200">
                                  <p className="text-xs text-yellow-800">
                                    <span className="font-semibold">⚠️ Note:</span> {player.phase_note}
                                  </p>
                                </div>
                              )}

                              {/* Bid Info */}
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] uppercase font-bold tracking-wider">
                                {player.your_bid ? (
                                  <>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-slate-400">Your Bid:</span>
                                      <span className="text-slate-800 font-black">£{player.your_bid.amount.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-slate-400">Winner:</span>
                                      {!player.your_bid.won && (
                                        <span className="text-slate-700 font-extrabold">{player.winning_bid.team_name} (</span>
                                      )}
                                      <span className={`font-black ${player.your_bid.won ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        £{player.winning_bid.amount.toLocaleString()}
                                      </span>
                                      {!player.your_bid.won && (
                                        <span className="text-slate-700 font-extrabold">)</span>
                                      )}
                                    </div>
                                    {!player.your_bid.won && player.your_bid.lost_by > 0 && (
                                      <span className="text-rose-600 font-black font-mono">
                                        Lost by £{player.your_bid.lost_by.toLocaleString()}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400">No bid placed</span>
                                    <span className="text-slate-500 font-extrabold">• Winner: {player.winning_bid.team_name}</span>
                                    <span className="text-slate-800 font-black">£{player.winning_bid.amount.toLocaleString()}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Status Badge & Expand Button */}
                          <div className="flex items-center gap-2 shrink-0">
                            {player.your_bid && (
                              <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider ${
                                player.your_bid.won 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' 
                                  : 'bg-rose-50 text-rose-700 border-rose-200/60'
                              }`}>
                                {player.your_bid.won ? 'WON' : 'LOST'}
                              </span>
                            )}
                            <button
                              onClick={() => togglePlayerExpand(player.player_id)}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                              title="View all bids"
                            >
                              <svg 
                                className={`w-5 h-5 text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Expanded View - All Bids */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50/20 p-4 font-mono">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                            All Bids ({player.total_bids})
                          </h4>
                          <div className="space-y-2 text-xs font-bold uppercase tracking-wider">
                            {player.all_bids.map((bid, idx) => (
                              <div 
                                key={idx} 
                                className={`flex items-center justify-between p-3 rounded-xl border ${
                                  bid.is_winner 
                                    ? 'bg-emerald-50 border-emerald-200/60 text-emerald-800' 
                                    : bid.is_you 
                                    ? 'bg-blue-50 border-blue-200/60 text-blue-800'
                                    : 'bg-slate-50/60 border-slate-200/30 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-700">
                                    #{idx + 1}
                                  </span>
                                  <span className={`font-medium ${bid.is_you ? 'text-blue-700' : 'text-gray-900'}`}>
                                    {bid.team_name}
                                    {bid.is_you && ' (You)'}
                                  </span>
                                  {bid.is_winner && (
                                    <span className="px-2 py-0.5 rounded-md bg-green-600 text-white text-xs font-bold">
                                      🏆 WINNER
                                    </span>
                                  )}
                                </div>
                                <div className="font-bold text-gray-900">
                                  £{bid.amount.toLocaleString()}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
