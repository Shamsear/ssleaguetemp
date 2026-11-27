'use client';

import { Home, Info, Plane, Search, XCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import LineupSubmission from '@/components/LineupSubmission';
import TripleThreatLineupSubmission from '@/components/TripleThreatLineupSubmission';
import { useAutoLockLineups } from '@/hooks/useAutoLockLineups';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

export default function FixtureLineupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const fixtureId = params?.fixtureId as string;

  const [fixture, setFixture] = useState<any>(null);
  const [teamId, setTeamId] = useState<string>('');
  const [existingLineup, setExistingLineup] = useState<any>(null);
  const [opponentLineup, setOpponentLineup] = useState<any>(null);
  const [opponentRoster, setOpponentRoster] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [roundStarted, setRoundStarted] = useState<boolean>(false);

  // Auto-lock lineups when deadline passes
  useAutoLockLineups(fixtureId, deadline || undefined);

  useEffect(() => {
    if (user && fixtureId) {
      fetchFixtureAndLineup();
    }
  }, [user, fixtureId]);

  const fetchFixtureAndLineup = async () => {
    try {
      setLoadingData(true);

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

      // Fetch user's team_id from team_seasons for this season
      const teamSeasonsRes = await fetchWithTokenRefresh(`/api/team-seasons?user_id=${user?.uid}&season_id=${fixtureData.fixture.season_id}`);
      const teamSeasonsData = await teamSeasonsRes.json();
      
      console.log('<Search className="w-4 h-4 text-slate-500" /> DEBUG - Team seasons data:', teamSeasonsData);
      
      if (!teamSeasonsData.success || !teamSeasonsData.team_season) {
        throw new Error('You are not registered for this season');
      }
      
      const actualTeamId = teamSeasonsData.team_season.team_id;
      
      // Determine which team the user belongs to
      console.log('<Search className="w-4 h-4 text-slate-500" /> DEBUG - Fixture data:', {
        fixtureId,
        home_team_id: fixtureData.fixture.home_team_id,
        away_team_id: fixtureData.fixture.away_team_id,
        home_team_name: fixtureData.fixture.home_team_name,
        away_team_name: fixtureData.fixture.away_team_name,
        user_uid: user?.uid,
        actual_team_id: actualTeamId
      });
      
      console.log('<Search className="w-4 h-4 text-slate-500" /> DEBUG - Team matching:', {
        is_home_team: fixtureData.fixture.home_team_id === actualTeamId,
        is_away_team: fixtureData.fixture.away_team_id === actualTeamId
      });
      
      const userTeamId = fixtureData.fixture.home_team_id === actualTeamId
        ? fixtureData.fixture.home_team_id
        : fixtureData.fixture.away_team_id;
      
      console.log('<Search className="w-4 h-4 text-slate-500" /> DEBUG - Determined userTeamId:', userTeamId);
      
      // Verify user's team is actually in this fixture
      if (userTeamId !== fixtureData.fixture.home_team_id && userTeamId !== fixtureData.fixture.away_team_id) {
        console.error('<XCircle className="w-4 h-4 text-rose-500" /> User team not in fixture!');
        throw new Error('You are not part of this fixture');
      }
      
      setTeamId(userTeamId);

      // Fetch deadline information from editable API with teamId
      const editableRes = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/editable?team_id=${userTeamId}`);
      const editableData = await editableRes.json();
      
      if (editableData.deadline) {
        setDeadline(editableData.deadline);
      }
      const isRoundActive = Boolean(editableData.roundStarted);
      setRoundStarted(isRoundActive);

      // Fetch existing lineup if any - only for the user's team
      const lineupUrl = `/api/lineups?fixture_id=${fixtureId}&team_id=${userTeamId}`;
      console.log('<Search className="w-4 h-4 text-slate-500" /> DEBUG - Fetching lineup from:', lineupUrl);
      const lineupRes = await fetchWithTokenRefresh(lineupUrl);
      const lineupData = await lineupRes.json();
      
      console.log('<Search className="w-4 h-4 text-slate-500" /> DEBUG - Lineup API response:', lineupData);
      
      const isTripleThreatFixture = Boolean(
        fixtureData.fixture.tournament_type === 'triple_threat' ||
        fixtureData.fixture.matchday_format === 'triple_threat' ||
        fixtureData.fixture.scoring_system === 'triple_threat' ||
        fixtureData.fixture.knockout_format === 'triple_threat' ||
        fixtureData.fixture.tournament_id?.toLowerCase().includes('triple_threat')
      );

      // Verify the returned lineup belongs to this team and is not a system_auto stub in Triple Threat
      if (lineupData.success && lineupData.lineups !== null && lineupData.lineups !== undefined) {
        const returnedLineup = lineupData.lineups;
        const isSystemAutoPhantom =
          isTripleThreatFixture &&
          (returnedLineup.submitted_by === 'system_auto' || !returnedLineup.triple_threat_lineup);

        if (isSystemAutoPhantom) {
          console.log('<Info className="w-4 h-4 text-blue-500" /> DEBUG - Ignoring unsubmitted system_auto stub for Triple Threat');
          setExistingLineup(null);
        } else if (returnedLineup.team_id === userTeamId) {
          console.log('✅ DEBUG - Team ID matches, setting lineup');
          setExistingLineup(returnedLineup);
        } else {
          console.error('<XCircle className="w-4 h-4 text-rose-500" /> CRITICAL - Lineup team_id mismatch!', {
            returned: returnedLineup.team_id,
            expected: userTeamId
          });
        }
      } else {
        console.log('<Info className="w-4 h-4 text-blue-500" /> DEBUG - No existing lineup found for this team (lineups is null/undefined)');
        setExistingLineup(null);
      }

      // If user is Home Team AND the round has started, also fetch Away Team's submitted lineup & roster (Home Advantage)
      if (userTeamId === fixtureData.fixture.home_team_id && isRoundActive) {
        try {
          const [oppLineupRes, oppPlayersRes] = await Promise.all([
            fetchWithTokenRefresh(`/api/lineups?fixture_id=${fixtureId}&team_id=${fixtureData.fixture.away_team_id}`),
            fetch(`/api/team/${fixtureData.fixture.away_team_id}/players?seasonId=${fixtureData.fixture.season_id}`)
          ]);
          if (oppPlayersRes.ok) {
            const oppPlayersData = await oppPlayersRes.json();
            setOpponentRoster(oppPlayersData.realplayers || oppPlayersData.data || []);
          }
          if (oppLineupRes.ok) {
            const oppData = await oppLineupRes.json();
            if (
              oppData.success &&
              oppData.lineups &&
              !oppData.lineups.hidden_until_round_start &&
              !oppData.lineups.is_draft &&
              oppData.lineups.submitted_by !== 'system_auto' &&
              oppData.lineups.triple_threat_lineup
            ) {
              setOpponentLineup(oppData.lineups);
            } else {
              setOpponentLineup(null);
            }
          }
        } catch (oppErr) {
          console.warn('Could not fetch away lineup for home advantage:', oppErr);
        }
      } else {
        setOpponentLineup(null);
      }
    } catch (error: any) {
      console.error('Error fetching data:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmitSuccess = () => {
    // Refresh lineup data
    fetchFixtureAndLineup();
    
    // Show success message or redirect
    setTimeout(() => {
      router.push(`/dashboard/team/fixture/${fixtureId}`);
    }, 1500);
  };

  if (loading || loadingData) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-extrabold">
            Loading lineup...
          </p>
        </div>
      </div>
    );
  }

  if (!user || !fixture) {
    return null;
  }

  const isHomeUser = fixture.home_team_id === teamId;

  return (
    <AuthGuard requiredRole="team">
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto relative z-10 space-y-6">
          {/* Header Back Link */}
          <div>
            <Link
              href={`/dashboard/team/fixture/${fixtureId}`}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              {"<-"} Back to Fixture
            </Link>
          </div>

          {/* Fixture Info Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 sm:p-8 shadow-sm font-mono">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div>
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">
                  LINEUP SUBMISSION
                </span>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-800 uppercase tracking-wide mt-0.5">
                  Round {fixture.round_number}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="inline-flex items-center px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wider border border-indigo-200 rounded-full">
                    {fixture.leg === 'first' ? '1st' : '2nd'} Leg
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold uppercase tracking-wider border border-purple-200 rounded-full">
                    Match #{fixture.match_number}
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border rounded-full ${
                    isHomeUser
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    {isHomeUser ? 'Home Team' : 'Away Team'}
                  </span>
                </div>
              </div>

              {deadline && (
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl px-4 py-2.5 text-left sm:text-right self-start sm:self-auto">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    {isHomeUser ? 'Away Cutoff (Reference)' : 'Submission Deadline'}
                  </span>
                  <span className="text-xs font-extrabold text-slate-800">
                    {new Date(deadline).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Kolkata',
                    })} IST
                  </span>
                </div>
              )}
            </div>

            {/* Teams VS Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 sm:gap-6 items-center">
              {/* Home Team */}
              <div className={`console-card bg-white border rounded-2xl p-4 sm:p-5 transition-all ${
                isHomeUser ? 'border-amber-300 shadow-sm' : 'border-slate-200/60'
              }`}>
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

              {/* VS Badge */}
              <div className="flex justify-center items-center">
                <div className="bg-slate-800 text-amber-400 rounded-full w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center text-xs sm:text-sm font-black shadow-md border-4 border-slate-200">
                  VS
                </div>
              </div>

              {/* Away Team */}
              <div className={`console-card bg-white border rounded-2xl p-4 sm:p-5 transition-all ${
                !isHomeUser ? 'border-amber-300 shadow-sm' : 'border-slate-200/60'
              }`}>
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

          {/* Lineup Submission Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-4 sm:p-8 shadow-sm">
            {fixture.tournament_type === 'triple_threat' ||
             fixture.matchday_format === 'triple_threat' ||
             fixture.scoring_system === 'triple_threat' ||
             fixture.knockout_format === 'triple_threat' ||
             fixture.tournament_id?.toLowerCase().includes('triple_threat') ? (
              <TripleThreatLineupSubmission
                fixtureId={fixtureId}
                teamId={teamId}
                seasonId={fixture.season_id}
                fixture={fixture}
                teamName={isHomeUser ? fixture.home_team_name : fixture.away_team_name}
                existingLineup={existingLineup}
                opponentLineup={opponentLineup}
                opponentRoster={opponentRoster}
                opponentTeamName={isHomeUser ? fixture.away_team_name : fixture.home_team_name}
                isHomeTeam={isHomeUser}
                roundStarted={roundStarted}
                onSubmitSuccess={handleSubmitSuccess}
              />
            ) : (
              <LineupSubmission
                fixtureId={fixtureId}
                teamId={teamId}
                seasonId={fixture.season_id}
                existingLineup={existingLineup}
                onSubmitSuccess={handleSubmitSuccess}
              />
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
