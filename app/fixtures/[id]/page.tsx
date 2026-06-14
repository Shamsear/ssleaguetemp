'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Activity, Crown, Medal, Repeat, Shield, Star, TrendingUp, Trophy } from 'lucide-react';

interface Matchup {
  home_player_id: string;
  home_player_name: string;
  away_player_id: string;
  away_player_name: string;
  position: number;
  match_duration?: number;
  home_goals?: number | null;
  away_goals?: number | null;
  home_substituted?: boolean;
  home_original_player_name?: string;
  home_sub_penalty?: number;
  away_substituted?: boolean;
  away_original_player_name?: string;
  away_sub_penalty?: number;
}

interface Fixture {
  id: string;
  season_id: string;
  round_number: number;
  match_number: number;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  leg: string;
  status: string;
  scheduled_date?: string;
  home_score?: number;
  away_score?: number;
  motm_player_id?: string | null;
  motm_player_name?: string | null;
  home_penalty_goals?: number;
  away_penalty_goals?: number;
}

export default function PublicFixtureDetailPage() {
  const params = useParams();
  const fixtureId = params?.id as string;

  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fixtureId) {
      fetchFixtureDetails();
    }
  }, [fixtureId]);

  const fetchFixtureDetails = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch fixture details
      const fixtureResponse = await fetch(`/api/fixtures/${fixtureId}`);
      if (!fixtureResponse.ok) {
        throw new Error('Failed to fetch fixture details');
      }
      const fixtureData = await fixtureResponse.json();
      setFixture(fixtureData.fixture);

      // Fetch matchups
      const matchupsResponse = await fetch(`/api/fixtures/${fixtureId}/matchups`);
      if (matchupsResponse.ok) {
        const matchupsData = await matchupsResponse.json();
        if (matchupsData.matchups) {
          // Sort by position
          matchupsData.matchups.sort((a: Matchup, b: Matchup) => a.position - b.position);
          setMatchups(matchupsData.matchups);
        }
      }
    } catch (err: any) {
      console.error('Error fetching fixture details:', err);
      setError(err.message || 'Failed to load fixture details');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateScores = () => {
    if (!fixture) {
      return { home: 0, away: 0 };
    }

    if (matchups.length === 0) {
      return {
        home: fixture.home_score ?? 0,
        away: fixture.away_score ?? 0,
        homePlayerGoals: fixture.home_score ?? 0,
        awayPlayerGoals: fixture.away_score ?? 0,
        homeSubPenalties: 0,
        awaySubPenalties: 0
      };
    }

    const homePlayerGoals = matchups.reduce((sum, m) => sum + (m.home_goals ?? 0), 0);
    const awayPlayerGoals = matchups.reduce((sum, m) => sum + (m.away_goals ?? 0), 0);
    
    const homeSubPenalties = matchups.reduce((sum, m) => sum + (m.home_sub_penalty ?? 0), 0);
    const awaySubPenalties = matchups.reduce((sum, m) => sum + (m.away_sub_penalty ?? 0), 0);
    
    const homeTotalGoals = homePlayerGoals + awaySubPenalties + (fixture.home_penalty_goals ?? 0);
    const awayTotalGoals = awayPlayerGoals + homeSubPenalties + (fixture.away_penalty_goals ?? 0);

    return {
      home: homeTotalGoals,
      away: awayTotalGoals,
      homePlayerGoals,
      awayPlayerGoals,
      homeSubPenalties,
      awaySubPenalties
    };
  };

  const scores = calculateScores();
  const hasResults = fixture
    ? fixture.status === 'completed' ||
      fixture.status === 'in_progress' ||
      fixture.status === 'live' ||
      matchups.some(m => m.home_goals !== null && m.home_goals !== undefined)
    : false;

  if (isLoading) {
    return (
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-slate-500 font-mono text-xs">Loading Fixture Ledger...</p>
        </div>
      </div>
    );
  }

  if (error || !fixture) {
    return (
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm max-w-md mx-4 space-y-4">
          <Shield className="w-12 h-12 text-rose-500 mx-auto" />
          <h3 className="text-xl font-bold text-slate-900">Fixture Ledger Error</h3>
          <p className="text-sm text-slate-500 font-mono">{error || 'This fixture does not exist or has been removed.'}</p>
          <Link
            href="/fixtures"
            className="inline-flex items-center px-5 py-2.5 rounded-xl bg-slate-800 text-white font-mono font-bold text-xs hover:bg-slate-700 transition-colors"
          >
            BACK TO FIXTURES
          </Link>
        </div>
      </div>
    );
  }

  const winner = hasResults
    ? scores.home > scores.away
      ? 'home'
      : scores.away > scores.home
      ? 'away'
      : 'draw'
    : null;

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-6xl mx-auto relative z-10 space-y-6">
        
        {/* Back Button */}
        <Link
          href="/fixtures"
          className="inline-flex items-center text-xs font-mono font-bold text-slate-500 hover:text-amber-600 transition-colors"
        >
          {"<-"} BACK_TO_FIXTURES
        </Link>

        {/* Match Header Panel */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm text-center relative overflow-hidden">
          <div className="text-center mb-6">
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">
              Round {fixture.round_number} - {fixture.leg === 'first' ? '1st' : '2nd'} Leg
            </span>
            {fixture.scheduled_date && (
              <p className="text-xs text-slate-405 font-mono mt-1 select-none">
                {new Date(fixture.scheduled_date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                }).toUpperCase()}
              </p>
            )}
          </div>

          {/* Score Display Grid */}
          <div className="grid grid-cols-3 gap-4 sm:gap-8 items-center max-w-3xl mx-auto py-2">
            {/* Home Team */}
            <div className="text-right sm:pr-4">
              <h2 className={`text-xl sm:text-2xl font-black truncate ${winner === 'home' ? 'text-amber-600' : 'text-slate-900'}`}>
                {fixture.home_team_name}
              </h2>
            </div>

            {/* Score / Status */}
            <div className="text-center flex flex-col items-center justify-center">
              {hasResults ? (
                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-5 py-2.5 rounded-2xl select-none font-mono">
                  <span className={`text-3xl sm:text-4xl font-black ${winner === 'home' ? 'text-amber-600' : 'text-slate-800'}`}>
                    {scores.home}
                  </span>
                  <span className="text-slate-400 font-bold text-lg">:</span>
                  <span className={`text-3xl sm:text-4xl font-black ${winner === 'away' ? 'text-amber-600' : 'text-slate-800'}`}>
                    {scores.away}
                  </span>
                </div>
              ) : (
                <div className="px-5 py-2.5 bg-blue-50 border border-blue-200 text-blue-700 font-mono font-bold text-xs rounded-xl select-none uppercase tracking-wide">
                  {fixture.status === 'scheduled' || fixture.status === 'pending' ? 'UPCOMING' : fixture.status.toUpperCase()}
                </div>
              )}
            </div>

            {/* Away Team */}
            <div className="text-left sm:pl-4">
              <h2 className={`text-xl sm:text-2xl font-black truncate ${winner === 'away' ? 'text-amber-600' : 'text-slate-900'}`}>
                {fixture.away_team_name}
              </h2>
            </div>
          </div>

          {/* Winner announcement */}
          {hasResults && (
            <div className="mt-4 flex justify-center select-none font-mono text-[9px] font-bold">
              {winner === 'draw' ? (
                <span className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full">
                  MATCH ENDED IN A DRAW
                </span>
              ) : (
                <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full uppercase">
                  {winner === 'home' ? fixture.home_team_name : fixture.away_team_name} DECLARED VICTORIOUS
                </span>
              )}
            </div>
          )}

          {/* MOTM */}
          {hasResults && fixture.motm_player_name && (
            <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 font-mono text-xs">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500 inline align-middle" />
              <span className="font-bold text-slate-800 uppercase tracking-wide">
                Man of the Match: <span className="text-amber-600 font-black">{fixture.motm_player_name}</span>
              </span>
            </div>
          )}
        </div>

        {/* Matchups */}
        {matchups.length > 0 && (
          <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
            <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
              <Activity className="w-4 h-4 mr-2 text-amber-600" /> Matchups Ledger
            </h3>
            
            <div className="space-y-3">
              {matchups.map((matchup, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 border border-slate-200/40 rounded-xl p-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    {/* Home player */}
                    <div className="flex-1 text-right min-w-0 pr-2">
                      <p className="font-bold text-slate-900 text-sm truncate">
                        {matchup.home_player_name}
                      </p>
                      {matchup.home_substituted && (
                        <p className="text-[10px] text-amber-650 font-mono mt-0.5">
                          <Repeat className="w-3.5 h-3.5 text-slate-500 inline mr-1 align-text-bottom" /> SUB: {matchup.home_original_player_name}
                          {matchup.home_sub_penalty ? ` (-${matchup.home_sub_penalty} PTS)` : ''}
                        </p>
                      )}
                    </div>

                    {/* Score / VS Block */}
                    <div className="flex flex-col items-center justify-center px-4 font-mono select-none">
                      {hasResults ? (
                        <div className="text-center">
                          <span className="text-lg font-black text-slate-900 bg-white border border-slate-200 px-3 py-1 rounded-lg">
                            {matchup.home_goals ?? 0} - {matchup.away_goals ?? 0}
                          </span>
                          <span className="text-[8px] text-slate-400 block mt-1.5 font-bold uppercase tracking-wider">
                            {matchup.match_duration || 6} MIN
                          </span>
                        </div>
                      ) : (
                        <div className="text-center">
                          <span className="text-xs font-bold text-slate-400 bg-white border border-slate-200 px-3 py-1 rounded-lg">
                            VS
                          </span>
                          <span className="text-[8px] text-slate-400 block mt-1.5 font-bold uppercase tracking-wider">
                            {matchup.match_duration || 6} MIN
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Away player */}
                    <div className="flex-1 text-left min-w-0 pl-2">
                      <p className="font-bold text-slate-900 text-sm truncate">
                        {matchup.away_player_name}
                      </p>
                      {matchup.away_substituted && (
                        <p className="text-[10px] text-amber-655 font-mono mt-0.5">
                          <Repeat className="w-3.5 h-3.5 text-slate-500 inline mr-1 align-text-bottom" /> SUB: {matchup.away_original_player_name}
                          {matchup.away_sub_penalty ? ` (-${matchup.away_sub_penalty} PTS)` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Score Breakdown */}
        {hasResults && (
          <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
            <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
              <Shield className="w-4 h-4 mr-2 text-[#D4AF37]" /> Score Breakdown Ledger
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Home Team Breakdown */}
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-5 font-mono text-xs text-slate-700 space-y-3">
                <h4 className="text-sm font-extrabold text-slate-900 uppercase border-b border-slate-200/60 pb-2">
                  {fixture.home_team_name}
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 uppercase tracking-wide text-[9px]">Player Goals</span>
                    <span className="font-bold text-slate-800">{scores.homePlayerGoals}</span>
                  </div>
                  {scores.awaySubPenalties > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 uppercase tracking-wide text-[9px]">Opponent Sub Penalties</span>
                      <span className="font-bold text-emerald-600">+{scores.awaySubPenalties}</span>
                    </div>
                  )}
                  {(fixture.home_penalty_goals ?? 0) > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 uppercase tracking-wide text-[9px]">Fine/Violation Goals</span>
                      <span className="font-bold text-emerald-600">+{fixture.home_penalty_goals}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2.5 border-t border-slate-200">
                    <span className="font-bold text-slate-900 uppercase tracking-wider text-[10px]">Total Score</span>
                    <span className="font-black text-xl text-slate-900">{scores.home}</span>
                  </div>
                </div>
              </div>

              {/* Away Team Breakdown */}
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-5 font-mono text-xs text-slate-700 space-y-3">
                <h4 className="text-sm font-extrabold text-slate-900 uppercase border-b border-slate-200/60 pb-2">
                  {fixture.away_team_name}
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 uppercase tracking-wide text-[9px]">Player Goals</span>
                    <span className="font-bold text-slate-800">{scores.awayPlayerGoals}</span>
                  </div>
                  {scores.homeSubPenalties > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 uppercase tracking-wide text-[9px]">Opponent Sub Penalties</span>
                      <span className="font-bold text-emerald-600">+{scores.homeSubPenalties}</span>
                    </div>
                  )}
                  {(fixture.away_penalty_goals ?? 0) > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 uppercase tracking-wide text-[9px]">Fine/Violation Goals</span>
                      <span className="font-bold text-emerald-600">+{fixture.away_penalty_goals}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2.5 border-t border-slate-200">
                    <span className="font-bold text-slate-900 uppercase tracking-wider text-[10px]">Total Score</span>
                    <span className="font-black text-xl text-slate-900">{scores.away}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* No Matchups Message */}
        {matchups.length === 0 && (
          <div className="bg-white border border-slate-200/60 rounded-2xl p-12 text-center shadow-sm">
            <Shield className="w-12 h-12 text-slate-350 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">No Matchups Yet</h3>
            <p className="text-xs text-slate-400 font-mono uppercase">
              Matchups for this fixture haven't been set up yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
