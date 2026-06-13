'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/firebase/config';
import {
  collection,
  getDocs,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { getISTNow, parseISTDate, createISTDateTime } from '@/lib/utils/timezone';
import { useRoundPhaseMonitor, calculatePhase } from '@/hooks/useRoundPhaseMonitor';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface Match {
  id: string;
  round_number: number;
  match_number: number;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  home_score?: number;
  away_score?: number;
  status: string;
  match_date?: Date;
  winner_id?: string;
  round_status?: string;
  leg?: string;
  phase?: 'home_fixture' | 'fixture_entry' | 'result_entry' | 'closed';
  phase_label?: string;
  home_deadline?: Date;
  away_deadline?: Date;
  result_deadline?: Date;
  tournament_id?: string;
  tournament_name?: string;
}

export default function TeamMatchesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [seasonId, setSeasonId] = useState<string>('');
  const [teamId, setTeamId] = useState<string>('');
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');
  const [phaseUpdateTrigger, setPhaseUpdateTrigger] = useState(0);

  // Monitor phase changes via WebSocket
  const { isConnected: wsConnected, lastCheck } = useRoundPhaseMonitor({
    seasonId,
    enabled: !!seasonId && !isLoading,
    onPhaseChange: (roundNumber, newPhase) => {
      console.log(`🔄 Phase changed for round ${roundNumber}: ${newPhase}`);
      // Trigger matches re-calculation
      setPhaseUpdateTrigger(prev => prev + 1);
    },
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchMatches = async () => {
      if (!user || user.role !== 'team') return;

      try {
        setIsLoading(true);

        // Fetch team's registered season from team_seasons collection
        const { db } = await import('@/lib/firebase/config');
        const { collection, query, where, getDocs, limit, orderBy, doc, getDoc } = await import('firebase/firestore');

        console.log('🔍 Fetching team registration...');
        // Get team's registered season(s)
        const teamSeasonsSnapshot = await getDocs(
          query(
            collection(db, 'team_seasons'),
            where('user_id', '==', user.uid),
            where('status', '==', 'registered'),
            orderBy('joined_at', 'desc')
          )
        );

        if (teamSeasonsSnapshot.empty) {
          console.log('❌ No registered season found for team');
          setIsLoading(false);
          return;
        }

        // Find the current/ongoing season the team is registered for
        let currentSeasonId: string | null = null;
        let teamId: string | null = null;

        console.log('🔍 Checking registered seasons status...');
        // Check each registered season and find one that's not completed
        for (const teamSeasonDoc of teamSeasonsSnapshot.docs) {
          const teamSeasonData = teamSeasonDoc.data();
          const seasonId = teamSeasonData.season_id;

          // Store team_id from the first registration
          if (!teamId) {
            teamId = teamSeasonData.team_id;
            setTeamId(teamId);
            console.log('🎯 Team ID:', teamId);
          }

          // Get season details
          const seasonRef = doc(db, 'seasons', seasonId);
          const seasonDoc = await getDoc(seasonRef);

          if (seasonDoc.exists()) {
            const seasonData = seasonDoc.data();
            const seasonStatus = seasonData.status || 'draft';

            console.log(`  Season ${seasonId}: status = ${seasonStatus}`);

            // Use this season if it's not completed (active, draft, ongoing, etc.)
            if (seasonStatus !== 'completed') {
              currentSeasonId = seasonId;
              console.log('✅ Using ongoing season:', currentSeasonId, `(${seasonStatus})`);
              break;
            }
          }
        }

        // Fallback: use most recent if all are completed
        if (!currentSeasonId) {
          const latestTeamSeason = teamSeasonsSnapshot.docs[0].data();
          currentSeasonId = latestTeamSeason.season_id;
          console.log('⚠️ All seasons completed, using latest:', currentSeasonId);
        }

        setSeasonId(currentSeasonId);

        // Fetch tournaments for this season
        const tournamentsRes = await fetchWithTokenRefresh(`/api/tournaments?season_id=${currentSeasonId}`);
        const tournamentsData = await tournamentsRes.json();

        if (tournamentsData.success && tournamentsData.tournaments) {
          setTournaments(tournamentsData.tournaments);
          // Auto-select first tournament
          if (tournamentsData.tournaments.length > 0 && !selectedTournamentId) {
            setSelectedTournamentId(tournamentsData.tournaments[0].id);
          }
        }

        // Fetch fixtures from Neon database
        console.log('🔍 Fetching fixtures from Neon for season:', currentSeasonId, 'team:', teamId);

        const fixturesResponse = await fetchWithTokenRefresh(`/api/fixtures/team?team_id=${teamId}&season_id=${currentSeasonId}`);

        if (!fixturesResponse.ok) {
          const errorData = await fixturesResponse.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Failed to fetch fixtures from Neon:', fixturesResponse.status, errorData);
          setIsLoading(false);
          return;
        }

        const { fixtures: fixturesList } = await fixturesResponse.json();
        console.log('📊 Found fixtures from Neon:', fixturesList.length);

        const allMatches: Match[] = [];

        // Build a map of fixture data first
        const fixturesByRound = new Map<string, any[]>();
        fixturesList.forEach((fixture: any) => {
          const roundKey = `${fixture.tournament_id}_${fixture.round_number}_${fixture.leg || 'first'}`;
          if (!fixturesByRound.has(roundKey)) {
            fixturesByRound.set(roundKey, []);
          }
          fixturesByRound.get(roundKey)!.push({
            fixtureDoc: { id: fixture.id },
            fixture
          });
        });

        // Fetch round statuses and deadlines from Neon for all relevant rounds (in parallel)
        const roundDataMap = new Map<string, any>();
        const roundFetchPromises = Array.from(fixturesByRound.entries()).map(async ([roundKey, fixtures]) => {
          const firstFixture = fixtures[0].fixture;
          const roundNumber = firstFixture.round_number;
          const leg = firstFixture.leg || 'first';
          const tournamentId = firstFixture.tournament_id;

          const defaultData = {
            status: 'pending',
            home_fixture_deadline_time: '23:30',
            away_fixture_deadline_time: '23:45',
            result_entry_deadline_day_offset: 2,
            result_entry_deadline_time: '00:30',
          };

          try {
            const response = await fetchWithTokenRefresh(`/api/round-deadlines?tournament_id=${tournamentId}&round_number=${roundNumber}&leg=${leg}`);

            if (response.ok) {
              const { roundDeadline } = await response.json();

              if (roundDeadline) {
                return {
                  roundKey,
                  data: {
                    status: roundDeadline.status || 'pending',
                    home_fixture_deadline_time: roundDeadline.home_fixture_deadline_time || '23:30',
                    away_fixture_deadline_time: roundDeadline.away_fixture_deadline_time || '23:45',
                    result_entry_deadline_day_offset: roundDeadline.result_entry_deadline_day_offset || 2,
                    result_entry_deadline_time: roundDeadline.result_entry_deadline_time || '00:30',
                    scheduled_date: roundDeadline.scheduled_date,
                  }
                };
              }
            }
            return { roundKey, data: defaultData };
          } catch (error) {
            console.error(`Error fetching round deadline for round ${roundNumber} leg ${leg}:`, error);
            return { roundKey, data: defaultData };
          }
        });

        // Wait for all round deadline fetches to complete
        const roundResults = await Promise.all(roundFetchPromises);
        roundResults.forEach(({ roundKey, data }) => {
          roundDataMap.set(roundKey, data);
        });

        // Helper function to calculate match phase
        const calculateMatchPhase = (roundData: any, matchDate: Date | null) => {
          if (!matchDate || !roundData.scheduled_date) {
            return { phase: 'fixture_entry' as const, phase_label: 'Fixture Entry' };
          }

          // Get current time in IST
          const now = getISTNow();
          // Parse scheduled date as IST
          const baseDate = parseISTDate(roundData.scheduled_date);

          // Parse deadlines using IST utilities
          const homeDeadline = createISTDateTime(
            roundData.scheduled_date,
            roundData.home_fixture_deadline_time
          );

          const awayDeadline = createISTDateTime(
            roundData.scheduled_date,
            roundData.away_fixture_deadline_time
          );

          // Calculate result deadline (base date + offset days + time)
          const resultDeadline = new Date(baseDate);
          resultDeadline.setDate(resultDeadline.getDate() + roundData.result_entry_deadline_day_offset);
          const [resultHour, resultMin] = roundData.result_entry_deadline_time.split(':').map(Number);
          resultDeadline.setHours(resultHour, resultMin, 0, 0);

          if (now < homeDeadline) {
            return {
              phase: 'home_fixture' as const,
              phase_label: 'Home Fixture Setup',
              home_deadline: homeDeadline,
              away_deadline: awayDeadline,
              result_deadline: resultDeadline,
            };
          } else if (now < awayDeadline) {
            return {
              phase: 'fixture_entry' as const,
              phase_label: 'Fixture Entry',
              home_deadline: homeDeadline,
              away_deadline: awayDeadline,
              result_deadline: resultDeadline,
            };
          } else if (now < resultDeadline) {
            return {
              phase: 'result_entry' as const,
              phase_label: 'Result Entry',
              home_deadline: homeDeadline,
              away_deadline: awayDeadline,
              result_deadline: resultDeadline,
            };
          } else {
            return {
              phase: 'closed' as const,
              phase_label: 'Closed',
              home_deadline: homeDeadline,
              away_deadline: awayDeadline,
              result_deadline: resultDeadline,
            };
          }
        };

        // Now build the matches array with round status and phase
        fixturesByRound.forEach((fixtures, roundKey) => {
          const roundData = roundDataMap.get(roundKey) || { status: 'pending' };

          fixtures.forEach(({ fixtureDoc, fixture }) => {
            const matchDate = fixture.scheduled_date?.toDate?.() || fixture.scheduled_date;
            const phaseInfo = calculateMatchPhase(roundData, matchDate);

            console.log('✅ Found match for current team:', {
              home: fixture.home_team_name,
              away: fixture.away_team_name,
              match_status: fixture.status,
              round_status: roundData.status,
              phase: phaseInfo.phase_label,
              round: fixture.round_number
            });

            // Find tournament name
            const tournament = tournamentsData.tournaments?.find((t: any) => t.id === fixture.tournament_id);

            allMatches.push({
              id: fixtureDoc.id,
              round_number: fixture.round_number || 0,
              match_number: fixture.match_number || 0,
              home_team_id: fixture.home_team_id,
              home_team_name: fixture.home_team_name || 'Team',
              away_team_id: fixture.away_team_id,
              away_team_name: fixture.away_team_name || 'Team',
              home_score: fixture.home_score,
              away_score: fixture.away_score,
              status: fixture.status || 'scheduled',
              match_date: matchDate,
              winner_id: fixture.result === 'home_win' ? fixture.home_team_id : fixture.result === 'away_win' ? fixture.away_team_id : undefined,
              round_status: roundData.status,
              leg: fixture.leg || 'first',
              phase: phaseInfo.phase,
              phase_label: phaseInfo.phase_label,
              home_deadline: phaseInfo.home_deadline,
              away_deadline: phaseInfo.away_deadline,
              result_deadline: phaseInfo.result_deadline,
              tournament_id: fixture.tournament_id,
              tournament_name: tournament?.tournament_name,
            });
          });
        });

        // Sort by round number and match number
        allMatches.sort((a, b) => {
          if (a.round_number !== b.round_number) {
            return b.round_number - a.round_number; // Latest rounds first
          }
          return a.match_number - b.match_number;
        });

        console.log('📊 Total matches found for user:', allMatches.length);
        console.log('📊 Match statuses:', allMatches.map(m => ({ round: m.round_number, status: m.status })));
        console.log(`🔌 WebSocket connected: ${wsConnected}`);
        setMatches(allMatches);
      } catch (error) {
        console.error('Error fetching matches:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMatches();
  }, [user, lastCheck, phaseUpdateTrigger]); // Re-fetch when phase changes or every minute

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0066FF] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading matches...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team') {
    return null;
  }

  // Filter matches by selected tournament
  const filteredMatches = selectedTournamentId
    ? matches.filter(m => m.tournament_id === selectedTournamentId)
    : matches;

  // Completed: matches that BOTH have valid scores AND completed/closed status
  // This ensures we don't show matches as completed just because of incorrect status
  const completedMatches = filteredMatches.filter(m =>
    (m.home_score !== null && m.home_score !== undefined &&
      m.away_score !== null && m.away_score !== undefined) &&
    (m.status === 'completed' || m.status === 'closed')
  );

  // Get IDs of completed matches for exclusion
  const completedMatchIds = new Set(completedMatches.map(m => m.id));

  // Active: matches in an active round that aren't completed yet
  // These are matches where teams can work on fixtures, matchups, or results
  const activeMatches = filteredMatches.filter(m =>
    !completedMatchIds.has(m.id) &&
    m.round_status === 'active'
  );

  // Upcoming: matches in pending/inactive rounds that aren't completed or active
  const upcomingMatches = filteredMatches.filter(m =>
    !completedMatchIds.has(m.id) &&
    m.round_status !== 'active'
  );

  const getMatchResultClass = (match: Match) => {
    // Show result styling if scores are available
    if (match.home_score === undefined || match.away_score === undefined) {
      return 'bg-white border border-slate-200/60';
    }

    if (match.winner_id === teamId) {
      return 'border-l-4 border-emerald-500 bg-emerald-50/20 border-y border-r border-slate-200/60';
    } else if (match.winner_id) {
      return 'border-l-4 border-red-500 bg-red-50/20 border-y border-r border-slate-200/60';
    }
    return 'border-l-4 border-slate-400 bg-slate-50/50 border-y border-r border-slate-200/60'; // Draw
  };

  const getResultText = (match: Match) => {
    // Show result if scores are available
    if (match.home_score === undefined || match.away_score === undefined) return null;

    // Check if this team won (compare with team ID, not user ID)
    if (match.winner_id === teamId) {
      return <span className="text-emerald-700 font-bold uppercase tracking-wider text-[10px] bg-emerald-50 py-0.5 px-2 rounded-full border border-emerald-200/60">Won</span>;
    } else if (match.winner_id) {
      return <span className="text-red-700 font-bold uppercase tracking-wider text-[10px] bg-red-50 py-0.5 px-2 rounded-full border border-red-200/60">Lost</span>;
    }
    return <span className="text-slate-600 font-bold uppercase tracking-wider text-[10px] bg-slate-100 py-0.5 px-2 rounded-full border border-slate-200/60">Draw</span>;
  };

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Navigation */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <Link
            href="/dashboard/team"
            className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            ← Back to Dashboard
          </Link>
          
          {seasonId && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm">
              <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider">
                {wsConnected ? 'Live Updates' : 'Connecting...'}
              </span>
            </div>
          )}
        </div>

        {/* Header Title Section */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">FIXTURES</span>
            <h1 className="text-2xl font-mono font-bold text-slate-800 uppercase tracking-wide">Team Matches</h1>
            <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mt-1">
              View your team's match history, lineups, and upcoming fixtures
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column: Selector & Stats summary */}
          <div className="lg:col-span-1 space-y-6">
            {/* Tournament Selector */}
            {tournaments.length > 0 && (
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm">
                <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Select Tournament</label>
                <div className="relative">
                  <select
                    value={selectedTournamentId}
                    onChange={(e) => setSelectedTournamentId(e.target.value)}
                    className="w-full pl-8 py-2.5 pr-8 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-xs font-mono font-bold uppercase tracking-wider cursor-pointer appearance-none"
                  >
                    {tournaments.map((tournament) => (
                      <option key={tournament.id} value={tournament.id}>
                        {tournament.tournament_name}
                      </option>
                    ))}
                  </select>
                  <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                  <div className="absolute right-3 top-3.5 pointer-events-none text-slate-400">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {/* Statistics Summary Cards */}
            <div className="space-y-4">
              {/* Active */}
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex items-center justify-between font-mono">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Matches</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{activeMatches.length}</p>
                </div>
                <div className="p-3 bg-amber-50 text-amber-600 border border-amber-200 rounded-2xl">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>

              {/* Upcoming */}
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex items-center justify-between font-mono">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Upcoming Fixtures</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{upcomingMatches.length}</p>
                </div>
                <div className="p-3 bg-blue-50 text-blue-600 border border-blue-200 rounded-2xl">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>

              {/* Completed */}
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex items-center justify-between font-mono">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Completed Matches</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{completedMatches.length}</p>
                </div>
                <div className="p-3 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-2xl">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Matches Lists */}
          <div className="lg:col-span-3 space-y-6">
            {matches.length === 0 ? (
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center shadow-sm">
                <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-slate-800 text-lg font-mono font-bold uppercase tracking-wider mb-1">No matches found</p>
                <p className="text-slate-400 font-mono text-xs uppercase tracking-wider">Matches will appear here once fixtures are created by the admin</p>
              </div>
            ) : (
              <>
                {/* Active Matches */}
                {activeMatches.length > 0 && (
                  <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
                    <div className="px-6 py-4 bg-emerald-50/20 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-mono font-bold text-emerald-800 uppercase tracking-wider">Active Matches</h2>
                        <p className="text-[10px] font-mono font-bold text-emerald-600 uppercase tracking-wider mt-0.5">Matches currently in progress</p>
                      </div>
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeMatches.map(match => {
                          const getPhaseColor = () => {
                            switch (match.phase) {
                              case 'home_fixture': return 'bg-blue-50 text-blue-700 border-blue-200/60';
                              case 'fixture_entry': return 'bg-purple-50 text-purple-700 border-purple-200/60';
                              case 'result_entry': return 'bg-orange-50 text-orange-700 border-orange-200/60';
                              default: return 'bg-emerald-50 text-emerald-700 border-emerald-200/60';
                            }
                          };

                          const getNextDeadline = () => {
                            const now = getISTNow();
                            if (match.home_deadline && now < match.home_deadline) {
                              return { label: 'Home deadline', date: match.home_deadline };
                            } else if (match.away_deadline && now < match.away_deadline) {
                              return { label: 'Away deadline', date: match.away_deadline };
                            } else if (match.result_deadline && now < match.result_deadline) {
                              return { label: 'Result deadline', date: match.result_deadline };
                            }
                            return null;
                          };

                          const nextDeadline = getNextDeadline();

                          return (
                            <div key={match.id} className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 hover:border-amber-400/40 transition-all duration-200 font-mono">
                              <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Round {match.round_number} • Match {match.match_number}</span>
                                <span className={`px-2.5 py-0.5 text-[9px] font-bold rounded uppercase border ${getPhaseColor()}`}>
                                  {match.phase_label}
                                </span>
                              </div>
                              <div className="flex justify-between items-center mb-4">
                                <div className="text-center flex-1 min-w-0">
                                  <p className={`text-xs font-bold truncate uppercase ${match.home_team_id === teamId ? 'text-amber-600 font-extrabold' : 'text-slate-700'}`}>
                                    {match.home_team_name}
                                  </p>
                                </div>
                                <div className="px-3 text-slate-400 text-[10px] font-bold">VS</div>
                                <div className="text-center flex-1 min-w-0">
                                  <p className={`text-xs font-bold truncate uppercase ${match.away_team_id === teamId ? 'text-amber-600 font-extrabold' : 'text-slate-700'}`}>
                                    {match.away_team_name}
                                  </p>
                                </div>
                              </div>
                              {nextDeadline && (
                                <div className="mt-3 pt-3 border-t border-slate-100/60">
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-slate-400 font-bold uppercase tracking-wider">{nextDeadline.label}:</span>
                                    <span className="font-bold text-slate-705">
                                      {nextDeadline.date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} {nextDeadline.date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                                    </span>
                                  </div>
                                </div>
                              )}
                              {match.match_date && (
                                <div className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2.5">
                                  Match Date: {new Date(match.match_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                                </div>
                              )}
                              <div className="mt-4">
                                <Link
                                  href={`/dashboard/team/fixture/${match.id}`}
                                  className="w-full inline-flex items-center justify-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
                                >
                                  <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  Manage Fixtures
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Upcoming Matches */}
                {upcomingMatches.length > 0 && (
                  <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-slate-100">
                      <h2 className="text-sm font-mono font-bold text-slate-800 uppercase tracking-wider">Upcoming Matches</h2>
                      <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mt-0.5">Scheduled fixtures</p>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {upcomingMatches
                          .sort((a, b) => {
                            if (a.round_number !== b.round_number) {
                              return a.round_number - b.round_number;
                            }
                            return a.match_number - b.match_number;
                          })
                          .map(match => (
                            <div key={match.id} className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 hover:border-amber-400/40 transition-all duration-200 font-mono">
                              <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Round {match.round_number} • Match {match.match_number}</span>
                                <span className="px-2.5 py-0.5 text-[9px] font-bold rounded uppercase border bg-blue-50 text-blue-750 border-blue-200/60">
                                  Upcoming
                                </span>
                              </div>
                              <div className="flex justify-between items-center mb-4">
                                <div className="text-center flex-1 min-w-0">
                                  <p className={`text-xs font-bold truncate uppercase ${match.home_team_id === teamId ? 'text-amber-600 font-extrabold' : 'text-slate-700'}`}>
                                    {match.home_team_name}
                                  </p>
                                </div>
                                <div className="px-3 text-slate-400 text-[10px] font-bold">VS</div>
                                <div className="text-center flex-1 min-w-0">
                                  <p className={`text-xs font-bold truncate uppercase ${match.away_team_id === teamId ? 'text-amber-600 font-extrabold' : 'text-slate-700'}`}>
                                    {match.away_team_name}
                                  </p>
                                </div>
                              </div>
                              {match.match_date && (
                                <div className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-4">
                                  {new Date(match.match_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                                </div>
                              )}
                              <div>
                                <Link
                                  href={`/dashboard/team/fixture/${match.id}`}
                                  className="w-full inline-flex items-center justify-center px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/60 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all"
                                >
                                  <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  Prepare Draft Lineup
                                </Link>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Completed Matches */}
                {completedMatches.length > 0 && (
                  <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-slate-100">
                      <h2 className="text-sm font-mono font-bold text-slate-800 uppercase tracking-wider">Completed Matches</h2>
                      <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mt-0.5">Match results and history</p>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {completedMatches.map(match => (
                          <div key={match.id} className={`console-card rounded-2xl p-5 hover:border-amber-400/40 transition-all duration-200 font-mono ${getMatchResultClass(match)}`}>
                            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100/60">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Round {match.round_number} • Match {match.match_number}</span>
                              <span className="px-2.5 py-0.5 text-[9px] font-bold rounded uppercase border bg-slate-100 text-slate-500 border-slate-200/60">
                                Completed
                              </span>
                            </div>
                            <div className="flex justify-between items-center mb-4">
                              <div className="text-center flex-1 min-w-0">
                                  <p className={`text-xs font-bold truncate uppercase ${match.home_team_id === teamId ? 'text-amber-600 font-extrabold' : 'text-slate-700'}`}>
                                    {match.home_team_name}
                                  </p>
                                  <p className="text-xl font-bold text-slate-800 mt-1">{match.home_score ?? '-'}</p>
                                </div>
                                <div className="px-3 text-slate-400 text-[10px] font-bold">VS</div>
                                <div className="text-center flex-1 min-w-0">
                                  <p className={`text-xs font-bold truncate uppercase ${match.away_team_id === teamId ? 'text-amber-600 font-extrabold' : 'text-slate-700'}`}>
                                    {match.away_team_name}
                                  </p>
                                  <p className="text-xl font-bold text-slate-800 mt-1">{match.away_score ?? '-'}</p>
                                </div>
                            </div>
                            <div className="text-center mb-3">
                              {getResultText(match)}
                            </div>
                            {match.match_date && (
                              <div className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-4">
                                {new Date(match.match_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                              </div>
                            )}
                            {/* Show edit button if before result deadline */}
                            {match.result_deadline && getISTNow() < match.result_deadline ? (
                              <Link
                                href={`/dashboard/team/fixture/${match.id}`}
                                className="w-full inline-flex items-center justify-center px-4 py-2 text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all"
                              >
                                <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Edit Result
                              </Link>
                            ) : (
                              <Link
                                href={`/dashboard/team/fixture/${match.id}`}
                                className="w-full inline-flex items-center justify-center px-4 py-2 text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all"
                              >
                                <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                View Match
                              </Link>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
