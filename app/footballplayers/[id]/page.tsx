'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PlayerCard } from '@/components/PlayerImage';
import { 
  ArrowLeft, 
  DollarSign, 
  Calendar, 
  Award, 
  Clock, 
  TrendingUp, 
  User, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  ChevronRight,
  TrendingDown,
  Percent,
  ListFilter
} from 'lucide-react';

interface Player {
  id: number;
  name: string;
  position: string;
  position_group?: string;
  playing_style?: string;
  overall_rating: number;
  player_id?: string;
  nationality?: string;
  foot?: string;
  age?: number;
  nfl_team?: string;
  team?: {
    id: number;
    name: string;
  };
  acquisition_value?: number;
  acquired_at?: string;
  round_id?: string;
  round_type?: string;
  
  // Stats
  speed?: number;
  acceleration?: number;
  ball_control?: number;
  dribbling?: number;
  tight_possession?: number;
  low_pass?: number;
  lofted_pass?: number;
  finishing?: number;
  heading?: number;
  kicking_power?: number;
  tackling?: number;
  defensive_awareness?: number;
  defensive_engagement?: number;
  offensive_awareness?: number;
  stamina?: number;
  physical_contact?: number;
  gk_awareness?: number;
  gk_reflexes?: number;
  gk_catching?: number;
  gk_parrying?: number;
  gk_reach?: number;
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
      <div className="w-full bg-gray-200 rounded-full h-2.5 shadow-inner overflow-hidden">
        <div
          className={`h-2.5 rounded-full transition-all duration-700 ${getBarColor(value)}`}
          style={{ width: `${animatedWidth}%` }}
        />
      </div>
    </div>
  );
};

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

interface WinningBid {
  season_id: string;
  round_id: number;
  round_number: number;
  round_type: string;
  team_id: string;
  team_name: string;
  winning_bid: number;
  bid_time: string;
}

export default function PublicPlayerDetailPage() {
  const params = useParams();
  const playerId = params?.id as string;
  
  const [player, setPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stats' | 'auction' | 'history'>('stats');
  const [auctionHistory, setAuctionHistory] = useState<{
    bidsBySeason: Record<string, AuctionBid[]>;
    winningBids: WinningBid[];
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
    const fetchPlayerData = async () => {
      if (!playerId) return;

      try {
        const playerResponse = await fetch(`/api/players/${playerId}`, {
          headers: { 'Cache-Control': 'no-cache' },
        });
        
        if (!playerResponse.ok) {
          throw new Error('Failed to fetch player details');
        }

        const playerData = await playerResponse.json();

        if (playerData.success && playerData.data.player) {
          setPlayer(playerData.data.player);
          
          const historyResponse = await fetch(`/api/players/${playerId}/history`, {
            headers: { 'Cache-Control': 'no-cache' },
          });
          
          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            if (historyData.success) {
              setPlayerHistory(historyData.data);
            }
          }
        } else {
          setError('Player not found');
        }
      } catch (err) {
        console.error('Error fetching player:', err);
        setError('Failed to load player details');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlayerData();
  }, [playerId]);

  useEffect(() => {
    const fetchAuctionHistory = async () => {
      if (!playerId || activeTab !== 'auction' || auctionHistory) return;

      try {
        setLoadingAuction(true);
        const response = await fetch(`/api/players/${playerId}/auction-history`, {
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
  }, [playerId, activeTab, auctionHistory]);

  const getPositionColor = (position: string) => {
    switch (position) {
      case 'GK': return 'bg-amber-50 border border-amber-200 text-amber-805';
      case 'CB':
      case 'LB': 
      case 'RB': return 'bg-blue-50 border border-blue-200 text-blue-800';
      case 'DMF':
      case 'CMF':
      case 'LMF':
      case 'RMF':
      case 'AMF': return 'bg-emerald-50 border border-emerald-200 text-emerald-805';
      case 'LWF':
      case 'RWF':
      case 'CF':
      case 'SS': return 'bg-rose-50 border border-rose-200 text-rose-800';
      default: return 'bg-slate-50 border border-slate-200 text-slate-700';
    }
  };

  const getRatingGradient = (rating: number) => {
    if (rating >= 85) return 'from-emerald-500 to-teal-650';
    if (rating >= 75) return 'from-blue-500 to-indigo-650';
    if (rating >= 65) return 'from-amber-500 to-orange-550';
    return 'from-slate-400 to-slate-550';
  };

  const getRatingBadge = (rating: number) => {
    if (rating >= 85) return { text: 'Elite', color: 'bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono font-bold uppercase' };
    if (rating >= 75) return { text: 'Excellent', color: 'bg-blue-50 border border-blue-200 text-blue-800 font-mono font-bold uppercase' };
    if (rating >= 65) return { text: 'Good', color: 'bg-amber-50 border border-amber-200 text-amber-800 font-mono font-bold uppercase' };
    return { text: 'Unrated', color: 'bg-slate-50 border border-slate-200 text-slate-650 font-mono font-bold uppercase' };
  };

  const getRoundTypeFromId = (roundId: string): string => {
    if (!roundId) return 'unknown';
    const roundIdStr = String(roundId).toUpperCase();
    if (roundIdStr.includes('FBR')) return 'bulk';
    if (roundIdStr.includes('FR')) return 'normal';
    return 'unknown';
  };

  const filterBidsByRound = (bids: AuctionBid[]) => {
    if (selectedRoundFilter === 'all') return bids;
    if (selectedRoundFilter === 'normal') {
      return bids.filter(bid => getRoundTypeFromId(bid.round_id.toString()) === 'normal');
    }
    if (selectedRoundFilter === 'bulk') {
      return bids.filter(bid => getRoundTypeFromId(bid.round_id.toString()) === 'bulk');
    }
    return bids.filter(bid => bid.round_id.toString() === selectedRoundFilter);
  };

  const renderKeyStats = () => {
    if (!player) return null;

    const position = player.position;
    let stats: { label: string; value: number }[] = [];

    if (position === 'K' || position === 'GK') {
      stats = [
        { label: 'GK Awareness', value: player.gk_awareness || 0 },
        { label: 'GK Catching', value: player.gk_catching || 0 },
        { label: 'GK Parrying', value: player.gk_parrying || 0 },
        { label: 'GK Reflexes', value: player.gk_reflexes || 0 },
        { label: 'GK Reach', value: player.gk_reach || 0 },
        { label: 'Defensive Awareness', value: player.defensive_awareness || 0 },
      ];
    } else if (['CB', 'RB', 'LB'].includes(position)) {
      stats = [
        { label: 'Defensive Awareness', value: player.defensive_awareness || 0 },
        { label: 'Tackling', value: player.tackling || 0 },
        { label: 'Defensive Engagement', value: player.defensive_engagement || 0 },
        { label: 'Physical Contact', value: player.physical_contact || 0 },
        { label: 'Ball Control', value: player.ball_control || 0 },
        { label: 'Speed', value: player.speed || 0 },
      ];
    } else if (position === 'DMF') {
      stats = [
        { label: 'Defensive Awareness', value: player.defensive_awareness || 0 },
        { label: 'Tackling', value: player.tackling || 0 },
        { label: 'Ball Control', value: player.ball_control || 0 },
        { label: 'Low Pass', value: player.low_pass || 0 },
        { label: 'Stamina', value: player.stamina || 0 },
        { label: 'Physical Contact', value: player.physical_contact || 0 },
      ];
    } else if (position === 'CMF') {
      stats = [
        { label: 'Ball Control', value: player.ball_control || 0 },
        { label: 'Low Pass', value: player.low_pass || 0 },
        { label: 'Lofted Pass', value: player.lofted_pass || 0 },
        { label: 'Offensive Awareness', value: player.offensive_awareness || 0 },
        { label: 'Dribbling', value: player.dribbling || 0 },
        { label: 'Stamina', value: player.stamina || 0 },
      ];
    } else if (['RMF', 'LMF'].includes(position)) {
      stats = [
        { label: 'Speed', value: player.speed || 0 },
        { label: 'Acceleration', value: player.acceleration || 0 },
        { label: 'Dribbling', value: player.dribbling || 0 },
        { label: 'Ball Control', value: player.ball_control || 0 },
        { label: 'Lofted Pass', value: player.lofted_pass || 0 },
        { label: 'Tight Possession', value: player.tight_possession || 0 },
      ];
    } else if (position === 'AMF') {
      stats = [
        { label: 'Offensive Awareness', value: player.offensive_awareness || 0 },
        { label: 'Ball Control', value: player.ball_control || 0 },
        { label: 'Dribbling', value: player.dribbling || 0 },
        { label: 'Tight Possession', value: player.tight_possession || 0 },
        { label: 'Low Pass', value: player.low_pass || 0 },
        { label: 'Finishing', value: player.finishing || 0 },
      ];
    } else if (position === 'SS') {
      stats = [
        { label: 'Offensive Awareness', value: player.offensive_awareness || 0 },
        { label: 'Finishing', value: player.finishing || 0 },
        { label: 'Ball Control', value: player.ball_control || 0 },
        { label: 'Dribbling', value: player.dribbling || 0 },
        { label: 'Speed', value: player.speed || 0 },
        { label: 'Acceleration', value: player.acceleration || 0 },
      ];
    } else if (position === 'CF') {
      stats = [
        { label: 'Finishing', value: player.finishing || 0 },
        { label: 'Offensive Awareness', value: player.offensive_awareness || 0 },
        { label: 'Physical Contact', value: player.physical_contact || 0 },
        { label: 'Heading', value: player.heading || 0 },
        { label: 'Ball Control', value: player.ball_control || 0 },
        { label: 'Kicking Power', value: player.kicking_power || 0 },
      ];
    } else {
      stats = [
        { label: 'Speed', value: player.speed || 0 },
        { label: 'Ball Control', value: player.ball_control || 0 },
        { label: 'Dribbling', value: player.dribbling || 0 },
        { label: 'Offensive Awareness', value: player.offensive_awareness || 0 },
        { label: 'Stamina', value: player.stamina || 0 },
        { label: 'Physical Contact', value: player.physical_contact || 0 },
      ];
    }

    return stats.map((stat, index) => (
      <StatsBar key={index} label={stat.label} value={stat.value} />
    ));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-gray-650 font-mono text-sm">Loading player details...</p>
        </div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg">
        <div className="text-center">
          <p className="text-red-650 text-lg font-mono">{error || 'Player not found'}</p>
          <Link href="/footballplayers" className="mt-4 inline-block text-amber-600 font-bold hover:underline font-mono">
            Back to Player Database
          </Link>
        </div>
      </div>
    );
  }

  const ratingBadge = getRatingBadge(player.overall_rating);

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-5xl mx-auto relative z-10 space-y-8">
        {/* Header with Back Button */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <Link href="/footballplayers" className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all">
            <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Back to Player Database
          </Link>
          
          <div className="bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm shrink-0">
            Player ID: {player.player_id || player.id}
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

        {/* Two-column layout */}
        {activeTab === 'stats' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Column - Player Info */}
          <div className="lg:col-span-1 space-y-6">
            {/* Player Card */}
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
              <div className="relative w-40 h-40 mx-auto mb-4">
                <PlayerCard
                  playerId={player.player_id || player.id.toString()}
                  playerName={player.name}
                  priority={true}
                />
                <div className="absolute bottom-0 right-0 bg-amber-500 text-white font-mono font-extrabold text-xs py-1 px-2.5 rounded-tl-xl shadow-md">
                  {player.overall_rating || '--'}
                </div>
              </div>

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

              <div className="space-y-2.5 text-xs border-t border-slate-100 pt-4 font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Nationality:</span>
                  <span className="font-extrabold text-slate-800">{player.nationality || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Playing Style:</span>
                  <span className="font-extrabold text-slate-805">{player.playing_style || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Acquisition Details */}
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-amber-500" />
                Acquisition Details
              </h3>
              <div className="space-y-3 font-mono">
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-inner">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Team</p>
                  <p className="text-base font-extrabold text-slate-800">
                    {player.team ? (
                      <span className="flex items-center gap-1">
                        <User className="w-4 h-4 text-blue-600" />
                        {player.team.name}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-400 uppercase">
                        Free Agent
                      </span>
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
                      <span className="flex items-center gap-1 text-slate-400 uppercase">
                        Free Transfer
                      </span>
                    )}
                  </p>
                </div>

                {player.acquired_at && (
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-inner">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Acquired On</p>
                    <p className="text-sm font-extrabold text-slate-800">
                      {new Date(player.acquired_at).toLocaleDateString('en-GB', { 
                        day: '2-digit', 
                        month: 'short', 
                        year: 'numeric' 
                      })}
                    </p>
                  </div>
                )}

                {player.round_id && (
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-inner">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Acquired Via</p>
                    <p className="text-sm font-extrabold text-slate-800">
                      {player.round_type === 'bulk' ? 'Bulk' : 'Normal'} Round #{parseInt(player.round_id.match(/\d+$/)?.[0] || '0') || player.round_id}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Stats */}
          <div className="lg:col-span-3 space-y-6">
            {/* Overall Rating */}
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
              <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-500" />
                Overall Performance
              </h3>
              <div className="flex items-center">
                <div className={`w-24 h-24 bg-gradient-to-br ${getRatingGradient(player.overall_rating)} rounded-3xl flex items-center justify-center shadow-lg transform rotate-3 hover:rotate-0 transition-transform duration-300 shrink-0`}>
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
                <TrendingUp className="w-4 h-4 text-amber-500" />
                Key Attributes
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {renderKeyStats()}
              </div>
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
                <Clock className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                <h3 className="text-base font-extrabold text-slate-800 uppercase tracking-wide font-mono">No Auction History</h3>
                <p className="text-xs text-slate-400 font-mono mt-1">This player has not been part of any auctions yet.</p>
              </div>
            ) : (
              <>
                {/* Auction Summary */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
                  <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Bids</p>
                      <p className="text-2xl font-black text-blue-600 mt-2">{auctionHistory.totalBids}</p>
                    </div>
                  </div>

                  <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Seasons</p>
                      <p className="text-2xl font-black text-purple-600 mt-2">{auctionHistory.totalSeasons}</p>
                    </div>
                  </div>

                  <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Times Won</p>
                      <p className="text-2xl font-black text-emerald-600 mt-2">{auctionHistory.winningBids.length}</p>
                    </div>
                  </div>

                  <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Highest Bid</p>
                      <p className="text-2xl font-black text-amber-600 mt-2">£{(auctionHistory.highestBid || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Successful Acquisitions */}
                {auctionHistory.winningBids.length > 0 && (
                  <div className="console-card bg-white border-2 border-emerald-500/20 rounded-3xl p-6 shadow-sm">
                    <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-emerald-500" />
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
                                  <span className="text-slate-500 font-mono">
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
                    <ListFilter className="w-4 h-4 text-blue-500" />
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
                            <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            </span>
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
                                {filteredBids.map((bid) => {
                                  const detectedRoundType = getRoundTypeFromId(bid.round_id.toString());
                                  const isWinner = bid.is_winning || bid.team_id === bid.winning_team_id;
                                  return (
                                    <div
                                      key={bid.id}
                                      className={`rounded-2xl p-4 border transition-all ${
                                        isWinner
                                          ? 'bg-green-50/50 border-green-205 shadow-sm'
                                          : 'bg-slate-50/55 border-slate-150'
                                      }`}
                                    >
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                            <span className="font-extrabold text-slate-850 text-sm truncate max-w-[180px] sm:max-w-none">
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
                                          <p className={`text-base font-extrabold ${
                                            isWinner ? 'text-green-650' : 'text-slate-700'
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
                      let statusBadge = (
                        <span className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider text-white bg-green-500 shrink-0 text-center flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active
                        </span>
                      );
                      let cardHeaderGradient = 'from-green-50 to-emerald-50 border-emerald-100';
                      let valueText = 'text-green-700';

                      if (contract.status === 'released') {
                        statusBadge = (
                          <span className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider text-white bg-red-500 shrink-0 text-center flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5" /> Released
                          </span>
                        );
                        cardHeaderGradient = 'from-red-50 to-orange-50 border-red-100';
                        valueText = 'text-red-700';
                      } else if (contract.status === 'swapped') {
                        statusBadge = (
                          <span className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider text-white bg-blue-500 shrink-0 text-center flex items-center gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5" /> Swapped
                          </span>
                        );
                        cardHeaderGradient = 'from-blue-50 to-indigo-50 border-blue-100';
                        valueText = 'text-blue-700';
                      } else if (contract.status === 'takeover') {
                        statusBadge = (
                          <span className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider text-white bg-purple-500 shrink-0 text-center flex items-center gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5" /> Takeover
                          </span>
                        );
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
                                  <User className="w-5 h-5 text-slate-700 shrink-0" />
                                  <h3 className="text-base sm:text-lg font-extrabold text-slate-800 truncate leading-tight">{contract.team_name}</h3>
                                </div>
                                {statusBadge}
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
                                        <RefreshCw className="w-4 h-4 text-blue-500" />
                                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Swap In</h4>
                                      </>
                                    ) : contract.type === 'takeover' ? (
                                      <>
                                        <RefreshCw className="w-4 h-4 text-purple-500" />
                                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Inherited</h4>
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircle2 className="w-4 h-4 text-green-500" />
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
                                    <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-xs text-slate-600">
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
                                    <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-xs text-slate-655 font-mono">
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
                                        <XCircle className="w-4 h-4 text-red-500" />
                                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Release Details</h4>
                                      </div>
                                      
                                      <div className="bg-red-50 border border-red-100 rounded-2xl p-4 shadow-inner">
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Refund Amount</p>
                                        <p className="text-xl font-extrabold text-red-705">
                                          £{contract.release_amount?.toLocaleString() || 0}
                                        </p>
                                      </div>

                                      {contract.release_date && (
                                        <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-xs text-slate-600">
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
                                        <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-xs text-slate-600">
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
                                        <RefreshCw className="w-4 h-4 text-blue-500" />
                                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Swap Out Details</h4>
                                      </div>
                                      
                                      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 shadow-inner">
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Ended Status</p>
                                        <p className="text-sm font-extrabold text-blue-700 uppercase">
                                          Swapped to another team
                                        </p>
                                      </div>

                                      {contract.end_date && (
                                        <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-xs text-slate-600">
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
                                        <RefreshCw className="w-4 h-4 text-purple-500" />
                                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Takeover Details</h4>
                                      </div>
                                      
                                      <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 shadow-inner">
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">Ended Status</p>
                                        <p className="text-sm font-extrabold text-purple-700 uppercase">
                                          Team takeover ended contract
                                        </p>
                                      </div>

                                      {contract.end_date && (
                                        <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-xs text-slate-600">
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
                                    <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-green-50/50 to-emerald-50/50 rounded-2xl border-2 border-dashed border-green-200 text-center shadow-inner h-full min-h-[120px]">
                                      <CheckCircle2 className="w-8 h-8 text-green-550 mb-1" />
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
                <Clock className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                <h3 className="text-base font-extrabold text-slate-800 uppercase tracking-wide font-mono">No Ownership History</h3>
                <p className="text-xs text-slate-400 font-mono mt-1">This player has no recorded ownership history yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
