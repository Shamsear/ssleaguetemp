'use client';

import { useState, useEffect } from 'react';
import { Home, Plane } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import LineupSubmission from '@/components/LineupSubmission';
import TripleThreatLineupSubmission from '@/components/TripleThreatLineupSubmission';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

export default function SelectOpponentLineupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const fixtureId = params?.fixtureId as string;

  const [fixture, setFixture] = useState<any>(null);
  const [opponentTeamId, setOpponentTeamId] = useState<string>('');
  const [opponentTeamName, setOpponentTeamName] = useState<string>('');
  const [canSelectLineup, setCanSelectLineup] = useState(false);
  const [existingLineup, setExistingLineup] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && fixtureId) {
      fetchFixtureAndCheckEligibility();
    }
  }, [user, fixtureId]);

  const fetchFixtureAndCheckEligibility = async () => {
    try {
      setLoadingData(true);
      setError(null);

      // Fetch fixture details
      const fixtureRes = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}`);
      
      if (!fixtureRes.ok) {
        throw new Error('Fixture not found');
      }

      const fixtureData = await fixtureRes.json();
      
      if (!fixtureData.fixture) {
        throw new Error('Fixture not found');
      }

      setFixture(fixtureData.fixture);

      // Determine which team is the user's team and which is opponent
      const isHomeTeam = fixtureData.fixture.home_team_id === (user as any)?.team_id || fixtureData.fixture.home_team_id === (user as any)?.teamId;
      const isAwayTeam = fixtureData.fixture.away_team_id === (user as any)?.team_id || fixtureData.fixture.away_team_id === (user as any)?.teamId;

      if (!isHomeTeam && !isAwayTeam) {
        setError('You are not part of this fixture');
        setLoadingData(false);
        return;
      }

      const userTeamId = isHomeTeam ? fixtureData.fixture.home_team_id : fixtureData.fixture.away_team_id;
      const opponentId = isHomeTeam ? fixtureData.fixture.away_team_id : fixtureData.fixture.home_team_id;
      const opponentName = isHomeTeam ? fixtureData.fixture.away_team_name : fixtureData.fixture.home_team_name;

      setOpponentTeamId(opponentId);
      setOpponentTeamName(opponentName);

      // Check if opponent lineup is eligible for selection
      const eligibilityRes = await fetchWithTokenRefresh(`/api/lineups/opponent-selection-eligibility?fixture_id=${fixtureId}&opponent_team_id=${opponentId}`);
      const eligibilityData = await eligibilityRes.json();

      if (!eligibilityData.success || !eligibilityData.eligible) {
        setError(eligibilityData.message || 'Opponent lineup selection not available');
        setCanSelectLineup(false);
      } else {
        setCanSelectLineup(true);

        // Check if lineup already selected (ignore unsubmitted system_auto stubs in Triple Threat)
        const isTT =
          fixtureData.fixture.tournament_type === 'triple_threat' ||
          fixtureData.fixture.matchday_format === 'triple_threat';
        const lineupRes = await fetchWithTokenRefresh(`/api/lineups?fixture_id=${fixtureId}&team_id=${opponentId}`);
        const lineupData = await lineupRes.json();
        
        if (lineupData.success && lineupData.lineups) {
          const l = lineupData.lineups;
          if (!isTT || (l.submitted_by !== 'system_auto' && l.triple_threat_lineup)) {
            setExistingLineup(l);
          } else {
            setExistingLineup(null);
          }
        }
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmitSuccess = () => {
    // Refresh data
    fetchFixtureAndCheckEligibility();
    
    // Show success message
    setTimeout(() => {
      router.push(`/dashboard/team/fixture/${fixtureId}`);
    }, 2000);
  };

  if (loading || loadingData) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-extrabold">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  if (!user || !fixture) {
    return null;
  }

  if (error) {
    return (
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto relative z-10 space-y-6">
          <div>
            <Link
              href={`/dashboard/team/fixture/${fixtureId}`}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              {"<-"} Back to Fixture
            </Link>
          </div>

          <div className="console-card bg-white border border-rose-200 rounded-3xl p-8 text-center shadow-sm font-mono">
            <div className="w-14 h-14 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900 uppercase tracking-wider mb-1">Not Available</h2>
            <p className="text-xs text-slate-600 font-sans">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthGuard requiredRole="team">
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto relative z-10 space-y-6">
          <div>
            <Link
              href={`/dashboard/team/fixture/${fixtureId}`}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              {"<-"} Back to Fixture
            </Link>
          </div>

          {/* Warning Banner */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-3xl p-5 sm:p-6 shadow-sm font-mono">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 bg-amber-100 border border-amber-200 rounded-2xl flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold text-amber-900 uppercase tracking-wider mb-1">
                  Opponent Lineup Selection
                </h3>
                <p className="text-xs text-amber-800 font-sans">
                  <strong>{opponentTeamName}</strong> did not submit their lineup within the deadline. You are permitted to select their lineup on their behalf.
                </p>
              </div>
            </div>
          </div>

          {/* Fixture Info */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 sm:p-8 shadow-sm font-mono">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div>
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">
                  OPPONENT LINEUP
                </span>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-800 uppercase tracking-wide mt-0.5">
                  Select Lineup for {opponentTeamName}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Round {fixture.round_number} • Match #{fixture.match_number}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 sm:gap-6 items-center">
              <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white border border-slate-200 rounded-2xl p-1.5 overflow-hidden flex items-center justify-center shadow-sm flex-shrink-0">
                    {fixture.home_team_logo ? (
                      <img src={fixture.home_team_logo} alt={fixture.home_team_name} className="w-full h-full object-contain" />
                    ) : (
                      <Home className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Home Team</div>
                    <div className="text-base sm:text-lg font-bold text-slate-800 uppercase tracking-wide truncate">
                      {fixture.home_team_name}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center items-center">
                <div className="bg-slate-800 text-amber-400 rounded-full w-11 h-11 flex items-center justify-center text-xs font-black shadow-md border-4 border-slate-200">
                  VS
                </div>
              </div>

              <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white border border-slate-200 rounded-2xl p-1.5 overflow-hidden flex items-center justify-center shadow-sm flex-shrink-0">
                    {fixture.away_team_logo ? (
                      <img src={fixture.away_team_logo} alt={fixture.away_team_name} className="w-full h-full object-contain" />
                    ) : (
                      <Plane className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Away Team</div>
                    <div className="text-base sm:text-lg font-bold text-slate-800 uppercase tracking-wide truncate">
                      {fixture.away_team_name}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Lineup Selection Component */}
          {canSelectLineup && (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-4 sm:p-8 shadow-sm">
              {fixture?.tournament_type === 'triple_threat' || fixture?.matchday_format === 'triple_threat' ? (
                <TripleThreatLineupSubmission
                  fixtureId={fixtureId}
                  teamId={opponentTeamId}
                  seasonId={fixture.season_id}
                  fixture={fixture}
                  teamName={opponentTeamName}
                  existingLineup={existingLineup}
                  onSubmitSuccess={handleSubmitSuccess}
                  isOpponentSelection={true}
                  opponentTeamName={opponentTeamName}
                />
              ) : (
                <LineupSubmission
                  fixtureId={fixtureId}
                  teamId={opponentTeamId}
                  seasonId={fixture.season_id}
                  existingLineup={existingLineup}
                  onSubmitSuccess={handleSubmitSuccess}
                  isOpponentSelection={true}
                  opponentTeamName={opponentTeamName}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
