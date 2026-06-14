'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { PlayerCard } from '@/components/PlayerImage';

interface FootballPlayer {
  id: string;
  player_id: string;
  name: string;
  position?: string;
  overall_rating?: number;
  nationality?: string;
  playing_style?: string;
  foot?: string;
  age?: number;
  nfl_team?: string;
  club?: string;
  team?: {
    id: string;
    name: string;
  };
  team_id?: string;
  acquisition_value?: number;
  acquired_at?: any;
  round_id?: string;
  is_auction_eligible?: boolean;
  
  // Stats
  speed?: number;
  acceleration?: number;
  ball_control?: number;
  dribbling?: number;
  tight_possession?: number;
  offensive_awareness?: number;
  defensive_awareness?: number;
  tackling?: number;
  defensive_engagement?: number;
  low_pass?: number;
  lofted_pass?: number;
  finishing?: number;
  heading?: number;
  stamina?: number;
  physical_contact?: number;
  kicking_power?: number;
  gk_awareness?: number;
  gk_catching?: number;
  gk_parrying?: number;
  gk_reflexes?: number;
  gk_reach?: number;
  [key: string]: any;
}

interface StatsBarProps {
  label: string;
  value: number;
}

const StatsBar: React.FC<StatsBarProps> = ({ label, value }) => {
  const [animatedWidth, setAnimatedWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedWidth(value);
    }, 200);
    return () => clearTimeout(timer);
  }, [value]);

  const getBarColor = (val: number) => {
    if (val >= 85) return 'bg-green-400';
    if (val >= 75) return 'bg-blue-400';
    if (val >= 65) return 'bg-yellow-400';
    return 'bg-gray-400';
  };

  const getBadgeColor = (val: number) => {
    if (val >= 85) return 'bg-green-100 text-green-800';
    if (val >= 75) return 'bg-blue-100 text-blue-800';
    if (val >= 65) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="bg-white/50 rounded-xl p-3 hover:bg-white/60 transition-all duration-300">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-gray-700 font-medium">{label}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getBadgeColor(value)}`}>
          {value}
        </span>
      </div>
      <div className="w-full bg-slate-100 border border-slate-200/60 rounded-full h-2.5 shadow-inner overflow-hidden">
        <div
          className={`h-2.5 rounded-full transition-all duration-700 ${getBarColor(value)}`}
          style={{ width: `${animatedWidth}%` }}
        />
      </div>
    </div>
  );
};

export default function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  const [player, setPlayer] = useState<FootballPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [awards, setAwards] = useState<any[]>([]);
  const [loadingAwards, setLoadingAwards] = useState(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'auction' | 'history'>('stats');
  
  const [auctionHistory, setAuctionHistory] = useState<{
    bidsBySeason: Record<string, any[]>;
    winningBids: any[];
    totalBids: number;
    totalSeasons: number;
    highestBid: number;
  } | null>(null);
  const [loadingAuction, setLoadingAuction] = useState(false);
  const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set());
  const [selectedRoundFilter, setSelectedRoundFilter] = useState<string>('all');
  
  const [playerHistory, setPlayerHistory] = useState<{
    transactions: any[];
    releases: any[];
    roadmap: any[];
    winningBids: any[];
  } | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
    if (!authLoading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const fetchPlayer = async () => {
      try {
        const response = await fetch(`/api/players/${resolvedParams.id}`, {
          headers: { 'Cache-Control': 'no-cache' },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch player details');
        }

        const result = await response.json();

        if (result.success && result.data.player) {
          const data = result.data.player;
          const playerData = {
            id: data.id.toString(),
            player_id: data.player_id || data.id.toString(),
            name: data.name,
            position: data.position,
            overall_rating: data.overall_rating,
            nationality: data.nationality,
            playing_style: data.playing_style,
            foot: data.foot,
            age: data.age,
            nfl_team: data.nfl_team,
            club: data.club || data.team_name,
            team: data.team ? {
              id: data.team.id.toString(),
              name: data.team.name
            } : undefined,
            team_id: data.team_id?.toString(),
            acquisition_value: data.acquisition_value,
            acquired_at: data.acquired_at,
            round_id: data.round_id,
            is_auction_eligible: data.is_auction_eligible,
            // Stats
            speed: data.speed,
            acceleration: data.acceleration,
            ball_control: data.ball_control,
            dribbling: data.dribbling,
            tight_possession: data.tight_possession,
            offensive_awareness: data.offensive_awareness,
            defensive_awareness: data.defensive_awareness,
            tackling: data.tackling,
            defensive_engagement: data.defensive_engagement,
            low_pass: data.low_pass,
            lofted_pass: data.lofted_pass,
            finishing: data.finishing,
            heading: data.heading,
            stamina: data.stamina,
            physical_contact: data.physical_contact,
            kicking_power: data.kicking_power,
            gk_awareness: data.gk_awareness,
            gk_catching: data.gk_catching,
            gk_parrying: data.gk_parrying,
            gk_reflexes: data.gk_reflexes,
            gk_reach: data.gk_reach,
          } as FootballPlayer;
          
          setPlayer(playerData);
          fetchPlayerAwards(playerData.player_id);
          
          setLoadingHistory(true);
          fetch(`/api/players/${resolvedParams.id}/history`, {
            headers: { 'Cache-Control': 'no-cache' },
          })
            .then(res => res.json())
            .then(historyData => {
              if (historyData.success) {
                setPlayerHistory(historyData.data);
              }
            })
            .catch(err => console.error('Error fetching player history:', err))
            .finally(() => setLoadingHistory(false));
        } else {
          alert('Player not found');
          router.push('/dashboard/committee/players');
        }
      } catch (err) {
        console.error('Error fetching player:', err);
        alert('Failed to load player details');
      } finally {
        setLoading(false);
      }
    };

    if (user?.role === 'committee_admin') {
      fetchPlayer();
    }
  }, [user, resolvedParams.id, router]);

  const fetchPlayerAwards = async (playerId: string) => {
    setLoadingAwards(true);
    try {
      const response = await fetch(`/api/awards?player_id=${playerId}`);
      const result = await response.json();
      
      if (result.success && result.data) {
        setAwards(result.data);
      }
    } catch (err) {
      console.error('Error fetching awards:', err);
    } finally {
      setLoadingAwards(false);
    }
  };

  useEffect(() => {
    const fetchAuctionHistory = async () => {
      if (!player || activeTab !== 'auction' || auctionHistory) return;

      try {
        setLoadingAuction(true);
        const response = await fetch(`/api/players/${resolvedParams.id}/auction-history`, {
          headers: { 'Cache-Control': 'no-cache' },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch auction history');
        }

        const data = await response.json();
        if (data.success) {
          setAuctionHistory(data.data);
        }
      } catch (err) {
        console.error('Error fetching auction history:', err);
      } finally {
        setLoadingAuction(false);
      }
    };

    fetchAuctionHistory();
  }, [player, activeTab, auctionHistory, resolvedParams.id]);

  const getRoundTypeFromId = (roundId: string): string => {
    if (!roundId) return 'unknown';
    const roundIdStr = String(roundId).toUpperCase();
    if (roundIdStr.includes('FBR')) return 'bulk';
    if (roundIdStr.includes('FR')) return 'normal';
    return 'unknown';
  };

  const filterBidsByRound = (bids: any[]) => {
    if (selectedRoundFilter === 'all') return bids;
    if (selectedRoundFilter === 'normal') {
      return bids.filter(bid => getRoundTypeFromId(bid.round_id.toString()) === 'normal');
    }
    if (selectedRoundFilter === 'bulk') {
      return bids.filter(bid => getRoundTypeFromId(bid.round_id.toString()) === 'bulk');
    }
    return bids.filter(bid => bid.round_id.toString() === selectedRoundFilter);
  };

  const getPositionColor = (position?: string) => {
    if (!position) return 'bg-slate-50 border border-slate-200 text-slate-700';
    const pos = position.toUpperCase();
    switch (pos) {
      case 'GK':
      case 'K':
        return 'bg-amber-50 border border-amber-200 text-amber-800';
      case 'CB':
      case 'LB': 
      case 'RB':
        return 'bg-blue-50 border border-blue-200 text-blue-800';
      case 'DMF':
      case 'CMF':
      case 'LMF':
      case 'RMF':
      case 'AMF':
      case 'WR':
      case 'TE':
        return 'bg-emerald-50 border border-emerald-200 text-emerald-800';
      case 'LWF':
      case 'RWF':
      case 'CF':
      case 'SS':
        return 'bg-rose-50 border border-rose-200 text-rose-800';
      case 'QB':
        return 'bg-red-50 border border-red-200 text-red-800';
      case 'DST':
        return 'bg-slate-50 border border-slate-200 text-slate-700';
      default:
        return 'bg-slate-50 border border-slate-200 text-slate-700';
    }
  };

  const getRatingGradient = (rating: number) => {
    if (rating >= 85) return 'from-emerald-500 to-teal-600';
    if (rating >= 75) return 'from-blue-500 to-indigo-600';
    if (rating >= 65) return 'from-amber-500 to-orange-500';
    return 'from-slate-400 to-slate-500';
  };

  const getRatingBadge = (rating: number) => {
    if (rating >= 85) return { text: 'Elite', color: 'bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono font-bold uppercase' };
    if (rating >= 75) return { text: 'Excellent', color: 'bg-blue-50 border border-blue-200 text-blue-800 font-mono font-bold uppercase' };
    if (rating >= 65) return { text: 'Good', color: 'bg-amber-50 border border-amber-200 text-amber-800 font-mono font-bold uppercase' };
    return { text: 'Unrated', color: 'bg-slate-50 border border-slate-200 text-slate-600 font-mono font-bold uppercase' };
  };

  const formatAcquisitionDate = (dateVal: any) => {
    if (!dateVal) return null;
    try {
      if (typeof dateVal === 'object' && dateVal.seconds !== undefined) {
        return new Date(dateVal.seconds * 1000).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
      }
      return new Date(dateVal).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch (e) {
      console.error("Error parsing date:", e);
      return 'N/A';
    }
  };

  const getKeyStats = (position?: string) => {
    if (!player) return [];

    switch (position) {
      case 'GK':
        return [
          { label: 'GK Awareness', value: player.gk_awareness || 0 },
          { label: 'GK Catching', value: player.gk_catching || 0 },
          { label: 'GK Parrying', value: player.gk_parrying || 0 },
          { label: 'GK Reflexes', value: player.gk_reflexes || 0 },
          { label: 'GK Reach', value: player.gk_reach || 0 },
          { label: 'Defensive Awareness', value: player.defensive_awareness || 0 }
        ];
      case 'CB':
      case 'RB':
      case 'LB':
        return [
          { label: 'Defensive Awareness', value: player.defensive_awareness || 0 },
          { label: 'Tackling', value: player.tackling || 0 },
          { label: 'Defensive Engagement', value: player.defensive_engagement || 0 },
          { label: 'Physical Contact', value: player.physical_contact || 0 },
          { label: 'Ball Control', value: player.ball_control || 0 },
          { label: 'Speed', value: player.speed || 0 }
        ];
      case 'DMF':
        return [
          { label: 'Defensive Awareness', value: player.defensive_awareness || 0 },
          { label: 'Tackling', value: player.tackling || 0 },
          { label: 'Ball Control', value: player.ball_control || 0 },
          { label: 'Low Pass', value: player.low_pass || 0 },
          { label: 'Stamina', value: player.stamina || 0 },
          { label: 'Physical Contact', value: player.physical_contact || 0 }
        ];
      case 'CMF':
        return [
          { label: 'Ball Control', value: player.ball_control || 0 },
          { label: 'Low Pass', value: player.low_pass || 0 },
          { label: 'Lofted Pass', value: player.lofted_pass || 0 },
          { label: 'Offensive Awareness', value: player.offensive_awareness || 0 },
          { label: 'Dribbling', value: player.dribbling || 0 },
          { label: 'Stamina', value: player.stamina || 0 }
        ];
      case 'RMF':
      case 'LMF':
        return [
          { label: 'Speed', value: player.speed || 0 },
          { label: 'Acceleration', value: player.acceleration || 0 },
          { label: 'Dribbling', value: player.dribbling || 0 },
          { label: 'Ball Control', value: player.ball_control || 0 },
          { label: 'Lofted Pass', value: player.lofted_pass || 0 },
          { label: 'Tight Possession', value: player.tight_possession || 0 }
        ];
      case 'AMF':
        return [
          { label: 'Offensive Awareness', value: player.offensive_awareness || 0 },
          { label: 'Ball Control', value: player.ball_control || 0 },
          { label: 'Dribbling', value: player.dribbling || 0 },
          { label: 'Tight Possession', value: player.tight_possession || 0 },
          { label: 'Low Pass', value: player.low_pass || 0 },
          { label: 'Finishing', value: player.finishing || 0 }
        ];
      case 'SS':
        return [
          { label: 'Offensive Awareness', value: player.offensive_awareness || 0 },
          { label: 'Finishing', value: player.finishing || 0 },
          { label: 'Ball Control', value: player.ball_control || 0 },
          { label: 'Dribbling', value: player.dribbling || 0 },
          { label: 'Speed', value: player.speed || 0 },
          { label: 'Acceleration', value: player.acceleration || 0 }
        ];
      case 'CF':
        return [
          { label: 'Finishing', value: player.finishing || 0 },
          { label: 'Offensive Awareness', value: player.offensive_awareness || 0 },
          { label: 'Physical Contact', value: player.physical_contact || 0 },
          { label: 'Heading', value: player.heading || 0 },
          { label: 'Ball Control', value: player.ball_control || 0 },
          { label: 'Kicking Power', value: player.kicking_power || 0 }
        ];
      default:
        return [
          { label: 'Speed', value: player.speed || 0 },
          { label: 'Ball Control', value: player.ball_control || 0 },
          { label: 'Dribbling', value: player.dribbling || 0 },
          { label: 'Offensive Awareness', value: player.offensive_awareness || 0 },
          { label: 'Stamina', value: player.stamina || 0 },
          { label: 'Physical Contact', value: player.physical_contact || 0 }
        ];
    }
  };

  const getAdditionalStats = () => {
    if (!player) return [];

    const mainStatsKeys = [
      'speed', 'acceleration', 'ball_control', 'dribbling', 'tight_possession',
      'offensive_awareness', 'defensive_awareness', 'tackling', 'defensive_engagement',
      'low_pass', 'lofted_pass', 'finishing', 'heading', 'stamina',
      'physical_contact', 'kicking_power',
      'gk_awareness', 'gk_catching', 'gk_parrying', 'gk_reflexes', 'gk_reach',
      'id', 'player_id', 'name', 'position', 'overall_rating', 'nationality',
      'playing_style', 'foot', 'age', 'nfl_team', 'club', 'team', 'team_id',
      'acquisition_value', 'acquired_at', 'round_id', 'is_auction_eligible'
    ];

    return Object.entries(player)
      .filter(([key, value]) => !mainStatsKeys.includes(key) && value && typeof value === 'number')
      .map(([key, value]) => ({
        name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value
      }));
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-gray-650 font-mono text-sm uppercase tracking-wider font-bold">Loading player details...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'committee_admin' || !player) {
    return null;
  }

  const keyStats = getKeyStats(player.position);
  const additionalStats = getAdditionalStats();
  const ratingBadge = getRatingBadge(player.overall_rating || 0);

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-5xl mx-auto relative z-10 space-y-8">
        {/* Header with Back Button */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <Link href="/dashboard/committee/players" className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all">
            ← Back to Player List
          </Link>
          
          <div className="bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm shrink-0">
            Player ID: {player.player_id}
          </div>
        </div>

        {/* Main Tabs */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-2 shadow-sm">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('stats')}
              className={`flex-1 px-4 py-2.5 rounded-2xl text-xs font-mono font-bold uppercase tracking-wider transition-all ${
                activeTab === 'stats'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Player Stats
            </button>
            <button
              onClick={() => setActiveTab('auction')}
              className={`flex-1 px-4 py-2.5 rounded-2xl text-xs font-mono font-bold uppercase tracking-wider transition-all ${
                activeTab === 'auction'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Auction History
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 px-4 py-2.5 rounded-2xl text-xs font-mono font-bold uppercase tracking-wider transition-all ${
                activeTab === 'history'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Ownership History
            </button>
          </div>
        </div>

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Left Column - Player Info */}
            <div className="lg:col-span-1 space-y-6">
              {/* Player Card */}
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                {/* Player Image */}
                <div className="relative w-40 h-40 mx-auto mb-4">
                  <PlayerCard
                    playerId={player.player_id || player.id}
                    playerName={player.name}
                    priority={true}
                  />
                  <div className="absolute bottom-0 right-0 bg-amber-500 text-white font-mono font-extrabold text-xs py-1 px-2.5 rounded-tl-xl shadow-md">
                    {player.overall_rating || '--'}
                  </div>
                </div>

                {/* Player Basic Info */}
                <div className="text-center font-mono">
                  <h1 className="text-xl font-extrabold text-slate-900 tracking-tight mb-1">{player.name}</h1>
                  <div className="flex flex-wrap items-center justify-center gap-1.5 mb-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getPositionColor(player.position)}`}>
                      {player.position}
                    </span>
                    {player.nfl_team && (
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{player.nfl_team}</span>
                    )}
                  </div>
                </div>

                {/* Player Details */}
                <div className="space-y-2.5 text-xs border-t border-slate-100 pt-4 font-mono">
                  {(player.club || player.team_name) && (
                    <div className="flex justify-between items-center bg-blue-50/50 -mx-3 px-3 py-2 rounded">
                      <span className="text-slate-400 font-bold uppercase tracking-wider flex items-center">
                        Real Club:
                        <span className="ml-1 text-[10px] text-slate-350 cursor-help" title="Player's real-world club">
                          ⓘ
                        </span>
                      </span>
                      <span className="font-extrabold text-blue-700">{player.club || player.team_name}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold uppercase tracking-wider">Nationality:</span>
                    <span className="font-extrabold text-slate-800">{player.nationality || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold uppercase tracking-wider">Playing Style:</span>
                    <span className="font-extrabold text-slate-800">{player.playing_style || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold uppercase tracking-wider">Preferred Foot:</span>
                    <span className="font-extrabold text-slate-800">{player.foot || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold uppercase tracking-wider">Age:</span>
                    <span className="font-extrabold text-slate-800">{player.age || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Tournament Team details */}
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4">
                <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Tournament Assignment
                </h3>
                <div className="space-y-3 font-mono">
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-inner">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Team</p>
                    <p className="text-base font-extrabold text-slate-800">
                      {player.team ? (
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          {player.team.name}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-slate-400 uppercase">Free Agent</span>
                      )}
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-inner">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Cost</p>
                    <p className="text-base font-extrabold text-slate-800">
                      {player.team && player.acquisition_value ? (
                        <span className="flex items-center gap-1 text-emerald-600 font-mono">
                          £{player.acquisition_value.toLocaleString()}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-slate-400 uppercase">Free Transfer</span>
                      )}
                    </p>
                  </div>

                  {player.acquired_at && (
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-inner">
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Acquired On</p>
                      <p className="text-sm font-extrabold text-slate-800">
                        {formatAcquisitionDate(player.acquired_at)}
                      </p>
                    </div>
                  )}

                  {!player.acquired_at && player.round_id && (
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-inner">
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Acquired Via</p>
                      <p className="text-sm font-extrabold text-slate-800">
                        Round #{player.round_id} Auction
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Awards Section */}
              {awards.length > 0 && (
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4 bg-gradient-to-br from-amber-50/20 to-yellow-50/10">
                  <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    Awards & Honors
                  </h3>
                  <div className="space-y-3 font-mono text-xs">
                    {awards.map((award) => (
                      <div key={award.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-inner flex items-center gap-3">
                        <span className="text-2xl shrink-0">
                          {award.award_type === 'POTD' && '⭐'}
                          {award.award_type === 'POTW' && '🌟'}
                          {award.award_type === 'TOD' && '🏅'}
                          {award.award_type === 'TOW' && '🏆'}
                          {award.award_type === 'POTS' && '👑'}
                          {award.award_type === 'TOTS' && '🏆'}
                        </span>
                        <div className="min-w-0">
                          <p className="font-extrabold text-slate-800 text-sm leading-tight">
                            {award.award_type === 'POTD' && 'Player of the Day'}
                            {award.award_type === 'POTW' && 'Player of the Week'}
                            {award.award_type === 'TOD' && 'Team of the Day'}
                            {award.award_type === 'TOW' && 'Team of the Week'}
                            {award.award_type === 'POTS' && 'Player of the Season'}
                            {award.award_type === 'TOTS' && 'Team of the Season'}
                          </p>
                          <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider mt-1.5 leading-none">
                            {award.round_number && `Round ${award.round_number}`}
                            {award.week_number && `Week ${award.week_number}`}
                            {award.selected_at && ` • ${new Date(award.selected_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Attributes & Additional Stats */}
            <div className="lg:col-span-3 space-y-6">
              {/* Overall Performance */}
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 .587l3.668 7.431 8.2 1.192-5.933 5.782 1.4 8.168L12 18.896l-7.335 3.864 1.4-8.168L.132 9.21l8.2-1.192L12 .587z"/>
                  </svg>
                  Overall Performance
                </h3>
                <div className="flex items-center">
                  <div className={`w-24 h-24 bg-gradient-to-br ${getRatingGradient(player.overall_rating || 0)} rounded-3xl flex items-center justify-center shadow-lg transform rotate-3 hover:rotate-0 transition-transform duration-300 shrink-0`}>
                    <span className="text-4xl font-black text-white font-mono">{player.overall_rating || '--'}</span>
                  </div>
                  <div className="ml-6 font-mono">
                    <h4 className="text-lg font-extrabold text-slate-900 leading-tight">{player.name}</h4>
                    <p className="text-xs text-slate-400 mt-1 font-bold">
                      {player.position} {player.nfl_team && ` - ${player.nfl_team}`}
                    </p>
                    <div className="mt-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${ratingBadge.color}`}>
                        {ratingBadge.text}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Key Attributes */}
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Key Attributes
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {keyStats.map((stat, index) => (
                    <StatsBar key={index} label={stat.label} value={stat.value} />
                  ))}
                </div>
              </div>

              {/* Additional Statistics */}
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Additional Statistics
                </h3>
                {additionalStats.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 font-mono text-xs">
                    {additionalStats.map((stat, index) => (
                      <div key={index} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-inner">
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">{stat.name}</p>
                        <p className="text-base font-extrabold text-slate-805">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 text-xs font-mono font-bold uppercase tracking-wider">
                    No additional statistics available
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Auction History Tab */}
        {activeTab === 'auction' && (
          <div className="space-y-6">
            {loadingAuction ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
                  <p className="mt-4 text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Loading auction history...</p>
                </div>
              </div>
            ) : !auctionHistory || auctionHistory.totalBids === 0 ? (
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center shadow-sm">
                <svg className="w-16 h-16 mx-auto text-slate-350 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-base font-extrabold text-slate-800 uppercase tracking-wide">No Auction History</h3>
                <p className="text-xs text-slate-400 font-mono mt-1">This player has not been part of any auctions yet.</p>
              </div>
            ) : (
              <>
                {/* Auction Summary */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">Total Bids</p>
                      <p className="text-2xl font-black text-blue-600 mt-2 font-mono">{auctionHistory.totalBids}</p>
                    </div>
                  </div>

                  <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">Seasons</p>
                      <p className="text-2xl font-black text-purple-600 mt-2 font-mono">{auctionHistory.totalSeasons}</p>
                    </div>
                  </div>

                  <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">Times Won</p>
                      <p className="text-2xl font-black text-emerald-600 mt-2 font-mono">{auctionHistory.winningBids.length}</p>
                    </div>
                  </div>

                  <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">Highest Bid</p>
                      <p className="text-2xl font-black text-amber-600 mt-2 font-mono">£{(auctionHistory.highestBid || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Successful Acquisitions */}
                {auctionHistory.winningBids.length > 0 && (
                  <div className="console-card bg-white border-2 border-emerald-500/20 rounded-3xl p-6 shadow-sm">
                    <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      Successful Acquisitions
                    </h3>
                    <div className="space-y-3 font-mono text-xs">
                      {auctionHistory.winningBids.map((bid, index) => {
                        const detectedRoundType = getRoundTypeFromId(bid.round_id.toString());
                        return (
                          <div key={index} className="bg-gradient-to-r from-emerald-50/50 to-green-50/50 rounded-2xl p-4 border border-emerald-100">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-1">
                                  <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] font-bold rounded">
                                    {bid.season_id}
                                  </span>
                                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                                    detectedRoundType === 'bulk' 
                                      ? 'bg-purple-100 text-purple-800' 
                                      : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {detectedRoundType === 'bulk' ? 'BULK' : 'NORMAL'}
                                  </span>
                                  <span className="text-slate-500">
                                    Round #{bid.round_number}
                                  </span>
                                </div>
                                <p className="font-extrabold text-sm text-slate-800 leading-tight">{bid.team_name}</p>
                                <p className="text-[10px] text-slate-400 mt-1">
                                  {new Date(bid.bid_time).toLocaleDateString('en-GB', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                              <div className="text-left sm:text-right shrink-0">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Winning Bid</p>
                                <p className="text-xl font-bold text-green-600 font-mono">
                                  £{(bid.winning_bid || 0).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* All Bids by Season */}
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4">
                  <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    All Bids by Season
                  </h3>
                  
                  {Object.entries(auctionHistory.bidsBySeason).map(([seasonId, bids]) => {
                    const isExpanded = expandedSeasons.has(seasonId);
                    const filteredBids = filterBidsByRound(bids).sort((a, b) => (b.bid_amount || 0) - (a.bid_amount || 0));
                    
                    return (
                      <div key={seasonId} className="mb-4 last:mb-0">
                        <button
                          onClick={() => {
                            const newExpanded = new Set(expandedSeasons);
                            if (isExpanded) {
                               newExpanded.delete(seasonId);
                            } else {
                               newExpanded.add(seasonId);
                            }
                            setExpandedSeasons(newExpanded);
                          }}
                          className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl font-mono font-bold text-xs uppercase tracking-wider transition-all"
                        >
                          <div className="flex items-center gap-2">
                            <svg
                              className={`w-4 h-4 text-slate-500 transition-transform ${
                                isExpanded ? 'rotate-90' : ''
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] rounded-lg">
                              {seasonId}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                              {bids.length} {bids.length === 1 ? 'bid' : 'bids'}
                            </span>
                          </div>
                          <span className="text-[9px] text-slate-400 uppercase font-bold hidden sm:inline">
                            {isExpanded ? 'Click to collapse' : 'Click to expand'}
                          </span>
                        </button>
                        
                        {isExpanded && (
                          <div className="mt-3 pl-4 space-y-3">
                            {/* Filter Buttons */}
                            <div className="flex gap-2 p-1.5 bg-slate-50 border border-slate-150 rounded-2xl max-w-sm">
                              <button
                                onClick={() => setSelectedRoundFilter('all')}
                                className={`flex-1 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider transition-all ${
                                  selectedRoundFilter === 'all'
                                    ? 'bg-slate-800 text-white'
                                    : 'text-slate-650 hover:bg-slate-100/80'
                                }`}
                              >
                                All
                              </button>
                              <button
                                onClick={() => setSelectedRoundFilter('normal')}
                                className={`flex-1 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider transition-all ${
                                  selectedRoundFilter === 'normal'
                                    ? 'bg-slate-800 text-white'
                                    : 'text-slate-650 hover:bg-slate-100/80'
                                }`}
                              >
                                Normal
                              </button>
                              <button
                                onClick={() => setSelectedRoundFilter('bulk')}
                                className={`flex-1 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider transition-all ${
                                  selectedRoundFilter === 'bulk'
                                    ? 'bg-slate-800 text-white'
                                    : 'text-slate-650 hover:bg-slate-100/80'
                                }`}
                              >
                                Bulk
                              </button>
                            </div>

                            {/* Bids List */}
                            {filteredBids.length > 0 ? (
                              <div className="space-y-2 font-mono text-xs">
                                {filteredBids.map((bid: any) => {
                                  const detectedRoundType = getRoundTypeFromId(bid.round_id.toString());
                                  const isWinner = bid.is_winning || bid.team_id === bid.winning_team_id;
                                  return (
                                    <div
                                      key={bid.id}
                                      className={`rounded-2xl p-4 border transition-all ${
                                        isWinner
                                          ? 'bg-green-50/50 border-green-200 shadow-sm'
                                          : 'bg-slate-50/55 border-slate-150'
                                      }`}
                                    >
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                            <span className="font-extrabold text-slate-800 text-sm truncate max-w-[180px] sm:max-w-none">
                                              {bid.team_name}
                                            </span>
                                            {isWinner && (
                                              <span className="px-1.5 py-0.5 bg-green-600 text-white text-[9px] font-bold rounded">
                                                WON
                                              </span>
                                            )}
                                            <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                                              detectedRoundType === 'bulk' 
                                                ? 'bg-purple-100 text-purple-800' 
                                                : 'bg-blue-100 text-blue-800'
                                            }`}>
                                              {detectedRoundType === 'bulk' ? 'BULK' : 'NORMAL'}
                                            </span>
                                          </div>
                                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-[10px] text-slate-400">
                                            <div className="flex items-center gap-2">
                                              <span>Round #{bid.round_number}</span>
                                              <span className="hidden sm:inline">•</span>
                                              <span className="font-mono">{bid.round_id}</span>
                                            </div>
                                            <span className="hidden sm:inline">•</span>
                                            <span>
                                              {new Date(bid.bid_time).toLocaleDateString('en-GB', {
                                                day: '2-digit',
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                              })}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="text-left sm:text-right shrink-0">
                                          <p className={`text-base font-extrabold font-mono ${
                                            isWinner ? 'text-green-600' : 'text-slate-700'
                                          }`}>
                                            £{(bid.bid_amount || 0).toLocaleString()}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-center py-6 text-slate-400 text-xs font-mono font-bold uppercase tracking-wider">
                                No {selectedRoundFilter === 'all' ? '' : selectedRoundFilter} bids found
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Ownership History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            {loadingHistory ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
                <p className="mt-4 text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Loading timeline...</p>
              </div>
            ) : playerHistory && playerHistory.roadmap.length > 0 ? (
              <>
                {/* Timeline Header Card */}
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">TIMELINE</span>
                      <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">Ownership Timeline</h2>
                      <p className="text-xs text-slate-400 font-mono mt-1">Complete history of {player.name}'s team ownership</p>
                    </div>
                    <div className="flex sm:block shrink-0">
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3 font-mono">
                        <div className="text-2xl font-black text-amber-600">{playerHistory.roadmap.length}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Teams</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Timeline Cards */}
                <div className="relative font-mono text-xs">
                  <div className="absolute left-4 sm:left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-amber-400/50 via-blue-400/30 to-slate-200/20 hidden md:block"></div>

                  <div className="space-y-6">
                    {playerHistory.roadmap.map((contract: any, index: number) => {
                      let statusStyle = 'bg-green-500';
                      let cardHeaderGradient = 'from-green-50 to-emerald-50 border-emerald-100';
                      let valueText = 'text-green-700';

                      if (contract.status === 'released') {
                        statusStyle = 'bg-red-500';
                        cardHeaderGradient = 'from-red-50 to-orange-50 border-red-100';
                        valueText = 'text-red-700';
                      } else if (contract.status === 'swapped') {
                        statusStyle = 'bg-blue-500';
                        cardHeaderGradient = 'from-blue-50 to-indigo-50 border-blue-100';
                        valueText = 'text-blue-700';
                      } else if (contract.status === 'takeover') {
                        statusStyle = 'bg-purple-500';
                        cardHeaderGradient = 'from-purple-50 to-pink-50 border-purple-100';
                        valueText = 'text-purple-700';
                      }

                      return (
                        <div key={index} className="relative">
                          {/* Dot */}
                          <div className="absolute left-2.5 sm:left-6 top-6 w-3.5 h-3.5 rounded-full bg-white border-4 border-slate-800 shadow-md hidden md:block z-10"></div>

                          {/* Contract card */}
                          <div className="md:ml-16 lg:ml-20 console-card bg-white border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">
                            {/* Card header */}
                            <div className={`p-4 sm:p-5 border-b bg-gradient-to-r ${cardHeaderGradient}`}>
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 font-mono">
                                <div className="flex items-center gap-2.5">
                                  <svg className="w-5 h-5 text-slate-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                  </svg>
                                  <h3 className="text-base sm:text-lg font-extrabold text-slate-805 truncate leading-tight">{contract.team_name}</h3>
                                </div>
                                <span className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider text-white ${statusStyle} shrink-0 text-center`}>
                                  {contract.status === 'released' ? '🔴 Released' : contract.status === 'swapped' ? '🔄 Swapped' : contract.status === 'takeover' ? '🔄 Takeover' : '🟢 Active'}
                                </span>
                              </div>
                            </div>

                            {/* Card body */}
                            <div className="p-5">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Acquisition Column */}
                                <div className="space-y-3 font-mono">
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    {contract.type === 'swap' ? (
                                      <>
                                        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                        </svg>
                                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Swap In</h4>
                                      </>
                                    ) : contract.type === 'takeover' ? (
                                      <>
                                        <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                        </svg>
                                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Inherited</h4>
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                        </svg>
                                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Acquisition</h4>
                                      </>
                                    )}
                                  </div>
                                  
                                  <div className={`bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-inner`}>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">
                                      {contract.type === 'swap' ? 'Swap Value' : contract.type === 'takeover' ? 'Inherited Value' : 'Acquisition Value'}
                                    </p>
                                    <p className={`text-xl font-extrabold ${valueText}`}>
                                      £{contract.acquisition_value?.toLocaleString() || 0}
                                    </p>
                                  </div>

                                  {contract.acquisition_date && (
                                    <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-xs text-slate-650">
                                      <span className="font-bold uppercase tracking-wider text-[9px] text-slate-400">Date</span>
                                      <span className="font-extrabold">
                                        {new Date(contract.acquisition_date).toLocaleDateString('en-GB', {
                                          day: '2-digit',
                                          month: 'short',
                                          year: 'numeric'
                                        })}
                                      </span>
                                    </div>
                                  )}

                                  {contract.acquisition_round && (
                                    <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-xs text-slate-650">
                                      <span className="font-bold uppercase tracking-wider text-[9px] text-slate-400">Round</span>
                                      <span className="font-extrabold">{contract.acquisition_round}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Status Details Column */}
                                <div className="space-y-3 font-mono">
                                  {contract.status === 'released' && (
                                    <>
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Release Details</h4>
                                      </div>
                                      
                                      <div className="bg-red-50 border border-red-100 rounded-2xl p-4 shadow-inner">
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Refund Amount</p>
                                        <p className="text-xl font-extrabold text-red-700">
                                          £{contract.release_amount?.toLocaleString() || 0}
                                        </p>
                                      </div>

                                      {contract.release_date && (
                                        <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-xs text-slate-650">
                                          <span className="font-bold uppercase tracking-wider text-[9px] text-slate-400">Release Date</span>
                                          <span className="font-extrabold">
                                            {new Date(contract.release_date).toLocaleDateString('en-GB', {
                                              day: '2-digit',
                                              month: 'short',
                                              year: 'numeric'
                                            })}
                                          </span>
                                        </div>
                                      )}

                                      {contract.release_timing && (
                                        <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-xs text-slate-650">
                                          <span className="font-bold uppercase tracking-wider text-[9px] text-slate-400">Timing</span>
                                          <span className="font-extrabold uppercase">
                                            {contract.release_timing === 'mid' ? 'Mid-Season' : 'Start of Season'}
                                          </span>
                                        </div>
                                      )}
                                    </>
                                  )}

                                  {contract.status === 'swapped' && (
                                    <>
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                        </svg>
                                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Swap Out Details</h4>
                                      </div>
                                      
                                      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 shadow-inner">
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Ended Status</p>
                                        <p className="text-sm font-extrabold text-blue-700 uppercase">
                                          Swapped to another team
                                        </p>
                                      </div>

                                      {contract.end_date && (
                                        <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-xs text-slate-650">
                                          <span className="font-bold uppercase tracking-wider text-[9px] text-slate-400">Swap Date</span>
                                          <span className="font-extrabold">
                                            {new Date(contract.end_date).toLocaleDateString('en-GB', {
                                              day: '2-digit',
                                              month: 'short',
                                              year: 'numeric'
                                            })}
                                          </span>
                                        </div>
                                      )}
                                    </>
                                  )}

                                  {contract.status === 'takeover' && (
                                    <>
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                        </svg>
                                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Takeover Details</h4>
                                      </div>
                                      
                                      <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 shadow-inner">
                                        <p className="text-[9px] text-slate-405 font-bold uppercase tracking-wide mb-1">Ended Status</p>
                                        <p className="text-sm font-extrabold text-purple-700 uppercase">
                                          Team takeover ended contract
                                        </p>
                                      </div>

                                      {contract.end_date && (
                                        <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-xs text-slate-650">
                                          <span className="font-bold uppercase tracking-wider text-[9px] text-slate-400">Takeover Date</span>
                                          <span className="font-extrabold">
                                            {new Date(contract.end_date).toLocaleDateString('en-GB', {
                                              day: '2-digit',
                                              month: 'short',
                                              year: 'numeric'
                                            })}
                                          </span>
                                        </div>
                                      )}
                                    </>
                                  )}

                                  {contract.status === 'active' && (
                                    <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-green-50/50 to-emerald-50/50 rounded-2xl border-2 border-dashed border-green-250 text-center shadow-inner h-full min-h-[120px]">
                                      <svg className="w-8 h-8 text-green-500 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <p className="text-sm font-extrabold text-green-700 uppercase">Currently Active</p>
                                      <p className="text-[10px] text-slate-400 mt-0.5">Player is on the team roster</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center shadow-sm">
                <svg className="w-20 h-20 text-slate-250 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-base font-extrabold text-slate-800 uppercase tracking-wide">No Ownership History</h3>
                <p className="text-xs text-slate-400 font-mono mt-1">This player has no recorded ownership history yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
