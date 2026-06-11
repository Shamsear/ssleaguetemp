'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import Link from 'next/link';
import PlayerPhoto from '@/components/PlayerPhoto';
import { usePlayerStats, usePlayerAwards, useTeamTrophies, useTeamSeasonStats, type PlayerAward, type TeamTrophy, type TeamStats } from '@/hooks';
import {
  Zap,
  Shield,
  Flame,
  Target,
  Award,
  ArrowRight,
  TrendingUp,
  Activity,
  Award as AwardIcon,
  ChevronRight,
  ChevronLeft,
  Briefcase,
  User,
  Calendar,
  Phone,
  MapPin,
  Smile
} from 'lucide-react';

interface PlayerData {
  id: string;
  player_id?: string;
  name: string;
  category?: string;
  star_rating?: number;
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
  role?: string;
  psn_id?: string;
  xbox_id?: string;
  steam_id?: string;
  is_registered?: boolean;
  is_active?: boolean;
  is_available?: boolean;
  notes?: string;
  photo_url?: string;
  photo_position_circle?: string;
  photo_scale_circle?: number;
  photo_position_x_circle?: number;
  photo_position_y_circle?: number;
  photo_position_square?: string;
  photo_scale_square?: number;
  photo_position_x_square?: number;
  photo_position_y_square?: number;
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

export default function PlayerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [allSeasonData, setAllSeasonData] = useState<PlayerData[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchHistory[]>([]);
  const [seasonName, setSeasonName] = useState<string>('Season');
  const [error, setError] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<'overall' | 'all-seasons' | string>('overall');
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [playerDataLoaded, setPlayerDataLoaded] = useState(false);

  const playerId = params.id as string;
  const [firebaseSeasons, setFirebaseSeasons] = useState<any[]>([]);

  // Use React Query hook for player stats from Neon
  const { data: playerStatsData, isLoading: statsLoading } = usePlayerStats({
    playerId: playerId
  });

  // Fetch seasons from cache or Firebase
  useEffect(() => {
    const fetchSeasons = async () => {
      try {
        // Try to get from localStorage cache first (expires after 1 hour)
        const cached = localStorage.getItem('seasons_cache');
        const cacheTime = localStorage.getItem('seasons_cache_time');

        if (cached && cacheTime) {
          const cacheAge = Date.now() - parseInt(cacheTime);
          if (cacheAge < 3600000) { // 1 hour
            setFirebaseSeasons(JSON.parse(cached));
            return;
          }
        }

        // Fetch from Firebase if no cache or expired
        const seasonsRef = collection(db, 'seasons');
        const seasonsSnapshot = await getDocs(seasonsRef);
        const seasonsData = seasonsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Cache the results
        localStorage.setItem('seasons_cache', JSON.stringify(seasonsData));
        localStorage.setItem('seasons_cache_time', Date.now().toString());

        setFirebaseSeasons(seasonsData);
      } catch (error) {
        console.error('Error fetching seasons:', error);
      }
    };
    fetchSeasons();
  }, []);

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


  // Process player stats data from Neon when it arrives
  useEffect(() => {
    const processPlayerData = async () => {
      // Clear error when data starts loading
      if (statsLoading) {
        setError(null);
        return;
      }

      // Wait for Firebase seasons to load before filtering
      if (firebaseSeasons.length === 0) {
        return;
      }

      // Only show error if done loading and no data
      if (!playerStatsData || playerStatsData.length === 0) {
        setError('No season stats found for this player');
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
        if (fbSeason.status === 'active' || fbSeason.status === 'completed') {
          return true;
        }

        // For very old seasons without start_date or status, include them
        const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
        return seasonNum < 16; 
      });

      // Fetch photo_url and personal details from API
      let photoUrl: string | undefined;
      let personalDetails: any = {};
      try {
        const response = await fetch(`/api/players/${playerId}/details`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.player) {
            photoUrl = data.player.photo_url;
            personalDetails = {
              place: data.player.place,
              phone: data.player.phone,
              dob: data.player.dob,
              date_of_birth: data.player.date_of_birth,
            };
            (window as any).__playerPhotoSettings = {
              photo_position_circle: data.player.photo_position_circle,
              photo_scale_circle: data.player.photo_scale_circle,
              photo_position_x_circle: data.player.photo_position_x_circle,
              photo_position_y_circle: data.player.photo_position_y_circle,
              photo_position_square: data.player.photo_position_square,
              photo_scale_square: data.player.photo_scale_square,
              photo_position_x_square: data.player.photo_position_x_square,
              photo_position_y_square: data.player.photo_position_y_square,
            };
          }
        }
      } catch (error) {
        console.error('Error fetching player details:', error);
      }

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
          name: statsData.player_name || 'Unknown Player',
          player_id: statsData.player_id,
          season_id: statsData.season_id,
          season_name: seasonName,
          team: statsData.team,
          team_id: statsData.team_id,
          category: statsData.category,
          star_rating: statsData.star_rating,
          photo_url: photoUrl,
          place: personalDetails.place,
          phone: personalDetails.phone,
          dob: personalDetails.dob,
          date_of_birth: personalDetails.date_of_birth,
          ...((window as any).__playerPhotoSettings || {}),
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
        setError('No active seasons found for this player');
      }

      setPlayerDataLoaded(true);
    };

    processPlayerData();
  }, [playerStatsData, statsLoading, firebaseSeasons, playerId]);


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
        return 'bg-red-100 text-red-800 border-red-200';
      case 'black':
        return 'bg-gray-850 text-white border-gray-800';
      case 'blue':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'orange':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'white':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-150 text-gray-800 border-gray-200';
    }
  };

  if (statsLoading || firebaseSeasons.length === 0 || !playerDataLoaded) {
    return (
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-slate-500 font-mono text-xs">Loading Player Profile...</p>
        </div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center max-w-md p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
          <Award className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">Profile Error</h2>
          <p className="text-sm text-slate-500 font-mono">{error || 'Player profile not found'}</p>
          <Link
            href="/players"
            className="inline-flex items-center gap-1.5 border border-slate-250 bg-slate-50 hover:bg-slate-100 text-slate-700 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm font-mono"
          >
            ← BACK TO PLAYERS
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
    displayStats = overallStats; 
  } else if (selectedView === 'season' && selectedSeasonId) {
    const selectedSeason = allSeasonData.find(s => (s.season_id || s.id) === selectedSeasonId);
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
        
        {/* Header Panel */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link
            href="/players"
            className="inline-flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm font-mono"
          >
            ← BACK TO PLAYERS
          </Link>

          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-xl font-bold">
              LOBBY_ID: {player.player_id || player.id}
            </span>
            {allSeasonData.length > 1 && (
              <span className="bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-amber-700 px-3 py-1.5 rounded-xl font-bold">
                {allSeasonData.length} SEASONS ACTIVE
              </span>
            )}
          </div>
        </div>

        {/* View Tabs */}
        {allSeasonData.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-slate-200/60 pb-3">
            <button
              onClick={() => {
                setSelectedView('overall');
                setSelectedSeasonId(null);
              }}
              className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all ${
                selectedView === 'overall'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                  : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm'
              }`}
            >
              OVERALL STATS
            </button>

            <button
              onClick={() => {
                setSelectedView('all-seasons');
                setSelectedSeasonId(null);
              }}
              className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all ${
                selectedView === 'all-seasons'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                  : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm'
              }`}
            >
              ALL SEASONS ({allSeasonData.length})
            </button>

            {allSeasonData.length > 0 && (
              <div className="h-8 w-px bg-slate-200 self-center hidden sm:block mx-1"></div>
            )}

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
                  className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                      : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm'
                  }`}
                >
                  {seasonData.season_name?.toUpperCase() || seasonData.season_id || `SEASON ${allSeasonData.length - index}`}
                  {isCurrentSeason && (
                    <span className="ml-1.5 inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Left Column - Player Profile & Overview */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Player Card */}
            <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm text-center space-y-4">
              
              {/* Image Frame */}
              <div className="relative w-40 h-40 mx-auto rounded-xl shadow-sm border border-slate-200 bg-white overflow-hidden">
                <PlayerPhoto
                  photoUrl={player.photo_url}
                  playerName={player.name}
                  shape="square"
                  size={160}
                  className="rounded-xl"
                  positionSquare={player.photo_position_square}
                  scaleSquare={player.photo_scale_square}
                  posXSquare={player.photo_position_x_square}
                  posYSquare={player.photo_position_y_square}
                />

                {player.is_potm && (
                  <div className="absolute top-0 left-0 bg-amber-500 text-white text-[9px] font-mono font-bold py-1 px-2 rounded-br-lg uppercase tracking-wider">
                    POTM
                  </div>
                )}
              </div>

              {/* Basic Info */}
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 mb-1">{player.name}</h2>
                {currentSeasonData.team && (
                  <div className="mb-3">
                    <span className="text-xs font-mono font-bold text-slate-400 uppercase">{currentSeasonData.team}</span>
                  </div>
                )}

                {/* Rating / Category Badges */}
                {selectedView === 'season' && selectedSeasonId && (() => {
                  const getSeasonNumber = (seasonId: string | undefined): number => {
                    if (!seasonId) return 0;
                    const match = seasonId.match(/\d+/);
                    return match ? parseInt(match[0]) : 0;
                  };

                  const seasonNumber = getSeasonNumber(currentSeasonData.season_id);
                  const isNewSeason = seasonNumber >= 16;

                  if (isNewSeason && currentSeasonData.star_rating !== undefined && currentSeasonData.star_rating !== null) {
                    const starRating = currentSeasonData.star_rating;
                    return (
                      <div className="mt-2">
                        <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-250 text-amber-800 px-3 py-1 rounded-full text-xs font-mono font-bold">
                          <span>⭐ Rating:</span>
                          <span>{starRating}</span>
                        </div>
                      </div>
                    );
                  } else if (!isNewSeason && currentSeasonData.category) {
                    return (
                      <div className="mt-2">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider ${
                          currentSeasonData.category.toLowerCase() === 'legend'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {currentSeasonData.category}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}

                {selectedView === 'season' && selectedSeasonId && currentSeasonData.season_name && (
                  <div className="mt-3">
                    <span className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase">
                      {currentSeasonData.season_name}
                    </span>
                  </div>
                )}
              </div>

              {/* Bio Details */}
              <div className="space-y-2.5 text-xs border-t border-slate-100 pt-4 text-left font-mono">
                {player.place && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px] flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-purple-500" /> PLACE
                    </span>
                    <span className="font-semibold text-slate-800">{player.place}</span>
                  </div>
                )}
                {(() => {
                  const dobValue = player.dob || player.date_of_birth;
                  if (dobValue) {
                    try {
                      const dateObj = dobValue.toDate ? dobValue.toDate() : new Date(dobValue);
                      const formattedDate = dateObj.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      });
                      return (
                        <div className="flex justify-between items-center py-1">
                          <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px] flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-blue-500" /> DOB
                          </span>
                          <span className="font-semibold text-slate-800">{formattedDate}</span>
                        </div>
                      );
                    } catch {
                      return null;
                    }
                  }
                  return null;
                })()}
                {player.phone && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px] flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-emerald-500" /> PHONE
                    </span>
                    <span className="font-semibold text-slate-800">{player.phone}</span>
                  </div>
                )}
                {player.nationality && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">NATIONALITY</span>
                    <span className="font-semibold text-slate-800">{player.nationality}</span>
                  </div>
                )}
                {player.age && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">AGE</span>
                    <span className="font-semibold text-slate-800">{player.age} yrs</span>
                  </div>
                )}
                {player.height && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">HEIGHT</span>
                    <span className="font-semibold text-slate-800">{player.height} cm</span>
                  </div>
                )}
                {player.weight && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">WEIGHT</span>
                    <span className="font-semibold text-slate-800">{player.weight} kg</span>
                  </div>
                )}
              </div>
            </div>

            {/* Record Ledger */}
            <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
                <Shield className="w-4 h-4 mr-2 text-[#D4AF37]" /> Overall Record
              </h3>

              <div className="grid grid-cols-3 gap-2 font-mono">
                <div className="border border-emerald-100 rounded-xl p-3 bg-emerald-50/20 text-center">
                  <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Wins</p>
                  <p className="text-2xl font-black text-emerald-600 mt-1">{stats.matches_won || 0}</p>
                </div>
                <div className="border border-amber-100 rounded-xl p-3 bg-amber-50/20 text-center">
                  <p className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Draws</p>
                  <p className="text-2xl font-black text-amber-600 mt-1">{stats.matches_drawn || 0}</p>
                </div>
                <div className="border border-rose-100 rounded-xl p-3 bg-rose-50/20 text-center">
                  <p className="text-[10px] text-rose-700 font-bold uppercase tracking-wider">Losses</p>
                  <p className="text-2xl font-black text-rose-600 mt-1">{stats.matches_lost || 0}</p>
                </div>
              </div>

              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg">
                  <span className="text-slate-400 uppercase tracking-wide text-[9px]">Goals For (GS)</span>
                  <span className="font-bold text-slate-800">{stats.goals_scored || 0}</span>
                </div>
                <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg">
                  <span className="text-slate-400 uppercase tracking-wide text-[9px]">Goals Against (GC)</span>
                  <span className="font-bold text-slate-800">{stats.goals_conceded || 0}</span>
                </div>
                <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg">
                  <span className="text-slate-400 uppercase tracking-wide text-[9px]">Goal Difference (GD)</span>
                  <span className={`font-bold ${goalDifference > 0 ? 'text-emerald-600' : goalDifference < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                    {goalDifference > 0 ? '+' : ''}{goalDifference}
                  </span>
                </div>
                {selectedView === 'season' && (
                  <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg">
                    <span className="text-slate-400 uppercase tracking-wide text-[9px]">Points</span>
                    <span className="font-bold text-amber-600">{stats.points || stats.total_points || 0}</span>
                  </div>
                )}
                <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg">
                  <span className="text-slate-400 uppercase tracking-wide text-[9px]">Clean Sheets</span>
                  <span className="font-bold text-purple-600">{stats.clean_sheets || 0}</span>
                </div>
              </div>
            </div>

            {/* POTM Awards */}
            {player.potm_awards && player.potm_awards.length > 0 && (
              <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
                  <Award className="w-4 h-4 mr-2 text-amber-500" /> POTM Awards
                </h3>

                <div className="space-y-2">
                  {player.potm_awards.map((award, index) => (
                    <div key={index} className="border border-slate-150 rounded-xl p-3 bg-slate-50/50 flex items-center">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mr-3 flex-shrink-0">
                        <Award className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="font-mono">
                        <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">{award.month}</p>
                        <p className="text-[10px] text-slate-400 font-bold">{award.year}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Stats / Breakdown */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* Season-by-Season Tab */}
            {selectedView === 'all-seasons' && allSeasonData.length > 0 && (
              <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm space-y-6">
                <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
                  <Activity className="w-4 h-4 mr-2 text-purple-600" /> Season-by-Season Breakdown
                </h3>

                <div className="space-y-4">
                  {allSeasonData.map((seasonData, index) => {
                    const seasonStats = (seasonData.stats || {}) as any;
                    const isCurrentSeason = index === 0;

                    return (
                      <div
                        key={`all-seasons-${seasonData.player_id || playerId}-${seasonData.season_id || seasonData.id}-${index}`}
                        className={`rounded-2xl p-5 border transition-all ${
                          isCurrentSeason
                            ? 'border-2 border-amber-500/80 bg-amber-50/10 shadow-sm'
                            : 'border-slate-200 bg-white/50 hover:border-amber-400/40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                              isCurrentSeason ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {allSeasonData.length - index}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-slate-900 text-sm">
                                  {seasonData.season_name || seasonData.season_id || `Season ${allSeasonData.length - index}`}
                                </h4>
                                {seasonData.category && (
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase tracking-wider ${
                                    seasonData.category.toLowerCase() === 'legend'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {seasonData.category}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 font-semibold mt-0.5">{seasonData.team || 'No Team'}</p>
                            </div>
                          </div>
                          {isCurrentSeason && (
                            <span className="px-2.5 py-1 bg-amber-600 text-white text-[9px] font-mono font-bold rounded-full uppercase tracking-wider">
                              Active
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                          <div className="bg-slate-50/85 rounded-lg p-3 text-center border border-slate-100">
                            <p className="text-[9px] text-slate-400 uppercase">Matches</p>
                            <p className="text-lg font-black text-slate-900 mt-0.5">{seasonStats.matches_played || 0}</p>
                          </div>
                          <div className="bg-slate-50/85 rounded-lg p-3 text-center border border-slate-100">
                            <p className="text-[9px] text-slate-400 uppercase">Record</p>
                            <p className="text-xs font-bold text-slate-900 mt-1.5">
                              {seasonStats.matches_won || 0}W-{seasonStats.matches_drawn || 0}D-{seasonStats.matches_lost || 0}L
                            </p>
                          </div>
                          <div className="bg-slate-50/85 rounded-lg p-3 text-center border border-slate-100">
                            <p className="text-[9px] text-slate-400 uppercase">Goals</p>
                            <p className="text-lg font-black text-purple-600 mt-0.5">{seasonStats.goals_scored || 0}</p>
                          </div>
                          <div className="bg-slate-50/85 rounded-lg p-3 text-center border border-slate-100">
                            <p className="text-[9px] text-slate-400 uppercase">Points</p>
                            <p className="text-lg font-black text-amber-600 mt-0.5">{seasonStats.points || seasonStats.total_points || 0}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mt-3 font-mono">
                          <div className="bg-slate-50/85 rounded-lg p-3 text-center border border-slate-100">
                            <p className="text-[9px] text-slate-400 uppercase">Conceded</p>
                            <p className="text-base font-bold text-red-600 mt-0.5">{seasonStats.goals_conceded || 0}</p>
                          </div>
                          <div className="bg-slate-50/85 rounded-lg p-3 text-center border border-slate-100">
                            <p className="text-[9px] text-slate-400 uppercase">Net Goals</p>
                            <p className={`text-base font-bold ${(seasonStats.net_goals || 0) > 0 ? 'text-emerald-600' :
                              (seasonStats.net_goals || 0) < 0 ? 'text-red-600' : 'text-slate-600'
                              } mt-0.5`}>
                              {(seasonStats.net_goals || 0) > 0 ? '+' : ''}{seasonStats.net_goals || 0}
                            </p>
                          </div>
                          <div className="bg-slate-50/85 rounded-lg p-3 text-center border border-slate-100">
                            <p className="text-[9px] text-slate-400 uppercase">CS</p>
                            <p className="text-base font-bold text-purple-600 mt-0.5">{seasonStats.clean_sheets || 0}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Statistics Display */}
            {selectedView !== 'all-seasons' && (
              <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm space-y-6">
                <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
                  <Activity className="w-4 h-4 mr-2 text-amber-600" />
                  {selectedView === 'overall' ? 'Overall Statistics' :
                    selectedView === 'season' && selectedSeasonId ?
                      `Statistics - ${currentSeasonData.season_name || currentSeasonData.season_id || 'Season'}` :
                      `Statistics - ${seasonName}`}
                </h3>

                {selectedView === 'season' && (
                  <div className="bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-xl p-4 flex items-center justify-between font-mono">
                    <div>
                      <p className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Total Points</p>
                      <p className="text-3xl font-black text-amber-600 mt-0.5">{stats.points || stats.total_points || 0}</p>
                    </div>
                    {selectedSeasonId === allSeasonData[0]?.id && currentSeasonData.ranking && (
                      <div className="bg-white border border-slate-200 px-4 py-2 rounded-lg shadow-sm text-right">
                        <p className="text-[9px] text-slate-400 font-bold uppercase">League Ranking</p>
                        <p className="text-xl font-black text-amber-600 mt-0.5">#{currentSeasonData.ranking}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Main Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 uppercase font-bold">Matches</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{stats.matches_played || 0}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 uppercase font-bold text-purple-600">Goals</p>
                    <p className="text-2xl font-black text-purple-600 mt-1">{stats.goals_scored || 0}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 uppercase font-bold text-emerald-600">CS</p>
                    <p className="text-2xl font-black text-emerald-600 mt-1">{stats.clean_sheets || 0}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 uppercase font-bold">Net Goals</p>
                    <p className={`text-2xl font-black ${(stats.net_goals || 0) > 0 ? 'text-emerald-600' :
                      (stats.net_goals || 0) < 0 ? 'text-red-600' : 'text-slate-600'
                      } mt-1`}>
                      {(stats.net_goals || 0) > 0 ? '+' : ''}{stats.net_goals || 0}
                    </p>
                  </div>
                </div>

                {/* Secondary Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
                  <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 uppercase font-bold">Win Rate</p>
                    <p className="text-2xl font-black text-emerald-600 mt-1">{winRate}%</p>
                  </div>
                  <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 uppercase font-bold text-purple-600">Goals/Game</p>
                    <p className="text-2xl font-black text-purple-600 mt-1">{goalsPerGame}</p>
                  </div>
                  <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 uppercase font-bold text-red-600">GC/Game</p>
                    <p className="text-2xl font-black text-red-600 mt-1">
                      {typeof stats.conceded_per_game === 'number' ? stats.conceded_per_game.toFixed(2) : (stats.conceded_per_game || '0.00')}
                    </p>
                  </div>
                  {stats.average_rating > 0 && (
                    <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 text-center">
                      <p className="text-[9px] text-slate-400 uppercase font-bold text-amber-600">Avg Rating</p>
                      <p className="text-2xl font-black text-amber-600 mt-1">{stats.average_rating.toFixed(1)}</p>
                    </div>
                  )}
                </div>

                {/* Goal breakdown */}
                {(stats.goals_conceded !== undefined || stats.net_goals !== undefined || stats.conceded_per_game !== undefined) && (
                  <div className="border-t border-slate-100 pt-6">
                    <h4 className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider mb-4">Goal Breakdown</h4>
                    <div className="grid grid-cols-3 gap-4 font-mono">
                      <div className="bg-rose-50/30 rounded-xl p-4 text-center border border-rose-100/50">
                        <p className="text-[9px] text-rose-700 font-bold uppercase">Conceded</p>
                        <p className="text-2xl font-black text-rose-600 mt-1">{stats.goals_conceded || 0}</p>
                        {stats.conceded_per_game && (
                          <p className="text-[9px] text-rose-500 font-semibold mt-1">{stats.conceded_per_game} / game</p>
                        )}
                      </div>
                      <div className={`rounded-xl p-4 text-center border ${
                        goalDifference > 0
                          ? 'bg-emerald-50/30 border-emerald-100/50'
                          : goalDifference < 0
                            ? 'bg-rose-50/30 border-rose-100/50'
                            : 'bg-slate-50/30 border-slate-100/50'
                      }`}>
                        <p className="text-[9px] text-slate-500 font-bold uppercase">Goal Diff</p>
                        <p className={`text-2xl font-black ${goalDifference > 0 ? 'text-emerald-600' : goalDifference < 0 ? 'text-red-600' : 'text-slate-600'} mt-1`}>
                          {goalDifference > 0 ? '+' : ''}{goalDifference}
                        </p>
                      </div>
                      <div className="bg-emerald-50/30 rounded-xl p-4 text-center border border-emerald-100/50">
                        <p className="text-[9px] text-emerald-700 font-bold uppercase">Scored</p>
                        <p className="text-2xl font-black text-emerald-600 mt-1">{stats.goals_scored || 0}</p>
                        {stats.goals_per_game && (
                          <p className="text-[9px] text-emerald-500 font-semibold mt-1">{stats.goals_per_game} / game</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Progress metrics */}
                <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider mb-4">Performance Metrics</h4>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-1 text-xs">
                        <span className="text-slate-500 font-mono">GOALS PER GAME</span>
                        <span className="font-bold font-mono text-slate-700">{goalsPerGame}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200/40">
                        <div
                          className="h-2.5 bg-gradient-to-r from-amber-500 to-amber-600 rounded-full"
                          style={{ width: `${Math.min(parseFloat(goalsPerGame as string) * 50, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1 text-xs">
                        <span className="text-slate-500 font-mono">WIN PERCENTAGE</span>
                        <span className="font-bold font-mono text-slate-700">{winRate}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200/40">
                        <div
                          className="h-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full"
                          style={{ width: `${winRate}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Team Trophies */}
            {selectedView === 'season' && selectedSeasonId && !trophiesLoading && teamTrophies.length > 0 && (
              <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm space-y-6">
                <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
                  <AwardIcon className="w-4 h-4 mr-2 text-amber-500" /> Team Trophies
                </h3>
                <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">
                  {currentSeasonData.season_name || 'This Season'} • {currentSeasonData.team || 'Squad'}
                </p>

                {teamStats && teamStats.position && (
                  <div className="p-3 bg-blue-50 border border-blue-200/50 rounded-xl flex items-center justify-between font-mono text-xs">
                    <span className="font-bold text-blue-800">LEAGUE POSITION</span>
                    <span className="text-xl font-black text-blue-700">#{teamStats.position}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 justify-items-center">
                  {teamTrophies.map((trophy) => {
                    const isLeague = trophy.trophy_type === 'league';
                    const isCup = trophy.trophy_type === 'cup';
                    return (
                      <div
                        key={trophy.id}
                        className={`fut-card p-4 flex flex-col justify-between ${
                          isLeague ? 'fut-card-gold' : isCup ? 'fut-card-silver' : 'fut-card-bronze'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[8px] font-mono text-slate-400 uppercase block">TROPHY</span>
                          <AwardIcon className="w-4 h-4 text-amber-500" />
                        </div>

                        <div className="text-center py-2">
                          <AwardIcon className="w-9 h-9 text-amber-500/80 mx-auto mb-1.5" />
                          <h4 className="font-bold text-slate-900 text-xs truncate max-w-[130px]">{trophy.trophy_name}</h4>
                          {trophy.position && (
                            <p className="text-[9px] text-slate-500 font-mono mt-0.5">Rank: #{trophy.position}</p>
                          )}
                        </div>

                        <div className="border-t border-slate-200/50 pt-2 flex justify-between items-center text-[8px] font-mono">
                          <span className="text-slate-400">TYPE:</span>
                          <span className="font-bold text-slate-700 uppercase">{trophy.trophy_type.replace('_', ' ')}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Player Awards */}
            {selectedView === 'season' && selectedSeasonId && !awardsLoading && playerAwards.length > 0 && (
              <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm space-y-6">
                <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
                  <AwardIcon className="w-4 h-4 mr-2 text-purple-600" /> Player Awards
                </h3>
                <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">
                  {currentSeasonData.season_name || 'This Season'}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 justify-items-center">
                  {playerAwards.map((award) => {
                    const isNewTable = award.round_number !== undefined || award.week_number !== undefined;
                    const awardName = isNewTable ? award.award_category : award.award_type;
                    const awardTypeCategory = isNewTable ? 'individual' : award.award_category;
                    const isWinner = award.award_position?.toLowerCase() === 'winner' || !award.award_position;
                    const isRunnerUp = award.award_position?.toLowerCase() === 'runner-up';

                    return (
                      <div
                        key={award.id}
                        className={`fut-card p-4 flex flex-col justify-between ${
                          isWinner ? 'fut-card-gold' : isRunnerUp ? 'fut-card-silver' : 'fut-card-bronze'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[8px] font-mono text-slate-400 uppercase block">
                            {awardTypeCategory === 'category' ? 'CATEGORY' : 'INDIVIDUAL'}
                          </span>
                          <AwardIcon className="w-4 h-4 text-amber-500" />
                        </div>

                        <div className="text-center py-2">
                          <AwardIcon className="w-9 h-9 text-amber-500/80 mx-auto mb-1.5" />
                          <h4 className="font-bold text-slate-900 text-xs truncate max-w-[130px]">{awardName}</h4>
                          {award.round_number && (
                            <p className="text-[9px] text-slate-500 font-mono mt-0.5">Round {award.round_number}</p>
                          )}
                          {award.week_number && (
                            <p className="text-[9px] text-slate-500 font-mono mt-0.5">Week {award.week_number}</p>
                          )}
                        </div>

                        <div className="border-t border-slate-200/50 pt-2 flex justify-between items-center text-[8px] font-mono">
                          <span className="text-slate-400">AWARD:</span>
                          <span className="font-bold text-amber-700 uppercase">{award.award_position || 'WINNER'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Round Performance breakdown */}
            {selectedView === 'season' && selectedSeasonId && currentSeasonData.round_performance && Object.keys(currentSeasonData.round_performance).length > 0 && (
              <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center border-b border-slate-100 pb-3">
                  <Activity className="w-4 h-4 mr-2 text-primary" /> Round Performance
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(currentSeasonData.round_performance).map(([roundKey, roundData]: [string, any]) => (
                    <div key={roundKey} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 transition-all font-mono">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-bold text-slate-700 uppercase">{roundKey}</h4>
                        <span className="text-[10px] font-bold text-slate-400">{roundData.matches} matches</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-white border border-slate-150 rounded-lg p-2">
                          <p className="text-[9px] text-slate-400 uppercase">Goals</p>
                          <p className="text-sm font-bold text-purple-600 mt-0.5">{roundData.goals || 0}</p>
                        </div>
                        <div className="bg-white border border-slate-150 rounded-lg p-2">
                          <p className="text-[9px] text-slate-400 uppercase">Conceded</p>
                          <p className="text-sm font-bold text-red-600 mt-0.5">{roundData.goals_conceded || 0}</p>
                        </div>
                        <div className="bg-white border border-slate-150 rounded-lg p-2">
                          <p className="text-[9px] text-slate-400 uppercase">GD</p>
                          <p className={`text-sm font-bold ${roundData.goal_difference > 0 ? 'text-emerald-600' : roundData.goal_difference < 0 ? 'text-rose-600' : 'text-slate-600'} mt-0.5`}>
                            {roundData.goal_difference > 0 ? '+' : ''}{roundData.goal_difference}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs mt-2">
                        <div className="bg-white border border-slate-150 rounded-lg p-2">
                          <p className="text-[9px] text-slate-400 uppercase">W/D/L</p>
                          <p className="text-[10px] font-bold text-slate-800 mt-1">
                            {roundData.wins}/{roundData.draws}/{roundData.losses}
                          </p>
                        </div>
                        <div className="bg-white border border-slate-150 rounded-lg p-2">
                          <p className="text-[9px] text-slate-400 uppercase">POTM</p>
                          <p className="text-sm font-bold text-amber-600 mt-0.5">{roundData.potm_count || 0}</p>
                        </div>
                        <div className="bg-white border border-slate-150 rounded-lg p-2">
                          <p className="text-[9px] text-slate-400 uppercase">Points</p>
                          <p className="text-sm font-bold text-amber-600 mt-0.5">{roundData.points || 0}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Match History */}
            {selectedView === 'season' && selectedSeasonId && matchHistory && matchHistory.length > 0 && (
              <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden space-y-4">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-150">
                  <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider">Match History</h3>
                </div>

                <div className="p-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead>
                      <tr className="font-mono text-[9px] text-slate-400 font-bold uppercase tracking-wider text-center">
                        <th className="px-4 py-2 text-left">Match</th>
                        <th className="px-4 py-2">Result</th>
                        <th className="px-4 py-2">GS</th>
                        <th className="px-4 py-2">GC</th>
                        <th className="px-4 py-2">GD</th>
                        <th className="px-4 py-2">POTM</th>
                        <th className="px-4 py-2 text-amber-600">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-center font-mono text-xs text-slate-700">
                      {matchHistory.map((match, index) => (
                        <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 text-left font-bold text-slate-900">
                            {match.opponent ? `vs ${match.opponent}` : `Match ${match.match_number}`}
                          </td>
                          <td className={`px-4 py-3 font-bold ${
                            match.result === 'win' ? 'text-emerald-600' :
                            match.result === 'loss' ? 'text-rose-600' :
                            'text-amber-500'
                          }`}>
                            {match.result.toUpperCase()}
                          </td>
                          <td className="px-4 py-3 text-purple-600 font-bold">
                            {match.player_goals}
                          </td>
                          <td className="px-4 py-3 text-red-650 font-semibold">
                            {match.opponent_goals}
                          </td>
                          <td className={`px-4 py-3 font-bold ${
                            match.player_goals - match.opponent_goals > 0 ? 'text-emerald-600' :
                            match.player_goals - match.opponent_goals < 0 ? 'text-rose-600' :
                            'text-slate-650'
                          }`}>
                            {match.player_goals - match.opponent_goals > 0 ? '+' : ''}
                            {match.player_goals - match.opponent_goals}
                          </td>
                          <td className="px-4 py-3 text-amber-600 font-bold">
                            {match.is_potm ? '★' : '—'}
                          </td>
                          <td className="px-4 py-3 text-amber-600 font-black">
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
