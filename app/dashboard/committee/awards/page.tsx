'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import {
  Trophy,
  Settings,
  ArrowLeft,
  Info,
  Calendar,
  Clock,
  Lock,
  Plus,
  Crown,
  Award,
  ChevronLeft,
  ChevronRight,
  Trash2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

type AwardTab = 'POTD' | 'POTW' | 'TOD' | 'TOW' | 'POTS' | 'TOTS';

interface Award {
  id: string;
  award_type: string;
  player_id?: string;
  player_name?: string;
  team_id?: string;
  team_name?: string;
  round_number?: number;
  week_number?: number;
  performance_stats: any;
  selected_by_name?: string;
  selected_at?: string;
}

interface Candidate {
  player_id?: string;
  player_name?: string;
  team_id?: string;
  team_name?: string;
  performance_stats: any;
  fixture_id?: string;
  result?: string;
}

export default function AwardsManagementPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { isCommitteeAdmin, userSeasonId } = usePermissions();

  const [activeTab, setActiveTab] = useState<AwardTab>('POTD');
  const [currentRound, setCurrentRound] = useState(1);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [maxRounds, setMaxRounds] = useState(0);

  const [awards, setAwards] = useState<Award[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);

  const [loading_data, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tournamentId, setTournamentId] = useState<string>('');
  const [availableTournaments, setAvailableTournaments] = useState<Array<{ id: string, name: string }>>([]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && !isCommitteeAdmin) {
      router.push('/dashboard');
    }
  }, [user, loading, router, isCommitteeAdmin]);

  // Fetch available tournaments for the season
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

          // Set first tournament as default
          setTournamentId(tournaments[0].id);
          console.log(`<Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Available tournaments:`, tournaments);
        }
      } catch (err) {
        console.error('Error fetching tournaments:', err);
      }
    };

    fetchTournaments();
  }, [userSeasonId]);

  // Fetch max rounds when tournament changes
  useEffect(() => {
    const fetchMaxRounds = async () => {
      if (!tournamentId) return;

      try {
        const response = await fetchWithTokenRefresh(`/api/fixtures/season?tournament_id=${tournamentId}`);
        const result = await response.json();

        if (result.fixtures && result.fixtures.length > 0) {
          const maxRound = Math.max(...result.fixtures.map((f: any) => f.round_number || 0));
          setMaxRounds(maxRound);
          console.log(`🎮 Found ${maxRound} rounds in tournament ${tournamentId}`);
        } else {
          setMaxRounds(14);
        }
      } catch (err) {
        console.error('Error fetching rounds:', err);
        setMaxRounds(14);
      }
    };

    fetchMaxRounds();
  }, [tournamentId]);

  // Calculate current week from round
  useEffect(() => {
    setCurrentWeek(Math.ceil(currentRound / 7));
  }, [currentRound]);

  // Load awards and candidates when tab/round/week changes
  useEffect(() => {
    if (!userSeasonId || !tournamentId) return;
    loadData();
  }, [activeTab, currentRound, currentWeek, userSeasonId, tournamentId]);

  const loadData = async () => {
    if (!userSeasonId) return;

    setLoadingData(true);
    setError(null);

    try {
      // Load existing award for current context
      const awardParams = new URLSearchParams({
        tournament_id: tournamentId,
        season_id: userSeasonId,
        award_type: activeTab,
      });

      if (['POTD', 'TOD'].includes(activeTab)) {
        awardParams.append('round_number', currentRound.toString());
      } else if (['POTW', 'TOW'].includes(activeTab)) {
        awardParams.append('week_number', currentWeek.toString());
      }

      const awardsRes = await fetchWithTokenRefresh(`/api/awards?${awardParams}`);
      const awardsData = await awardsRes.json();
      setAwards(awardsData.success ? awardsData.data : []);

      // Load eligible candidates
      const candidateParams = new URLSearchParams({
        tournament_id: tournamentId,
        season_id: userSeasonId,
        award_type: activeTab,
      });

      if (['POTD', 'TOD'].includes(activeTab)) {
        candidateParams.append('round_number', currentRound.toString());
      } else if (['POTW', 'TOW'].includes(activeTab)) {
        candidateParams.append('week_number', currentWeek.toString());
      }

      const candidatesRes = await fetchWithTokenRefresh(`/api/awards/eligible?${candidateParams}`);
      const candidatesData = await candidatesRes.json();
      setCandidates(candidatesData.success ? candidatesData.data : []);

    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load awards data');
    } finally {
      setLoadingData(false);
    }
  };

  const handleSelectAward = async () => {
    if (!selectedCandidate || !userSeasonId || !user) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const candidate = candidates.find(c =>
        (c.player_id === selectedCandidate) || (c.team_id === selectedCandidate)
      );

      if (!candidate) throw new Error('Candidate not found');

      const payload = {
        award_type: activeTab,
        tournament_id: tournamentId,
        season_id: userSeasonId,
        round_number: ['POTD', 'TOD'].includes(activeTab) ? currentRound : null,
        week_number: ['POTW', 'TOW'].includes(activeTab) ? currentWeek : null,
        player_id: candidate.player_id || null,
        player_name: candidate.player_name || null,
        team_id: candidate.team_id || null,
        team_name: candidate.team_name || null,
        performance_stats: candidate.performance_stats,
        selected_by: user.uid,
        selected_by_name: (user as any).displayName || (user as any).email || '',
        notes: '',
      };

      const response = await fetchWithTokenRefresh('/api/awards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(result.message);
        setSelectedCandidate(null);
        loadData(); // Reload to show updated award
      } else {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save award');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAward = async (awardId: string) => {
    if (!confirm('Are you sure you want to remove this award?')) return;

    try {
      const response = await fetchWithTokenRefresh(`/api/awards?id=${awardId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('Award removed successfully');
        loadData();
      } else {
        setError(result.error);
      }
    } catch (err: any) {
      setError('Failed to delete award');
    }
  };

  if (loading || !user || !isCommitteeAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono font-mono">Loading awards console...</p>
        </div>
      </div>
    );
  }

  const currentAward = awards.length > 0 ? awards[0] : null;
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
              <Trophy className="w-6 h-6 text-amber-400 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">SYSTEM CONTROL</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Awards Management
              </h1>
              <p className="text-xs text-slate-500 font-mono mt-1">
                Select and manage tournament awards
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
            <p className="mt-2 text-[10px] text-slate-400 uppercase font-bold">
              💡 Awards are specific to each tournament. Select a tournament to view and manage its awards.
            </p>
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
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { id: 'POTD' as AwardTab, label: 'POTD', icon: Award },
            { id: 'POTW' as AwardTab, label: 'POTW', icon: Trophy },
            { id: 'TOD' as AwardTab, label: 'TOD', icon: Award },
            { id: 'TOW' as AwardTab, label: 'TOW', icon: Trophy },
            { id: 'POTS' as AwardTab, label: 'POTS', icon: Crown },
            { id: 'TOTS' as AwardTab, label: 'TOTS', icon: Crown },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border font-mono text-xs uppercase tracking-wider font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-slate-800 border-slate-900 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
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
                    {maxRounds > 0 && Array.from({ length: maxRounds }, (_, i) => i + 1).map((round) => (
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
              <div className="flex gap-3 flex-wrap">
                {[
                  { week: 1, rounds: '1-7' },
                  { week: 2, rounds: '8-13' },
                  { week: 3, rounds: '14-20' },
                  { week: 4, rounds: '21-26' },
                ].map(({ week, rounds }) => (
                  <button
                    key={week}
                    onClick={() => setCurrentWeek(week)}
                    className={`px-5 py-2.5 rounded-xl font-mono text-xs font-bold transition-all border text-left flex flex-col justify-center cursor-pointer ${
                      currentWeek === week
                        ? 'bg-slate-800 border-slate-900 text-white shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                  >
                    <span>Week {week}</span>
                    <span className={`text-[9px] uppercase font-black mt-0.5 block ${
                      currentWeek === week ? 'text-amber-400' : 'text-slate-400'
                    }`}>Rounds {rounds}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Current Award Display */}
          {currentAward && (
            <div className="console-card bg-emerald-50/35 border-2 border-emerald-300 rounded-3xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider font-mono">
                    CURRENT WINNER
                  </span>
                  <h3 className="text-xl font-extrabold text-emerald-800">
                    {currentAward.player_name || currentAward.team_name}
                  </h3>
                  <p className="text-xs text-emerald-600 font-bold">
                    Selected by {currentAward.selected_by_name}
                  </p>
                </div>
                <div>
                  <button
                    onClick={() => handleDeleteAward(currentAward.id)}
                    className="w-full sm:w-auto px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-mono text-xs uppercase font-extrabold shadow-sm transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove Award
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Candidates List Section */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
            <h3 className="text-base font-extrabold text-slate-900 uppercase tracking-tight mb-4">
              {currentAward ? `Winner: ${currentAward.player_name || currentAward.team_name}` : candidates.length > 0 ? 'Eligible Candidates' : 'No candidates available'}
            </h3>

            {currentAward && (
              <div className="mb-6 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <Info className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <p className="text-[10px] font-bold text-amber-850 uppercase tracking-wider leading-relaxed">
                  An award has already been given for this {['POTD', 'TOD'].includes(activeTab) ? 'round' : 'week'}.
                  You must remove the current award before selecting a new one.
                </p>
              </div>
            )}

            {loading_data ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto"></div>
                <p className="mt-3 text-xs text-slate-550 font-mono font-extrabold uppercase tracking-wider">Loading candidates...</p>
              </div>
            ) : currentAward ? (
              <div className="text-center py-12 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center justify-center">
                <Lock className="w-12 h-12 text-slate-400 mb-3" />
                <p className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Candidate selection is locked</p>
                <p className="text-xs text-slate-500 font-mono mt-1">Remove the current award to select a different winner</p>
              </div>
            ) : candidates.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {candidates.map((candidate, idx) => {
                  const candidateId = candidate.player_id || candidate.team_id || `candidate-${idx}`;
                  const isSelected = selectedCandidate === candidateId;

                  return (
                    <div
                      key={candidateId}
                      onClick={() => setSelectedCandidate(candidateId)}
                      className={`p-4 rounded-2xl cursor-pointer transition-all border ${
                        isSelected
                          ? 'bg-amber-50/50 border-amber-500 ring-2 ring-amber-500/10'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-extrabold text-sm text-slate-800 truncate">
                            {candidate.player_name || candidate.team_name}
                          </p>
                          {candidate.result && (
                            <p className="text-[10px] text-slate-500 font-mono mt-1 font-bold">{candidate.result}</p>
                          )}
                           {candidate.performance_stats && (
                             <div className="flex flex-wrap gap-1.5 mt-2">
                               {Object.entries(candidate.performance_stats).map(([key, value]) => (
                                 <span key={key} className="px-2 py-0.5 bg-slate-200/60 border border-slate-300/30 rounded-md text-[9px] font-bold text-slate-650 uppercase">
                                   {key}: {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : (value as any)}
                                 </span>
                               ))}
                             </div>
                           )}
                        </div>
                        {isSelected && (
                          <span className="text-amber-500 text-lg font-black shrink-0 sm:mr-2">Yes</span>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                  No completed fixtures or eligible stats found for {['POTD', 'TOD'].includes(activeTab) ? `Round ${currentRound}` : `Week ${currentWeek}`}.
                </p>
                {error && (
                  <p className="text-[10px] text-rose-500 font-mono font-bold mt-2 uppercase">{error}</p>
                )}
              </div>
            )}
          </div>

          {/* Action Button */}
          {candidates.length > 0 && !currentAward && (
            <button
              onClick={handleSelectAward}
              disabled={!selectedCandidate || submitting}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-900 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Select Award Winner</span>
                </>
              )}
            </button>
          )}

          {currentAward && (
            <div className="w-full py-3 bg-slate-100 border border-slate-200 text-slate-400 font-extrabold rounded-xl text-xs uppercase tracking-wider text-center cursor-not-allowed flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" /> Award Already Given - Remove to Select Another
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
