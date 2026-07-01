'use client';
import { Activity, AlertTriangle, ClipboardList, Crown, Pencil, Save, Settings, Trophy, XCircle, Swords, ArrowLeft } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import FixtureTimeline from '@/components/FixtureTimeline';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import ConfirmModal from '@/components/modals/ConfirmModal';
import PromptModal from '@/components/modals/PromptModal';
import FixtureShareButton from '@/components/FixtureShareButton';
import CommitteeMatchupCreator from '@/components/CommitteeMatchupCreator';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface Matchup {
  id: number;
  home_player_id: string;
  home_player_name: string;
  away_player_id: string;
  away_player_name: string;
  home_goals: number | null;
  away_goals: number | null;
  position: number;
}

interface Fixture {
  id: string;
  season_id: string;
  tournament_id?: string;
  round_number: number;
  match_number: number;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  status: string;
  leg: string;
  scheduled_date?: string;
  home_score?: number;
  away_score?: number;
  result?: string;
  motm_player_id?: string;
  motm_player_name?: string;
  match_status_reason?: string;
  created_at?: string;
  created_by_name?: string;
  result_submitted_at?: string;
  result_submitted_by_name?: string;
  scoring_type?: string;
}

export default function CommitteeFixtureDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const fixtureId = params?.fixtureId as string;

  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showMatchupCreator, setShowMatchupCreator] = useState(false);
  const [showLineupEditor, setShowLineupEditor] = useState<'home' | 'away' | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedScores, setEditedScores] = useState<{ [key: number]: { home: number, away: number } }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingRoundRobin, setIsGeneratingRoundRobin] = useState(false);
  const [knockoutFormat, setKnockoutFormat] = useState<string | null>(null);

  // Modal system
  const {
    alertState,
    showAlert,
    closeAlert,
    confirmState,
    showConfirm,
    closeConfirm,
    handleConfirm,
    promptState,
    showPrompt,
    closePrompt,
    handlePromptConfirm,
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
    if (fixtureId && user?.role === 'committee_admin') {
      fetchFixtureData();
    }
  }, [fixtureId, user]);

  const fetchFixtureData = async () => {
    setIsLoading(true);
    try {
      // Fetch fixture
      const fixtureRes = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}`);
      const fixtureData = await fixtureRes.json();

      if (fixtureData.fixture) {
        setFixture(fixtureData.fixture);
        setKnockoutFormat(fixtureData.fixture.knockout_format || null);
      }

      // Fetch matchups
      const matchupsRes = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/matchups`);
      const matchupsData = await matchupsRes.json();

      if (matchupsData.matchups) {
        setMatchups(matchupsData.matchups);

        // Initialize edited scores
        const scores: { [key: number]: { home: number, away: number } } = {};
        matchupsData.matchups.forEach((m: Matchup) => {
          scores[m.position] = {
            home: m.home_goals ?? 0,
            away: m.away_goals ?? 0
          };
        });
        setEditedScores(scores);
      }
    } catch (error) {
      console.error('Error fetching fixture data:', error);
      showAlert({
        type: 'error',
        title: 'Load Failed',
        message: 'Failed to load fixture data'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeclareWO = async (absentTeam: 'home' | 'away') => {
    const teamName = absentTeam === 'home' ? fixture?.home_team_name : fixture?.away_team_name;
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Declare Walkover',
      message: `Declare walkover due to ${teamName} being absent?`,
      confirmText: 'Declare WO',
      cancelText: 'Cancel'
    });

    if (!confirmed || !fixture) return;

    setIsSaving(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/declare-wo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          absent_team: absentTeam,
          declared_by: user?.uid,
          declared_by_name: user?.displayName || user?.email,
        })
      });

      if (response.ok) {
        showAlert({
          type: 'success',
          title: 'Walkover Declared',
          message: 'Walkover declared successfully!'
        });
        fetchFixtureData();
      } else {
        const error = await response.json();
        showAlert({
          type: 'error',
          title: 'Failed',
          message: error.error || 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error declaring WO:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to declare walkover'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeclareNull = async () => {
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Declare Match NULL',
      message: 'Declare match NULL due to both teams being absent?',
      confirmText: 'Declare NULL',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setIsSaving(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/declare-null`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          declared_by: user?.uid,
          declared_by_name: user?.displayName || user?.email,
        })
      });

      if (response.ok) {
        showAlert({
          type: 'success',
          title: 'Match Nullified',
          message: 'Match declared NULL successfully!'
        });
        fetchFixtureData();
      } else {
        const error = await response.json();
        showAlert({
          type: 'error',
          title: 'Failed',
          message: error.error || 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error declaring NULL:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to declare NULL'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateRoundRobinMatchups = async () => {
    const confirmed = await showConfirm({
      type: 'info',
      title: 'Generate Round Robin Matchups',
      message: 'This will automatically generate all 25 matchups (5x5) based on the submitted lineups. Both lineups will be locked. Continue?',
      confirmText: 'Generate Matchups',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setIsGeneratingRoundRobin(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/generate-round-robin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showAlert({
          type: 'success',
          title: 'Matchups Generated',
          message: `Successfully generated ${data.matchups_count} round robin matchups!`
        });
        fetchFixtureData();
      } else {
        showAlert({
          type: 'error',
          title: 'Generation Failed',
          message: data.error || 'Failed to generate matchups'
        });
      }
    } catch (error) {
      console.error('Error generating round robin matchups:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to generate round robin matchups'
      });
    } finally {
      setIsGeneratingRoundRobin(false);
    }
  };

  const handleSaveResults = async () => {
    if (!fixture) return;

    const reason = await showPrompt({
      title: 'Edit Reason',
      message: 'Enter reason for editing result (optional):',
      placeholder: 'Reason for edit...',
      defaultValue: ''
    });

    if (!reason) return; // User cancelled

    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Save Changes',
      message: 'Save the edited results? This will revert old stats and apply new ones.',
      confirmText: 'Save Changes',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setIsSaving(true);
    try {
      // Prepare edited matchups
      const editedMatchups = matchups.map(m => ({
        position: m.position,
        home_player_id: m.home_player_id,
        home_player_name: m.home_player_name,
        away_player_id: m.away_player_id,
        away_player_name: m.away_player_name,
        home_goals: editedScores[m.position]?.home ?? m.home_goals ?? 0,
        away_goals: editedScores[m.position]?.away ?? m.away_goals ?? 0,
      }));

      const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/edit-result`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchups: editedMatchups,
          edited_by: user?.uid,
          edited_by_name: user?.displayName || user?.email,
          edit_reason: reason || 'Result corrected by committee admin'
        })
      });

      if (response.ok) {
        showAlert({
          type: 'success',
          title: 'Results Updated',
          message: 'Results updated successfully! Stats have been recalculated.'
        });
        setIsEditMode(false);
        fetchFixtureData(); // Reload data
      } else {
        const error = await response.json();
        showAlert({
          type: 'error',
          title: 'Save Failed',
          message: error.error || 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error saving results:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to save results. Please try again.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono text-slate-800">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold animate-pulse">Loading fixture...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'committee_admin') {
    return null;
  }

  if (!fixture) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Fixture Not Found</h1>
          <Link href="/dashboard/committee/team-management/tournament" className="text-blue-600 mt-4 inline-block">
            &larr; Back to Tournament
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 px-4 sm:px-6">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/committee/team-management/tournament?tab=fixtures&tournament=${fixture.tournament_id}&round=${fixture.round_number}`}
            className="p-3 bg-white border border-slate-200/60 hover:bg-slate-50 rounded-2xl text-slate-600 transition-all shadow-sm shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
              Committee Fixture Management
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs font-mono text-slate-500">
              <span>
                {(fixture as any).knockout_round ? (
                  <>
                    {(fixture as any).knockout_round === 'quarter_finals' && (
                      <span className="inline-flex items-center gap-1 text-rose-500 font-semibold"><Swords className="w-4 h-4" /> Quarter Finals</span>
                    )}
                    {(fixture as any).knockout_round === 'semi_finals' && (
                      <span className="inline-flex items-center gap-1 text-amber-500 font-semibold"><Trophy className="w-4 h-4" /> Semi Finals</span>
                    )}
                    {(fixture as any).knockout_round === 'finals' && (
                      <span className="inline-flex items-center gap-1 text-amber-500 font-semibold"><Crown className="w-4 h-4" /> Finals</span>
                    )}
                    {(fixture as any).knockout_round === 'third_place' && (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-semibold"><Trophy className="w-4 h-4" /> Third Place Playoff</span>
                    )}
                  </>
                ) : (
                  `Round ${fixture.round_number}`
                )}
              </span>
              <span>•</span>
              <span>Match {fixture.match_number}</span>
              <span>•</span>
              <span>{fixture.leg === 'first' ? '1st Leg' : '2nd Leg'}</span>
              
              {(fixture as any).knockout_round && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-sm">
                    KNOCKOUT
                  </span>
                </>
              )}
              
              {(fixture as any).scoring_system && (
                <>
                  <span>•</span>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${(fixture as any).scoring_system === 'wins'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-blue-50 text-blue-800 border border-blue-200'
                    }`}>
                    {(fixture as any).scoring_system === 'wins' ? 'Win-Based' : 'Goal-Based'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Fixture Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Match Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
              {/* Home Team */}
              <div className="flex-1 text-center md:text-left w-full">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-2">
                  <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">{fixture.home_team_name}</h2>
                  <button
                    onClick={() => setShowLineupEditor('home')}
                    className="self-center md:self-auto px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit Lineup
                  </button>
                </div>
                <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Home Team</p>
              </div>

              {/* Score / Status */}
              <div className="text-center px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl shrink-0 min-w-[140px]">
                <div className="text-3xl font-black text-slate-800 tracking-tight">
                  {fixture.home_score ?? '-'} : {fixture.away_score ?? '-'}
                </div>
                <div className="mt-1">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase ${
                    fixture.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-250' :
                    fixture.status === 'in_progress' ? 'bg-amber-50 text-amber-700 border border-amber-250' :
                    'bg-sky-50 text-sky-700 border border-sky-250'
                  }`}>
                    {fixture.status}
                  </span>
                </div>
                {matchups.length === 0 && fixture.status !== 'completed' && (
                  <button
                    onClick={() => setShowMatchupCreator(true)}
                    className="mt-3 px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold font-mono uppercase tracking-wider rounded-lg transition-all shadow-sm flex items-center gap-1 mx-auto cursor-pointer"
                  >
                    <Swords className="w-3 h-3" /> Add Matchups
                  </button>
                )}
              </div>

              {/* Away Team */}
              <div className="flex-1 text-center md:text-right w-full">
                <div className="flex flex-col md:flex-row-reverse md:items-center justify-between gap-3 mb-2">
                  <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">{fixture.away_team_name}</h2>
                  <button
                    onClick={() => setShowLineupEditor('away')}
                    className="self-center md:self-auto px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit Lineup
                  </button>
                </div>
                <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Away Team</p>
              </div>
            </div>

            {fixture.match_status_reason && (
              <div className={`p-4 rounded-2xl mb-4 ${fixture.match_status_reason.includes('wo') ? 'bg-orange-50 border border-orange-200 text-orange-850' :
                'bg-slate-50 border border-slate-200 text-slate-750'
                }`}>
                <p className="font-bold text-sm flex items-center gap-1.5">
                  {fixture.match_status_reason === 'wo_home_absent' && (
                    <>
                      <AlertTriangle className="w-4 h-4 text-orange-600" /> Walkover - Home team absent
                    </>
                  )}
                  {fixture.match_status_reason === 'wo_away_absent' && (
                    <>
                      <AlertTriangle className="w-4 h-4 text-orange-600" /> Walkover - Away team absent
                    </>
                  )}
                  {fixture.match_status_reason === 'null_both_absent' && (
                    <>
                      <XCircle className="w-4 h-4 text-rose-600" /> Match NULL - Both teams absent
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4 text-xs font-mono text-slate-500 mt-4 pt-4 border-t border-slate-100">
              <div>
                <strong className="text-slate-700 uppercase tracking-wider text-[10px] block mb-1">Created</strong> 
                {fixture.created_at ? new Date(fixture.created_at).toLocaleString() : 'N/A'}
                {fixture.created_by_name && <span className="text-[10px] text-slate-400 block mt-0.5">by {fixture.created_by_name}</span>}
              </div>
              {fixture.result_submitted_at && (
                <div>
                  <strong className="text-slate-700 uppercase tracking-wider text-[10px] block mb-1">Result Submitted</strong> 
                  {new Date(fixture.result_submitted_at).toLocaleString()}
                  {fixture.result_submitted_by_name && <span className="text-[10px] text-slate-400 block mt-0.5">by {fixture.result_submitted_by_name}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Matchups */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-gray-900 tracking-tight">Individual Matchups</h3>
              {!isEditMode && fixture.status === 'completed' && (
                <button
                  onClick={() => setIsEditMode(true)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit Results
                </button>
              )}
              {isEditMode && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setIsEditMode(false);
                      fetchFixtureData();
                    }}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all border border-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveResults}
                    disabled={isSaving}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? 'Saving...' : (
                      <>
                        <Save className="w-3.5 h-3.5" /> Save Changes
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {matchups.map((matchup) => (
                <div key={matchup.id} className="bg-slate-50/60 border border-slate-100 rounded-2xl p-4 hover:bg-slate-50 transition-all">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{matchup.home_player_name}</p>
                    </div>
                    <div className="flex items-center gap-2 mx-2 shrink-0">
                      {isEditMode ? (
                        <>
                          <input
                            type="number"
                            min="0"
                            value={editedScores[matchup.position]?.home ?? 0}
                            onChange={(e) => setEditedScores(prev => ({
                              ...prev,
                              [matchup.position]: { ...prev[matchup.position], home: parseInt(e.target.value) || 0 }
                            }))}
                            className="w-16 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-center font-bold text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                          />
                          <span className="text-slate-400 font-bold">-</span>
                          <input
                            type="number"
                            min="0"
                            value={editedScores[matchup.position]?.away ?? 0}
                            onChange={(e) => setEditedScores(prev => ({
                              ...prev,
                              [matchup.position]: { ...prev[matchup.position], away: parseInt(e.target.value) || 0 }
                            }))}
                            className="w-16 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-center font-bold text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                          />
                        </>
                      ) : (
                        <span className="px-4 py-1.5 bg-white border border-slate-150 rounded-xl text-sm font-black text-slate-800 font-mono shadow-sm">
                          {matchup.home_goals ?? '-'} : {matchup.away_goals ?? '-'}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 text-right min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{matchup.away_player_name}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Actions & Timeline */}
        <div className="space-y-6">
          {/* Actions */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
            <h3 className="text-lg font-black text-gray-900 tracking-tight mb-4">Committee Actions</h3>
            <div className="space-y-3">
              {/* Share Button */}
              <div className="flex justify-center w-full">
                <FixtureShareButton fixture={fixture} matchups={matchups} />
              </div>

              <button
                onClick={() => setShowTimeline(true)}
                className="w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ClipboardList className="w-4 h-4 text-white" /> View Complete Timeline
              </button>

              {/* Create Matchups Button - Only show if matchups don't exist */}
              {matchups.length === 0 && fixture.status !== 'completed' && (
                <>
                  <button
                    onClick={() => setShowMatchupCreator(true)}
                    className="w-full px-4 py-3 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Swords className="w-4 h-4 text-white" /> Create Matchups
                  </button>
                  
                  {/* Round Robin Auto-Generate Button */}
                  {knockoutFormat === 'round_robin' && (
                    <button
                      onClick={handleGenerateRoundRobinMatchups}
                      disabled={isGeneratingRoundRobin}
                      className="w-full px-4 py-3 bg-gradient-to-r from-orange-50 to-red-50 hover:from-orange-600 hover:to-red-600 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isGeneratingRoundRobin ? (
                        <>
                          <span className="animate-spin"><Settings className="w-4 h-4 text-white" /></span> Generating...
                        </>
                      ) : (
                        <>
                          🎯 Auto-Generate Round Robin
                        </>
                      )}
                    </button>
                  )}
                </>
              )}

              {fixture.status !== 'completed' && (
                <div className="pt-4 border-t border-slate-100 space-y-2.5">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Administrative Declarations</p>
                  <button
                    onClick={() => handleDeclareWO('home')}
                    disabled={isSaving}
                    className="w-full px-4 py-3 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold font-mono uppercase tracking-wider rounded-xl border border-orange-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <AlertTriangle className="w-4 h-4 text-orange-600" /> WO - Home Team Absent
                  </button>
                  <button
                    onClick={() => handleDeclareWO('away')}
                    disabled={isSaving}
                    className="w-full px-4 py-3 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold font-mono uppercase tracking-wider rounded-xl border border-orange-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <AlertTriangle className="w-4 h-4 text-orange-600" /> WO - Away Team Absent
                  </button>
                  <button
                    onClick={handleDeclareNull}
                    disabled={isSaving}
                    className="w-full px-4 py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold font-mono uppercase tracking-wider rounded-xl border border-rose-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4 text-rose-600" /> NULL - Both Teams Absent
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Quick Info */}
          <div className="console-card bg-gradient-to-br from-slate-50 to-blue-50/20 border border-slate-200/60 rounded-3xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 text-sm mb-4">Quick Info</h3>
            <div className="space-y-3 text-xs font-mono text-slate-600">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-slate-400">Season ID</span>
                <span className="font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-200/50 shadow-2xs">{fixture.season_id}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-slate-400">Fixture ID</span>
                <span className="font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-200/50 shadow-2xs truncate max-w-[180px]" title={fixture.id}>{fixture.id}</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-slate-400">Matchups Count</span>
                <span className="font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-200/50 shadow-2xs">{matchups.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Timeline Modal */}
      <FixtureTimeline
        fixtureId={fixtureId}
        isOpen={showTimeline}
        onClose={() => setShowTimeline(false)}
      />

      {/* Matchup Creator Modal */}
      {showMatchupCreator && fixture && user && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 transition-all duration-300 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-5xl w-full overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
            <CommitteeMatchupCreator
              fixtureId={fixtureId}
              seasonId={fixture.season_id}
              homeTeamId={fixture.home_team_id}
              homeTeamName={fixture.home_team_name}
              awayTeamId={fixture.away_team_id}
              awayTeamName={fixture.away_team_name}
              userId={user.uid}
              userName={user.displayName || user.email || 'Committee Admin'}
              onSuccess={() => {
                setShowMatchupCreator(false);
                showAlert({
                  type: 'success',
                  title: 'Matchups Created',
                  message: 'Matchups have been created successfully!'
                });
                fetchFixtureData(); // Reload data
              }}
              onCancel={() => setShowMatchupCreator(false)}
            />
          </div>
        </div>
      )}

      {/* Lineup Editor Modal */}
      {showLineupEditor && fixture && user && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 transition-all duration-300 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
            <CommitteeMatchupCreator
              fixtureId={fixtureId}
              seasonId={fixture.season_id}
              homeTeamId={fixture.home_team_id}
              homeTeamName={fixture.home_team_name}
              awayTeamId={fixture.away_team_id}
              awayTeamName={fixture.away_team_name}
              userId={user.uid}
              userName={user.displayName || user.email || 'Committee Admin'}
              onSuccess={() => {
                setShowLineupEditor(null);
                showAlert({
                  type: 'success',
                  title: 'Lineup Updated',
                  message: 'Lineup has been updated successfully!'
                });
                fetchFixtureData(); // Reload data
              }}
              onCancel={() => setShowLineupEditor(null)}
              initialTeamToEdit={showLineupEditor}
            />
          </div>
        </div>
      )}

      {/* Alert, Confirm, and Prompt Modals */}
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

      <PromptModal
        isOpen={promptState.isOpen}
        onConfirm={handlePromptConfirm}
        onCancel={closePrompt}
        title={promptState.title}
        message={promptState.message}
        placeholder={promptState.placeholder}
        defaultValue={promptState.defaultValue}
        confirmText={promptState.confirmText}
        cancelText={promptState.cancelText}
      />
    </div>
  );
}
