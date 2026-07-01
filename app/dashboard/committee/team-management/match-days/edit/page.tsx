'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { getActiveSeason } from '@/lib/firebase/seasons';
import { getRoundDeadlines, updateRoundDeadlines } from '@/lib/firebase/fixtures';
import { getISTToday, parseISTDate, createISTDateTime, formatISTDateTime } from '@/lib/utils/timezone';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import {
  ArrowLeft,
  Calendar,
  Clock,
  AlertTriangle,
  Info,
  Save,
  Check
} from 'lucide-react';

function EditRoundDeadlinesContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const tournamentId = searchParams.get('tournament');
  const seasonId = searchParams.get('season');
  const roundNumber = parseInt(searchParams.get('round') || '0');
  const leg = (searchParams.get('leg') || 'first') as 'first' | 'second';

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [seasonName, setSeasonName] = useState('');
  
  const [homeTime, setHomeTime] = useState('17:00');
  const [awayTime, setAwayTime] = useState('17:00');
  const [resultDayOffset, setResultDayOffset] = useState(1);
  const [resultTime, setResultTime] = useState('00:30');
  const [scheduledDate, setScheduledDate] = useState('');

  // Modal system
  const {
    alertState,
    showAlert,
    closeAlert,
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
    loadDeadlines();
  }, [tournamentId, roundNumber, leg]);

  const loadDeadlines = async () => {
    if (!roundNumber) return;

    try {
      setIsLoading(true);

      const activeSeason = await getActiveSeason();
      if (activeSeason) {
        setSeasonName(activeSeason.name);
      }

      // If tournament_id is not provided, fetch it from season
      let tournamentIdToUse = tournamentId;
      if (!tournamentIdToUse && seasonId) {
        console.log('No tournament_id provided, fetching from season:', seasonId);
        const tournamentsRes = await fetchWithTokenRefresh(`/api/tournaments?season_id=${seasonId}`);
        const tournamentsData = await tournamentsRes.json();
        
        if (tournamentsData.success && tournamentsData.tournaments && tournamentsData.tournaments.length > 0) {
          // Use the first/primary tournament for this season
          tournamentIdToUse = tournamentsData.tournaments[0].id;
          console.log('Using tournament:', tournamentIdToUse);
        } else {
          console.error('No tournaments found for season:', seasonId);
          return;
        }
      }

      if (!tournamentIdToUse) {
        console.error('No tournament_id available');
        return;
      }

      // Fetch round deadlines from tournament API
      const response = await fetchWithTokenRefresh(`/api/round-deadlines?tournament_id=${tournamentIdToUse}&round_number=${roundNumber}&leg=${leg}`);
      if (!response.ok) {
        console.error('Failed to fetch round deadlines');
        return;
      }
      
      const { roundDeadline } = await response.json();
      const deadlines = roundDeadline;
      console.log('Loaded deadlines:', deadlines);
      if (deadlines) {
        setHomeTime(deadlines.home_fixture_deadline_time || '17:00');
        setAwayTime(deadlines.away_fixture_deadline_time || '17:00');
        setResultDayOffset(deadlines.result_entry_deadline_day_offset || 2);
        setResultTime(deadlines.result_entry_deadline_time || '00:30');
        
        // Extract date part if scheduled_date is a timestamp
        let dateValue = deadlines.scheduled_date || '';
        if (dateValue && dateValue.includes('T')) {
          dateValue = dateValue.split('T')[0]; // Extract YYYY-MM-DD
        }
        setScheduledDate(dateValue);
        
        console.log('Set values:', {
          homeTime: deadlines.home_fixture_deadline_time,
          awayTime: deadlines.away_fixture_deadline_time,
          resultTime: deadlines.result_entry_deadline_time,
          scheduled_date: dateValue
        });
      }
    } catch (error) {
      console.error('Error loading deadlines:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const deadlineData: any = {
        home_fixture_deadline_time: homeTime,
        away_fixture_deadline_time: awayTime,
        result_entry_deadline_day_offset: resultDayOffset,
        result_entry_deadline_time: resultTime,
      };

      // Only include scheduled_date if it has a value
      if (scheduledDate) {
        deadlineData.scheduled_date = scheduledDate;
      }

      // If tournament_id is not provided, fetch it from season
      let tournamentIdToUse = tournamentId;
      if (!tournamentIdToUse && seasonId) {
        const tournamentsRes = await fetchWithTokenRefresh(`/api/tournaments?season_id=${seasonId}`);
        const tournamentsData = await tournamentsRes.json();
        
        if (tournamentsData.success && tournamentsData.tournaments && tournamentsData.tournaments.length > 0) {
          tournamentIdToUse = tournamentsData.tournaments[0].id;
        }
      }
      
      if (!tournamentIdToUse) {
        showAlert({
          type: 'error',
          title: 'Error',
          message: 'No tournament found for this season'
        });
        return;
      }
      
      // Update round deadlines via tournament API
      const response = await fetchWithTokenRefresh('/api/round-deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournament_id: tournamentIdToUse,
          season_id: seasonId,
          round_number: roundNumber,
          leg,
          ...deadlineData,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        showAlert({
          type: 'error',
          title: 'Update Failed',
          message: error.error || 'Failed to update deadlines'
        });
        return;
      }
      
      const result = await response.json();
      
      // Success - redirect after showing message
      showAlert({
        type: 'success',
        title: 'Deadlines Updated',
        message: 'Deadlines updated successfully!'
      });
      setTimeout(() => {
        router.push('/dashboard/committee/team-management/match-days');
      }, 1500);
    } catch (error) {
      console.error('Error updating deadlines:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to update deadlines'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getExampleDay = () => {
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return dayNames[(resultDayOffset) % 7];
  };

  // Calculate actual deadlines based on scheduled date
  const calculatedDeadlines = useMemo(() => {
    if (!scheduledDate) {
      return null;
    }

    try {
      const baseDate = parseISTDate(scheduledDate);
      
      // Home fixture deadline
      const homeDeadline = createISTDateTime(scheduledDate, homeTime);
      
      // Away fixture deadline
      const awayDeadline = createISTDateTime(scheduledDate, awayTime);
      
      // Result entry deadline (base date + offset days)
      const resultDate = new Date(baseDate);
      resultDate.setDate(resultDate.getDate() + resultDayOffset);
      const resultDeadline = createISTDateTime(
        `${resultDate.getFullYear()}-${String(resultDate.getMonth() + 1).padStart(2, '0')}-${String(resultDate.getDate()).padStart(2, '0')}`,
        resultTime
      );

      return {
        home: homeDeadline,
        away: awayDeadline,
        result: resultDeadline,
        scheduledDateFormatted: baseDate.toLocaleDateString('en-IN', { 
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'Asia/Kolkata'
        }),
      };
    } catch (error) {
      console.error('Error calculating deadlines:', error);
      return null;
    }
  }, [scheduledDate, homeTime, awayTime, resultTime, resultDayOffset]);

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading...</p>
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

      <div className="max-w-4xl mx-auto relative z-10 space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link
            href="/dashboard/committee/team-management/match-days"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Clock className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">DEADLINE OVERRIDE</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Edit Match Round Deadlines
              </h1>
              <p className="text-xs text-slate-550 font-mono mt-1">
                Round {roundNumber} ({leg === 'first' ? '1st' : '2nd'} Leg) — {seasonName || 'Active Season'}
              </p>
            </div>
          </div>
        </div>

        {/* Edit Form Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <div className="border-b border-slate-100 pb-4 mb-6">
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight uppercase">Deadline Configuration</h2>
          </div>
          <div className="p-0">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="home_deadline_time" className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-500" />
                    Home Fixture Deadline Time
                  </label>
                  <input
                    type="time"
                    id="home_deadline_time"
                    value={homeTime}
                    onChange={(e) => setHomeTime(e.target.value)}
                    className="block w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">Daily time when home teams can no longer create fixtures</p>
                </div>

                <div>
                  <label htmlFor="away_deadline_time" className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-cyan-500" />
                    Away Fixture Deadline Time
                  </label>
                  <input
                    type="time"
                    id="away_deadline_time"
                    value={awayTime}
                    onChange={(e) => setAwayTime(e.target.value)}
                    className="block w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">Daily time when away teams can no longer modify fixtures</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="result_deadline_day_offset" className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-emerald-500" />
                    Result Entry Day Offset
                  </label>
                  <select
                    id="result_deadline_day_offset"
                    value={resultDayOffset}
                    onChange={(e) => setResultDayOffset(parseInt(e.target.value))}
                    className="block w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all cursor-pointer"
                    required
                  >
                    <option value="0">Same day (Day 0)</option>
                    <option value="1">Next day (Day 1)</option>
                    <option value="2">Day after tomorrow (Day 2)</option>
                    <option value="3">3 days later (Day 3)</option>
                    <option value="4">4 days later (Day 4)</option>
                    <option value="7">1 week later (Day 7)</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">How many days after match day results are due</p>
                </div>

                <div>
                  <label htmlFor="result_deadline_time" className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-500" />
                    Result Entry Deadline Time
                  </label>
                  <input
                    type="time"
                    id="result_deadline_time"
                    value={resultTime}
                    onChange={(e) => setResultTime(e.target.value)}
                    className="block w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">Time when results are due on the deadline day (IST)</p>
                </div>
              </div>

              <div>
                <label htmlFor="scheduled_date" className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-amber-500" />
                  Scheduled Date
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    id="scheduled_date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="block flex-1 px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setScheduledDate(getISTToday())}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase rounded-xl transition-all cursor-pointer whitespace-nowrap border border-slate-900"
                  >
                    Today
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 font-mono">When this round is planned to be played (used for deadline calculations in IST)</p>
              </div>

              {/* Deadline Preview */}
              <div className="mt-8 p-5 bg-slate-50 border border-slate-200/60 rounded-3xl space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200/60 pb-3">
                  <Info className="w-5 h-5 text-blue-500" />
                  <h3 className="text-xs font-extrabold uppercase text-slate-800 tracking-wider">Deadline Preview</h3>
                </div>

                {calculatedDeadlines ? (
                  <div className="space-y-4 font-mono">
                    <div className="text-xs text-slate-650">
                      <div className="mb-1 uppercase font-black tracking-wider text-[10px] text-slate-500">Scheduled Match Day:</div>
                      <div className="pl-3 text-slate-900 font-extrabold text-sm border-l-2 border-amber-500">{calculatedDeadlines.scheduledDateFormatted}</div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-white border border-slate-200/60 p-3 rounded-2xl space-y-1 shadow-sm">
                        <div className="text-[9px] font-black uppercase text-blue-700 tracking-wider mb-1 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                          Home Deadline
                        </div>
                        <div className="text-xs font-black text-slate-900">
                          {calculatedDeadlines.home.toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'Asia/Kolkata'
                          })}
                          {' @ '}
                          {calculatedDeadlines.home.toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                            timeZone: 'Asia/Kolkata'
                          })}
                        </div>
                        <div className="text-[8px] text-slate-500 leading-tight mt-1">Home teams must create fixtures before this time</div>
                      </div>

                      <div className="bg-white border border-slate-200/60 p-3 rounded-2xl space-y-1 shadow-sm">
                        <div className="text-[9px] font-black uppercase text-cyan-700 tracking-wider mb-1 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
                          Away Deadline
                        </div>
                        <div className="text-xs font-black text-slate-900">
                          {calculatedDeadlines.away.toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'Asia/Kolkata'
                          })}
                          {' @ '}
                          {calculatedDeadlines.away.toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                            timeZone: 'Asia/Kolkata'
                          })}
                        </div>
                        <div className="text-[8px] text-slate-500 leading-tight mt-1">Away teams can modify fixtures until this time</div>
                      </div>

                      <div className="bg-white border border-slate-200/60 p-3 rounded-2xl space-y-1 shadow-sm">
                        <div className="text-[9px] font-black uppercase text-emerald-700 tracking-wider mb-1 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Result Deadline
                        </div>
                        <div className="text-xs font-black text-slate-900">
                          {calculatedDeadlines.result.toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'Asia/Kolkata'
                          })}
                          {' @ '}
                          {calculatedDeadlines.result.toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                            timeZone: 'Asia/Kolkata'
                          })}
                        </div>
                        <div className="text-[8px] text-slate-500 leading-tight mt-1">
                          Results due {resultDayOffset} {resultDayOffset === 1 ? 'day' : 'days'} after match day
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-655 space-y-3 font-mono">
                    <div className="flex items-center gap-3 p-3 bg-amber-50/50 border border-amber-200/50 rounded-2xl">
                      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                      <div>
                        <div className="font-extrabold text-amber-800">Set Scheduled Date</div>
                        <div className="text-[10px] text-amber-600 mt-0.5">Please set a scheduled date above to see calculated deadline times</div>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 space-y-1 pl-3 border-l-2 border-slate-200">
                      <div><strong>Current Configuration:</strong></div>
                      <div>• Home fixture deadline: <strong>{homeTime}</strong> on match day</div>
                      <div>• Away fixture deadline: <strong>{awayTime}</strong> on match day</div>
                      <div>• Result deadline: <strong>{resultTime}</strong>, {resultDayOffset} {resultDayOffset === 1 ? 'day' : 'days'} after match day</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-slate-100 pt-6">
                <Link
                  href="/dashboard/committee/team-management/match-days"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase rounded-xl transition-all shadow-sm cursor-pointer border border-slate-200"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Update Deadlines</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Modal Component */}
      <AlertModal
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />
    </div>
  );
}

export default function EditRoundDeadlinesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
            <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading deadline editor...</p>
          </div>
        </div>
      }
    >
      <EditRoundDeadlinesContent />
    </Suspense>
  );
}
