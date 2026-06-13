'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import OptimizedImage from '@/components/OptimizedImage';

interface RealPlayer {
  player_id: string;
  player_name: string;
  display_name?: string;
  photo_url?: string;
  photo_position_x_circle?: number;
  photo_position_y_circle?: number;
  photo_scale_circle?: number;
  team: string;
  team_id: string;
  category: string;
  star_rating: number;
  base_value?: number;
  auction_value?: number;
  points: number;
  matches_played: number;
  goals_scored: number;
  assists: number;
}

interface PlayerPlan {
  id: string;
  player_id?: string;
  name: string;
  photo_url?: string;
  photo_position_x_circle?: number;
  photo_position_y_circle?: number;
  photo_scale_circle?: number;
  category?: string;
  initialStars: number;
  basePrice: number;
  currentPoints: number;
  bidAmount: number;
  finalStars: number;
  matches: number;
}

// Star upgrade matrix based on specifications
const UPGRADE_MATRIX: Record<number, Record<number, number>> = {
  3: { 140: 4, 265: 5, 415: 6, 590: 7, 790: 8, 1040: 9, 1540: 10 },
  4: { 195: 5, 345: 6, 520: 7, 720: 8, 970: 9, 1470: 10 },
  5: { 250: 6, 425: 7, 625: 8, 875: 9, 1375: 10 },
  6: { 305: 7, 505: 8, 755: 9, 1255: 10 },
  7: { 360: 8, 610: 9, 1100: 10 },
  8: { 440: 9, 940: 10 },
  9: { 710: 10 }
};

const REQUIRED_PLAYERS = 5; // Exact count - will be fetched from season settings
const TOTAL_BUDGET = 1000;
const MIN_BID = 100;
const DEFAULT_MATCHES = 38;

// Points based on star rating
const STAR_RATING_POINTS: Record<number, number> = {
  3: 100,
  4: 120,
  5: 145,
  6: 175,
  7: 210,
  8: 250,
  9: 300,
  10: 375
};

// Calculate minimum bid based on star rating (base price to maintain that rating)
const getMinimumBidForStars = (stars: number): number => {
  const baseValues: Record<number, number> = {
    3: 100,  // Starting minimum
    4: 140,  // Minimum to stay at 4★
    5: 195,  // Minimum to stay at 5★
    6: 250,  // Minimum to stay at 6★
    7: 305,  // Minimum to stay at 7★
    8: 360,  // Minimum to stay at 8★
    9: 440,  // Minimum to stay at 9★
    10: 710  // Minimum to stay at 10★
  };
  return baseValues[stars] || 100;
};

// Calculate star rating from points
const calculateStarRatingFromPoints = (points: number): number => {
  if (points >= 350) return 10;
  if (points >= 300) return 9;
  if (points >= 250) return 8;
  if (points >= 210) return 7;
  if (points >= 175) return 6;
  if (points >= 145) return 5;
  if (points >= 120) return 4;
  return 3;
};

// Generate photo transform style based on custom positioning (matching PlayerPhoto component)
const getPhotoStyle = (x?: number, y?: number, scale?: number) => {
  const posX = x ?? 50;
  const posY = y ?? 50;
  const scaleValue = scale ?? 1;

  return {
    objectPosition: `${posX}% ${posY}%`,
    transform: `scale(${scaleValue})`,
    transformOrigin: `${posX}% ${posY}%`,
  };
};

export default function RealPlayersPlannerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [players, setPlayers] = useState<PlayerPlan[]>([]);
  const [requiredPlayers, setRequiredPlayers] = useState(REQUIRED_PLAYERS); // Fetch from season settings
  const [availableRealPlayers, setAvailableRealPlayers] = useState<RealPlayer[]>([]);
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);
  const [searchTerms, setSearchTerms] = useState<Record<number, string>>({});
  const [showUpgradeMatrix, setShowUpgradeMatrix] = useState(false);
  const [teamBudget, setTeamBudget] = useState(TOTAL_BUDGET);
  const [teamSpent, setTeamSpent] = useState(0);
  const [starRatingConfig, setStarRatingConfig] = useState<Record<number, number>>({});
  const [isLoadingBudget, setIsLoadingBudget] = useState(true);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch team's actual SSCoin budget and available real players
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        // Fetch active season first
        const seasonResponse = await fetchWithTokenRefresh('/api/cached/firebase/seasons?isActive=true');
        if (!seasonResponse.ok) {
          console.error('Failed to fetch active season');
          return;
        }

        const seasonData = await seasonResponse.json();
        if (!seasonData.success || seasonData.data.length === 0) {
          console.error('No active season found');
          return;
        }

        const season = seasonData.data[0];
        const seasonId = season.id;

        console.log('🎯 Active season:', seasonId);

        // Fetch budget with season_id parameter
        const response = await fetchWithTokenRefresh(`/api/team/dashboard?season_id=${seasonId}`);
        
        if (!response.ok) {
          console.error('❌ Dashboard API error:', response.status, response.statusText);
          const errorData = await response.json();
          console.error('Error details:', errorData);
          // Use default budget if API fails
          setTeamBudget(TOTAL_BUDGET);
          setTeamSpent(0);
        } else {
          const data = await response.json();
          console.log('📊 Dashboard API response:', data);

          if (data.success && data.data) {
            const teamSeason = data.data.seasonParticipation || {};
            const seasonSettings = data.data.seasonSettings || {};

            console.log('💰 Budget data:', {
              real_player_budget_from_teamSeason: teamSeason.real_player_budget,
              dollar_budget_from_seasonSettings: seasonSettings.dollar_budget,
              real_player_spent_from_teamSeason: teamSeason.real_player_spent,
              TOTAL_BUDGET_constant: TOTAL_BUDGET
            });

            // Use real_player_budget from team_seasons (Firebase)
            const budget = teamSeason.real_player_budget || seasonSettings.dollar_budget || TOTAL_BUDGET;
            const spent = teamSeason.real_player_spent || 0;
            
            console.log('✅ Setting budget:', budget, 'spent:', spent);
            
            setTeamBudget(budget);
            setTeamSpent(spent);
          } else {
            console.warn('⚠️ API returned success but no data, using defaults');
            setTeamBudget(TOTAL_BUDGET);
            setTeamSpent(0);
          }
        }

        // Extract star rating config
        if (season.star_rating_config && Array.isArray(season.star_rating_config)) {
          const configMap: Record<number, number> = {};
          season.star_rating_config.forEach((config: any) => {
            if (config.star_rating && config.base_auction_value) {
              configMap[config.star_rating] = config.base_auction_value;
            }
          });
          setStarRatingConfig(configMap);
          console.log('⭐ Star rating config loaded:', configMap);
        }

        // Fetch real players
        const playersResponse = await fetchWithTokenRefresh(`/api/stats/players?seasonId=${seasonId}&limit=1000`);
        if (playersResponse.ok) {
          const playersData = await playersResponse.json();
          if (playersData.success) {
            const realPlayers = playersData.data?.filter((p: any) => p.star_rating && p.star_rating > 0) || [];

            // Fetch photo URLs
            const playerIds = realPlayers.map((p: any) => p.player_id).filter(Boolean);
            if (playerIds.length > 0) {
              try {
                const photosResponse = await fetchWithTokenRefresh('/api/real-players?' + new URLSearchParams({
                  playerIds: playerIds.join(',')
                }));

                if (photosResponse.ok) {
                  const photosData = await photosResponse.json();
                  if (photosData.success && photosData.players) {
                    const photoMap = new Map(
                      photosData.players.map((p: any) => [
                        p.player_id,
                        {
                          photo_url: p.photo_url,
                          photo_position_x_circle: p.photo_position_x_circle,
                          photo_position_y_circle: p.photo_position_y_circle,
                          photo_scale_circle: p.photo_scale_circle
                        }
                      ])
                    );

                    realPlayers.forEach((player: any) => {
                      const photoData = photoMap.get(player.player_id);
                      if (photoData) {
                        player.photo_url = photoData.photo_url;
                        player.photo_position_x_circle = photoData.photo_position_x_circle;
                        player.photo_position_y_circle = photoData.photo_position_y_circle;
                        player.photo_scale_circle = photoData.photo_scale_circle;
                      }
                    });
                  }
                }
              } catch (photoError) {
                console.warn('Could not fetch player photos:', photoError);
              }
            }

            setAvailableRealPlayers(realPlayers);
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoadingBudget(false);
        setIsLoadingPlayers(false);
      }
    };

    fetchData();
  }, [user]);

  // Initialize with minimum 5 players
  useEffect(() => {
    if (players.length === 0) {
      const initialPlayers: PlayerPlan[] = Array.from({ length: requiredPlayers }, (_, i) =>
        createEmptyPlayer(i)
      );
      setPlayers(initialPlayers);
    }
  }, [requiredPlayers]);

  const createEmptyPlayer = (index: number): PlayerPlan => ({
    id: `player-${Date.now()}-${index}`,
    name: 'Select a player...',
    initialStars: 3,
    basePrice: 100,
    currentPoints: 100,
    bidAmount: 0,
    finalStars: 3,
    matches: 0
  });

  const selectRealPlayer = (realPlayer: RealPlayer, index: number) => {
    console.log('🎯 selectRealPlayer called', { realPlayer: realPlayer.player_name, index });

    setPlayers(players.map((player, i) => {
      if (i !== index) return player;

      const initialStars = realPlayer.star_rating || 3;
      // Player's current auction value is their base price
      const playerBasePrice = realPlayer.auction_value || starRatingConfig[initialStars] || getMinimumBidForStars(initialStars);

      const updated = {
        ...player,
        player_id: realPlayer.player_id,
        name: realPlayer.display_name || realPlayer.player_name,
        photo_url: realPlayer.photo_url,
        photo_position_x_circle: realPlayer.photo_position_x_circle,
        photo_position_y_circle: realPlayer.photo_position_y_circle,
        photo_scale_circle: realPlayer.photo_scale_circle,
        category: realPlayer.category,
        initialStars: initialStars,
        basePrice: playerBasePrice,
        currentPoints: realPlayer.points || 100,
        bidAmount: playerBasePrice
      };

      // Recalculate with new star rating and bid amount
      updated.finalStars = calculateFinalStars(updated.initialStars, updated.bidAmount);

      console.log('✅ Player updated', updated);
      return updated;
    }));

    console.log('🚪 Closing dropdown');
    setOpenDropdownIndex(null);
    setSearchTerms({ ...searchTerms, [index]: '' });
  };

  const toggleDropdown = (index: number) => {
    setOpenDropdownIndex(openDropdownIndex === index ? null : index);
    if (openDropdownIndex !== index) {
      setSearchTerms({ ...searchTerms, [index]: '' });
    }
  };

  const getFilteredPlayersForDropdown = (index: number) => {
    const searchTerm = searchTerms[index] || '';
    const searchLower = searchTerm.toLowerCase();

    return availableRealPlayers
      .filter(p => {
        return (
          p.player_name?.toLowerCase().includes(searchLower) ||
          p.display_name?.toLowerCase().includes(searchLower) ||
          p.team?.toLowerCase().includes(searchLower)
        );
      })
      .filter(p => !players.some(plan => plan.player_id === p.player_id));
  };

  const calculateFinalStars = (initialStars: number, bidAmount: number): number => {
    if (initialStars < 3 || initialStars > 9) return initialStars;
    if (initialStars === 10) return 10;

    const upgrades = UPGRADE_MATRIX[initialStars];
    if (!upgrades) return initialStars;

    // Find the highest upgrade the bid amount qualifies for
    const sortedThresholds = Object.keys(upgrades)
      .map(Number)
      .sort((a, b) => b - a); // Sort descending

    for (const threshold of sortedThresholds) {
      if (bidAmount >= threshold) {
        return upgrades[threshold];
      }
    }

    return initialStars;
  };

  const updatePlayer = (id: string, field: keyof PlayerPlan, value: any) => {
    setPlayers(players.map(player => {
      if (player.id !== id) return player;

      const updated = { ...player, [field]: value };

      // Recalculate when initialStars, bidAmount, or matches changes
      if (field === 'initialStars' || field === 'bidAmount' || field === 'matches') {
        updated.finalStars = calculateFinalStars(updated.initialStars, updated.bidAmount);
      }

      return updated;
    }));
  };

  const addPlayer = () => {
    if (players.length < requiredPlayers) {
      setPlayers([...players, createEmptyPlayer(players.length)]);
    }
  };

  const removePlayer = (id: string) => {
    if (players.length > requiredPlayers) {
      setPlayers(players.filter(p => p.id !== id));
    }
  };

  // Calculate totals
  const totalPlannedSpend = players.reduce((sum, p) => sum + p.bidAmount, 0);
  const remainingBudget = teamBudget - teamSpent - totalPlannedSpend;

  const getNextUpgrade = (currentPoints: number, currentBid: number, basePrice: number): { amount: number; stars: number; pointsNeeded: number } | null => {
    const currentStars = calculateStarRatingFromPoints(currentPoints);

    if (currentStars >= 10) return null;

    // Star rating thresholds
    const starThresholds: Record<number, number> = {
      4: 120,
      5: 145,
      6: 175,
      7: 210,
      8: 250,
      9: 300,
      10: 350
    };

    // Find the next star rating threshold
    const nextStars = currentStars + 1;
    const pointsNeeded = starThresholds[nextStars];

    if (!pointsNeeded) return null;

    // Calculate how many more points needed
    const pointsToGain = pointsNeeded - currentPoints;

    if (pointsToGain <= 0) return null; // Already at or above next threshold

    // Calculate SSCoin needed: each +5 SSCoin = +1 point
    const ssCoinNeeded = pointsToGain * 5;
    const bidAmount = basePrice + ssCoinNeeded;

    return {
      amount: bidAmount,
      stars: nextStars,
      pointsNeeded: pointsNeeded
    };
  };

  // Generate bid increments with points preview
  const getBidIncrements = (initialStars: number, currentBid: number, playerBasePrice: number, playerCurrentPoints: number): Array<{ bid: number; stars: number; points: number; isUpgrade: boolean }> => {
    const increments: Array<{ bid: number; stars: number; points: number; isUpgrade: boolean }> = [];
    const upgrades = UPGRADE_MATRIX[initialStars];

    if (!upgrades) return increments;

    // Get all upgrade thresholds
    const thresholds = Object.keys(upgrades).map(Number).sort((a, b) => a - b);

    // Start from current bid or minimum, go up to highest upgrade + 20
    const minBid = starRatingConfig[initialStars] || getMinimumBidForStars(initialStars);
    const startBid = Math.max(currentBid, minBid);
    const maxThreshold = Math.max(...thresholds);
    const maxBid = maxThreshold + 20;

    // Generate increments in steps of 5
    for (let bid = startBid; bid <= maxBid && increments.length < 10; bid += 5) {
      // Calculate points: current points + 1 point for each +5 SSCoin above base price
      const bidDifference = bid - playerBasePrice;
      const pointsIncrement = Math.floor(bidDifference / 5);
      const points = playerCurrentPoints + pointsIncrement;

      // Calculate star rating from points (250 points = 8★, etc.)
      const stars = calculateStarRatingFromPoints(points);

      // Check if this increment crosses a star upgrade threshold
      const prevBid = bid - 5;
      const prevBidDifference = prevBid - playerBasePrice;
      const prevPointsIncrement = Math.floor(prevBidDifference / 5);
      const prevPoints = playerCurrentPoints + prevPointsIncrement;
      const prevStars = calculateStarRatingFromPoints(prevPoints);
      const justUpgraded = stars > prevStars;

      increments.push({ bid, stars, points, isUpgrade: justUpgraded });
    }

    return increments;
  };

  if (loading || isLoadingBudget || isLoadingPlayers) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Real Players Planner...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team') {
    return null;
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Back Link */}
        <Link
          href="/dashboard"
          className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit mb-4"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Dashboard
        </Link>

        {/* Header Title Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono relative overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/10 flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800">
                  Real Players Planner
                </h1>
                <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                  Select exactly {requiredPlayers} SS Members for auction
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Budget Overview Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Budget */}
          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-sky-500 rounded-2xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">SSCoin Budget</p>
              <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200/50 rounded-lg text-[9px] font-black uppercase">Total Budget</span>
            </div>
            <p className="text-2xl font-black text-slate-800">{teamBudget.toLocaleString()} SSCoin</p>
            <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
              Available to spend
            </div>
          </div>

          {/* Card 2: Planned */}
          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-purple-500 rounded-2xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Planned Spending</p>
              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200/50 rounded-lg text-[9px] font-black uppercase">Estimated</span>
            </div>
            <p className="text-2xl font-black text-purple-700">{totalPlannedSpend.toLocaleString()} SSCoin</p>
            <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
              Roster target: <span className="text-slate-700">{players.length} players selected</span>
            </div>
          </div>

          {/* Card 3: Remaining */}
          {(() => {
            const isOverBudget = remainingBudget < 0;
            return (
              <div className={`console-card bg-white border border-slate-200/60 border-l-4 rounded-2xl p-5 shadow-sm ${isOverBudget ? 'border-l-rose-500' : 'border-l-emerald-500'}`}>
                <div className="flex justify-between items-center mb-3">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Remaining Balance</p>
                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${isOverBudget ? 'bg-rose-50 text-rose-700 border-rose-200/50' : 'bg-emerald-50 text-emerald-700 border-emerald-200/50'}`}>
                    {isOverBudget ? 'Over Budget' : 'Remaining'}
                  </span>
                </div>
                <p className={`text-2xl font-black ${isOverBudget ? 'text-rose-650' : 'text-emerald-700'}`}>
                  {remainingBudget.toLocaleString()} SSCoin
                </p>
                <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                  Spent: <span className="text-slate-700">{teamSpent > 0 ? `${teamSpent} SSCoin` : 'Not spent'}</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={addPlayer}
            disabled={players.length >= requiredPlayers}
            className="px-4 py-2.5 bg-slate-800 text-amber-400 border border-slate-900 rounded-xl hover:bg-slate-700 hover:shadow-md transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            Add Player {players.length >= requiredPlayers && '(Roster Full)'}
          </button>

          <button
            onClick={() => setShowUpgradeMatrix(!showUpgradeMatrix)}
            className="px-4 py-2.5 bg-white border border-slate-200/60 rounded-xl hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit cursor-pointer shadow-sm"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {showUpgradeMatrix ? 'Hide' : 'View'} Upgrade Matrix
          </button>
        </div>

        {/* Upgrade Matrix Panel */}
        {showUpgradeMatrix && (
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Star Upgrade Threshold Matrix</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">SSCoin bid amounts required to upgrade players to higher star ratings</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(UPGRADE_MATRIX).map(([initialStar, upgrades]) => (
                <div key={initialStar} className="bg-slate-50/50 border border-slate-200/40 rounded-xl p-4 font-mono">
                  <h3 className="font-extrabold text-xs text-amber-600 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-200/60 flex justify-between items-center">
                    <span>{initialStar}★ Initial Rating</span>
                    <span className="bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded uppercase font-bold font-mono">Base</span>
                  </h3>
                  <div className="space-y-1.5">
                    {Object.entries(upgrades).map(([amount, finalStar]) => (
                      <div key={amount} className="flex justify-between text-xs py-0.5 border-b border-slate-100 last:border-b-0 font-semibold text-slate-600">
                        <span>Bid SSCoin {amount}</span>
                        <span className="font-extrabold text-emerald-600">→ {finalStar}★ Rating</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Player Cards List */}
        <div className="space-y-4">
          {players.map((player, index) => {
            const nextUpgrade = getNextUpgrade(player.currentPoints, player.bidAmount, player.basePrice);
            return (
              <div
                key={player.id}
                className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm transition-all duration-200"
                style={{ position: 'relative', zIndex: openDropdownIndex === index ? 100 : 1 }}
              >
                {/* Header info */}
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                  <h3 className="text-xs font-black text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                    <span className="bg-slate-800 text-amber-400 w-6 h-6 border border-slate-900 rounded-lg flex items-center justify-center font-black text-xs shadow-md">{index + 1}</span>
                    <span> Roster Slot {index + 1}</span>
                  </h3>
                  <button
                    onClick={() => removePlayer(player.id)}
                    disabled={players.length <= requiredPlayers}
                    className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title={players.length <= requiredPlayers ? `Exactly ${requiredPlayers} players required` : 'Remove player'}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column: Player dropdown & bid input */}
                  <div className="space-y-4">
                    {/* Player Selection Dropdown */}
                    <div className="relative">
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Player Selection</label>
                      <button
                        onClick={() => toggleDropdown(index)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 hover:border-amber-400/40 hover:bg-slate-50 transition-colors text-left flex items-center gap-3 cursor-pointer shadow-sm bg-white"
                      >
                        {player.photo_url ? (
                          <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 border border-slate-200/80 shadow-sm relative bg-slate-100">
                            <OptimizedImage
                              src={player.photo_url}
                              alt={player.name}
                              width={80}
                              height={80}
                              quality={85}
                              className="w-full h-full object-cover"
                              style={getPhotoStyle(player.photo_position_x_circle, player.photo_position_y_circle, player.photo_scale_circle)}
                              fallback={
                                <div className="w-full h-full flex items-center justify-center bg-slate-800 text-amber-400 font-extrabold text-xs">
                                  {player.name[0].toUpperCase()}
                                </div>
                              }
                            />
                          </div>
                        ) : player.player_id ? (
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-800 text-amber-400 font-extrabold text-xs flex-shrink-0">
                            {player.name[0].toUpperCase()}
                          </div>
                        ) : (
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 text-slate-400 font-extrabold text-xs flex-shrink-0">
                            ?
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs font-extrabold ${!player.player_id ? 'text-slate-400 uppercase' : 'text-slate-800'}`}>
                            {player.name}
                          </div>
                          {player.category && (
                            <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{player.category}</div>
                          )}
                        </div>
                        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Dropdown list popup */}
                      {openDropdownIndex === index && (
                        <div className="absolute w-full mt-2 bg-white rounded-xl shadow-xl border border-slate-200 max-h-96 overflow-hidden flex flex-col z-50">
                          <div className="p-2 border-b border-slate-100">
                            <input
                              type="text"
                              placeholder="Search player name or team..."
                              value={searchTerms[index] || ''}
                              onChange={(e) => setSearchTerms({ ...searchTerms, [index]: e.target.value })}
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                            />
                          </div>
                          <div className="overflow-y-auto max-h-72 divide-y divide-slate-100">
                            {getFilteredPlayersForDropdown(index).length === 0 ? (
                              <div className="p-4 text-center text-slate-400 text-xs font-bold uppercase">
                                {searchTerms[index] ? 'No matching members' : 'All members selected'}
                              </div>
                            ) : (
                              getFilteredPlayersForDropdown(index).map((realPlayer) => (
                                <button
                                  key={realPlayer.player_id}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    selectRealPlayer(realPlayer, index);
                                  }}
                                  className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-left"
                                >
                                  {/* Photo */}
                                  <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 border border-slate-200 shadow-sm relative bg-slate-100">
                                    {realPlayer.photo_url ? (
                                      <OptimizedImage
                                        src={realPlayer.photo_url}
                                        alt={realPlayer.player_name}
                                        width={80}
                                        height={80}
                                        quality={85}
                                        className="w-full h-full object-cover"
                                        style={getPhotoStyle(realPlayer.photo_position_x_circle, realPlayer.photo_position_y_circle, realPlayer.photo_scale_circle)}
                                        fallback={
                                          <div className="w-full h-full flex items-center justify-center bg-slate-800 text-amber-400 font-extrabold text-xs">
                                            {realPlayer.player_name[0].toUpperCase()}
                                          </div>
                                        }
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center bg-slate-800 text-amber-400 font-extrabold text-xs">
                                        {realPlayer.player_name[0].toUpperCase()}
                                      </div>
                                    )}
                                  </div>

                                  {/* Details */}
                                  <div className="flex-1 min-w-0">
                                    <div className="font-extrabold text-slate-800 text-xs truncate">
                                      {realPlayer.display_name || realPlayer.player_name}
                                    </div>
                                    <div className="text-[9px] text-slate-400 font-bold uppercase truncate">{realPlayer.team}</div>
                                    <div className="flex items-center gap-1.5 mt-1">
                                      {realPlayer.category && (
                                        <span className={`px-1.5 py-0.2 text-[8px] font-black uppercase rounded ${
                                          realPlayer.category.toLowerCase() === 'legend'
                                            ? 'bg-amber-100 text-amber-800 border border-amber-200/50'
                                            : 'bg-blue-100 text-blue-800 border border-blue-200/50'
                                        }`}>
                                          {realPlayer.category}
                                        </span>
                                      )}
                                      <span className="px-1.5 py-0.2 text-[8px] font-black uppercase rounded bg-purple-100 text-purple-800 border border-purple-200/50">
                                        {realPlayer.star_rating || 3}★
                                      </span>
                                    </div>
                                  </div>

                                  {/* Stats */}
                                  <div className="flex gap-3 text-center text-[10px] font-bold flex-shrink-0 pr-1">
                                    <div>
                                      <div className="font-extrabold text-slate-800">{realPlayer.points || 0}</div>
                                      <div className="text-[8px] text-slate-400 uppercase">Pts</div>
                                    </div>
                                    <div>
                                      <div className="font-extrabold text-emerald-600">⚽ {realPlayer.goals_scored || 0}</div>
                                      <div className="text-[8px] text-slate-400 uppercase">Gls</div>
                                    </div>
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Inputs Row (Bid and Matches) */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Bid input */}
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Bid Amount (SSCoin)</label>
                        <input
                          type="number"
                          value={player.bidAmount || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            updatePlayer(player.id, 'bidAmount', value === '' ? 0 : Number(value));
                          }}
                          min={player.basePrice}
                          step={10}
                          placeholder="Enter bid"
                          className={`w-full py-2 px-3 bg-white border rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono ${
                            player.player_id && player.bidAmount > 0 && player.bidAmount < player.basePrice
                              ? 'border-rose-450 bg-rose-50/50'
                              : 'border-slate-200'
                          }`}
                          disabled={!player.player_id}
                        />
                        {player.player_id && player.bidAmount > 0 && player.bidAmount < player.basePrice ? (
                          <span className="text-[8px] text-rose-600 font-bold block mt-1 uppercase">Below floor of SSCoin {player.basePrice}</span>
                        ) : (
                          <span className="text-[8px] text-slate-400 font-bold block mt-1 uppercase">
                            {player.player_id ? `Floor: SSCoin ${player.basePrice}` : 'Choose player first'}
                          </span>
                        )}
                      </div>

                      {/* Matches input */}
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Planned Matches</label>
                        <input
                          type="number"
                          value={player.matches || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            updatePlayer(player.id, 'matches', value === '' ? 0 : Number(value));
                          }}
                          min="0"
                          step="1"
                          placeholder="Matches"
                          className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                          disabled={!player.player_id}
                        />
                        <span className="text-[8px] text-slate-400 font-bold block mt-1 uppercase">Matches to schedule</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Star Upgrade display and bid increments preview */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Projected Star rating */}
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 font-mono">
                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-2">⭐ Projected Star Rating</div>
                        {(() => {
                          const currentStarsFromPoints = calculateStarRatingFromPoints(player.currentPoints);
                          const bidDifference = player.bidAmount - player.basePrice;
                          const pointsIncrement = Math.floor(bidDifference / 5);
                          const projectedPoints = player.currentPoints + pointsIncrement;
                          const projectedStars = calculateStarRatingFromPoints(projectedPoints);
                          const isUpgraded = projectedStars > currentStarsFromPoints;

                          return (
                            <div className="flex flex-col gap-1.5">
                              {isUpgraded ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-xl font-black text-slate-450">{currentStarsFromPoints}★</span>
                                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                  </svg>
                                  <span className="text-xl font-black text-emerald-700">{projectedStars}★</span>
                                  <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200/50 rounded-lg text-[8px] font-black uppercase">
                                    Upgraded!
                                  </span>
                                </div>
                              ) : (
                                <div className="text-xl font-black text-slate-700">{currentStarsFromPoints}★</div>
                              )}
                              {nextUpgrade ? (
                                <span className="text-[8px] text-slate-500 font-bold uppercase mt-1 leading-relaxed">
                                  💡 Next upgrade at SSCoin {nextUpgrade.amount} → {nextUpgrade.stars}★ ({nextUpgrade.pointsNeeded} pts)
                                </span>
                              ) : player.player_id ? (
                                <span className="text-[8px] text-emerald-600 font-bold uppercase mt-1">✓ Max 10★ rating reached</span>
                              ) : null}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Bid Increments preview */}
                      {player.player_id && player.bidAmount > 0 && (
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 font-mono">
                          <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-2 flex justify-between">
                            <span>🎯 Bid Increments (+5 SSCoin)</span>
                            <span className="text-[8px] lowercase">(stars & points)</span>
                          </div>
                          <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                            {getBidIncrements(player.initialStars, player.bidAmount, player.basePrice, player.currentPoints).map((increment, idx) => {
                              const isCurrentBid = increment.bid === player.bidAmount;
                              return (
                                <div
                                  key={idx}
                                  className={`flex items-center justify-between text-[10px] py-1 px-1.5 rounded ${
                                    isCurrentBid
                                      ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-sm font-black'
                                      : increment.isUpgrade
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 font-extrabold'
                                      : 'bg-white border border-slate-100 text-slate-650'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span>${increment.bid}</span>
                                    {isCurrentBid && <span className="text-[8px] px-1 bg-slate-900 text-amber-400 border border-slate-950 rounded uppercase font-bold">Cur</span>}
                                    {increment.isUpgrade && !isCurrentBid && <span className="text-[8px] px-1 bg-emerald-100 text-emerald-700 rounded uppercase font-bold">Up</span>}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold">{increment.stars}★</span>
                                    <span className="font-bold">{increment.points} pts</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          </div>

        {/* Warning messages */}
        {players.length !== requiredPlayers && (
          <div className="console-card bg-amber-50/60 border border-amber-200/60 p-4 rounded-xl flex gap-3 items-center">
            <span className="text-lg flex-shrink-0">⚠️</span>
            <div>
              <span className="font-extrabold text-amber-800 text-[10px] uppercase tracking-wider block mb-0.5">Roster Status Warning</span>
              <p className="text-xs sm:text-sm text-amber-900 leading-relaxed font-semibold">
                You must select exactly {requiredPlayers} SS Members. Current selection size: {players.length}
              </p>
            </div>
          </div>
        )}

        {remainingBudget < 0 && (
          <div className="console-card bg-rose-50/60 border border-rose-200/60 p-4 rounded-xl flex gap-3 items-center">
            <span className="text-lg flex-shrink-0">🚨</span>
            <div>
              <span className="font-extrabold text-rose-800 text-[10px] uppercase tracking-wider block mb-0.5">Budget Alert</span>
              <p className="text-xs sm:text-sm text-rose-900 leading-relaxed font-semibold">
                Real player budget exceeded by SSCoin {Math.abs(remainingBudget).toLocaleString()}!
              </p>
            </div>
          </div>
        )}

        {/* Bottom Tips Callout */}
        <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-indigo-500 rounded-2xl p-5 shadow-sm font-mono">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">📝</span>
            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Planning Guidelines</h4>
          </div>
          <ul className="text-xs text-slate-655 space-y-2 leading-relaxed font-semibold">
            <li className="flex items-start gap-1">
              <span>•</span>
              <span>Must have exactly {requiredPlayers} SS Members (Real players) on your squad.</span>
            </li>
            <li className="flex items-start gap-1">
              <span>•</span>
              <span>Strategic SSCoin bid increases directly boost player points and stars.</span>
            </li>
            <li className="flex items-start gap-1">
              <span>•</span>
              <span>Higher final star ratings correspond to increased per-match salaries. Plan according to your budget limits!</span>
            </li>
            <li className="flex items-start gap-1">
              <span>•</span>
              <span>This is a strategic planning sandbox - actual auction results may differ.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
