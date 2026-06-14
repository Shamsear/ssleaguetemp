'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import {
  ArrowLeft,
  Settings,
  Info,
  Calendar,
  Clock,
  MessageSquare,
  Globe,
  Users,
  Trophy,
  Award,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  BarChart2,
  Lock,
  Plus
} from 'lucide-react';

type PollType = 'POTD' | 'POTW' | 'TOD' | 'TOW';

interface Poll {
  id: string;
  poll_id: string;
  poll_type: string;
  question_en: string;
  options: any[];
  total_votes: number;
  status: string;
  closes_at?: string;
  created_at: string;
  metadata?: any;
}

export default function PollsManagementPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { isCommitteeAdmin, userSeasonId } = usePermissions();

  const [activeTab, setActiveTab] = useState<PollType>('POTD');
  const [currentRound, setCurrentRound] = useState(1);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [maxRounds, setMaxRounds] = useState(14);

  const [polls, setPolls] = useState<Poll[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading_data, setLoadingData] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tournamentId, setTournamentId] = useState<string>('');
  const [availableTournaments, setAvailableTournaments] = useState<Array<{ id: string, name: string }>>([]);
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [newDeadline, setNewDeadline] = useState('');
  const [expandedOption, setExpandedOption] = useState<string | null>(null);
  const [voters, setVoters] = useState<Record<string, any[]>>({});
  const [loadingVoters, setLoadingVoters] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && !isCommitteeAdmin) {
      router.push('/dashboard');
    }
  }, [user, loading, router, isCommitteeAdmin]);

  // Fetch available tournaments
  useEffect(() => {
    const fetchTournaments = async () => {
      if (!userSeasonId) return;

      try {
        const response = await fetchWithTokenRefresh(`/api/tournaments?season_id=${userSeasonId}`);
        const result = await response.json();

        if (result.success && result.tournaments && result.tournaments.length > 0) {
          const tournaments = result.tournaments.map((t: any) => ({
            id: t.id,
            name: t.tournament_name || t.id
          }));
          setAvailableTournaments(tournaments);
          setTournamentId(tournaments[0].id);
        }
      } catch (err) {
        console.error('Error fetching tournaments:', err);
      }
    };

    fetchTournaments();
  }, [userSeasonId]);

  // Fetch max rounds
  useEffect(() => {
    const fetchMaxRounds = async () => {
      if (!tournamentId) return;

      try {
        const response = await fetchWithTokenRefresh(`/api/fixtures/season?tournament_id=${tournamentId}`);
        const result = await response.json();

        if (result.fixtures && result.fixtures.length > 0) {
          const maxRound = Math.max(...result.fixtures.map((f: any) => f.round_number || 0));
          setMaxRounds(maxRound);
        }
      } catch (err) {
        console.error('Error fetching rounds:', err);
      }
    };

    fetchMaxRounds();
  }, [tournamentId]);

  useEffect(() => {
    setCurrentWeek(Math.ceil(currentRound / 7));
  }, [currentRound]);

  // Load polls and candidates
  useEffect(() => {
    if (!userSeasonId || !tournamentId) return;
    loadData();
  }, [activeTab, currentRound, currentWeek, userSeasonId, tournamentId]);

  const loadData = async () => {
    if (!userSeasonId) return;

    setLoadingData(true);
    setError(null);

    try {
      // Load existing polls
      const pollParams = new URLSearchParams({
        season_id: userSeasonId,
        poll_type: `award_${activeTab.toLowerCase()}`,
      });

      if (['POTD', 'TOD'].includes(activeTab)) {
        pollParams.append('round_number', currentRound.toString());
      } else if (['POTW', 'TOW'].includes(activeTab)) {
        pollParams.append('week_number', currentWeek.toString());
      }

      console.log('🔍 Fetching polls with params:', pollParams.toString());
      const pollsRes = await fetchWithTokenRefresh(`/api/polls?${pollParams}`);
      const pollsData = await pollsRes.json();
      console.log('<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Polls response:', pollsData);
      setPolls(pollsData.success && pollsData.data ? pollsData.data : []);


      // Load eligible candidates (same as awards but skip award check for fan polls)
      const candidateParams = new URLSearchParams({
        tournament_id: tournamentId,
        season_id: userSeasonId,
        award_type: activeTab,
        skip_award_check: 'true', // Allow candidates even if admin award was given
      });

      if (['POTD', 'TOD'].includes(activeTab)) {
        candidateParams.append('round_number', currentRound.toString());
      } else if (['POTW', 'TOW'].includes(activeTab)) {
        candidateParams.append('week_number', currentWeek.toString());
      }

      console.log('Fetching candidates:', candidateParams.toString());
      const candidatesRes = await fetchWithTokenRefresh(`/api/awards/eligible?${candidateParams}`);
      const candidatesData = await candidatesRes.json();

      console.log('Candidates response:', candidatesData);

      if (candidatesData.success) {
        setCandidates(candidatesData.data || []);

        // Show specific message if no candidates
        if (!candidatesData.data || candidatesData.data.length === 0) {
          if (candidatesData.message) {
            setError(candidatesData.message);
          } else {
            const period = ['POTD', 'TOD'].includes(activeTab) ? `Round ${currentRound}` : `Week ${currentWeek}`;
            setError(`No completed fixtures found for ${period}. Fixtures must be completed before candidates can be nominated.`);
          }
        }
      } else {
        setError(candidatesData.error || 'Failed to load candidates');
      }

    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load polls data');
    } finally {
      setLoadingData(false);
    }
  };

  const handleCreatePoll = async () => {
    if (!userSeasonId || !user || candidates.length === 0) return;

    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const pollType = `award_${activeTab.toLowerCase()}`;
      const isPlayer = ['POTD', 'POTW'].includes(activeTab);

      // English questions
      const questionEn = isPlayer
        ? `Who should win ${activeTab === 'POTD' ? 'Player of the Day' : 'Player of the Week'}?`
        : `Which team should win ${activeTab === 'TOD' ? 'Team of the Day' : 'Team of the Week'}?`;

      // Malayalam questions
      const questionMl = isPlayer
        ? `${activeTab === 'POTD' ? 'ദിവസത്തെ മികച്ച കളിക്കാരൻ' : 'ആഴ്ചയിലെ മികച്ച കളിക്കാരൻ'} ആരായിരിക്കണം?`
        : `${activeTab === 'TOD' ? 'ദിവസത്തെ മികച്ച ടീം' : 'ആഴ്ചയിലെ മികച്ച ടീം'} ഏതായിരിക്കണം?`;

      const options = candidates.map((candidate, idx) => ({
        id: `option_${idx + 1}`,
        text_en: candidate.player_name || candidate.team_name,
        text_ml: candidate.player_name || candidate.team_name, // Use same name for Malayalam
        player_id: candidate.player_id || null,
        team_id: candidate.team_id || null,
      }));

      const metadata: any = {
        tournament_id: tournamentId,
        award_type: activeTab,
      };

      if (['POTD', 'TOD'].includes(activeTab)) {
        metadata.round_number = currentRound;
      } else {
        metadata.week_number = currentWeek;
      }

      const payload = {
        season_id: userSeasonId,
        poll_type: pollType,
        question_en: questionEn,
        question_ml: questionMl,
        options,
        closes_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        metadata,
      };

      const response = await fetchWithTokenRefresh('/api/polls/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('Poll created successfully!');
        setCandidates([]); // Clear candidates immediately

        // Small delay to ensure database has committed the transaction
        setTimeout(() => {
          loadData();
        }, 500);
      } else {
        setError(result.error || 'Failed to create poll');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create poll');
    } finally {
      setCreating(false);
    }
  };

  const handleClosePoll = async (pollId: string) => {
    if (!confirm('Are you sure you want to close this poll?')) return;

    try {
      const response = await fetchWithTokenRefresh('/api/polls/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poll_id: pollId }),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('Poll closed successfully');
        loadData();
      } else {
        setError(result.error || 'Failed to close poll');
      }
    } catch (err: any) {
      setError('Failed to close poll');
    }
  };

  const handleUpdateDeadline = async (pollId: string) => {
    if (!newDeadline) {
      setError('Please select a new deadline');
      return;
    }

    try {
      // The datetime-local input gives us a string in format "YYYY-MM-DDTHH:mm"
      // We need to treat this as IST and convert to UTC for database
      const [datePart, timePart] = newDeadline.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      
      // Create date in IST (manually construct to avoid timezone issues)
      const istDate = new Date(year, month - 1, day, hours, minutes, 0);
      
      // Convert IST to UTC by subtracting 5:30 hours
      const utcDate = new Date(istDate.getTime() - (5.5 * 60 * 60 * 1000));
      const utcString = utcDate.toISOString();

      console.log('Input:', newDeadline, 'IST Date:', istDate, 'UTC:', utcString);

      const response = await fetchWithTokenRefresh(`/api/polls/${pollId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closes_at: utcString }),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('Poll deadline updated successfully');
        setEditingDeadline(false);
        setNewDeadline('');
        loadData();
      } else {
        setError(result.error || 'Failed to update deadline');
      }
    } catch (err: any) {
      setError('Failed to update deadline');
    }
  };

  const startEditingDeadline = (currentDeadline: string) => {
    // Convert UTC from database to IST for display
    const utcDate = new Date(currentDeadline);
    
    // Get IST time by adding 5:30 hours
    const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
    
    // Format for datetime-local input (YYYY-MM-DDTHH:mm)
    const year = istDate.getFullYear();
    const month = String(istDate.getMonth() + 1).padStart(2, '0');
    const day = String(istDate.getDate()).padStart(2, '0');
    const hours = String(istDate.getHours()).padStart(2, '0');
    const minutes = String(istDate.getMinutes()).padStart(2, '0');
    
    const localDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
    
    console.log('UTC:', currentDeadline, 'IST for input:', localDateTime);
    
    setNewDeadline(localDateTime);
    setEditingDeadline(true);
  };

  const toggleOptionExpansion = async (optionId: string, pollId: string) => {
    if (expandedOption === optionId) {
      setExpandedOption(null);
      return;
    }

    setExpandedOption(optionId);

    // Load voters if not already loaded
    if (!voters[optionId]) {
      setLoadingVoters(true);
      try {
        const response = await fetchWithTokenRefresh(`/api/polls/${pollId}/voters?option_id=${optionId}`);
        const result = await response.json();

        if (result.success) {
          setVoters(prev => ({
            ...prev,
            [optionId]: result.voters || []
          }));
        }
      } catch (err) {
        console.error('Error loading voters:', err);
      } finally {
        setLoadingVoters(false);
      }
    }
  };

  if (loading || !user || !isCommitteeAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono font-mono">Loading polls console...</p>
        </div>
      </div>
    );
  }

  const currentPoll = polls.length > 0 ? polls[0] : null;
  const maxWeeks = Math.ceil(maxRounds / 7);

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <BarChart2 className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">SYSTEM CONTROL</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Polls Management
              </h1>
              <p className="text-xs text-slate-500 font-mono mt-1">
                Create and manage voting polls for awards
              </p>
            </div>
          </div>
        </div>

        {/* Tournament Selector */}
        {availableTournaments.length > 0 && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
              Select Tournament
            </label>
            <select
              value={tournamentId}
              onChange={(e) => setTournamentId(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all duration-200"
            >
              {availableTournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournament.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Messages */}
        {error && (
          <div className="console-card bg-rose-50 border border-rose-200 rounded-3xl p-5 shadow-sm flex items-center gap-3 text-rose-800">
            <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
            <p className="text-xs font-bold uppercase tracking-wide">{error}</p>
          </div>
        )}

        {success && (
          <div className="console-card bg-emerald-50/30 border border-emerald-200 rounded-3xl p-5 shadow-sm flex items-center gap-3 text-emerald-800">
            <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <p className="text-xs font-bold uppercase tracking-wide">{success}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { id: 'POTD' as PollType, label: 'POTD', icon: Award },
            { id: 'POTW' as PollType, label: 'POTW', icon: Trophy },
            { id: 'TOD' as PollType, label: 'TOD', icon: Award },
            { id: 'TOW' as PollType, label: 'TOW', icon: Trophy },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border font-mono text-xs uppercase tracking-wider font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-slate-800 border-slate-900 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Round/Week Navigator */}
          {['POTD', 'TOD'].includes(activeTab) && (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                Select Round
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentRound(Math.max(1, currentRound - 1))}
                  disabled={currentRound === 1}
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed font-bold transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex-1 overflow-x-auto scrollbar-none py-1">
                  <div className="flex gap-2">
                    {Array.from({ length: maxRounds }, (_, i) => i + 1).map((round) => (
                      <button
                        key={round}
                        onClick={() => setCurrentRound(round)}
                        className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all ${
                          currentRound === round
                            ? 'bg-slate-800 border-slate-900 text-white shadow-sm'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                        }`}
                      >
                        Round {round}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setCurrentRound(Math.min(maxRounds, currentRound + 1))}
                  disabled={currentRound === maxRounds}
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed font-bold transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {['POTW', 'TOW'].includes(activeTab) && (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                Select Week
              </label>
              <div className="flex gap-2 flex-wrap">
                {Array.from({ length: maxWeeks }, (_, i) => i + 1).map((week) => (
                  <button
                    key={week}
                    onClick={() => setCurrentWeek(week)}
                    className={`px-6 py-2 rounded-xl font-mono text-xs font-bold transition-all ${
                      currentWeek === week
                        ? 'bg-slate-800 border-slate-900 text-white shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                  >
                    Week {week}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Current Poll Display */}
          {currentPoll && (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-5">
                <div className="flex-1 space-y-1">
                  <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">
                    ACTIVE POLL • {currentPoll.poll_type.replace('award_', '').toUpperCase()}
                  </span>
                  <h2 className="text-lg font-extrabold text-slate-900 leading-tight">
                    {currentPoll.question_en}
                  </h2>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>Total Votes: <strong className="text-slate-800 font-bold">{currentPoll.total_votes}</strong></span>
                    <span>•</span>
                    <span>Status: <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-md text-[10px] uppercase font-bold">{currentPoll.status}</span></span>
                  </div>
                  {currentPoll.closes_at && (
                    <p className="text-[11px] text-slate-500 font-bold flex items-center gap-1 mt-1">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <span>Closes: {new Date(currentPoll.closes_at).toLocaleString('en-IN', { 
                        timeZone: 'Asia/Kolkata',
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })} IST</span>
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap w-full md:w-auto">
                  {currentPoll.status === 'active' && !editingDeadline && (
                    <>
                      <button
                        onClick={() => startEditingDeadline(currentPoll.closes_at || '')}
                        className="flex-1 md:flex-initial px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl font-mono text-xs uppercase font-extrabold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Calendar className="w-3.5 h-3.5" /> Edit Deadline
                      </button>
                      <button
                        onClick={() => handleClosePoll(currentPoll.poll_id)}
                        className="flex-1 md:flex-initial px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-mono text-xs uppercase font-extrabold shadow-sm transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Lock className="w-3.5 h-3.5" /> Close Poll
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Deadline Editor */}
              {editingDeadline && (
                <div className="console-card bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    Edit Poll Deadline (IST)
                  </h4>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="datetime-local"
                      value={newDeadline}
                      onChange={(e) => setNewDeadline(e.target.value)}
                      className="flex-1 px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateDeadline(currentPoll.poll_id)}
                        className="flex-1 sm:flex-initial px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-mono text-xs uppercase font-extrabold shadow-sm transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingDeadline(false);
                          setNewDeadline('');
                        }}
                        className="flex-1 sm:flex-initial px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-mono text-xs uppercase font-extrabold transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Poll Options Results */}
              <div className="space-y-3">
                {[...currentPoll.options]
                  .sort((a: any, b: any) => (b.votes || 0) - (a.votes || 0))
                  .map((option: any, index: number) => {
                    const percentage = currentPoll.total_votes > 0
                      ? ((option.votes || 0) / currentPoll.total_votes * 100).toFixed(1)
                      : '0.0';
                    const isExpanded = expandedOption === option.id;
                    const optionVoters = voters[option.id] || [];

                    // Badges for ranks
                    let rankEmoji = null;
                    if (index === 0 && option.votes > 0) rankEmoji = '<Trophy className="w-4 h-4 inline-block text-amber-500 fill-amber-500 mr-1 align-text-bottom" />';
                    else if (index === 1 && option.votes > 0) rankEmoji = '<Trophy className="w-4 h-4 inline-block text-slate-400 fill-slate-400 mr-1 align-text-bottom" />';
                    else if (index === 2 && option.votes > 0) rankEmoji = '<Trophy className="w-4 h-4 inline-block text-amber-700 fill-amber-700 mr-1 align-text-bottom" />';

                    return (
                      <div key={option.id} className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-sm transition-all duration-300">
                        <div 
                          className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() => toggleOptionExpansion(option.id, currentPoll.poll_id)}
                        >
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                              {rankEmoji && (
                                <span className="text-base flex-shrink-0">{rankEmoji}</span>
                              )}
                              <span className="font-extrabold text-sm text-slate-800">{option.text_en}</span>
                              {option.votes > 0 && (
                                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider ml-1 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                                  {isExpanded ? 'Hide Voters' : 'View Voters'}
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-mono font-bold text-slate-600">
                              {option.votes || 0} votes ({percentage}%)
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div
                              className="bg-amber-500 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>

                        {/* Expanded Voters List */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-3 border-t border-slate-100 bg-slate-50/50 space-y-2">
                            <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider mb-2">
                              Verified Voters
                            </div>
                            {loadingVoters ? (
                              <div className="py-4 text-center">
                                <div className="animate-spin rounded-full h-5.5 w-5.5 border-b-2 border-slate-800 mx-auto"></div>
                              </div>
                            ) : optionVoters.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                                {optionVoters.map((voter: any, idx: number) => (
                                  <div 
                                    key={idx} 
                                    className="flex items-center justify-between p-2.5 bg-white border border-slate-100 rounded-xl shadow-sm"
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-xs font-bold text-slate-800 truncate">
                                        {voter.voter_name}
                                      </span>
                                      {voter.is_flagged && (
                                        <span className="flex-shrink-0 text-[8px] bg-red-50 text-red-600 border border-red-100 px-1 rounded uppercase font-black tracking-wide">
                                          Flagged
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[9px] text-slate-400 font-bold whitespace-nowrap">
                                      {new Date(voter.voted_at).toLocaleString('en-IN', {
                                        timeZone: 'Asia/Kolkata',
                                        dateStyle: 'short',
                                        timeStyle: 'short'
                                      })}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="py-3 text-center text-xs text-slate-550 font-mono font-extrabold uppercase tracking-wider">
                                No votes cast yet
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Nominees / Create Poll Section */}
          {!currentPoll && (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
              {loading_data ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto"></div>
                  <p className="mt-3 text-xs text-slate-550 font-mono font-extrabold uppercase tracking-wider">Loading nominees...</p>
                </div>
              ) : candidates.length > 0 ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-2">
                      <Plus className="w-5 h-5 text-amber-500" /> Create Award Poll
                    </h3>
                    <p className="text-xs text-slate-500 font-mono mt-1">
                      No active poll exists for this selection. Nominate the candidates below to initialize voting.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                    <Info className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {candidates.length} candidate(s) are eligible based on completed match statistics.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                    {candidates.map((candidate, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60 flex flex-col justify-between"
                      >
                        <p className="font-extrabold text-sm text-slate-800">
                          {candidate.player_name || candidate.team_name}
                        </p>
                        {candidate.result && (
                          <p className="text-[10px] text-slate-500 font-mono mt-1 font-bold">{candidate.result}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleCreatePoll}
                    disabled={creating}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-900 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {creating ? (
                      <>
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                        <span>Initializing Poll...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5 text-amber-400" />
                        <span>Create & Launch Poll</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-4">
                    <Info className="w-6 h-6 text-slate-400" />
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">
                    No Nominees Available
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    No eligible candidates found for {['POTD', 'TOD'].includes(activeTab) ? `Round ${currentRound}` : `Week ${currentWeek}`}.
                  </p>
                  {error && (
                    <p className="text-[10px] text-rose-500 font-mono font-bold mt-2 uppercase">{error}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
