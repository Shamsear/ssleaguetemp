'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import PlayerImage from '@/components/PlayerImage';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

interface TeamProfile {
  id: string;
  name: string;
  logoUrl?: string;
  budget: number;
  totalSpent: number;
  playersCount: number;
  positionCounts: { [key: string]: number };
  averageRating: number;
  isAutoRegistered?: boolean;
  skippedSeasons?: number;
  penaltyAmount?: number;
  // Dual currency fields
  currencySystem?: string;
  footballBudget?: number;
  realPlayerBudget?: number;
  footballSpent?: number;
  realPlayerSpent?: number;
}

interface PlayerData {
  id: string;
  name: string;
  position: string;
  rating: number;
  purchasePrice: number;
  imageUrl?: string;
}

interface FixtureData {
  id: string;
  round_number?: number;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  home_score?: number;
  away_score?: number;
  status: string;
  scheduled_date?: any;
}

interface StandingsData {
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export default function TeamSquadPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const unwrappedParams = use(params);
  const teamId = unwrappedParams.teamId;
  const [teamProfile, setTeamProfile] = useState<TeamProfile | null>(null);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [fixtures, setFixtures] = useState<FixtureData[]>([]);
  const [standings, setStandings] = useState<StandingsData | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [seasonName, setSeasonName] = useState('');
  const [seasonType, setSeasonType] = useState<'single' | 'multi'>('single');
  const [activeTab, setActiveTab] = useState<'squad' | 'fixtures' | 'stats'>('squad');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Get active season
  useEffect(() => {
    const fetchActiveSeason = async () => {
      if (!user || user.role !== 'team') return;

      try {
        const seasonsQuery = query(collection(db, 'seasons'));
        const seasonsSnapshot = await getDocs(seasonsQuery);
        
        let targetSeasonId = null;
        let targetSeasonName = '';
        let targetSeasonType: 'single' | 'multi' = 'single';
        
        // Find first non-completed season
        for (const docSnap of seasonsSnapshot.docs) {
          const data = docSnap.data();
          if (data.status !== 'completed') {
            targetSeasonId = docSnap.id;
            targetSeasonName = data.name || `Season ${data.season_number || 'Unknown'}`;
            targetSeasonType = data.type || 'single';
            break;
          }
        }

        if (!targetSeasonId && seasonsSnapshot.size > 0) {
          const firstDoc = seasonsSnapshot.docs[0];
          targetSeasonId = firstDoc.id;
          const data = firstDoc.data();
          targetSeasonName = data.name || 'Season';
          targetSeasonType = data.type || 'single';
        }

        if (!targetSeasonId) {
          setError('No active season found');
          setIsLoading(false);
          return;
        }

        setSeasonId(targetSeasonId);
        setSeasonName(targetSeasonName);
        setSeasonType(targetSeasonType);
      } catch (error) {
        console.error('Error fetching active season:', error);
        setError('Failed to load active season');
        setIsLoading(false);
      }
    };

    fetchActiveSeason();
  }, [user]);

  // Fetch team profile and data
  useEffect(() => {
    const fetchTeamData = async () => {
      if (!seasonId || !teamId) return;

      try {
        setIsLoading(true);

        // Fetch team_season data
        const teamSeasonId = `${teamId}_${seasonId}`;
        const teamSeasonRef = doc(db, 'team_seasons', teamSeasonId);
        const teamSeasonDoc = await getDoc(teamSeasonRef);

        if (!teamSeasonDoc.exists()) {
          setError('Team not found in this season');
          setIsLoading(false);
          return;
        }

        const teamSeasonData = teamSeasonDoc.data();

        setTeamProfile({
          id: teamId,
          name: teamSeasonData.team_name || 'Unknown Team',
          logoUrl: teamSeasonData.team_logo,
          budget: teamSeasonData.budget || 0,
          totalSpent: teamSeasonData.total_spent || 0,
          playersCount: teamSeasonData.players_count || 0,
          positionCounts: teamSeasonData.position_counts || {},
          averageRating: teamSeasonData.average_rating || 0,
          // Dual currency fields
          currencySystem: teamSeasonData.currency_system || 'dual',
          footballBudget: teamSeasonData.football_budget || 0,
          realPlayerBudget: teamSeasonData.real_player_budget || 0,
          footballSpent: teamSeasonData.football_spent || 0,
          realPlayerSpent: teamSeasonData.real_player_spent || 0,
        });

        // Fetch players, fixtures, and standings from API
        const [playersRes, fixturesRes, standingsRes] = await Promise.all([
          fetch(`/api/team/${teamId}/players?seasonId=${seasonId}`),
          fetch(`/api/team/${teamId}/fixtures?season_id=${seasonId}&limit=50`),
          fetch(`/api/team/${teamId}/standings?season_id=${seasonId}`)
        ]);

        if (playersRes.ok) {
          const playersData = await playersRes.json();
          setPlayers(playersData.data || []);
          
          // Update balance from API if available (Neon is source of truth after finalization)
          if (playersData.balance) {
            setTeamProfile(prev => prev ? {
              ...prev,
              // Update football budget from Neon (source of truth)
              footballBudget: playersData.balance.football_budget || prev.footballBudget,
              footballSpent: playersData.balance.football_spent || prev.footballSpent,
              // Keep legacy fields for backward compatibility
              budget: playersData.balance.football_budget || prev.budget,
              totalSpent: playersData.balance.football_spent || prev.totalSpent,
              playersCount: (playersData.footballplayers?.length || 0) + (playersData.realplayers?.length || 0),
              // Real player budget comes from Firebase team_seasons, not Neon
            } : null);
          }
        }

        if (fixturesRes.ok) {
          const fixturesData = await fixturesRes.json();
          if (fixturesData.success && fixturesData.fixtures) {
            setFixtures(fixturesData.fixtures || []);
          }
        } else {
          console.error('Failed to fetch fixtures:', fixturesRes.status);
        }

        if (standingsRes.ok) {
          const standingsData = await standingsRes.json();
          if (standingsData.success && standingsData.standings) {
            setStandings(standingsData.standings);
          }
        } else {
          console.error('Failed to fetch standings:', standingsRes.status);
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching team data:', error);
        setError('Failed to load team data');
        setIsLoading(false);
      }
    };

    fetchTeamData();
  }, [seasonId, teamId]);

  const getPositionColor = (position: string) => {
    const colors: { [key: string]: string } = {
      GK: 'bg-amber-50 text-amber-700 border border-amber-200/40',
      CB: 'bg-rose-50 text-rose-700 border border-rose-200/40',
      LB: 'bg-rose-50/60 text-rose-700 border border-rose-200/30',
      RB: 'bg-rose-50/60 text-rose-700 border border-rose-200/30',
      DMF: 'bg-indigo-50 text-indigo-700 border border-indigo-200/40',
      CMF: 'bg-sky-50 text-sky-700 border border-sky-200/40',
      AMF: 'bg-violet-50 text-violet-700 border border-violet-200/40',
      LMF: 'bg-sky-50/60 text-sky-700 border border-sky-200/30',
      RMF: 'bg-sky-50/60 text-sky-700 border border-sky-200/30',
      LWF: 'bg-emerald-50/60 text-emerald-700 border border-emerald-200/30',
      RWF: 'bg-emerald-50/60 text-emerald-700 border border-emerald-200/30',
      SS: 'bg-emerald-50 text-emerald-700 border border-emerald-200/40',
      CF: 'bg-emerald-50 text-emerald-700 border border-emerald-200/40',
    };
    return colors[position] || 'bg-slate-50 text-slate-700 border border-slate-200/40';
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Squad...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team') {
    return null;
  }

  if (error || !teamProfile) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-8 max-w-md w-full mx-auto text-center relative z-10 font-mono">
          <div className="text-rose-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-2">Team Not Found</h2>
          <p className="text-xs text-slate-500 uppercase font-semibold mb-6">{error || 'This team does not exist in the current season'}</p>
          <Link 
            href="/dashboard/team/all-teams" 
            className="inline-flex items-center justify-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl text-xs uppercase tracking-wider font-bold transition-all shadow-sm w-full"
          >
            Back to All Teams
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Header */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap font-mono">
            <Link 
              href="/dashboard/team/all-teams" 
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-bold"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to All Teams</span>
            </Link>
            <span className="text-xs text-slate-500 uppercase font-semibold">
              Season: <span className="font-extrabold text-amber-500">{seasonName}</span>
            </span>
          </div>

          {/* Team Header */}
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="h-20 w-20 flex-shrink-0 bg-slate-50 border border-slate-200/60 rounded-xl flex items-center justify-center p-2 relative overflow-hidden shadow-inner mx-auto md:mx-0">
              {teamProfile.logoUrl ? (
                <Image 
                  src={teamProfile.logoUrl} 
                  alt={teamProfile.name} 
                  width={80}
                  height={80}
                  className="object-contain w-full h-full"
                />
              ) : (
                <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              )}
            </div>
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 uppercase tracking-wider font-mono mb-2">{teamProfile.name}</h1>
              
              {/* Currencies Grid in Team Header */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4 text-[10px] uppercase font-bold tracking-wider font-mono text-left">
                {standings && (
                  <div className="bg-amber-50/60 border border-amber-200/50 p-2.5 rounded-xl flex flex-col justify-between">
                    <span className="text-amber-600 text-[8px] mb-1">League Standing</span>
                    <span className="text-amber-800 font-extrabold text-xs">
                      #{standings.position} in League
                    </span>
                  </div>
                )}
                
                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between">
                  <span className="text-slate-400 text-[8px] mb-1">Squad Players</span>
                  <span className="text-slate-700 font-extrabold text-xs">
                    ⚽ {players.filter((p: any) => p.type === 'footballplayer').length} + 👤 {players.filter((p: any) => p.type === 'realplayer').length}
                  </span>
                </div>

                {seasonType === 'multi' || teamProfile.currencySystem === 'dual' ? (
                  <>
                    <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-400 text-[8px] mb-1">eCoin Spent</span>
                      <span className="text-blue-600 font-extrabold text-xs">
                        {(teamProfile.footballSpent || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-400 text-[8px] mb-1">SSCoin Spent</span>
                      <span className="text-purple-600 font-extrabold text-xs">
                        {(teamProfile.realPlayerSpent || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-400 text-[8px] mb-1">eCoin Left</span>
                      <span className="text-indigo-600 font-extrabold text-xs">
                        {(teamProfile.footballBudget || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-400 text-[8px] mb-1">SSCoin Left</span>
                      <span className="text-amber-600 font-extrabold text-xs">
                        {(teamProfile.realPlayerBudget || 0).toLocaleString()}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-400 text-[8px] mb-1">Spent</span>
                      <span className="text-emerald-600 font-extrabold text-xs">
                        {teamProfile.totalSpent.toLocaleString()}
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-400 text-[8px] mb-1">Left</span>
                      <span className="text-amber-600 font-extrabold text-xs">
                        {teamProfile.budget.toLocaleString()}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1.5 bg-slate-100/80 border border-slate-200/60 rounded-2xl shadow-inner font-mono">
          <button
            onClick={() => setActiveTab('squad')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === 'squad'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-700'
            }`}
          >
            Squad ({players.length})
          </button>
          <button
            onClick={() => setActiveTab('fixtures')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === 'fixtures'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-700'
            }`}
          >
            Fixtures
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === 'stats'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-700'
            }`}
          >
            Stats
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'squad' && (
          <div className="space-y-6">
            {/* eFootball Players Section */}
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6 font-mono flex-wrap gap-2">
                <h2 className="text-lg font-extrabold flex items-center gap-2 uppercase tracking-wider text-slate-800">
                  <span>⚽</span>
                  <span>eFootball Players</span>
                </h2>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200/60 px-2.5 py-1 rounded-xl uppercase tracking-wider">
                  {players.filter((p: any) => p.type === 'footballplayer').length} Players
                </span>
              </div>
              {players.filter((p: any) => p.type === 'footballplayer').length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono">
                  {players.filter((p: any) => p.type === 'footballplayer').map((player) => (
                    <div key={player.id} className="bg-slate-50/40 border border-slate-200/60 rounded-2xl p-4 hover:border-amber-400/40 hover:bg-white hover:shadow-sm transition-all duration-200 border-l-4 border-l-blue-500 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-12 w-12 bg-slate-100 border border-slate-200/60 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center p-0.5">
                            <PlayerImage
                              playerId={player.player_id || player.id}
                              playerName={player.name}
                              size={48}
                              className="rounded-lg"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-extrabold text-slate-800 truncate text-sm uppercase tracking-wide">{player.name}</h3>
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              {player.position && (
                                <span className={`inline-block px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider ${getPositionColor(player.position)}`}>
                                  {player.position}
                                </span>
                              )}
                              {player.overall_rating && (
                                <span className="text-xs font-black text-amber-500">★ {player.overall_rating}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-[11px] text-slate-500 space-y-1 border-t border-slate-100 pt-2.5 uppercase font-bold tracking-wider">
                          {player.purchase_price && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Price:</span> 
                              <span className="text-slate-700 font-mono">£{player.purchase_price.toLocaleString()}</span>
                            </div>
                          )}
                          {player.club && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Club:</span> 
                              <span className="text-slate-700 truncate max-w-[150px]">{player.club}</span>
                            </div>
                          )}
                          {player.nationality && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Nation:</span> 
                              <span className="text-slate-700 truncate max-w-[150px]">{player.nationality}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-xs text-slate-400 py-8 uppercase font-bold">No eFootball players acquired yet</p>
              )}
            </div>

            {/* Tournament Players Section */}
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6 font-mono flex-wrap gap-2">
                <h2 className="text-lg font-extrabold flex items-center gap-2 uppercase tracking-wider text-slate-800">
                  <span>🏆</span>
                  <span>Tournament Players</span>
                </h2>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200/60 px-2.5 py-1 rounded-xl uppercase tracking-wider">
                  {players.filter((p: any) => p.type === 'realplayer').length} Players
                </span>
              </div>
              {players.filter((p: any) => p.type === 'realplayer').length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono">
                  {players
                    .filter((p: any) => p.type === 'realplayer')
                    .sort((a: any, b: any) => (b.points || 0) - (a.points || 0))
                    .map((player) => (
                    <div key={player.id} className="bg-slate-50/40 border border-slate-200/60 rounded-2xl p-4 hover:border-amber-400/40 hover:bg-white hover:shadow-sm transition-all duration-200 border-l-4 border-l-emerald-500 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-12 w-12 bg-slate-100 border border-slate-200/60 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center p-0.5">
                            {player.photo_url ? (
                              <Image 
                                src={player.photo_url} 
                                alt={player.name} 
                                width={48}
                                height={48}
                                className="object-cover rounded-lg w-full h-full"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center bg-slate-200 text-slate-500 font-bold rounded-lg text-sm">
                                {player.name.substring(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-extrabold text-slate-800 truncate text-sm uppercase tracking-wide">{player.name}</h3>
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              {player.star_rating && (
                                <span className="text-xs font-black text-amber-500">⭐ {player.star_rating}</span>
                              )}
                              {player.category && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-150 uppercase tracking-wider">
                                  {player.category}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-[11px] text-slate-500 space-y-1 border-t border-slate-100 pt-2.5 uppercase font-bold tracking-wider">
                          {player.nationality && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Nationality:</span> 
                              <span className="text-slate-700 truncate max-w-[150px]">{player.nationality}</span>
                            </div>
                          )}
                          {player.place && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Place:</span> 
                              <span className="text-slate-700 truncate max-w-[150px]">{player.place}</span>
                            </div>
                          )}
                          {player.points !== undefined && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Points:</span> 
                              <span className="text-slate-700 font-mono font-black text-xs">{player.points}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-xs text-slate-400 py-8 uppercase font-bold">No tournament players registered yet</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'fixtures' && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
            <h2 className="text-lg font-extrabold uppercase tracking-wider text-slate-800 mb-6 font-mono">Fixtures</h2>
            {fixtures.length > 0 ? (
              <div className="space-y-3 font-mono">
                {fixtures.map((fixture) => {
                  const isHome = fixture.home_team_id === teamId;
                  const opponent = isHome ? fixture.away_team_name : fixture.home_team_name;
                  const result = fixture.home_score !== null && fixture.home_score !== undefined && 
                                 fixture.away_score !== null && fixture.away_score !== undefined
                    ? isHome 
                      ? fixture.home_score > fixture.away_score ? 'W' : fixture.home_score < fixture.away_score ? 'L' : 'D'
                      : fixture.away_score > fixture.home_score ? 'W' : fixture.away_score < fixture.home_score ? 'L' : 'D'
                    : null;

                  return (
                    <div key={fixture.id} className="bg-slate-50/60 border border-slate-200/40 hover:bg-white hover:border-amber-400/20 p-4 rounded-2xl transition-all duration-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {fixture.round_number && (
                          <span className="text-xs font-extrabold text-slate-400 bg-slate-100 border border-slate-200/40 px-2 py-0.5 rounded-lg">R{fixture.round_number}</span>
                        )}
                        <span className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                          {isHome ? 'vs' : '@'} {opponent}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 font-mono">
                        {fixture.status === 'completed' ? (
                          <>
                            <span className="text-base font-black text-slate-800">
                              {isHome ? fixture.home_score : fixture.away_score} - {isHome ? fixture.away_score : fixture.home_score}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border tracking-wider ${
                              result === 'W' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' :
                              result === 'L' ? 'bg-rose-50 text-rose-700 border-rose-200/60' :
                              'bg-slate-100 text-slate-500 border-slate-200/60'
                            }`}>
                              {result}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{fixture.status}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-xs text-slate-400 py-8 uppercase font-bold">No fixtures scheduled</p>
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-6">
            {standings ? (
              <>
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                  <h2 className="text-lg font-extrabold uppercase tracking-wider text-slate-800 mb-6 font-mono">League Statistics</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono">
                    <div className="text-center p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col justify-between">
                      <div className="text-3xl font-black text-blue-600">{standings.position}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">League Position</div>
                    </div>
                    <div className="text-center p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col justify-between">
                      <div className="text-3xl font-black text-amber-500">{standings.points}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">Points</div>
                    </div>
                    <div className="text-center p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col justify-between">
                      <div className="text-3xl font-black text-slate-700">{standings.played}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">Matches Played</div>
                    </div>
                    <div className="text-center p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col justify-between">
                      <div className="text-3xl font-black text-purple-600">★ {teamProfile.averageRating.toFixed(1)}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">Squad Avg Rating</div>
                    </div>
                  </div>
                </div>

                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 mb-4 font-mono">Match Record</h3>
                  <div className="grid grid-cols-3 gap-4 font-mono text-xs uppercase tracking-wider font-bold">
                    <div className="text-center p-4 bg-emerald-50/60 border border-emerald-100 text-emerald-700 rounded-2xl">
                      <div className="text-2xl font-black text-emerald-600">{standings.won}</div>
                      <div className="text-[9px] mt-1 text-emerald-500">Wins</div>
                    </div>
                    <div className="text-center p-4 bg-slate-50 border border-slate-200/40 text-slate-500 rounded-2xl">
                      <div className="text-2xl font-black text-slate-600">{standings.drawn}</div>
                      <div className="text-[9px] mt-1 text-slate-400">Draws</div>
                    </div>
                    <div className="text-center p-4 bg-rose-50/60 border border-rose-100 text-rose-700 rounded-2xl">
                      <div className="text-2xl font-black text-rose-600">{standings.lost}</div>
                      <div className="text-[9px] mt-1 text-rose-500">Losses</div>
                    </div>
                  </div>
                </div>

                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 mb-4 font-mono">Goals</h3>
                  <div className="grid grid-cols-3 gap-4 font-mono text-xs uppercase tracking-wider font-bold">
                    <div className="text-center p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                      <div className="text-2xl font-black text-slate-700">{standings.goalsFor}</div>
                      <div className="text-[9px] mt-1 text-slate-400">Scored</div>
                    </div>
                    <div className="text-center p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                      <div className="text-2xl font-black text-slate-700">{standings.goalsAgainst}</div>
                      <div className="text-[9px] mt-1 text-slate-400">Conceded</div>
                    </div>
                    <div className="text-center p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                      <div className={`text-2xl font-black ${standings.goalDifference >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {standings.goalDifference >= 0 ? '+' : ''}{standings.goalDifference}
                      </div>
                      <div className="text-[9px] mt-1 text-slate-400">Difference</div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center shadow-sm font-mono">
                <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <h3 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-2">No Statistics Available</h3>
                <p className="text-xs text-slate-500 font-semibold uppercase">Team statistics will appear here once matches are played.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
