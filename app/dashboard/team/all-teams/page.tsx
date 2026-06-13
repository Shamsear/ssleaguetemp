'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCachedTeamSeasons, useCachedSeasons } from '@/hooks/useCachedFirebase';
import type { Season } from '@/types/season';

interface Team {
  id: string;
  name: string;
  logoUrl?: string;
  balance: number;
  // Dual currency fields
  currencySystem?: string;
  footballBudget?: number;
  realPlayerBudget?: number;
  footballSpent?: number;
  realPlayerSpent?: number;
  // Penalty fields
  skipped_seasons?: number;
  penalty_amount?: number;
  last_played_season?: string;
  is_auto_registered?: boolean;
}

interface TeamStats {
  team: Team;
  totalPlayers: number;
  footballPlayersCount: number;
  realPlayersCount: number;
  totalValue: number;
  avgRating: number;
  positionBreakdown: { [key: string]: number };
}

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'AMF', 'LMF', 'RMF', 'LWF', 'RWF', 'SS', 'CF'];

export default function AllTeamsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [teams, setTeams] = useState<TeamStats[]>([]);
  const [seasonName, setSeasonName] = useState('');
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [maxPlayers, setMaxPlayers] = useState(25); // Default to 25
  const [seasonType, setSeasonType] = useState<'single' | 'multi'>('single');
  const [error, setError] = useState('');
  const [playerCounts, setPlayerCounts] = useState<{ [key: string]: { footballPlayersCount: number; realPlayersCount: number } }>({});

  // Fetch all team seasons for the season (cached, only after we have seasonId)
  const { data: allTeamSeasons, loading: allTeamsLoading } = useCachedTeamSeasons(
    seasonId ? { seasonId } : undefined
  );

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Get active season (same approach as team-leaderboard)
  useEffect(() => {
    const fetchActiveSeason = async () => {
      if (!user || user.role !== 'team') return;

      try {
        const { collection, query, getDocs } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase/config');
        
        // Get all seasons
        const seasonsQuery = query(collection(db, 'seasons'));
        const seasonsSnapshot = await getDocs(seasonsQuery);
        const nonCompletedSeasonIds: string[] = [];
        const seasonsMap = new Map<string, { name: string; maxPlayers: number }>();
        
        seasonsSnapshot.forEach((doc) => {
          const data = doc.data() as Season;
          seasonsMap.set(doc.id, {
            name: data.name || `Season ${data.season_number || 'Unknown'}`,
            maxPlayers: data.football_base_slots || data.max_football_players || 25
          });
          
          // Include seasons that are NOT completed
          if (data.status !== 'completed') {
            nonCompletedSeasonIds.push(doc.id);
          }
        });
        
        // Store the season type for the target season
        const getSeasonType = (sid: string): 'single' | 'multi' => {
          const season = seasonsSnapshot.docs.find(doc => doc.id === sid);
          return (season?.data() as Season)?.type || 'single';
        };

        // Get active season
        let targetSeasonId = null;
        if (nonCompletedSeasonIds.length > 0) {
          targetSeasonId = nonCompletedSeasonIds[0];
          const seasonData = seasonsMap.get(targetSeasonId);
          setSeasonName(seasonData?.name || 'Current Season');
          setMaxPlayers(seasonData?.maxPlayers || 25);
          setSeasonType(getSeasonType(targetSeasonId));
        } else if (seasonsSnapshot.size > 0) {
          // Fallback: use the first active season
          const firstActiveSeason = seasonsSnapshot.docs.find(doc => doc.data().isActive === true);
          if (firstActiveSeason) {
            targetSeasonId = firstActiveSeason.id;
            const seasonData = seasonsMap.get(targetSeasonId);
            setSeasonName(seasonData?.name || 'Current Season');
            setMaxPlayers(seasonData?.maxPlayers || 25);
            setSeasonType(getSeasonType(targetSeasonId));
          } else {
            const firstSeason = seasonsSnapshot.docs[0];
            targetSeasonId = firstSeason.id;
            const seasonData = seasonsMap.get(targetSeasonId);
            setSeasonName(seasonData?.name || 'Season');
            setMaxPlayers(seasonData?.maxPlayers || 25);
            setSeasonType(getSeasonType(targetSeasonId));
          }
        }

        if (!targetSeasonId) {
          setError('No active season found');
          return;
        }

        setSeasonId(targetSeasonId);
      } catch (error) {
        console.error('Error fetching active season:', error);
        setError('Failed to load active season');
      }
    };

    fetchActiveSeason();
  }, [user]);

  // Fetch player counts from Neon databases
  useEffect(() => {
    const fetchPlayerCounts = async () => {
      if (!seasonId) return;

      try {
        const response = await fetch(`/api/team/player-counts?seasonId=${seasonId}`);
        const result = await response.json();

        if (result.success) {
          setPlayerCounts(result.data);
        }
      } catch (error) {
        console.error('Error fetching player counts:', error);
      }
    };

    fetchPlayerCounts();
  }, [seasonId]);

  // Process all team seasons into TeamStats
  useEffect(() => {
    if (!allTeamSeasons || allTeamsLoading || !seasonId) return;

    console.log('[All Teams] Processing team seasons:', {
      totalTeamSeasons: allTeamSeasons.length,
      targetSeasonId: seasonId,
      sampleSeasonIds: allTeamSeasons.slice(0, 3).map((ts: any) => ts.season_id)
    });

    try {
      const teamsData: TeamStats[] = allTeamSeasons
        .filter((ts: any) => {
          const isRegistered = ts.status === 'registered';
          const isCorrectSeason = ts.season_id === seasonId;
          
          console.log('[All Teams] Filtering team:', {
            teamName: ts.team_name,
            seasonId: ts.season_id,
            targetSeasonId: seasonId,
            status: ts.status,
            passes: isRegistered && isCorrectSeason
          });
          
          return isRegistered && isCorrectSeason;
        })
        .map((teamSeasonData: any) => {
          const teamId = teamSeasonData.team_id;
          // Get actual player counts from Neon databases
          const footballPlayersCount = playerCounts[teamId]?.footballPlayersCount || 0;
          const realPlayersCount = playerCounts[teamId]?.realPlayersCount || 0;
          const totalPlayers = footballPlayersCount + realPlayersCount;
          const avgRating = teamSeasonData.average_rating || 0;

          return {
            team: {
              id: teamId,
              name: teamSeasonData.team_name || 'Unknown Team',
              logoUrl: teamSeasonData.team_logo || undefined,
              balance: teamSeasonData.budget || 0,
              // Dual currency fields
              currencySystem: teamSeasonData.currency_system || 'dual',
              footballBudget: teamSeasonData.football_budget || 0,
              realPlayerBudget: teamSeasonData.real_player_budget || 0,
              footballSpent: teamSeasonData.football_spent || 0,
              realPlayerSpent: teamSeasonData.real_player_spent || 0,
            },
            totalPlayers,
            footballPlayersCount,
            realPlayersCount,
            totalValue: teamSeasonData.currency_system === 'dual'
              ? (teamSeasonData.football_spent || 0) + (teamSeasonData.real_player_spent || 0)
              : (teamSeasonData.total_spent || 0),
            avgRating: Math.round(avgRating * 10) / 10,
            positionBreakdown: teamSeasonData.position_counts || {},
          };
        });

      // Sort teams by total value (descending)
      teamsData.sort((a, b) => b.totalValue - a.totalValue);

      console.log('[All Teams] Final filtered teams:', {
        count: teamsData.length,
        teams: teamsData.map(t => ({ name: t.team.name, id: t.team.id }))
      });

      setTeams(teamsData);
    } catch (err) {
      console.error('Error processing teams:', err);
      setError('An error occurred while loading teams');
    }
  }, [allTeamSeasons, allTeamsLoading, seasonId, playerCounts]);

  const getPositionColor = (position: string) => {
    const colors: { [key: string]: string } = {
      GK: 'bg-amber-50 text-amber-700 border border-amber-200/40',
      CB: 'bg-rose-50 text-rose-700 border border-rose-200/40',
      LB: 'bg-rose-50/60 text-rose-700 border border-rose-200/30',
      RB: 'bg-rose-50/60 text-rose-700 border border-rose-200/30',
      DMF: 'bg-indigo-50 text-indigo-700 border border-indigo-200/40',
      CMF: 'bg-sky-50 text-sky-700 border border-sky-200/40',
      AMF: 'bg-violet-50 text-violet-700 border border-violet-200/40',
      LMF: 'bg-sky-50/60 text-sky-700 border border-sky-200/30',
      RMF: 'bg-sky-50/60 text-sky-700 border border-sky-200/30',
      LWF: 'bg-emerald-50/60 text-emerald-700 border border-emerald-200/30',
      RWF: 'bg-emerald-50/60 text-emerald-700 border border-emerald-200/30',
      SS: 'bg-emerald-50 text-emerald-700 border border-emerald-200/40',
      CF: 'bg-emerald-50 text-emerald-700 border border-emerald-200/40',
    };
    return colors[position] || 'bg-slate-50 text-slate-700 border border-slate-200/40';
  };


  const isLoading = allTeamsLoading;

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Teams...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team') {
    return null;
  }

  if (error) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-8 max-w-md w-full mx-auto text-center relative z-10 font-mono">
          <div className="text-rose-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-2">Error Loading Teams</h2>
          <p className="text-xs text-slate-500 uppercase font-semibold mb-6">{error}</p>
          <Link 
            href="/dashboard" 
            className="inline-flex items-center justify-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl text-xs uppercase tracking-wider font-bold transition-all shadow-sm w-full"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="font-mono">
            <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wider text-slate-800">All Teams</h1>
            <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
              Season: <span className="font-extrabold text-amber-500">{seasonName}</span>
            </p>
          </div>
          <Link 
            href="/dashboard" 
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-bold"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Dashboard</span>
          </Link>
        </div>

        {/* Teams Count Badge */}
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200/60 rounded-xl font-mono text-xs uppercase tracking-wider font-bold shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span>{teams.length} Team{teams.length !== 1 ? 's' : ''} Registered</span>
          </div>
        </div>

        {teams.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((teamData) => (
              <div 
                key={teamData.team.id} 
                className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 hover:border-amber-400/40 hover:shadow-md transition-all duration-200 font-mono flex flex-col justify-between"
              >
                <div>
                  {/* Team Header */}
                  <div className="flex items-center mb-4 gap-3">
                    <div className="h-14 w-14 flex-shrink-0 bg-slate-50 border border-slate-200/60 rounded-xl flex items-center justify-center p-1.5 relative overflow-hidden shadow-inner">
                      {teamData.team.logoUrl ? (
                        <Image 
                          src={teamData.team.logoUrl} 
                          alt={teamData.team.name} 
                          width={56}
                          height={56}
                          className="object-contain w-full h-full"
                        />
                      ) : (
                        <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide leading-tight">{teamData.team.name}</h2>
                  </div>

                  {/* Team Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 mb-4 text-[10px] uppercase font-bold tracking-wider">
                    {/* Players Count */}
                    <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-400 text-[8px] mb-1">Squad Players</span>
                      <span className="text-slate-700 flex items-center gap-1 font-mono">
                        ⚽ {teamData.footballPlayersCount} / {maxPlayers}
                      </span>
                    </div>

                    {seasonType === 'multi' && (
                      <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between">
                        <span className="text-slate-400 text-[8px] mb-1">Real Players</span>
                        <span className="text-slate-700 flex items-center gap-1 font-mono">
                          👤 {teamData.realPlayersCount}
                        </span>
                      </div>
                    )}

                    {/* Currencies */}
                    {seasonType === 'multi' || teamData.team.currencySystem === 'dual' ? (
                      <>
                        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                          <span className="text-slate-400 text-[8px] mb-1">eCoin Spent</span>
                          <span className="text-blue-600 font-extrabold font-mono text-xs">
                            {(teamData.team.footballSpent || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                          <span className="text-slate-400 text-[8px] mb-1">SSCoin Spent</span>
                          <span className="text-purple-600 font-extrabold font-mono text-xs">
                            {(teamData.team.realPlayerSpent || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                          <span className="text-slate-400 text-[8px] mb-1">eCoin Left</span>
                          <span className="text-indigo-600 font-extrabold font-mono text-xs">
                            {(teamData.team.footballBudget || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                          <span className="text-slate-400 text-[8px] mb-1">SSCoin Left</span>
                          <span className="text-amber-600 font-extrabold font-mono text-xs">
                            {(teamData.team.realPlayerBudget || 0).toLocaleString()}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                          <span className="text-slate-400 text-[8px] mb-1">Spent</span>
                          <span className="text-emerald-600 font-extrabold font-mono text-xs">
                            {teamData.totalValue.toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                          <span className="text-slate-400 text-[8px] mb-1">Left</span>
                          <span className="text-amber-600 font-extrabold font-mono text-xs">
                            {teamData.team.balance.toLocaleString()}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Average Rating */}
                  {teamData.avgRating > 0 && (
                    <div className="mb-4 p-3 bg-amber-50/50 border border-amber-200/50 rounded-xl">
                      <div className="flex items-center justify-between font-mono">
                        <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Squad Avg Rating</span>
                        <span className="text-lg font-black text-amber-500">
                          ★ {teamData.avgRating.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Squad Composition */}
                  <div className="space-y-2 mb-4">
                    <h3 className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Squad Composition</h3>
                    <div className="grid grid-cols-4 gap-1 text-[9px] font-mono font-bold">
                      {POSITIONS.map((position) => {
                        const count = teamData.positionBreakdown[position] || 0;
                        return (
                          <div 
                            key={position} 
                            className={`rounded-lg py-1 px-1.5 flex justify-between items-center ${getPositionColor(position)} ${
                              count === 0 ? 'opacity-30' : ''
                            }`}
                          >
                            <span>{position}</span>
                            <span className="font-extrabold">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* View Squad Button */}
                <div className="mt-auto pt-3 border-t border-slate-100">
                  <Link
                    href={`/dashboard/team/squad/${teamData.team.id}`}
                    className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-sm"
                  >
                    View Squad
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* No Teams Message */
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center shadow-sm">
            <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-2">No Teams Found</h3>
            <p className="text-xs text-slate-500 font-semibold uppercase">No teams are registered for this season yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
