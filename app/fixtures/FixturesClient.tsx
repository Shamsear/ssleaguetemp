'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Activity, Shield, Star, Calendar, ChevronRight, Zap } from 'lucide-react';

interface Fixture {
  id: string;
  round_number: number;
  match_number: number;
  home_team_id: string;
  home_team_name: string;
  home_team_logo?: string;
  away_team_id: string;
  away_team_name: string;
  away_team_logo?: string;
  home_score?: number;
  away_score?: number;
  status: string;
  scheduled_date?: string;
  leg: string;
  season_id: string;
  tournament_id: string;
  motm_player_name?: string;
}

interface FixturesClientProps {
  isTeamView?: boolean;
}

function TeamLogo({ logoUrl, teamName, size = 40 }: { logoUrl?: string; teamName: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const cleanName = (teamName || '').toUpperCase();
  const initial = cleanName.charAt(0) || 'T';

  if (logoUrl && !imgError) {
    return (
      <div 
        style={{ width: size, height: size }} 
        className="relative rounded-full border-2 border-slate-200/80 bg-white p-0.5 shadow-sm overflow-hidden flex-shrink-0 flex items-center justify-center group-hover:scale-105 transition-transform"
      >
        <img
          src={logoUrl}
          alt={cleanName}
          onError={() => setImgError(true)}
          className="w-full h-full object-contain rounded-full"
        />
      </div>
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full border-2 border-slate-300/80 bg-gradient-to-br from-slate-800 to-slate-900 text-amber-400 font-extrabold flex items-center justify-center shadow-sm flex-shrink-0 font-mono text-xs group-hover:scale-105 transition-transform"
    >
      {initial}
    </div>
  );
}

function FixturesContent({ isTeamView = false }: FixturesClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab') || searchParams.get('filter');
  
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [seasonName, setSeasonName] = useState('');
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'live' | 'results'>('all');

  useEffect(() => {
    fetchFixtures();
  }, []);

  useEffect(() => {
    if (tabParam === 'upcoming' || tabParam === 'live' || tabParam === 'results' || tabParam === 'all') {
      setFilter(tabParam);
    }
  }, [tabParam]);

  const fetchFixtures = async () => {
    try {
      setIsLoading(true);

      const seasonRes = await fetch('/api/seasons/current');
      let seasonId = '';
      let sName = '';

      if (seasonRes.ok) {
        const seasonData = await seasonRes.json();
        seasonId = seasonData.season?.season_id || seasonData.season?.id || '';
        sName = seasonData.season?.name || (seasonId ? seasonId.replace('SSPSLS', 'Season ') : '');
      }

      if (!seasonId) {
        seasonId = 'SSPSLS18';
        sName = 'Season 18';
      }

      setSeasonName(sName);

      const [fixturesRes, teamSeasonsRes] = await Promise.all([
        fetch(`/api/fixtures/season?season_id=${seasonId}`),
        fetch(`/api/cached/firebase/team-seasons?seasonId=${seasonId}`).catch(() => null)
      ]);

      if (!fixturesRes.ok) {
        console.error('Failed to fetch fixtures');
        setIsLoading(false);
        return;
      }

      const data = await fixturesRes.json();
      let fixturesList: Fixture[] = data.fixtures || data.data || [];

      if (teamSeasonsRes && teamSeasonsRes.ok) {
        try {
          const tsData = await teamSeasonsRes.json();
          const tsList = tsData.teamSeasons || tsData.data || (Array.isArray(tsData) ? tsData : []);
          const logoMap = new Map<string, string>();

          tsList.forEach((ts: any) => {
            const logo = ts.team_logo || ts.logo_url || ts.logoUrl;
            if (logo) {
              if (ts.team_id) logoMap.set(ts.team_id, logo);
              if (ts.team_name) logoMap.set(ts.team_name.toLowerCase(), logo);
            }
          });

          fixturesList = fixturesList.map(f => ({
            ...f,
            home_team_logo: logoMap.get(f.home_team_id) || (f.home_team_name ? logoMap.get(f.home_team_name.toLowerCase()) : undefined),
            away_team_logo: logoMap.get(f.away_team_id) || (f.away_team_name ? logoMap.get(f.away_team_name.toLowerCase()) : undefined),
          }));
        } catch (logoErr) {
          console.log('Optional logo enrichment error:', logoErr);
        }
      }

      setFixtures(fixturesList);
    } catch (error) {
      console.error('Error fetching fixtures:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isFixtureCompleted = (f: Fixture) => {
    return f.status === 'completed' || f.status === 'finalized';
  };

  const isFixtureLive = (f: Fixture) => {
    return f.status === 'in_progress' || f.status === 'live' || f.status === 'active' || f.status === 'home_fixture' || f.status === 'fixture_entry' || f.status === 'result_entry';
  };

  const getFilteredFixtures = () => {
    let list = [...fixtures];
    if (filter === 'upcoming') {
      list = list.filter(f => !isFixtureCompleted(f) && !isFixtureLive(f));
      list.sort((a, b) => {
        if (a.round_number !== b.round_number) return a.round_number - b.round_number;
        return a.match_number - b.match_number;
      });
    } else if (filter === 'live') {
      list = list.filter(f => isFixtureLive(f));
      list.sort((a, b) => {
        if (a.round_number !== b.round_number) return a.round_number - b.round_number;
        return a.match_number - b.match_number;
      });
    } else if (filter === 'results') {
      list = list.filter(f => isFixtureCompleted(f));
      list.sort((a, b) => {
        if (b.round_number !== a.round_number) return b.round_number - a.round_number;
        return b.match_number - a.match_number;
      });
    } else {
      list.sort((a, b) => {
        if (a.round_number !== b.round_number) return a.round_number - b.round_number;
        return a.match_number - b.match_number;
      });
    }
    return list;
  };

  const filteredFixtures = getFilteredFixtures();

  const getStatusBadge = (fixture: Fixture) => {
    if (isFixtureCompleted(fixture)) {
      return (
        <span className="px-2.5 py-1 text-[9px] font-mono font-bold rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-700 uppercase tracking-wide shadow-2xs">
          Completed
        </span>
      );
    }
    if (isFixtureLive(fixture)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-mono font-bold rounded-lg bg-rose-50 border border-rose-200 text-rose-600 uppercase tracking-wide shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
          Live
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 text-[9px] font-mono font-bold rounded-lg bg-blue-50 border border-blue-200/80 text-blue-700 uppercase tracking-wide shadow-2xs">
        Upcoming
      </span>
    );
  };

  const liveCount = fixtures.filter(f => isFixtureLive(f)).length;
  const completedCount = fixtures.filter(f => isFixtureCompleted(f)).length;
  const upcomingCount = fixtures.filter(f => !isFixtureCompleted(f) && !isFixtureLive(f)).length;

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-4 sm:pt-6 lg:pt-20 pb-12 px-3 sm:px-6 font-mono">
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 via-blue-500/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-6 sm:space-y-8">
        
        <Link
          href={isTeamView ? "/dashboard/team" : "/"}
          className="inline-flex items-center text-xs font-bold text-slate-500 hover:text-amber-600 transition-colors"
        >
          {"<-"} {isTeamView ? "BACK_TO_DASHBOARD" : "BACK_TO_HOME"}
        </Link>

        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200/80 rounded-full text-amber-700 text-[10px] font-bold uppercase tracking-wider mb-2">
                <Zap className="w-3 h-3 text-amber-600 fill-amber-500" />
                <span>LEAGUE MATCH SCHEDULE</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                {seasonName ? seasonName.toUpperCase() : 'SEASON 18'} FIXTURES
              </h1>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">
                Official Season Match Schedule & Live Results
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2 w-full md:w-auto">
              <div className="p-2.5 sm:p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-center min-w-[70px]">
                <p className="text-[9px] font-bold text-slate-400 uppercase">ALL</p>
                <p className="text-base sm:text-lg font-black text-slate-900">{fixtures.length}</p>
              </div>
              <div className="p-2.5 sm:p-3 bg-rose-50/60 border border-rose-200/80 rounded-2xl text-center min-w-[70px]">
                <p className="text-[9px] font-bold text-rose-500 uppercase flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  LIVE
                </p>
                <p className="text-base sm:text-lg font-black text-rose-700">{liveCount}</p>
              </div>
              <div className="p-2.5 sm:p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl text-center min-w-[70px]">
                <p className="text-[9px] font-bold text-emerald-600 uppercase">DONE</p>
                <p className="text-base sm:text-lg font-black text-emerald-700">{completedCount}</p>
              </div>
              <div className="p-2.5 sm:p-3 bg-blue-50/60 border border-blue-200/80 rounded-2xl text-center min-w-[70px]">
                <p className="text-[9px] font-bold text-blue-600 uppercase">UPCOMING</p>
                <p className="text-base sm:text-lg font-black text-blue-700">{upcomingCount}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <button
                onClick={() => {
                  setFilter('all');
                  const basePath = isTeamView ? '/dashboard/team/fixtures' : '/fixtures';
                  router.push(`${basePath}?tab=all`);
                }}
                className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-2xs ${
                  filter === 'all'
                    ? 'bg-slate-900 text-white border border-slate-900'
                    : 'bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700'
                }`}
              >
                ALL ({fixtures.length})
              </button>
              <button
                onClick={() => {
                  setFilter('live');
                  const basePath = isTeamView ? '/dashboard/team/fixtures' : '/fixtures';
                  router.push(`${basePath}?tab=live`);
                }}
                className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-2xs ${
                  filter === 'live'
                    ? 'bg-rose-600 text-white border border-rose-600 shadow-md shadow-rose-600/20'
                    : 'bg-slate-50 border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-700'
                }`}
              >
                LIVE ({liveCount})
              </button>
              <button
                onClick={() => {
                  setFilter('upcoming');
                  const basePath = isTeamView ? '/dashboard/team/fixtures' : '/fixtures';
                  router.push(`${basePath}?tab=upcoming`);
                }}
                className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-2xs ${
                  filter === 'upcoming'
                    ? 'bg-blue-600 text-white border border-blue-600 shadow-md shadow-blue-600/20'
                    : 'bg-slate-50 border border-slate-200 hover:bg-blue-50 hover:text-blue-600 text-slate-700'
                }`}
              >
                UPCOMING ({upcomingCount})
              </button>
              <button
                onClick={() => {
                  setFilter('results');
                  const basePath = isTeamView ? '/dashboard/team/fixtures' : '/fixtures';
                  router.push(`${basePath}?tab=results`);
                }}
                className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-2xs ${
                  filter === 'results'
                    ? 'bg-emerald-600 text-white border border-emerald-600 shadow-md shadow-emerald-600/20'
                    : 'bg-slate-50 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-600 text-slate-700'
                }`}
              >
                RESULTS ({completedCount})
              </button>
            </div>

            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:block">
              SHOWING <span className="text-slate-900 font-extrabold">{filteredFixtures.length}</span> MATCHES
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center shadow-sm space-y-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600 mx-auto"></div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Loading Schedule...</p>
          </div>
        ) : filteredFixtures.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center shadow-sm space-y-3">
            <Shield className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-lg font-extrabold text-slate-900">No Matches Found</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
              {filter === 'upcoming' ? 'No upcoming matches at the moment.' : 
               filter === 'live' ? 'No live matches right now.' : 
               filter === 'results' ? 'No completed match results recorded.' :
               'No matches available for this season.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6 sm:space-y-8">
            {Object.entries(
              filteredFixtures.reduce((acc, fixture) => {
                const roundKey = `ROUND ${fixture.round_number} - ${fixture.leg === 'first' ? '1ST' : '2ND'} LEG`;
                if (!acc[roundKey]) {
                  acc[roundKey] = [];
                }
                acc[roundKey].push(fixture);
                return acc;
              }, {} as Record<string, Fixture[]>)
            ).map(([roundName, roundFixtures]) => (
              <div key={roundName} className="bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-slate-900 text-amber-400 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs">
                      <Activity className="w-4 h-4" />
                    </div>
                    <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-wider">
                      {roundName}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 uppercase">
                    {roundFixtures.length} Matches
                  </span>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4">
                  {roundFixtures.map((fixture) => {
                    const isCompleted = isFixtureCompleted(fixture) || (fixture.home_score !== null && fixture.away_score !== null && fixture.home_score !== undefined && fixture.away_score !== undefined);
                    const homeGoals = fixture.home_score ?? 0;
                    const awayGoals = fixture.away_score ?? 0;
                    const winner = isCompleted
                      ? homeGoals > awayGoals
                        ? 'home'
                        : awayGoals > homeGoals
                          ? 'away'
                          : 'draw'
                      : null;

                    const homeName = (fixture.home_team_name || 'HOME TEAM').toUpperCase();
                    const awayName = (fixture.away_team_name || 'AWAY TEAM').toUpperCase();

                    return (
                      <Link
                        key={fixture.id}
                        href={`/dashboard/team/fixture/${fixture.id}`}
                        className="block group"
                      >
                        <div className="bg-white border-2 border-slate-200/80 hover:border-amber-400/80 rounded-2xl p-3.5 sm:p-4 shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col justify-between gap-3">
                          
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                            <span className="text-slate-700 font-extrabold">MATCH #{fixture.match_number}</span>
                            <div className="flex items-center gap-2">
                              {fixture.scheduled_date && (
                                <span className="flex items-center gap-1 text-slate-400">
                                  <Calendar className="w-3 h-3" />
                                  {new Date(fixture.scheduled_date).toLocaleDateString()}
                                </span>
                              )}
                              {getStatusBadge(fixture)}
                            </div>
                          </div>

                          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3 items-center">
                            
                            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                              <TeamLogo
                                logoUrl={fixture.home_team_logo}
                                teamName={homeName}
                                size={38}
                              />
                              <span className={`font-extrabold text-xs sm:text-sm leading-tight transition-colors break-words ${
                                winner === 'home' ? 'text-amber-600 font-black' : 'text-slate-900 group-hover:text-amber-600'
                              }`}>
                                {homeName}
                              </span>
                            </div>

                            <div className="flex items-center justify-center">
                              {isCompleted ? (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-xl font-black text-sm sm:text-base shadow-xs">
                                  <span className={winner === 'home' ? 'text-amber-400' : 'text-slate-200'}>
                                    {homeGoals}
                                  </span>
                                  <span className="text-slate-500 text-xs">-</span>
                                  <span className={winner === 'away' ? 'text-amber-400' : 'text-slate-200'}>
                                    {awayGoals}
                                  </span>
                                </div>
                              ) : (
                                <div className="px-3 py-1.5 bg-slate-100 border border-slate-200/80 rounded-xl font-black text-xs text-amber-600 tracking-wider shadow-2xs">
                                  VS
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 sm:gap-2.5 justify-end text-right min-w-0">
                              <span className={`font-extrabold text-xs sm:text-sm leading-tight transition-colors break-words ${
                                winner === 'away' ? 'text-amber-600 font-black' : 'text-slate-900 group-hover:text-amber-600'
                              }`}>
                                {awayName}
                              </span>
                              <TeamLogo
                                logoUrl={fixture.away_team_logo}
                                teamName={awayName}
                                size={38}
                              />
                            </div>
                          </div>

                          {fixture.status === 'completed' && fixture.motm_player_name && (
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                              <span className="flex items-center gap-1.5 font-bold text-amber-600">
                                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                MOTM: <span className="text-slate-800 font-extrabold">{fixture.motm_player_name.toUpperCase()}</span>
                              </span>
                              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" />
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FixturesClient({ isTeamView = false }: FixturesClientProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen console-bg flex items-center justify-center font-mono">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-slate-500 font-bold text-xs uppercase tracking-wider">Loading Schedule...</p>
        </div>
      </div>
    }>
      <FixturesContent isTeamView={isTeamView} />
    </Suspense>
  );
}
