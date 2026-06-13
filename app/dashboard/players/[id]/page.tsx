'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { usePlayerStats, usePlayerAwards, useTeamTrophies, useTeamSeasonStats, type PlayerAward, type TeamTrophy, type TeamStats } from '@/hooks';

interface PlayerData {
  id: string;
  player_id?: string;
  name: string;
  category?: string;
  team?: string;
  team_id?: string;
  season_id?: string;
  season_name?: string;
  display_name?: string;
  email?: string;
  phone?: string;
  place?: string;
  dob?: any;
  date_of_birth?: any;
  dateOfBirth?: any;
  birth_date?: any;
  role?: string;
  psn_id?: string;
  xbox_id?: string;
  steam_id?: string;
  is_registered?: boolean;
  is_active?: boolean;
  is_available?: boolean;
  notes?: string;
  photo_url?: string;
  nationality?: string;
  age?: number;
  height?: number;
  weight?: number;
  is_potm?: boolean;
  potm_awards?: Array<{ month: string; year: string }>;
  ranking?: number;
  round_performance?: any;
  
  // Trophy/Award fields (arrays for unlimited trophies)
  category_trophies?: string[];
  individual_trophies?: string[];
  
  // Team trophy fields
  has_league_trophy?: boolean;
  team_rank?: number;
  cup_achievement?: string;
  
  // Direct stats (may be at root level)
  played?: number;
  points?: number;
  goals_scored?: number;
  clean_sheets?: number;
  
  // Stats object from realplayers
  stats?: {
    matches_played: number;
    matches_won: number;
    matches_lost: number;
    matches_drawn: number;
    goals_scored: number;
    goals_per_game: number;
    goals_conceded: number;
    conceded_per_game: number;
    net_goals: number;
    assists: number;
    clean_sheets: number;
    points: number;
    total_points: number;
    win_rate: number;
    average_rating: number;
    current_season_matches: number;
    current_season_wins: number;
  };
}

interface MatchHistory {
  match_number: string;
  opponent?: string;
  result: 'win' | 'loss' | 'draw';
  player_goals: number;
  opponent_goals: number;
  is_potm: boolean;
  points: number;
  date?: Date;
}

interface AuctionBid {
  id: number;
  round_id: number;
  player_id: string;
  team_id: string;
  team_name: string;
  bid_amount: number;
  bid_time: string;
  is_winning: boolean;
  season_id: string;
  round_number: number;
  round_type: string;
  winning_team_id?: string;
  winning_bid?: number;
}


export default function PlayerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [allSeasonData, setAllSeasonData] = useState<PlayerData[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchHistory[]>([]);
  const [seasonName, setSeasonName] = useState<string>('Season');
  const [error, setError] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<'overall' | 'all-seasons' | string>('overall');
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);

  const playerId = params.id as string;
  const [firebaseSeasons, setFirebaseSeasons] = useState<any[]>([]);
  const [firebasePlayer, setFirebasePlayer] = useState<any>(null);
  
  // Use React Query hook for player stats from Neon
  const { data: playerStatsData, isLoading: statsLoading } = usePlayerStats({
    playerId: playerId
  });
  
  // Fetch seasons and player data from Firebase
  useEffect(() => {
    const fetchFirebaseData = async () => {
      try {
        // Fetch seasons
        const seasonsRef = collection(db, 'seasons');
        const seasonsSnapshot = await getDocs(seasonsRef);
        const seasonsData = seasonsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setFirebaseSeasons(seasonsData);
        
        // Fetch player from realplayers
        const playersRef = collection(db, 'realplayers');
        const q = query(playersRef, where('player_id', '==', playerId));
        const playerSnapshot = await getDocs(q);
        
        if (!playerSnapshot.empty) {
          const playerDoc = playerSnapshot.docs[0];
          setFirebasePlayer({
            id: playerDoc.id,
            ...playerDoc.data()
          });
        }
      } catch (error) {
        console.error('Error fetching Firebase data:', error);
      }
    };
    fetchFirebaseData();
  }, [playerId]);
  
  // Fetch player awards for currently selected season
  const currentSeasonIdForAwards = selectedView === 'season' && selectedSeasonId ? selectedSeasonId : null;
  const { data: playerAwards = [], isLoading: awardsLoading } = usePlayerAwards(
    playerId,
    currentSeasonIdForAwards || undefined
  );
  
  // Fetch team trophies and stats for currently selected season
  const currentTeamId = selectedView === 'season' && selectedSeasonId ? 
    allSeasonData.find(s => (s.season_id || s.id) === selectedSeasonId)?.team_id : null;
  
  const { data: teamTrophies = [], isLoading: trophiesLoading } = useTeamTrophies(
    currentTeamId || undefined,
    currentSeasonIdForAwards || undefined
  );
  
  const { data: teamStats, isLoading: teamStatsLoading } = useTeamSeasonStats(
    currentTeamId || undefined,
    currentSeasonIdForAwards || undefined
  );

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      router.push('/login');
      return;
    }

    // Check if user has permission (super_admin, committee_admin, or team)
    if (!['super_admin', 'committee_admin', 'team'].includes(user.role)) {
      router.push('/dashboard');
      return;
    }

    // No need to fetch player data - React Query hook handles it
  }, [user, authLoading, playerId]);

  // Process player stats data from Neon when it arrives
  useEffect(() => {
    // Clear error when data starts loading
    if (statsLoading) {
      setError(null);
      return;
    }
    
    // Wait for Firebase data to load before processing
    if (firebaseSeasons.length === 0 || !firebasePlayer) {
      return;
    }
    
    // If we have Firebase player data but no stats, show basic player info without error
    if (!playerStatsData || playerStatsData.length === 0) {
      // Set basic player data from Firebase
      setPlayer({
        id: firebasePlayer.id,
        player_id: firebasePlayer.player_id,
        name: firebasePlayer.name || 'Unknown Player',
        display_name: firebasePlayer.display_name,
        photo_url: firebasePlayer.photo_url,
        team: firebasePlayer.team,
        category: firebasePlayer.category,
      } as any);
      setAllSeasonData([]);
      // Don't set error - player exists but has no stats yet
      return;
    }
    
    // Clear error when we have data
    setError(null);
    
    // Only show seasons that exist in Firebase and have started
    const startedSeasons = playerStatsData.filter((statsData: any) => {
      const seasonId = statsData.season_id;
      
      // Find the season in Firebase
      const fbSeason = firebaseSeasons.find(s => s.id === seasonId);
      
      // If season not found in Firebase, exclude it
      if (!fbSeason) return false;
      
      // Check if season has started
      if (fbSeason.start_date) {
        const startDate = fbSeason.start_date.toDate ? fbSeason.start_date.toDate() : new Date(fbSeason.start_date);
        const now = new Date();
        return startDate <= now;
      }
      
      // If no start_date field, check status (for backward compatibility)
      // Only include if status is 'active' or 'completed', NOT if it's 'upcoming'
      if (fbSeason.status === 'active' || fbSeason.status === 'completed') {
        return true;
      }
      
      // For very old seasons without start_date or status, include them
      // (This handles seasons created before these fields existed)
      const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
      return seasonNum < 16; // Only auto-include pre-S16 seasons
    });
    
    // Process all season data from Neon
    const allData = startedSeasons.map((statsData: any) => {
      const seasonName = statsData.season_name || statsData.season_id;
      
      const matchesPlayed = statsData.matches_played || 0;
      const goalsScored = statsData.goals_scored || 0;
      const goalsConceded = statsData.goals_conceded || 0;
      const wins = statsData.wins || 0;
      
      return {
        ...statsData,
        id: statsData.id || statsData.player_id,
        name: statsData.player_name || firebasePlayer?.name || 'Unknown Player',
        display_name: firebasePlayer?.display_name || statsData.player_name,
        photo_url: firebasePlayer?.photo_url,
        player_id: statsData.player_id,
        season_name: seasonName,
        team: statsData.team,
        team_id: statsData.team_id,
        category: statsData.category,
        stats: {
          matches_played: matchesPlayed,
          matches_won: wins,
          matches_lost: statsData.losses || 0,
          matches_drawn: statsData.draws || 0,
          goals_scored: goalsScored,
          goals_conceded: goalsConceded,
          assists: statsData.assists || 0,
          clean_sheets: statsData.clean_sheets || 0,
          points: statsData.points || 0,
          // Calculate derived stats
          net_goals: goalsScored - goalsConceded,
          goals_per_game: matchesPlayed > 0 ? (goalsScored / matchesPlayed).toFixed(2) : '0.00',
          conceded_per_game: matchesPlayed > 0 ? (goalsConceded / matchesPlayed).toFixed(2) : '0.00',
          win_rate: matchesPlayed > 0 
            ? parseFloat(((wins / matchesPlayed) * 100).toFixed(1))
            : 0
        }
      };
    });
    
    setAllSeasonData(allData);
    
    // Set the first season as default
    if (allData.length > 0) {
      setPlayer(allData[0]);
      setSeasonName(allData[0].season_name || 'Season');
    } else if (startedSeasons.length === 0 && playerStatsData.length > 0) {
      // If we have data but all seasons were filtered out, show message
      setError('No active seasons found for this player');
    }
  }, [playerStatsData, statsLoading, firebaseSeasons, firebasePlayer]);


  const fetchSeasonName = async (seasonId: string) => {
    try {
      const seasonDoc = await getDoc(doc(db, 'seasons', seasonId));
      if (seasonDoc.exists()) {
        const seasonData = seasonDoc.data();
        setSeasonName(seasonData.name || seasonData.short_name || 'Season');
      }
    } catch (err) {
      console.error('Error fetching season name:', err);
    }
  };
  
  const fetchMatchHistory = async (playerId: string, teamId?: string) => {
    try {
      // This is a simplified version - adjust based on your actual data structure
      // You may need to query match_matchups where this player was involved
      if (!teamId) return;

      const matchupsRef = collection(db, 'match_matchups');
      const q = query(
        matchupsRef,
        where('player_ids', 'array-contains', playerId),
        orderBy('created_at', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const history: MatchHistory[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Transform data to match history format
        // This is a placeholder - adjust based on your actual data structure
        history.push({
          match_number: data.match_number || 'N/A',
          opponent: data.opponent_name,
          result: data.result || 'draw',
          player_goals: data.player_goals || 0,
          opponent_goals: data.opponent_goals || 0,
          is_potm: data.potm_player_id === playerId,
          points: data.points || 0,
          date: data.match_date?.toDate(),
        });
      });

      setMatchHistory(history);
    } catch (err) {
      console.error('Error fetching match history:', err);
    }
  };


  const getCategoryColor = (category: string) => {
    const cat = category.toLowerCase();
    switch (cat) {
      case 'red':
        return 'bg-red-50 text-red-600 border border-red-200/60';
      case 'black':
        return 'bg-slate-800 text-slate-100 border border-slate-700/60';
      case 'blue':
        return 'bg-blue-50 text-blue-600 border border-blue-200/60';
      case 'orange':
        return 'bg-orange-50 text-orange-600 border border-orange-200/60';
      case 'white':
        return 'bg-slate-50 text-slate-600 border border-slate-200/60';
      default:
        return 'bg-slate-50 text-slate-600 border border-slate-200/60';
    }
  };

  if (authLoading || statsLoading || firebaseSeasons.length === 0 || (!firebasePlayer && !error)) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-amber-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">Loading Player Data...</p>
        </div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>
        <div className="text-center relative z-10 console-card bg-white border border-slate-200/60 rounded-3xl p-8 max-w-sm mx-auto shadow-sm">
          <svg className="w-12 h-12 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-lg font-mono font-bold text-slate-800 uppercase tracking-wider mb-2">Error Encountered</h2>
          <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-6">{error || 'Player not found'}</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Calculate overall stats from all seasons
  const calculateOverallStats = () => {
    if (allSeasonData.length === 0) return {
      matches_played: 0,
      matches_won: 0,
      matches_drawn: 0,
      matches_lost: 0,
      goals_scored: 0,
      goals_conceded: 0,
      clean_sheets: 0,
      assists: 0,
      points: 0,
    };
    
    const overall = allSeasonData.reduce((acc, seasonData) => {
      const s = (seasonData.stats || {}) as any;
      return {
        matches_played: (acc.matches_played || 0) + (s.matches_played || 0),
        matches_won: (acc.matches_won || 0) + (s.matches_won || 0),
        matches_drawn: (acc.matches_drawn || 0) + (s.matches_drawn || 0),
        matches_lost: (acc.matches_lost || 0) + (s.matches_lost || 0),
        goals_scored: (acc.goals_scored || 0) + (s.goals_scored || 0),
        goals_conceded: (acc.goals_conceded || 0) + (s.goals_conceded || 0),
        clean_sheets: (acc.clean_sheets || 0) + (s.clean_sheets || 0),
        assists: (acc.assists || 0) + (s.assists || 0),
        points: (acc.points || 0) + (s.points || 0),
      };
    }, {
      matches_played: 0,
      matches_won: 0,
      matches_drawn: 0,
      matches_lost: 0,
      goals_scored: 0,
      goals_conceded: 0,
      clean_sheets: 0,
      assists: 0,
      points: 0,
    } as any);
    
    // Calculate derived stats
    if (overall.matches_played > 0) {
      overall.goals_per_game = (overall.goals_scored / overall.matches_played).toFixed(2);
      overall.conceded_per_game = (overall.goals_conceded / overall.matches_played).toFixed(2);
      overall.win_rate = Math.round((overall.matches_won / overall.matches_played) * 100);
    }
    overall.net_goals = overall.goals_scored - overall.goals_conceded;
    
    return overall;
  };
  
  const overallStats = calculateOverallStats();
  
  // Get stats based on selected view
  let displayStats;
  let currentSeasonData = player;
  
  if (selectedView === 'overall') {
    displayStats = overallStats;
  } else if (selectedView === 'all-seasons') {
    displayStats = overallStats; // Show overall in the sidebar
  } else if (selectedView === 'season' && selectedSeasonId) {
    // Find the selected season data using season_id (not document id)
    const selectedSeason = allSeasonData.find(s => (s.season_id || s.id) === selectedSeasonId);
    console.log('Looking for season:', selectedSeasonId, 'Found:', selectedSeason?.season_id || selectedSeason?.id);
    if (selectedSeason) {
      currentSeasonData = selectedSeason;
      displayStats = selectedSeason.stats || {};
    } else {
      displayStats = player.stats || {};
    }
  } else {
    displayStats = player.stats || {};
  }
  
  const stats = displayStats;
  
  const goalDifference = stats.net_goals || ((stats.goals_scored || 0) - (stats.goals_conceded || 0));
  const winRate = stats.win_rate || (stats.matches_played && stats.matches_played > 0 
    ? parseFloat((((stats.matches_won || 0) / stats.matches_played) * 100).toFixed(1))
    : 0);
  const goalsPerGame = stats.goals_per_game || (stats.matches_played && stats.matches_played > 0
    ? ((stats.goals_scored || 0) / stats.matches_played).toFixed(2)
    : '0.00');

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Navigation */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <Link
            href="/dashboard/team/players-database"
            className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            ← Back to Database
          </Link>
          
          <div className="flex items-center gap-3">
            <span className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl text-xs text-slate-500 font-mono font-bold uppercase tracking-wider">
              Player ID: {player.player_id || player.id}
            </span>
            {allSeasonData.length > 1 && (
              <span className="px-3 py-1.5 bg-amber-500 text-white rounded-xl text-xs text-white font-mono font-bold uppercase tracking-wider">
                {allSeasonData.length} Seasons
              </span>
            )}
          </div>
        </div>

        {/* View Tabs */}
        {allSeasonData.length > 0 && (
          <div className="console-card bg-slate-100 rounded-3xl p-1 shadow-sm border border-slate-200/40">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {/* Overall Tab */}
              <button
                onClick={() => {
                  setSelectedView('overall');
                  setSelectedSeasonId(null);
                }}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  selectedView === 'overall'
                    ? 'bg-slate-800 text-white shadow-md'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                Overall Stats
              </button>
              
              {/* All Seasons Tab */}
              <button
                onClick={() => {
                  setSelectedView('all-seasons');
                  setSelectedSeasonId(null);
                }}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  selectedView === 'all-seasons'
                    ? 'bg-slate-800 text-white shadow-md'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                All Seasons ({allSeasonData.length})
              </button>
              
              {/* Divider */}
              {allSeasonData.length > 0 && (
                <div className="flex items-center px-1">
                  <div className="h-4 w-px bg-slate-300"></div>
                </div>
              )}
              
              {/* Individual Season Tabs */}
              {allSeasonData.map((seasonData, index) => {
                const isCurrentSeason = index === 0;
                const seasonId = seasonData.season_id || seasonData.id;
                const isSelected = selectedView === 'season' && selectedSeasonId === seasonId;
                
                return (
                  <button
                    key={`${seasonData.player_id || playerId}-${seasonData.season_id}-${seasonData.id}-${index}`}
                    onClick={async () => {
                      setSelectedView('season');
                      setSelectedSeasonId(seasonId);
                      if (seasonData.season_id && index === 0) {
                        await fetchSeasonName(seasonData.season_id);
                      }
                    }}
                    className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                      isSelected
                        ? 'bg-slate-800 text-white shadow-md'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    {seasonData.season_name || seasonData.season_id || `Season ${allSeasonData.length - index}`}
                    {isCurrentSeason && (
                      <span className="ml-1.5 inline-flex items-center justify-center w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">
          {/* Left Column - Player Info */}
          <div className="lg:col-span-1 space-y-6">
            {/* Player Card */}
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
              {/* Player Image */}
              <div className="relative w-40 h-40 mx-auto mb-4 rounded-full overflow-hidden border-2 border-slate-200 bg-slate-50 shadow-md">
                {player.photo_url ? (
                  <img
                    src={player.photo_url}
                    alt={player.name}
                    className="object-cover w-full h-full"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-400 to-slate-600 ${player.photo_url ? 'hidden' : ''}`}>
                  <span className="text-5xl font-bold text-white">{player.name?.[0] || 'P'}</span>
                </div>
                
                {/* POTM Badge */}
                {player.is_potm && (
                  <div className="absolute top-0 left-0 bg-amber-500 text-white text-[9px] font-mono font-bold py-0.5 px-2 rounded-br-xl uppercase tracking-wider shadow-sm">
                    POTM
                  </div>
                )}
              </div>

              {/* Player Basic Info */}
              <div className="text-center font-mono">
                <h1 className="text-lg font-bold text-slate-800 mb-1">{player.name}</h1>
                {currentSeasonData.team && (
                  <div className="mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{currentSeasonData.team}</span>
                  </div>
                )}

                {/* Player Category - Season Specific */}
                {currentSeasonData.category && (
                  <div className="mb-3">
                    <span className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider border ${getCategoryColor(currentSeasonData.category)}`}>
                      {currentSeasonData.category}
                    </span>
                  </div>
                )}
                
                {/* Season Info for individual season view */}
                {selectedView === 'season' && selectedSeasonId && currentSeasonData.season_name && (
                  <div className="mb-3">
                    <span className="px-3 py-1 rounded text-xs font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                      {currentSeasonData.season_name}
                    </span>
                  </div>
                )}
              </div>

              {/* Player Details */}
              <div className="space-y-3 text-xs border-t border-slate-100 pt-4 font-mono">
                {(firebasePlayer?.place || player.place) && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Place:
                    </span>
                    <span className="font-bold text-slate-700">{firebasePlayer?.place || player.place}</span>
                  </div>
                )}
                {(() => {
                  const dobValue = firebasePlayer?.dob || firebasePlayer?.date_of_birth || firebasePlayer?.dateOfBirth || firebasePlayer?.birth_date || 
                                  player.dob || player.date_of_birth || player.dateOfBirth || player.birth_date;
                  if (dobValue) {
                    try {
                      const dateObj = dobValue.toDate ? dobValue.toDate() : new Date(dobValue);
                      const formattedDate = dateObj.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      });
                      return (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            DOB:
                          </span>
                          <span className="font-bold text-slate-700">{formattedDate}</span>
                        </div>
                      );
                    } catch {
                      return null;
                    }
                  }
                  return null;
                })()}
                {(firebasePlayer?.phone || player.phone) && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      Phone:
                    </span>
                    <span className="font-bold text-slate-700">{firebasePlayer?.phone || player.phone}</span>
                  </div>
                )}
                {player.nationality && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold uppercase tracking-wider">Nationality:</span>
                    <span className="font-bold text-slate-700">{player.nationality}</span>
                  </div>
                )}
                {player.age && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold uppercase tracking-wider">Age:</span>
                    <span className="font-bold text-slate-700">{player.age}</span>
                  </div>
                )}
                {player.height && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold uppercase tracking-wider">Height:</span>
                    <span className="font-bold text-slate-700">{player.height} cm</span>
                  </div>
                )}
                {player.weight && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold uppercase tracking-wider">Weight:</span>
                    <span className="font-bold text-slate-700">{player.weight} kg</span>
                  </div>
                )}
              </div>
            </div>

            {/* Overall Record Card */}
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
              <h3 className="text-sm font-mono font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center">
                <svg className="w-4 h-4 mr-2 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Record Summary
              </h3>

              {/* Win/Draw/Loss Record */}
              <div className="grid grid-cols-3 gap-2 mb-4 font-mono">
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-2.5 text-center">
                  <p className="text-[9px] text-emerald-700 font-bold uppercase tracking-wider mb-1">WINS</p>
                  <p className="text-xl font-bold text-emerald-800">{stats.matches_won || 0}</p>
                </div>
                <div className="bg-slate-100/80 border border-slate-200/60 rounded-xl p-2.5 text-center">
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">DRAWS</p>
                  <p className="text-xl font-bold text-slate-700">{stats.matches_drawn || 0}</p>
                </div>
                <div className="bg-red-50/60 border border-red-100 rounded-xl p-2.5 text-center">
                  <p className="text-[9px] text-red-700 font-bold uppercase tracking-wider mb-1">LOSSES</p>
                  <p className="text-xl font-bold text-red-800">{stats.matches_lost || 0}</p>
                </div>
              </div>

              {/* Goal Stats */}
              <div className="space-y-2.5 font-mono text-xs">
                <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border border-slate-150 rounded-xl">
                  <span className="text-slate-500 uppercase tracking-wider font-bold text-[10px]">Goals Scored</span>
                  <span className="font-bold text-slate-800">{stats.goals_scored || 0}</span>
                </div>
                <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border border-slate-150 rounded-xl">
                  <span className="text-slate-500 uppercase tracking-wider font-bold text-[10px]">Goals Conceded</span>
                  <span className="font-bold text-red-600">{stats.goals_conceded || 0}</span>
                </div>
                <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border border-slate-150 rounded-xl">
                  <span className="text-slate-500 uppercase tracking-wider font-bold text-[10px]">Goal Difference</span>
                  <span className={`font-bold ${goalDifference > 0 ? 'text-emerald-600' : goalDifference < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                    {goalDifference > 0 ? '+' : ''}{goalDifference}
                  </span>
                </div>
                <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border border-slate-150 rounded-xl">
                  <span className="text-slate-500 uppercase tracking-wider font-bold text-[10px]">Total Points</span>
                  <span className="font-bold text-indigo-600">{stats.points || stats.total_points || 0}</span>
                </div>
                <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border border-slate-150 rounded-xl">
                  <span className="text-slate-500 uppercase tracking-wider font-bold text-[10px]">Clean Sheets</span>
                  <span className="font-bold text-purple-600">{stats.clean_sheets || 0}</span>
                </div>
              </div>
            </div>

            {/* POTM Awards */}
            {player.potm_awards && player.potm_awards.length > 0 && (
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                <h3 className="text-sm font-mono font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center">
                  <svg className="w-4 h-4 mr-2 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  POTM Awards
                </h3>

                <div className="space-y-3 font-mono">
                  {player.potm_awards.map((award, index) => (
                    <div key={index} className="bg-amber-50/50 border border-amber-200/60 rounded-2xl p-3 flex items-center">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mr-3 shrink-0">
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">{award.month}</p>
                        <p className="text-[10px] text-amber-600 font-bold">{award.year}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Stats */}
          <div className="lg:col-span-3 space-y-6">
            {/* All Seasons View */}
            {selectedView === 'all-seasons' && allSeasonData.length > 0 && (
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                <h3 className="text-sm font-mono font-bold text-slate-800 uppercase tracking-wider mb-6 flex items-center border-b border-slate-100 pb-3">
                  <svg className="w-4 h-4 mr-2 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Season-by-Season Breakdown
                </h3>
                
                <div className="space-y-4 font-mono">
                  {allSeasonData.map((seasonData, index) => {
                    const seasonStats = (seasonData.stats || {}) as any;
                    const isCurrentSeason = index === 0;
                    
                    return (
                      <div key={`all-seasons-${seasonData.player_id || playerId}-${seasonData.season_id || seasonData.id}-${index}`} className={`rounded-2xl p-5 border-2 ${
                        isCurrentSeason 
                          ? 'bg-amber-50/20 border-amber-400/40 shadow-sm' 
                          : 'bg-slate-50/40 border-slate-200/60'
                      }`}>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                              isCurrentSeason ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {allSeasonData.length - index}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wide">
                                  {seasonData.season_name || seasonData.season_id || `Season ${allSeasonData.length - index}`}
                                </h4>
                                {seasonData.category && (
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${getCategoryColor(seasonData.category)}`}>
                                    {seasonData.category}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider mt-0.5">{seasonData.team || 'No Team'}</p>
                            </div>
                          </div>
                          {isCurrentSeason && (
                            <span className="px-2.5 py-1 bg-amber-500 text-white text-[9px] font-bold rounded-full uppercase tracking-wider">
                              CURRENT
                            </span>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div className="bg-white/60 border border-slate-100 rounded-xl p-3 text-center">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Matches</p>
                            <p className="text-base font-bold text-slate-800">{seasonStats.matches_played || 0}</p>
                          </div>
                          <div className="bg-white/60 border border-slate-100 rounded-xl p-3 text-center">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Record (W-D-L)</p>
                            <p className="text-xs font-bold text-slate-800">
                              {seasonStats.matches_won || 0}-{seasonStats.matches_drawn || 0}-{seasonStats.matches_lost || 0}
                            </p>
                          </div>
                          <div className="bg-white/60 border border-slate-100 rounded-xl p-3 text-center">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Goals</p>
                            <p className="text-base font-bold text-emerald-600">{seasonStats.goals_scored || 0}</p>
                          </div>
                          <div className="bg-white/60 border border-slate-100 rounded-xl p-3 text-center">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Points</p>
                            <p className="text-base font-bold text-indigo-600">{seasonStats.points || seasonStats.total_points || 0}</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                          <div className="bg-white/60 border border-slate-100 rounded-xl p-2.5 text-center">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Conceded</p>
                            <p className="text-sm font-bold text-red-600">{seasonStats.goals_conceded || 0}</p>
                          </div>
                          <div className="bg-white/60 border border-slate-100 rounded-xl p-2.5 text-center">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Net Goals</p>
                            <p className={`text-sm font-bold ${
                              (seasonStats.net_goals || 0) > 0 ? 'text-emerald-600' : 
                              (seasonStats.net_goals || 0) < 0 ? 'text-red-600' : 'text-slate-600'
                            }`}>
                              {(seasonStats.net_goals || 0) > 0 ? '+' : ''}{seasonStats.net_goals || 0}
                            </p>
                          </div>
                          <div className="bg-white/60 border border-slate-100 rounded-xl p-2.5 text-center">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Clean Sheets</p>
                            <p className="text-sm font-bold text-purple-600">{seasonStats.clean_sheets || 0}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Stats Display (Overall or Individual Season) */}
            {selectedView !== 'all-seasons' && (
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                <h3 className="text-sm font-mono font-bold text-slate-800 uppercase tracking-wider mb-5 flex items-center border-b border-slate-100 pb-3">
                  <svg className="w-4.5 h-4.5 mr-2 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  {selectedView === 'overall' ? 'Overall Statistics' : 
                   selectedView === 'season' && selectedSeasonId ? 
                   `Statistics - ${currentSeasonData.season_name || currentSeasonData.season_id || 'Season'}` : 
                   `Statistics - ${seasonName}`}
                </h3>

                {/* Points display - Only for individual season view */}
                {selectedView === 'season' && (
                  <div className="mb-6 bg-gradient-to-r from-amber-500/5 to-amber-500/10 rounded-2xl p-4 shadow-sm border border-amber-500/20 flex items-center justify-between font-mono">
                    <div>
                      <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Total Season Points</p>
                      <p className="text-3xl font-black text-slate-800 mt-1">{stats.points || stats.total_points || 0}</p>
                    </div>
                    {selectedSeasonId === allSeasonData[0]?.id && currentSeasonData.ranking && (
                      <div className="bg-white border border-slate-200/60 px-4 py-2.5 rounded-xl shadow-sm">
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">League Rank</p>
                        <p className="text-xl font-black text-slate-800 mt-0.5">#{player.ranking}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Main Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 font-mono">
                  <div className="bg-slate-50 border border-slate-200/65 rounded-xl p-4 text-center transform hover:scale-[1.02] transition-all duration-200">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Matches</p>
                    <p className="text-xl font-bold text-slate-800">{stats.matches_played || 0}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/65 rounded-xl p-4 text-center transform hover:scale-[1.02] transition-all duration-200">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Goals</p>
                    <p className="text-xl font-bold text-emerald-600">{stats.goals_scored || 0}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/65 rounded-xl p-4 text-center transform hover:scale-[1.02] transition-all duration-200">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Clean Sheets</p>
                    <p className="text-xl font-bold text-purple-600">{stats.clean_sheets || 0}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/65 rounded-xl p-4 text-center transform hover:scale-[1.02] transition-all duration-200">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Net Goals</p>
                    <p className={`text-xl font-bold ${
                      (stats.net_goals || 0) > 0 ? 'text-emerald-600' : 
                      (stats.net_goals || 0) < 0 ? 'text-red-600' : 'text-slate-600'
                    }`}>
                      {(stats.net_goals || 0) > 0 ? '+' : ''}{stats.net_goals || 0}
                    </p>
                  </div>
                </div>

                {/* Secondary Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 font-mono text-xs">
                  <div className="bg-white border border-slate-150 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Win Rate</p>
                    <p className="text-lg font-bold text-emerald-600">{winRate}%</p>
                  </div>
                  <div className="bg-white border border-slate-150 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Goals/Game</p>
                    <p className="text-lg font-bold text-amber-600">{goalsPerGame}</p>
                  </div>
                  <div className="bg-white border border-slate-150 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Conceded/Game</p>
                    <p className="text-lg font-bold text-red-600">{typeof stats.conceded_per_game === 'number' ? stats.conceded_per_game.toFixed(2) : (stats.conceded_per_game || '0.00')}</p>
                  </div>
                  {stats.average_rating > 0 && (
                    <div className="bg-white border border-slate-150 rounded-xl p-4 text-center">
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Avg Rating</p>
                      <p className="text-lg font-bold text-indigo-600">{stats.average_rating.toFixed(1)}</p>
                    </div>
                  )}
                </div>

                {/* Goals Stats */}
                {(stats.goals_conceded !== undefined || stats.net_goals !== undefined || stats.conceded_per_game !== undefined) && (
                  <div className="mt-6 border-t border-slate-100 pt-5 font-mono">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Goal Performance Breakdown</h4>
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div className="bg-red-50/50 rounded-xl p-4 text-center border border-red-100">
                        <p className="text-[9px] text-red-700 font-bold uppercase tracking-wider mb-1">Conceded</p>
                        <p className="text-xl font-bold text-red-600">{stats.goals_conceded || 0}</p>
                        {stats.conceded_per_game && (
                          <p className="text-[9px] text-red-500 font-bold uppercase tracking-wider mt-1">{stats.conceded_per_game} / match</p>
                        )}
                      </div>
                      <div className={`rounded-xl p-4 text-center border ${
                        goalDifference > 0 
                          ? 'bg-emerald-50/50 border-emerald-100' 
                          : goalDifference < 0 
                          ? 'bg-red-50/50 border-red-100' 
                          : 'bg-slate-50 border-slate-100'
                      }`}>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">Goal Diff</p>
                        <p className={`text-xl font-bold ${
                          goalDifference > 0 ? 'text-emerald-600' : goalDifference < 0 ? 'text-red-600' : 'text-slate-600'
                        }`}>
                          {goalDifference > 0 ? '+' : ''}{goalDifference}
                        </p>
                      </div>
                      <div className="bg-emerald-50/50 rounded-xl p-4 text-center border border-emerald-100">
                        <p className="text-[9px] text-emerald-700 font-bold uppercase tracking-wider mb-1">Goals For</p>
                        <p className="text-xl font-bold text-emerald-600">{stats.goals_scored || 0}</p>
                        {stats.goals_per_game && (
                          <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-wider mt-1">{stats.goals_per_game} / match</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Performance Progress Bars */}
                <div className="mt-6 border-t border-slate-100 pt-5 font-mono">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Performance Metrics</h4>

                  {/* Goals per Game */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Goals per Game</span>
                      <span className="text-xs font-bold text-slate-800">{goalsPerGame}</span>
                    </div>
                    <div className="w-full bg-slate-100 border border-slate-200/50 rounded-full h-3 overflow-hidden p-0.5">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full transition-all duration-1000"
                        style={{ width: `${Math.min(parseFloat(goalsPerGame as string) * 50, 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Win Percentage */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Win Percentage</span>
                      <span className="text-xs font-bold text-slate-800">{winRate}%</span>
                    </div>
                    <div className="w-full bg-slate-100 border border-slate-200/50 rounded-full h-3 overflow-hidden p-0.5">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full transition-all duration-1000"
                        style={{ width: `${winRate}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Team Trophies - Only for Individual Season View */}
            {selectedView === 'season' && selectedSeasonId && !trophiesLoading && teamTrophies.length > 0 && (
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm font-mono">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center border-b border-slate-100 pb-3">
                  <svg className="w-4 h-4 mr-2 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  Team Trophies
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-4 font-mono">
                  {currentSeasonData.season_name || 'This Season'} - with {currentSeasonData.team}
                </p>
                
                {/* League Position from teamstats */}
                {teamStats && teamStats.position && (
                  <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg className="w-4.5 h-4.5 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                        </svg>
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">League Standings</span>
                      </div>
                      <span className="text-2xl font-black text-slate-800">#{teamStats.position}</span>
                    </div>
                    <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider mt-1.5">
                      {teamStats.points} pts • {teamStats.wins}W - {teamStats.draws}D - {teamStats.losses}L
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {teamTrophies.map((trophy) => {
                    const isLeague = trophy.trophy_type === 'league';
                    const isCup = trophy.trophy_type === 'cup';
                    
                    const bgGradient = isLeague
                      ? 'bg-emerald-50/50 border border-emerald-200/60'
                      : isCup
                      ? 'bg-blue-50/50 border border-blue-200/60'
                      : 'bg-slate-50 border border-slate-200/60';
                    
                    const iconBg = isLeague
                      ? 'bg-emerald-500'
                      : isCup
                      ? 'bg-blue-500'
                      : 'bg-slate-400';

                    return (
                      <div key={trophy.id} className={`console-card border rounded-2xl p-4 shadow-sm flex items-start gap-4 ${bgGradient}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white ${iconBg}`}>
                          <svg className="w-5.5 h-5.5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${
                            isLeague ? 'text-emerald-700' :
                            isCup ? 'text-blue-700' : 'text-slate-500'
                          }`}>
                            🏆 Team Achievement
                          </p>
                          <p className="text-xs font-bold text-slate-800 truncate uppercase tracking-wide">{trophy.trophy_name}</p>
                          {trophy.position && (
                            <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider mt-1">
                              Rank: #{trophy.position}
                            </p>
                          )}
                          {trophy.notes && (
                            <p className="text-[10px] text-slate-400 font-bold italic mt-1">{trophy.notes}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Player Awards - Only for Individual Season View */}
            {selectedView === 'season' && selectedSeasonId && !awardsLoading && playerAwards.length > 0 && (
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm font-mono">
                <h3 className="text-sm font-bold text-slate-855 uppercase tracking-wider mb-4 flex items-center border-b border-slate-100 pb-3">
                  <svg className="w-4 h-4 mr-2 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  Player Awards
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-4">{currentSeasonData.season_name || 'This Season'}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {playerAwards.map((award) => {
                    const isWinner = award.award_position?.toLowerCase() === 'winner' || !award.award_position;
                    const bgGradient = isWinner
                      ? 'bg-purple-50/50 border border-purple-200/60 shadow-sm'
                      : award.award_position?.toLowerCase() === 'runner-up'
                      ? 'bg-slate-50 border border-slate-200/60'
                      : 'bg-orange-50/50 border border-orange-200/60';
                    
                    const iconBg = isWinner
                      ? 'bg-purple-500'
                      : award.award_position?.toLowerCase() === 'runner-up'
                      ? 'bg-slate-400'
                      : 'bg-orange-500';
                    
                    const textColor = isWinner
                      ? 'text-purple-700'
                      : award.award_position?.toLowerCase() === 'runner-up'
                      ? 'text-slate-600'
                      : 'text-orange-700';

                    return (
                      <div key={award.id} className={`console-card border rounded-2xl p-4 flex items-start gap-4 ${bgGradient}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white ${iconBg}`}>
                          <svg className="w-5.5 h-5.5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center justify-between mb-1 gap-2">
                            <p className={`text-[9px] font-bold uppercase tracking-wider ${textColor}`}>
                              {award.award_category === 'category' ? '🎯 Category' : '🌟 Individual'}
                            </p>
                            {award.award_position && (
                              <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border ${
                                isWinner ? 'bg-purple-100 text-purple-700 border-purple-200/50' :
                                award.award_position.toLowerCase() === 'runner-up' ? 'bg-slate-105 text-slate-655 border-slate-200/50' :
                                'bg-orange-100 text-orange-700 border-orange-200/50'
                              }`}>
                                {award.award_position}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide truncate">{award.award_type}</p>
                          {award.player_category && (
                            <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider mt-1 flex items-center gap-1">
                              <svg className="w-3 h-3 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L11 4.323V3a1 1 0 011-1zm-5 8.274l-.818 2.552c-.25.78.057 1.62.754 2.062.629.4 1.446.45 2.122.085.577-.312.998-.835 1.187-1.452l.818-2.552-4.063-1.094zm10 0l-4.063 1.094.818 2.552c.189.617.61 1.14 1.187 1.452.676.365 1.493.315 2.122-.085.697-.442 1.004-1.282.754-2.062L15 10.274z" clipRule="evenodd" />
                              </svg>
                              {award.player_category}
                            </p>
                          )}
                          {award.performance_stats && Object.keys(award.performance_stats).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {Object.entries(award.performance_stats).map(([key, value]) => (
                                <span key={key} className="text-[9px] bg-white border border-slate-150 px-2 py-0.5 rounded font-bold uppercase tracking-wider text-slate-700">
                                  {key}: <span className="text-slate-900 font-extrabold">{String(value)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                          {award.notes && (
                            <p className="text-[10px] text-slate-400 font-bold italic mt-2">{award.notes}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Round Performance - Only for Individual Season View */}
            {selectedView === 'season' && selectedSeasonId && currentSeasonData.round_performance && Object.keys(currentSeasonData.round_performance).length > 0 && (
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm font-mono">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center border-b border-slate-100 pb-3">
                  <svg className="w-4 h-4 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Round Performance
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(currentSeasonData.round_performance).map(([roundKey, roundData]: [string, any]) => (
                    <div key={roundKey} className="console-card bg-slate-50/50 border border-slate-200/60 rounded-2xl p-4 hover:border-amber-400/40 transition-all duration-200">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">{roundKey}</h4>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          roundData.wins > roundData.losses
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : roundData.wins < roundData.losses
                            ? 'bg-red-50 text-red-700 border border-red-100'
                            : 'bg-amber-50 text-amber-700 border border-amber-100'
                        }`}>
                          {roundData.matches} Matches
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-white border border-slate-150 rounded-xl p-2">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Goals</p>
                          <p className="text-base font-bold text-emerald-600">{roundData.goals || 0}</p>
                        </div>
                        <div className="bg-white border border-slate-150 rounded-xl p-2">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Conceded</p>
                          <p className="text-base font-bold text-red-600">{roundData.goals_conceded || 0}</p>
                        </div>
                        <div className="bg-white border border-slate-150 rounded-xl p-2">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">GD</p>
                          <p className={`text-base font-bold ${
                            roundData.goal_difference > 0
                              ? 'text-emerald-600'
                              : roundData.goal_difference < 0
                              ? 'text-red-600'
                              : 'text-slate-600'
                          }`}>
                            {roundData.goal_difference > 0 ? '+' : ''}{roundData.goal_difference}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center mt-2 text-xs">
                        <div className="bg-white border border-slate-150 rounded-xl p-1.5 flex flex-col justify-center">
                          <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">W/D/L</p>
                          <p className="text-[10px] font-bold text-slate-700">
                            {roundData.wins}/{roundData.draws}/{roundData.losses}
                          </p>
                        </div>
                        <div className="bg-white border border-slate-150 rounded-xl p-1.5 flex flex-col justify-center">
                          <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">POTM</p>
                          <p className="text-sm font-bold text-amber-600">{roundData.potm_count || 0}</p>
                        </div>
                        <div className="bg-white border border-slate-150 rounded-xl p-1.5 flex flex-col justify-center">
                          <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Points</p>
                          <p className="text-sm font-bold text-indigo-600">{roundData.points || 0}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Match History - Only for Individual Season View */}
            {selectedView === 'season' && selectedSeasonId && matchHistory && matchHistory.length > 0 && (
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm overflow-hidden font-mono">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center border-b border-slate-100 pb-3">
                  <svg className="w-4 h-4 mr-2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Match History
                </h3>

                <div className="overflow-x-auto rounded-2xl border border-slate-150 shadow-inner bg-slate-50/50">
                  <table className="min-w-full divide-y divide-slate-200/60 font-mono text-[11px]">
                    <thead className="bg-slate-100/80 border-b border-slate-200/60">
                      <tr>
                        <th className="px-5 py-3 text-left font-bold text-slate-500 uppercase tracking-wider">Match</th>
                        <th className="px-5 py-3 text-left font-bold text-slate-500 uppercase tracking-wider">Result</th>
                        <th className="px-5 py-3 text-center font-bold text-slate-500 uppercase tracking-wider">GS</th>
                        <th className="px-5 py-3 text-center font-bold text-slate-500 uppercase tracking-wider">GC</th>
                        <th className="px-5 py-3 text-center font-bold text-slate-500 uppercase tracking-wider">GD</th>
                        <th className="px-5 py-3 text-center font-bold text-slate-500 uppercase tracking-wider">POTM</th>
                        <th className="px-5 py-3 text-center font-bold text-slate-500 uppercase tracking-wider">Points</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {matchHistory.map((match, index) => (
                        <tr key={index} className="hover:bg-slate-50/70 transition-all duration-150">
                          <td className="px-5 py-3 whitespace-nowrap text-slate-800">
                            {match.opponent ? `vs ${match.opponent}` : `Match ${match.match_number}`}
                          </td>
                          <td className={`px-5 py-3 whitespace-nowrap font-bold uppercase tracking-wider ${
                            match.result === 'win' ? 'text-green-600' :
                            match.result === 'loss' ? 'text-red-600' :
                            'text-amber-500'
                          }`}>
                            {match.result}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-center text-green-600 font-bold">
                            {match.player_goals}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-center text-red-600 font-bold">
                            {match.opponent_goals}
                          </td>
                          <td className={`px-5 py-3 whitespace-nowrap text-center font-bold ${
                            match.player_goals - match.opponent_goals > 0 ? 'text-green-600' :
                            match.player_goals - match.opponent_goals < 0 ? 'text-red-600' :
                            'text-slate-500'
                          }`}>
                            {match.player_goals - match.opponent_goals > 0 ? '+' : ''}{match.player_goals - match.opponent_goals}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-center text-amber-500 font-extrabold text-sm">
                            {match.is_potm ? '★' : '—'}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-center text-indigo-600 font-bold">
                            {match.points}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
