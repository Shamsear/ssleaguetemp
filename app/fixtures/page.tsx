'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Activity, Shield } from 'lucide-react';

interface Fixture {
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
  scheduled_date?: string;
  leg: string;
  season_id: string;
  tournament_id: string;
  motm_player_name?: string;
}

interface Season {
  id: string;
  name: string;
  status: string;
}

function FixturesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab') || searchParams.get('filter');
  
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [seasonName, setSeasonName] = useState('');
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'live' | 'results'>('upcoming');

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

      // Get active season
      const seasonsRef = collection(db, 'seasons');
      const seasonsQuery = query(
        seasonsRef,
        where('isActive', '==', true),
        orderBy('created_at', 'desc'),
        limit(1)
      );
      const seasonsSnapshot = await getDocs(seasonsQuery);

      if (seasonsSnapshot.empty) {
        console.log('No active season found');
        setIsLoading(false);
        return;
      }

      const seasonDoc = seasonsSnapshot.docs[0];
      const seasonData = seasonDoc.data();
      const seasonId = seasonDoc.id;
      setSeasonName(seasonData.name || seasonData.short_name || 'Current Season');

      // Fetch fixtures from Neon API
      const response = await fetch(`/api/fixtures/season?season_id=${seasonId}`);
      if (!response.ok) {
        console.error('Failed to fetch fixtures');
        setIsLoading(false);
        return;
      }

      const { fixtures: fixturesList } = await response.json();
      setFixtures(fixturesList);
    } catch (error) {
      console.error('Error fetching fixtures:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getFilteredFixtures = () => {
    let list = [...fixtures];
    if (filter === 'upcoming') {
      list = list.filter(f => f.status === 'scheduled' || f.status === 'pending');
      list.sort((a, b) => {
        if (a.round_number !== b.round_number) return a.round_number - b.round_number;
        return a.match_number - b.match_number;
      });
    } else if (filter === 'live') {
      list = list.filter(f => f.status === 'in_progress' || f.status === 'live');
      list.sort((a, b) => {
        if (a.round_number !== b.round_number) return a.round_number - b.round_number;
        return a.match_number - b.match_number;
      });
    } else if (filter === 'results') {
      list = list.filter(f => f.status === 'completed');
      // Show latest results first
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="px-2 py-0.5 text-[8px] font-mono font-bold rounded bg-emerald-50 border border-emerald-200 text-emerald-700 uppercase tracking-wide">Completed</span>;
      case 'in_progress':
      case 'live':
        return <span className="px-2 py-0.5 text-[8px] font-mono font-bold rounded bg-red-50 border border-red-250 text-red-605 animate-pulse uppercase tracking-wide">Live</span>;
      case 'scheduled':
      case 'pending':
        return <span className="px-2 py-0.5 text-[8px] font-mono font-bold rounded bg-blue-50 border border-blue-200 text-blue-700 uppercase tracking-wide">Upcoming</span>;
      default:
        return <span className="px-2 py-0.5 text-[8px] font-mono font-bold rounded bg-slate-50 border border-slate-200 text-slate-500 uppercase tracking-wide">{status}</span>;
    }
  };

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-8">
        
        {/* Navigation back */}
        <Link
          href="/"
          className="inline-flex items-center text-xs font-mono font-bold text-slate-500 hover:text-amber-600 transition-colors"
        >
          ← BACK_TO_HOME
        </Link>

        {/* Header Title Panel */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">League Schedule</span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              {seasonName ? `${seasonName} Matches` : 'Match Fixtures'}
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-1">
              {seasonName ? `${seasonName.toUpperCase()} TIMELINE:` : 'LEAGUE TIMELINE:'} <span className="text-amber-600 font-bold">{filteredFixtures.length}</span> {filter.toUpperCase()} MATCHES
            </p>
          </div>
          
          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setFilter('upcoming');
                router.push('/fixtures?tab=upcoming');
              }}
              className={`px-4 py-2.5 rounded-xl font-mono font-bold text-xs transition-all cursor-pointer ${
                filter === 'upcoming'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                  : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm'
              }`}
            >
              UPCOMING
            </button>
            <button
              onClick={() => {
                setFilter('live');
                router.push('/fixtures?tab=live');
              }}
              className={`px-4 py-2.5 rounded-xl font-mono font-bold text-xs transition-all cursor-pointer ${
                filter === 'live'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/10 animate-pulse'
                  : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm'
              }`}
            >
              LIVE
            </button>
            <button
              onClick={() => {
                setFilter('results');
                router.push('/fixtures?tab=results');
              }}
              className={`px-4 py-2.5 rounded-xl font-mono font-bold text-xs transition-all cursor-pointer ${
                filter === 'results'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10'
                  : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm'
              }`}
            >
              RESULTS
            </button>
            <button
              onClick={() => {
                setFilter('all');
                router.push('/fixtures?tab=all');
              }}
              className={`px-4 py-2.5 rounded-xl font-mono font-bold text-xs transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-slate-800 text-white shadow-md shadow-slate-800/10'
                  : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm'
              }`}
            >
              ALL
            </button>
          </div>
        </div>

        {/* Fixtures List */}
        {filteredFixtures.length === 0 ? (
          <div className="bg-white border border-slate-200/60 rounded-2xl p-12 text-center shadow-sm">
            <Shield className="w-12 h-12 text-slate-350 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">No Matches Found</h3>
            <p className="text-xs text-slate-400 font-mono uppercase">
              {filter === 'upcoming' ? 'No upcoming matches at the moment.' : 
               filter === 'live' ? 'No live matches right now.' : 
               filter === 'results' ? 'No completed match results recorded.' :
               'No matches available for this season.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Group by round */}
            {Object.entries(
              filteredFixtures.reduce((acc, fixture) => {
                const roundKey = `Round ${fixture.round_number} - ${fixture.leg === 'first' ? '1st' : '2nd'} Leg`;
                if (!acc[roundKey]) {
                  acc[roundKey] = [];
                }
                acc[roundKey].push(fixture);
                return acc;
              }, {} as Record<string, Fixture[]>)
            ).map(([roundName, roundFixtures]) => (
              <div key={roundName} className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm space-y-4">
                <h2 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
                  <Activity className="w-4 h-4 mr-2 text-amber-600" /> {roundName}
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {roundFixtures.map((fixture) => {
                    const winner = fixture.status === 'completed'
                      ? (fixture.home_score ?? 0) > (fixture.away_score ?? 0)
                        ? 'home'
                        : (fixture.away_score ?? 0) > (fixture.home_score ?? 0)
                          ? 'away'
                          : 'draw'
                      : null;

                    return (
                      <Link
                        key={fixture.id}
                        href={`/fixtures/${fixture.id}`}
                        className="block group"
                      >
                        <div className="console-card rounded-xl p-4 hover:border-amber-400/40 transition-all duration-250 bg-white border border-slate-200/60 shadow-sm flex flex-col justify-between">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 flex items-center justify-between gap-2">
                              {/* Home Team */}
                              <div className="flex-1 text-right min-w-0 pr-2">
                                <p className={`font-bold truncate text-sm transition-colors ${
                                  winner === 'home' ? 'text-amber-600 font-extrabold' : 'text-slate-900 group-hover:text-amber-600'
                                }`}>
                                  {fixture.home_team_name}
                                </p>
                              </div>
                              
                              {/* Score / VS Box */}
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-xs select-none">
                                {fixture.status === 'completed' ? (
                                  <span className={`px-1 ${winner === 'home' ? 'text-amber-600 font-black' : 'text-slate-800'}`}>
                                    {fixture.home_score ?? 0}
                                  </span>
                                ) : null}
                                <span className="text-slate-400 text-[10px]">VS</span>
                                {fixture.status === 'completed' ? (
                                  <span className={`px-1 ${winner === 'away' ? 'text-amber-600 font-black' : 'text-slate-800'}`}>
                                    {fixture.away_score ?? 0}
                                  </span>
                                ) : null}
                              </div>
                              
                              {/* Away Team */}
                              <div className="flex-1 text-left min-w-0 pl-2">
                                <p className={`font-bold truncate text-sm transition-colors ${
                                  winner === 'away' ? 'text-amber-600 font-extrabold' : 'text-slate-900 group-hover:text-amber-600'
                                }`}>
                                  {fixture.away_team_name}
                                </p>
                              </div>
                            </div>
                            
                            {/* Status tag */}
                            <div className="flex flex-col items-end gap-1.5 select-none pl-3 border-l border-slate-100">
                              {getStatusBadge(fixture.status)}
                              {fixture.scheduled_date && (
                                <span className="text-[9px] text-slate-400 font-mono">
                                  {new Date(fixture.scheduled_date).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* MOTM Award */}
                          {fixture.status === 'completed' && fixture.motm_player_name && (
                            <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-center gap-1.5 font-mono text-[9px] text-slate-500 select-none">
                              <span className="text-amber-500">★</span>
                              <span>MOTM: <span className="font-extrabold text-slate-700">{fixture.motm_player_name}</span></span>
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

export default function PublicFixturesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-slate-500 font-mono text-xs">Loading Fixtures Room...</p>
        </div>
      </div>
    }>
      <FixturesContent />
    </Suspense>
  );
}
