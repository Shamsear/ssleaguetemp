'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getActiveSeason, getSeasonById } from '@/lib/firebase/seasons';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getFixturesByRoundsWithDeadlines,
  TournamentRound,
  startRound,
  pauseRound,
  resumeRound,
  completeRound,
  restartRound
} from '@/lib/firebase/fixtures';
import { getISTNow, parseISTDate, createISTDateTime, getISTToday } from '@/lib/utils/timezone';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import ConfirmModal from '@/components/modals/ConfirmModal';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Play,
  Pause,
  Check,
  RotateCcw,
  Edit2,
  Trophy,
  Activity,
  CheckCircle,
  AlertTriangle,
  Info,
  HelpCircle,
  ChevronRight
} from 'lucide-react';

export default function MatchDayManagementPage() {
  const { user, loading } = useAuth();
  const { userSeasonId } = usePermissions();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(null);
  const [seasonName, setSeasonName] = useState('');
  const [rounds, setRounds] = useState<TournamentRound[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Modal system
  const {
    alertState,
    showAlert,
    closeAlert,
    confirmState,
    showConfirm,
    closeConfirm,
    handleConfirm,
  } = useModal();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    loadRounds();
  }, [user]);

  // Live timer update - updates every second for active rounds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // Update every second

    return () => clearInterval(timer);
  }, []);

  const loadRounds = async () => {
    if (!user || user.role !== 'committee_admin') return;

    try {
      setIsLoading(true);

      // Get season - use committee admin's assigned season or active season
      let seasonId = userSeasonId;
      let season = null;

      if (seasonId) {
        season = await getSeasonById(seasonId);
      } else {
        // Fallback to active season for super admins
        season = await getActiveSeason();
        seasonId = season?.id || null;
      }

      if (season && seasonId) {
        setActiveSeasonId(seasonId);
        setSeasonName(season.name);

        // Load all tournaments for this season
        const tournamentsRes = await fetchWithTokenRefresh(`/api/tournaments?season_id=${seasonId}`);
        const tournamentsData = await tournamentsRes.json();

        if (!tournamentsData.success || !tournamentsData.tournaments || tournamentsData.tournaments.length === 0) {
          console.log('No tournaments found for season:', seasonId);
          setRounds([]);
          setTournaments([]);
          setIsLoading(false);
          return;
        }

        // Store tournaments
        setTournaments(tournamentsData.tournaments);

        // Auto-select first tournament if none selected
        if (!selectedTournamentId && tournamentsData.tournaments.length > 0) {
          setSelectedTournamentId(tournamentsData.tournaments[0].id);
        }

        // Load round_deadlines from all tournaments
        const allRounds: TournamentRound[] = [];
        for (const tournament of tournamentsData.tournaments) {
          // Fetch fixtures for this tournament
          const fixturesRes = await fetchWithTokenRefresh(`/api/tournaments/${tournament.id}/fixtures`);
          const fixturesData = await fixturesRes.json();

          if (fixturesData.success && fixturesData.fixtures && fixturesData.fixtures.length > 0) {
            // Group fixtures by round_number and leg
            const roundsMap = new Map();

            for (const fixture of fixturesData.fixtures) {
              const key = `${fixture.round_number}_${fixture.leg || 'first'}`;
              if (!roundsMap.has(key)) {
                roundsMap.set(key, {
                  round_number: fixture.round_number,
                  leg: fixture.leg || 'first',
                  tournament_id: tournament.id,
                  tournament_name: tournament.tournament_name,
                  total_matches: 0,
                  completed_matches: 0,
                  matches: [],
                  status: 'pending',
                  is_active: false,
                  scheduled_date: null,
                  home_fixture_deadline_time: '17:00',
                  away_fixture_deadline_time: '17:00',
                  result_entry_deadline_day_offset: 2,
                  result_entry_deadline_time: '00:30',
                });
              }

              const round = roundsMap.get(key);
              round.total_matches++;
              if (fixture.status === 'completed') round.completed_matches++;
              round.matches.push(fixture);
            }

            // Fetch round_deadlines for this tournament to get scheduled dates and settings
            try {
              const deadlinesRes = await fetchWithTokenRefresh(`/api/round-deadlines?tournament_id=${tournament.id}`);
              if (deadlinesRes.ok) {
                const deadlinesData = await deadlinesRes.json();
                if (deadlinesData.roundDeadlines) {
                  for (const deadline of deadlinesData.roundDeadlines) {
                    const key = `${deadline.round_number}_${deadline.leg || 'first'}`;
                    const round = roundsMap.get(key);
                    if (round) {
                      // Merge deadline data into round
                      round.scheduled_date = deadline.scheduled_date;
                      round.round_start_time = deadline.round_start_time;
                      round.home_fixture_deadline_time = deadline.home_fixture_deadline_time;
                      round.away_fixture_deadline_time = deadline.away_fixture_deadline_time;
                      round.result_entry_deadline_day_offset = deadline.result_entry_deadline_day_offset;
                      round.result_entry_deadline_time = deadline.result_entry_deadline_time;
                      round.status = deadline.status || 'pending';
                      // Set is_active based on status
                      round.is_active = deadline.status === 'active';
                    }
                  }
                }
              }
            } catch (error) {
              console.error('Error fetching round deadlines for tournament:', tournament.id, error);
            }

            allRounds.push(...Array.from(roundsMap.values()));
          }
        }

        // Sort rounds by round number and leg
        allRounds.sort((a, b) => {
          if (a.round_number !== b.round_number) return a.round_number - b.round_number;
          return a.leg === 'first' ? -1 : 1;
        });

        setRounds(allRounds);
        console.log('Loaded rounds from tournaments:', allRounds.length);
      }
    } catch (error) {
      console.error('Error loading rounds:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter rounds by selected tournament
  const filteredRounds = selectedTournamentId
    ? rounds.filter((r: any) => r.tournament_id === selectedTournamentId)
    : rounds;

  const completedRounds = filteredRounds.filter((r: any) => r.status === 'completed').length;
  const activeRound = filteredRounds.find((r: any) => r.is_active);

  const handleStartRound = async (roundNumber: number, leg: 'first' | 'second') => {
    if (!activeSeasonId) return;

    const roundId = `${roundNumber}_${leg}`;
    setActioningId(roundId);

    try {
      // Check if round has a scheduled date
      const round = filteredRounds.find(r => r.round_number === roundNumber && r.leg === leg);

      if (!round?.scheduled_date) {
        showAlert({
          type: 'warning',
          title: 'No Date Set',
          message: 'Please set a scheduled date before starting the round. Use "Edit Deadlines" to set the date.'
        });
        return;
      }

      // Start the round via API
      const response = await fetchWithTokenRefresh('/api/round-deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournament_id: round.tournament_id,
          season_id: activeSeasonId,
          round_number: roundNumber,
          leg,
          scheduled_date: round.scheduled_date,
          home_fixture_deadline_time: round.home_fixture_deadline_time,
          away_fixture_deadline_time: round.away_fixture_deadline_time,
          result_entry_deadline_day_offset: round.result_entry_deadline_day_offset,
          result_entry_deadline_time: round.result_entry_deadline_time,
          status: 'active',
        }),
      });

      if (response.ok) {
        await loadRounds();
        showAlert({
          type: 'success',
          title: 'Round Started',
          message: `Round ${roundNumber} has been started!`
        });
      } else {
        const error = await response.json();
        showAlert({
          type: 'error',
          title: 'Start Failed',
          message: error.error || 'Failed to start round'
        });
      }
    } catch (error: any) {
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to start round: ' + error.message
      });
    } finally {
      setActioningId(null);
    }
  };

  const handlePauseRound = async (roundNumber: number, leg: 'first' | 'second') => {
    if (!activeSeasonId) return;

    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Pause Round',
      message: `Pause Round ${roundNumber} (${leg})?`,
      confirmText: 'Pause',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    const roundId = `${roundNumber}_${leg}`;
    setActioningId(roundId);
    try {
      const round = filteredRounds.find(r => r.round_number === roundNumber && r.leg === leg);
      if (!round) return;

      const response = await fetchWithTokenRefresh('/api/round-deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournament_id: round.tournament_id,
          season_id: activeSeasonId,
          round_number: roundNumber,
          leg,
          scheduled_date: round.scheduled_date,
          home_fixture_deadline_time: round.home_fixture_deadline_time,
          away_fixture_deadline_time: round.away_fixture_deadline_time,
          result_entry_deadline_day_offset: round.result_entry_deadline_day_offset,
          result_entry_deadline_time: round.result_entry_deadline_time,
          status: 'paused',
        }),
      });

      if (response.ok) {
        await loadRounds();
      } else {
        const error = await response.json();
        showAlert({
          type: 'error',
          title: 'Pause Failed',
          message: error.error || 'Failed to pause round'
        });
      }
    } catch (error: any) {
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to pause round: ' + error.message
      });
    } finally {
      setActioningId(null);
    }
  };

  const handleResumeRound = async (roundNumber: number, leg: 'first' | 'second') => {
    if (!activeSeasonId) return;

    const roundId = `${roundNumber}_${leg}`;
    setActioningId(roundId);
    try {
      const round = filteredRounds.find(r => r.round_number === roundNumber && r.leg === leg);
      if (!round) return;

      const response = await fetchWithTokenRefresh('/api/round-deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournament_id: round.tournament_id,
          season_id: activeSeasonId,
          round_number: roundNumber,
          leg,
          scheduled_date: round.scheduled_date,
          home_fixture_deadline_time: round.home_fixture_deadline_time,
          away_fixture_deadline_time: round.away_fixture_deadline_time,
          result_entry_deadline_day_offset: round.result_entry_deadline_day_offset,
          result_entry_deadline_time: round.result_entry_deadline_time,
          status: 'active',
        }),
      });

      if (response.ok) {
        await loadRounds();
      } else {
        const error = await response.json();
        showAlert({
          type: 'error',
          title: 'Resume Failed',
          message: error.error || 'Failed to resume round'
        });
      }
    } catch (error: any) {
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to resume round: ' + error.message
      });
    } finally {
      setActioningId(null);
    }
  };

  const handleCompleteRound = async (roundNumber: number, leg: 'first' | 'second') => {
    if (!activeSeasonId) return;

    const confirmed = await showConfirm({
      type: 'danger',
      title: 'Complete Round',
      message: `Complete Round ${roundNumber} (${leg})? This action cannot be undone.`,
      confirmText: 'Complete',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    const roundId = `${roundNumber}_${leg}`;
    setActioningId(roundId);
    try {
      const round = filteredRounds.find(r => r.round_number === roundNumber && r.leg === leg);
      if (!round) return;

      const response = await fetchWithTokenRefresh('/api/round-deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournament_id: round.tournament_id,
          season_id: activeSeasonId,
          round_number: roundNumber,
          leg,
          scheduled_date: round.scheduled_date,
          home_fixture_deadline_time: round.home_fixture_deadline_time,
          away_fixture_deadline_time: round.away_fixture_deadline_time,
          result_entry_deadline_day_offset: round.result_entry_deadline_day_offset,
          result_entry_deadline_time: round.result_entry_deadline_time,
          status: 'completed',
        }),
      });

      if (response.ok) {
        await loadRounds();
      } else {
        const error = await response.json();
        showAlert({
          type: 'error',
          title: 'Complete Failed',
          message: error.error || 'Failed to complete round'
        });
      }
    } catch (error: any) {
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to complete round: ' + error.message
      });
    } finally {
      setActioningId(null);
    }
  };

  const handleRestartRound = async (roundNumber: number, leg: 'first' | 'second') => {
    if (!activeSeasonId) return;

    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Restart Round',
      message: `Restart Round ${roundNumber} (${leg})? The round start time will be updated to current IST time.`,
      confirmText: 'Restart',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    const roundId = `${roundNumber}_${leg}`;
    setActioningId(roundId);
    try {
      const round = filteredRounds.find(r => r.round_number === roundNumber && r.leg === leg);
      if (!round) return;

      // Calculate current IST time (UTC + 5:30)
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istTime = new Date(now.getTime() + istOffset);
      const hours = istTime.getUTCHours().toString().padStart(2, '0');
      const minutes = istTime.getUTCMinutes().toString().padStart(2, '0');
      const currentISTTime = `${hours}:${minutes}`;

      const response = await fetchWithTokenRefresh('/api/round-deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournament_id: round.tournament_id,
          season_id: activeSeasonId,
          round_number: roundNumber,
          leg,
          scheduled_date: round.scheduled_date,
          round_start_time: currentISTTime, // Set to current IST time on restart
          home_fixture_deadline_time: round.home_fixture_deadline_time,
          away_fixture_deadline_time: round.away_fixture_deadline_time,
          result_entry_deadline_day_offset: round.result_entry_deadline_day_offset,
          result_entry_deadline_time: round.result_entry_deadline_time,
          status: 'active',
        }),
      });

      if (response.ok) {
        await loadRounds();
        showAlert({
          type: 'success',
          title: 'Round Restarted',
          message: `Round ${roundNumber} (${leg}) restarted at ${currentISTTime} IST`
        });
      } else {
        const error = await response.json();
        showAlert({
          type: 'error',
          title: 'Restart Failed',
          message: error.error || 'Failed to restart round'
        });
      }
    } catch (error: any) {
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to restart round: ' + error.message
      });
    } finally {
      setActioningId(null);
    }
  };
  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading rounds...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'committee_admin') {
    return null;
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Navigation & Header Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link
            href="/dashboard/committee/team-management/tournament"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Tournaments
          </Link>
        </div>

        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
                <Calendar className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">SYSTEM CONTROL</span>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                  Match Round Dashboard
                </h1>
                <p className="text-xs text-slate-550 font-mono mt-1">
                  {seasonName || 'Active Season'} — Configure and control match round phases and deadlines
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold text-slate-700">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>
                IST: {currentTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'medium' })}
              </span>
            </div>
          </div>

          {/* Tournament Selector inside Header Card */}
          {tournaments.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-t border-slate-100 pt-6">
              <label className="text-xs font-black uppercase text-slate-700 tracking-wider flex-shrink-0">Select Tournament:</label>
              <select
                value={selectedTournamentId}
                onChange={(e) => setSelectedTournamentId(e.target.value)}
                className="px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all cursor-pointer"
              >
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.tournament_name} ({tournament.status})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Tournament Status Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Rounds</span>
                <div className="text-2xl md:text-3xl font-black text-slate-900 mt-1">{filteredRounds.length}</div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Active Round</span>
                <div className="text-lg md:text-xl font-black text-emerald-600 mt-1 truncate">
                  {activeRound ? `${activeRound.round_number} (${activeRound.leg === 'first' ? '1st' : '2nd'} Leg)` : 'None'}
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <Activity className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Completed</span>
                <div className="text-2xl md:text-3xl font-black text-blue-600 mt-1">{completedRounds}</div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <CheckCircle className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] text-purple-600 font-bold uppercase tracking-wider">Total Fixtures</span>
                <div className="text-2xl md:text-3xl font-black text-purple-600 mt-1">
                  {filteredRounds.reduce((sum, r) => sum + r.total_matches, 0)}
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                <Trophy className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>

        {/* Match Rounds Table / Mobile Cards */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <div className="border-b border-slate-100 pb-4 mb-6 flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight uppercase">Match Rounds</h2>
          </div>
          <div className="p-0">
            {filteredRounds.length > 0 ? (
              <>
                {/* Desktop Table - Hidden on mobile */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-slate-50/50">
                      <tr>
                        <th className="px-4 py-3.5 text-left text-[10px] font-black text-slate-550 uppercase tracking-wider">Round</th>
                        <th className="px-4 py-3.5 text-left text-[10px] font-black text-slate-550 uppercase tracking-wider">Leg</th>
                        <th className="px-4 py-3.5 text-left text-[10px] font-black text-slate-550 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3.5 text-left text-[10px] font-black text-slate-550 uppercase tracking-wider">Current Phase</th>
                        <th className="px-4 py-3.5 text-left text-[10px] font-black text-slate-550 uppercase tracking-wider">Deadlines</th>
                        <th className="px-4 py-3.5 text-left text-[10px] font-black text-slate-550 uppercase tracking-wider">Fixtures</th>
                        <th className="px-4 py-3.5 text-left text-[10px] font-black text-slate-550 uppercase tracking-wider">Progress</th>
                        <th className="px-4 py-3.5 text-left text-[10px] font-black text-slate-550 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredRounds.map((round: any) => {
                        const progressPercentage = round.total_matches > 0 ? Math.round((round.completed_matches / round.total_matches) * 100) : 0;
                        const status = round.status || 'pending';
                        const isActive = round.is_active || false;
                        const roundId = `${round.round_number}_${round.leg}`;

                        // Calculate current phase
                        const calculatePhase = () => {
                          if (status !== 'active') {
                            return { phase: 'N/A', phaseLabel: 'Not Started', color: 'bg-slate-50 border border-slate-200/60 text-slate-600' };
                          }

                          if (!round.scheduled_date) {
                            return {
                              phase: 'awaiting_schedule',
                              phaseLabel: 'Set Schedule Date',
                              color: 'bg-amber-50 border border-amber-200/50 text-amber-700',
                              remaining: 'Required'
                            };
                          }

                          // Get current time in IST
                          const now = getISTNow();

                          // Extract date string from scheduled_date
                          const scheduledDateStr = typeof round.scheduled_date === 'string' && round.scheduled_date.includes('T')
                            ? round.scheduled_date.split('T')[0]
                            : round.scheduled_date;

                          // Parse deadlines using IST utilities
                          const homeDeadline = createISTDateTime(
                            scheduledDateStr,
                            round.home_fixture_deadline_time || '23:30'
                          );

                          const awayDeadline = createISTDateTime(
                            scheduledDateStr,
                            round.away_fixture_deadline_time || '23:45'
                          );

                          // Result deadline calculation - add days to the scheduled date
                          const [year, month, day] = scheduledDateStr.split('-').map(Number);
                          const offsetDays = round.result_entry_deadline_day_offset || 2;

                          const scheduledDate = new Date(Date.UTC(year, month - 1, day));
                          const resultDateObj = new Date(scheduledDate.getTime() + offsetDays * 24 * 60 * 60 * 1000);

                          const resultYear = resultDateObj.getUTCFullYear();
                          const resultMonth = String(resultDateObj.getUTCMonth() + 1).padStart(2, '0');
                          const resultDay = String(resultDateObj.getUTCDate()).padStart(2, '0');
                          const resultDateStr = `${resultYear}-${resultMonth}-${resultDay}`;
                          const resultDeadline = createISTDateTime(
                            resultDateStr,
                            round.result_entry_deadline_time || '00:30'
                          );

                          if (now < homeDeadline) {
                            const nowTime = now.getTime();
                            const deadlineTime = homeDeadline.getTime();
                            const remainingMs = deadlineTime - nowTime;
                            const totalSeconds = Math.floor(remainingMs / 1000);
                            const hours = Math.floor(totalSeconds / 3600);
                            const minutes = Math.floor((totalSeconds % 3600) / 60);
                            const seconds = totalSeconds % 60;
                            const remainingDisplay = hours > 0
                              ? `${hours}h ${minutes}m ${seconds}s left`
                              : minutes > 0
                                ? `${minutes}m ${seconds}s left`
                                : `${seconds}s left`;
                            return {
                              phase: 'home_fixture',
                              phaseLabel: 'Home Fixture Setup',
                              color: 'bg-blue-50 border border-blue-200/50 text-blue-700',
                              deadline: homeDeadline,
                              remaining: remainingDisplay
                            };
                          } else if (now < awayDeadline) {
                            const nowTime = now.getTime();
                            const deadlineTime = awayDeadline.getTime();
                            const remainingMs = deadlineTime - nowTime;
                            const totalSeconds = Math.floor(remainingMs / 1000);
                            const hours = Math.floor(totalSeconds / 3600);
                            const minutes = Math.floor((totalSeconds % 3600) / 60);
                            const seconds = totalSeconds % 60;
                            const remainingDisplay = hours > 0
                              ? `${hours}h ${minutes}m ${seconds}s left`
                              : minutes > 0
                                ? `${minutes}m ${seconds}s left`
                                : `${seconds}s left`;
                            return {
                              phase: 'fixture_entry',
                              phaseLabel: 'Fixture Entry',
                              color: 'bg-purple-50 border border-purple-200/50 text-purple-700',
                              deadline: awayDeadline,
                              remaining: remainingDisplay
                            };
                          } else if (now < resultDeadline) {
                            const remainingMs = resultDeadline.getTime() - now.getTime();
                            const totalSeconds = Math.floor(remainingMs / 1000);
                            const hours = Math.floor(totalSeconds / 3600);
                            const minutes = Math.floor((totalSeconds % 3600) / 60);
                            const seconds = totalSeconds % 60;
                            const remainingDisplay = hours > 0
                              ? `${hours}h ${minutes}m ${seconds}s left`
                              : minutes > 0
                                ? `${minutes}m ${seconds}s left`
                                : `${seconds}s left`;
                            return {
                              phase: 'result_entry',
                              phaseLabel: 'Result Entry',
                              color: 'bg-orange-50 border border-orange-200/50 text-orange-700',
                              deadline: resultDeadline,
                              remaining: remainingDisplay
                            };
                          } else {
                            const timeSinceDeadline = now.getTime() - resultDeadline.getTime();
                            const hoursPassed = Math.floor(timeSinceDeadline / (1000 * 60 * 60));
                            const daysPassed = Math.floor(hoursPassed / 24);
                            let expiredMsg = 'Expired';
                            if (daysPassed > 0) {
                              expiredMsg = `Expired ${daysPassed}d ago`;
                            } else if (hoursPassed > 0) {
                              expiredMsg = `Expired ${hoursPassed}h ago`;
                            } else {
                              expiredMsg = 'Just expired';
                            }
                            return {
                              phase: 'closed',
                              phaseLabel: 'Result Entry Closed',
                              color: 'bg-rose-50 border border-rose-200/50 text-rose-700',
                              deadline: null,
                              remaining: expiredMsg
                            };
                          }
                        };

                        const phaseInfo = calculatePhase();

                        return (
                          <tr
                            key={`${round.tournament_id}-${round.round_number}-${round.leg}`}
                            className={`${isActive
                              ? 'bg-emerald-50/30 hover:bg-emerald-50/50'
                              : status === 'completed'
                                ? 'bg-blue-50/20 hover:bg-blue-50/40'
                                : status === 'paused'
                                  ? 'bg-amber-50/30 hover:bg-amber-50/50'
                                  : 'hover:bg-slate-50/60'
                              } transition-colors duration-200 border-b border-slate-100`}
                          >
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">Round {round.round_number}</span>
                                {isActive && (
                                  <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-md uppercase tracking-wider">ACTIVE</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-slate-100 border border-slate-200 text-slate-700 uppercase">
                                {round.leg === 'first' ? '1st Leg' : '2nd Leg'}
                              </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span
                                className={`px-2.5 py-0.5 text-xs font-bold rounded-md border uppercase tracking-wider ${status === 'pending'
                                  ? 'bg-slate-50 border-slate-200 text-slate-600'
                                  : status === 'active'
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    : status === 'paused'
                                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                                      : 'bg-blue-50 border-blue-200 text-blue-700'
                                  }`}
                              >
                                {status}
                              </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="space-y-1.5">
                                <span className={`px-2 py-0.5 text-xs font-bold rounded-md uppercase tracking-wider ${phaseInfo.color}`}>
                                  {phaseInfo.phaseLabel}
                                </span>
                                {phaseInfo.remaining && status === 'active' && (
                                  <div className="text-[10px] text-slate-500 font-bold font-mono">
                                    {phaseInfo.remaining}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="text-[10px] font-bold text-slate-600 space-y-1">
                                {round.round_start_time && (
                                  <div className="text-purple-700 font-extrabold flex items-center gap-1">
                                    <span className="uppercase text-[9px] px-1 bg-purple-50 border border-purple-200/50 rounded">START:</span> {round.round_start_time}
                                  </div>
                                )}
                                <div className="flex items-center gap-1">
                                  <span className="uppercase text-[9px] px-1 bg-slate-50 border border-slate-200 rounded text-slate-500">HOME:</span> {round.home_fixture_deadline_time || '23:30'}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="uppercase text-[9px] px-1 bg-slate-50 border border-slate-200 rounded text-slate-500">AWAY:</span> {round.away_fixture_deadline_time || '23:45'}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="uppercase text-[9px] px-1 bg-slate-50 border border-slate-200 rounded text-slate-500">RESULT:</span> {(() => {
                                    if (!round.scheduled_date) return 'Not scheduled';
                                    const offsetDays = round.result_entry_deadline_day_offset || 2;
                                    const scheduledDate = new Date(round.scheduled_date);
                                    const resultDate = new Date(scheduledDate.getTime() + offsetDays * 24 * 60 * 60 * 1000);
                                    const dateStr = resultDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
                                    return `${dateStr} ${round.result_entry_deadline_time || '00:30'}`;
                                  })()}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-xs font-bold text-slate-900 font-mono">{round.total_matches}</td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2.5 min-w-[100px]">
                                <div className="w-16 bg-slate-100 border border-slate-200/60 rounded-full h-2 overflow-hidden flex-shrink-0">
                                  <div
                                    className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${progressPercentage}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-bold text-slate-600 w-8 text-right font-mono">
                                  {progressPercentage}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {/* Start Button */}
                                {status === 'pending' && (
                                  <button
                                    onClick={() => handleStartRound(round.round_number, round.leg)}
                                    disabled={actioningId === roundId}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase rounded-md transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                                    title="Start Round"
                                  >
                                    <Play className="w-3 h-3 fill-current" />
                                    <span>Start</span>
                                  </button>
                                )}

                                {/* Pause Button */}
                                {status === 'active' && (
                                  <button
                                    onClick={() => handlePauseRound(round.round_number, round.leg)}
                                    disabled={actioningId === roundId}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold uppercase rounded-md transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                                    title="Pause Round"
                                  >
                                    <Pause className="w-3 h-3 fill-current" />
                                    <span>Pause</span>
                                  </button>
                                )}

                                {/* Resume Button */}
                                {status === 'paused' && (
                                  <button
                                    onClick={() => handleResumeRound(round.round_number, round.leg)}
                                    disabled={actioningId === roundId}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-bold uppercase rounded-md transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                                    title="Resume Round"
                                  >
                                    <Play className="w-3 h-3 fill-current" />
                                    <span>Resume</span>
                                  </button>
                                )}

                                {/* Complete Button */}
                                {status === 'active' && (
                                  <button
                                    onClick={() => handleCompleteRound(round.round_number, round.leg)}
                                    disabled={actioningId === roundId}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase rounded-md transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                                    title="Complete Round"
                                  >
                                    <Check className="w-3 h-3 stroke-[3]" />
                                    <span>Complete</span>
                                  </button>
                                )}

                                {/* Restart Button */}
                                {(status === 'completed' || status === 'paused') && (
                                  <button
                                    onClick={() => handleRestartRound(round.round_number, round.leg)}
                                    disabled={actioningId === roundId}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold uppercase rounded-md transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                                    title="Restart Round"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Restart</span>
                                  </button>
                                )}

                                {/* Edit Deadlines Button */}
                                <Link
                                  href={`/dashboard/committee/team-management/match-days/edit?tournament=${round.tournament_id}&season=${activeSeasonId}&round=${round.round_number}&leg=${round.leg}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold uppercase rounded-md transition-all shadow-sm"
                                  title="Edit Deadlines"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>Edit</span>
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card Layout - Shown only on mobile */}
                <div className="md:hidden space-y-4">
                  {filteredRounds.map((round: any) => {
                    const progressPercentage = round.total_matches > 0 ? Math.round((round.completed_matches / round.total_matches) * 100) : 0;
                    const status = round.status || 'pending';
                    const isActive = round.is_active || false;
                    const roundId = `${round.round_number}_${round.leg}`;

                    const calculatePhase = () => {
                      if (status !== 'active') {
                        return { phase: 'N/A', phaseLabel: 'Not Started', color: 'bg-slate-50 border border-slate-200/60 text-slate-600' };
                      }

                      if (!round.scheduled_date) {
                        return {
                          phase: 'awaiting_schedule',
                          phaseLabel: 'Set Schedule Date',
                          color: 'bg-amber-50 border border-amber-200/50 text-amber-700',
                          remaining: 'Required'
                        };
                      }

                      const now = getISTNow();
                      const scheduledDateStr = typeof round.scheduled_date === 'string' && round.scheduled_date.includes('T')
                        ? round.scheduled_date.split('T')[0]
                        : round.scheduled_date;

                      const homeDeadline = createISTDateTime(
                        scheduledDateStr,
                        round.home_fixture_deadline_time || '23:30'
                      );

                      const awayDeadline = createISTDateTime(
                        scheduledDateStr,
                        round.away_fixture_deadline_time || '23:45'
                      );

                      const [year, month, day] = scheduledDateStr.split('-').map(Number);
                      const offsetDays = round.result_entry_deadline_day_offset || 2;

                      const scheduledDate = new Date(Date.UTC(year, month - 1, day));
                      const resultDateObj = new Date(scheduledDate.getTime() + offsetDays * 24 * 60 * 60 * 1000);

                      const resultYear = resultDateObj.getUTCFullYear();
                      const resultMonth = String(resultDateObj.getUTCMonth() + 1).padStart(2, '0');
                      const resultDay = String(resultDateObj.getUTCDate()).padStart(2, '0');
                      const resultDateStr = `${resultYear}-${resultMonth}-${resultDay}`;
                      const resultDeadline = createISTDateTime(
                        resultDateStr,
                        round.result_entry_deadline_time || '00:30'
                      );

                      if (now < homeDeadline) {
                        const remainingMs = homeDeadline.getTime() - now.getTime();
                        const totalSeconds = Math.floor(remainingMs / 1000);
                        const hours = Math.floor(totalSeconds / 3600);
                        const minutes = Math.floor((totalSeconds % 3600) / 60);
                        const seconds = totalSeconds % 60;
                        const remainingDisplay = hours > 0
                          ? `${hours}h ${minutes}m ${seconds}s left`
                          : minutes > 0
                            ? `${minutes}m ${seconds}s left`
                            : `${seconds}s left`;
                        return {
                          phase: 'home_fixture',
                          phaseLabel: 'Home Fixture Setup',
                          color: 'bg-blue-50 border border-blue-200/50 text-blue-700',
                          deadline: homeDeadline,
                          remaining: remainingDisplay
                        };
                      } else if (now < awayDeadline) {
                        const remainingMs = awayDeadline.getTime() - now.getTime();
                        const totalSeconds = Math.floor(remainingMs / 1000);
                        const hours = Math.floor(totalSeconds / 3600);
                        const minutes = Math.floor((totalSeconds % 3600) / 60);
                        const seconds = totalSeconds % 60;
                        const remainingDisplay = hours > 0
                          ? `${hours}h ${minutes}m ${seconds}s left`
                          : minutes > 0
                            ? `${minutes}m ${seconds}s left`
                            : `${seconds}s left`;
                        return {
                          phase: 'fixture_entry',
                          phaseLabel: 'Fixture Entry',
                          color: 'bg-purple-50 border border-purple-200/50 text-purple-700',
                          deadline: awayDeadline,
                          remaining: remainingDisplay
                        };
                      } else if (now < resultDeadline) {
                        const remainingMs = resultDeadline.getTime() - now.getTime();
                        const totalSeconds = Math.floor(remainingMs / 1000);
                        const hours = Math.floor(totalSeconds / 3600);
                        const minutes = Math.floor((totalSeconds % 3600) / 60);
                        const seconds = totalSeconds % 60;
                        const remainingDisplay = hours > 0
                          ? `${hours}h ${minutes}m ${seconds}s left`
                          : minutes > 0
                            ? `${minutes}m ${seconds}s left`
                            : `${seconds}s left`;
                        return {
                          phase: 'result_entry',
                          phaseLabel: 'Result Entry',
                          color: 'bg-orange-50 border border-orange-200/50 text-orange-700',
                          deadline: resultDeadline,
                          remaining: remainingDisplay
                        };
                      } else {
                        const timeSinceDeadline = now.getTime() - resultDeadline.getTime();
                        const hoursPassed = Math.floor(timeSinceDeadline / (1000 * 60 * 60));
                        const daysPassed = Math.floor(hoursPassed / 24);
                        let expiredMsg = 'Expired';
                        if (daysPassed > 0) {
                          expiredMsg = `Expired ${daysPassed}d ago`;
                        } else if (hoursPassed > 0) {
                          expiredMsg = `Expired ${hoursPassed}h ago`;
                        } else {
                          expiredMsg = 'Just expired';
                        }
                        return {
                          phase: 'closed',
                          phaseLabel: 'Result Entry Closed',
                          color: 'bg-rose-50 border border-rose-200/50 text-rose-700',
                          deadline: null,
                          remaining: expiredMsg
                        };
                      }
                    };

                    const phaseInfo = calculatePhase();

                    return (
                      <div
                        key={`${round.tournament_id}-${round.round_number}-${round.leg}`}
                        className={`console-card border rounded-3xl p-5 shadow-sm space-y-4 ${isActive
                          ? 'bg-emerald-50/10 border-emerald-200'
                          : status === 'completed'
                            ? 'bg-blue-50/10 border-blue-200'
                            : status === 'paused'
                              ? 'bg-amber-50/10 border-amber-250'
                              : 'bg-white border-slate-200/60'
                          }`}
                      >
                        {/* Round Header */}
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-extrabold text-slate-900 text-base">Round {round.round_number}</h3>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              {round.leg === 'first' ? '1st Leg' : '2nd Leg'}
                            </span>
                          </div>
                          {isActive && (
                            <span className="px-2 py-0.5 text-[9px] font-extrabold bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-md uppercase tracking-wider">ACTIVE</span>
                          )}
                        </div>

                        {/* Status & Phase */}
                        <div className="grid grid-cols-2 gap-4 border-t border-b border-slate-100 py-3">
                          <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Status</p>
                            <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded-md border uppercase tracking-wider ${status === 'pending'
                              ? 'bg-slate-50 border-slate-200 text-slate-600'
                              : status === 'active'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : status === 'paused'
                                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                                  : 'bg-blue-50 border-blue-200 text-blue-700'
                              }`}>
                              {status}
                            </span>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Current Phase</p>
                            <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded-md uppercase tracking-wider ${phaseInfo.color}`}>
                              {phaseInfo.phaseLabel}
                            </span>
                            {phaseInfo.remaining && status === 'active' && (
                              <p className="text-[10px] font-bold text-slate-500 mt-1">{phaseInfo.remaining}</p>
                            )}
                          </div>
                        </div>

                        {/* Deadlines */}
                        <div className="bg-slate-50/50 border border-slate-200/40 rounded-xl p-3">
                          <p className="text-[9px] font-black text-slate-700 uppercase tracking-wider mb-1.5">Deadlines</p>
                          <div className="text-[10px] font-bold text-slate-600 space-y-1">
                            {round.round_start_time && (
                              <div className="text-purple-700 font-extrabold flex items-center gap-1">
                                <span className="uppercase text-[9px] px-1 bg-purple-50 border border-purple-200/50 rounded">START:</span> {round.round_start_time}
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <span className="uppercase text-[9px] px-1 bg-slate-100 border border-slate-200 rounded text-slate-500">HOME:</span> {round.home_fixture_deadline_time || '23:30'}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="uppercase text-[9px] px-1 bg-slate-100 border border-slate-200 rounded text-slate-500">AWAY:</span> {round.away_fixture_deadline_time || '23:45'}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="uppercase text-[9px] px-1 bg-slate-100 border border-slate-200 rounded text-slate-500">RESULT:</span> {(() => {
                                if (!round.scheduled_date) return 'Not scheduled';
                                const offsetDays = round.result_entry_deadline_day_offset || 2;
                                const scheduledDate = new Date(round.scheduled_date);
                                const resultDate = new Date(scheduledDate.getTime() + offsetDays * 24 * 60 * 60 * 1000);
                                const dateStr = resultDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
                                return `${dateStr} ${round.result_entry_deadline_time || '00:30'}`;
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* Fixtures & Progress */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                            <span>Fixtures: {round.total_matches}</span>
                            <span>{progressPercentage}% Complete</span>
                          </div>
                          <div className="w-full bg-slate-100 border border-slate-200/60 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${progressPercentage}%` }}
                            />
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-2 pt-2">
                          {status === 'pending' && (
                            <button
                              onClick={() => handleStartRound(round.round_number, round.leg)}
                              disabled={actioningId === roundId}
                              className="flex-1 min-w-[45%] inline-flex items-center justify-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              Start
                            </button>
                          )}

                          {status === 'active' && (
                            <>
                              <button
                                onClick={() => handlePauseRound(round.round_number, round.leg)}
                                disabled={actioningId === roundId}
                                className="flex-1 min-w-[45%] inline-flex items-center justify-center gap-1 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold uppercase rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                              >
                                <Pause className="w-3.5 h-3.5 fill-current" />
                                Pause
                              </button>
                              <button
                                onClick={() => handleCompleteRound(round.round_number, round.leg)}
                                disabled={actioningId === roundId}
                                className="flex-1 min-w-[45%] inline-flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                Complete
                              </button>
                            </>
                          )}

                          {status === 'paused' && (
                            <>
                              <button
                                onClick={() => handleResumeRound(round.round_number, round.leg)}
                                disabled={actioningId === roundId}
                                className="flex-1 min-w-[45%] inline-flex items-center justify-center gap-1 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold uppercase rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                                Resume
                              </button>
                              <button
                                onClick={() => handleRestartRound(round.round_number, round.leg)}
                                disabled={actioningId === roundId}
                                className="flex-1 min-w-[45%] inline-flex items-center justify-center gap-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold uppercase rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Restart
                              </button>
                            </>
                          )}

                          {(status === 'completed') && (
                            <button
                              onClick={() => handleRestartRound(round.round_number, round.leg)}
                              disabled={actioningId === roundId}
                              className="flex-1 min-w-[45%] inline-flex items-center justify-center gap-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold uppercase rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Restart
                            </button>
                          )}

                          <Link
                            href={`/dashboard/committee/team-management/match-days/edit?tournament=${round.tournament_id}&season=${activeSeasonId}&round=${round.round_number}&leg=${round.leg}`}
                            className="flex-1 min-w-[45%] inline-flex items-center justify-center gap-1 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold uppercase rounded-xl transition-all shadow-sm"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit Deadlines
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-center py-12 space-y-4">
                <div className="w-16 h-16 mx-auto bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
                  <Calendar className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase">No Match Rounds Created</h3>
                  <p className="text-xs text-slate-550 mt-1">Create match rounds by generating fixtures in the tournament dashboard.</p>
                </div>
                <Link
                  href="/dashboard/committee/team-management/tournament"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer rounded-xl"
                >
                  <Trophy className="w-4 h-4 text-amber-400" />
                  Go to Tournament Dashboard
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* System Information */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <div className="border-b border-slate-100 pb-4 mb-6">
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight uppercase flex items-center gap-2">
              <Info className="w-5 h-5 text-amber-500" />
              How Match Rounds Work
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="flex items-center text-xs font-black text-slate-700 uppercase tracking-wider gap-2">
                <Clock className="w-4 h-4 text-slate-550" />
                Deadline Configuration
              </h4>
              <ul className="space-y-3.5 text-xs text-slate-600 font-mono">
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 font-extrabold">•</span>
                  <div>
                    <strong className="text-slate-900">Default Deadlines:</strong> Set in Tournament Settings and apply to all rounds
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 font-extrabold">•</span>
                  <div>
                    <strong className="text-slate-900">Round Overrides:</strong> Customize deadlines for specific rounds using the Edit button
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 font-extrabold">•</span>
                  <div>
                    <strong className="text-slate-900">Home Deadline:</strong> Daily time limit for home teams to create fixtures
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 font-extrabold">•</span>
                  <div>
                    <strong className="text-slate-900">Away Deadline:</strong> Daily time limit for away teams to modify fixtures
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 font-extrabold">•</span>
                  <div>
                    <strong className="text-slate-900">Result Entry:</strong> Number of days after fixture date for result submission
                  </div>
                </li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="flex items-center text-xs font-black text-slate-700 uppercase tracking-wider gap-2">
                <Activity className="w-4 h-4 text-slate-550" />
                Match Phases
              </h4>
              <ul className="space-y-3 text-xs text-slate-600 font-mono">
                <li className="flex items-start gap-3">
                  <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-blue-50 border border-blue-200 text-blue-700 mt-0.5 uppercase">Phase 1</span>
                  <div>
                    <strong className="text-slate-900">Home Fixture Setup:</strong> Home team creates matchups (realplayer vs realplayer)
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-purple-50 border border-purple-200 text-purple-700 mt-0.5 uppercase">Phase 2</span>
                  <div>
                    <strong className="text-slate-900">Fixture Entry:</strong> Both teams can work on fixtures after home deadline
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-orange-50 border border-orange-200 text-orange-700 mt-0.5 uppercase">Phase 3</span>
                  <div>
                    <strong className="text-slate-900">Result Entry:</strong> Teams enter/edit results for each matchup
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-rose-50 border border-rose-200 text-rose-700 mt-0.5 uppercase">Phase 4</span>
                  <div>
                    <strong className="text-slate-900">Closed:</strong> Match is finalized after result deadline expires
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Components */}
      <AlertModal
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        onConfirm={handleConfirm}
        onCancel={closeConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        type={confirmState.type}
      />
    </div>
  );
}
