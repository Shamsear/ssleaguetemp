'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { 
  ArrowLeft, 
  Search, 
  Download, 
  Award, 
  TrendingUp, 
  Trophy, 
  ChevronUp, 
  ChevronDown, 
  Calendar, 
  Shield, 
  Activity, 
  Users, 
  Sparkles 
} from 'lucide-react';

interface PlayerStats {
  id: string;
  player_id: string;
  player_name: string;
  position: string;
  overall_rating: number;
  team_name?: string;
  team_code?: string;
  price_paid?: number;
  auction_date?: Date;
  season_name: string;
  matches_played: number;
  goals: number;
  assists: number;
  clean_sheets: number;
  yellow_cards: number;
  red_cards: number;
  minutes_played: number;
  is_sold: boolean;
}

export default function SeasonPlayerStats() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Mock data - Replace with actual API calls
  const [players, setPlayers] = useState<PlayerStats[]>([
    {
      id: '1',
      player_id: 'sspslpsl001',
      player_name: 'Cristiano Ronaldo',
      position: 'CF',
      overall_rating: 91,
      team_name: 'Manchester United FC',
      team_code: 'MUN',
      price_paid: 5000000,
      auction_date: new Date('2024-02-01'),
      season_name: 'Season 2024',
      matches_played: 25,
      goals: 18,
      assists: 7,
      clean_sheets: 0,
      yellow_cards: 3,
      red_cards: 0,
      minutes_played: 2150,
      is_sold: true,
    },
    {
      id: '2',
      player_id: 'sspslpsl002',
      player_name: 'Bruno Fernandes',
      position: 'AMF',
      overall_rating: 88,
      team_name: 'Manchester United FC',
      team_code: 'MUN',
      price_paid: 4000000,
      auction_date: new Date('2024-02-02'),
      season_name: 'Season 2024',
      matches_played: 28,
      goals: 12,
      assists: 15,
      clean_sheets: 0,
      yellow_cards: 5,
      red_cards: 1,
      minutes_played: 2480,
      is_sold: true,
    },
    {
      id: '3',
      player_id: 'sspslpsl003',
      player_name: 'David de Gea',
      position: 'GK',
      overall_rating: 87,
      team_name: 'Manchester United FC',
      team_code: 'MUN',
      price_paid: 3500000,
      auction_date: new Date('2024-02-03'),
      season_name: 'Season 2024',
      matches_played: 30,
      goals: 0,
      assists: 0,
      clean_sheets: 12,
      yellow_cards: 2,
      red_cards: 0,
      minutes_played: 2700,
      is_sold: true,
    },
    {
      id: '4',
      player_id: 'sspslpsl004',
      player_name: 'Kevin De Bruyne',
      position: 'AMF',
      overall_rating: 92,
      team_name: 'Manchester City FC',
      team_code: 'MCI',
      price_paid: 5500000,
      auction_date: new Date('2024-02-04'),
      season_name: 'Season 2024',
      matches_played: 26,
      goals: 10,
      assists: 20,
      clean_sheets: 0,
      yellow_cards: 4,
      red_cards: 0,
      minutes_played: 2340,
      is_sold: true,
    },
    {
      id: '5',
      player_id: 'sspslpsl005',
      player_name: 'Mohamed Salah',
      position: 'RWF',
      overall_rating: 90,
      team_name: 'Liverpool FC',
      team_code: 'LIV',
      price_paid: 4800000,
      auction_date: new Date('2024-02-05'),
      season_name: 'Season 2024',
      matches_played: 29,
      goals: 22,
      assists: 11,
      clean_sheets: 0,
      yellow_cards: 2,
      red_cards: 0,
      minutes_played: 2610,
      is_sold: true,
    },
    {
      id: '6',
      player_id: 'sspslpsl006',
      player_name: 'Lionel Messi',
      position: 'RWF',
      overall_rating: 93,
      team_name: undefined,
      team_code: undefined,
      price_paid: undefined,
      auction_date: undefined,
      season_name: 'Season 2024',
      matches_played: 0,
      goals: 0,
      assists: 0,
      clean_sheets: 0,
      yellow_cards: 0,
      red_cards: 0,
      minutes_played: 0,
      is_sold: false,
    },
  ]);

  const [stats] = useState({
    totalPlayers: 150,
    soldPlayers: 145,
    unsoldPlayers: 5,
    totalGoals: 245,
    totalAssists: 180,
    totalMatches: 350,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeason, setFilterSeason] = useState('all');
  const [filterPosition, setFilterPosition] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState<'goals' | 'assists' | 'rating' | 'price'>('goals');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleExportData = () => {
    alert('Export data functionality - Backend to be implemented');
  };

  const filteredPlayers = players.filter(player => {
    const matchesSearch = player.player_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         player.player_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         player.team_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeason = filterSeason === 'all' || player.season_name === filterSeason;
    const matchesPosition = filterPosition === 'all' || player.position === filterPosition;
    const matchesTeam = filterTeam === 'all' || player.team_code === filterTeam;
    const matchesStatus = filterStatus === 'all' || 
                         (filterStatus === 'sold' && player.is_sold) ||
                         (filterStatus === 'unsold' && !player.is_sold);
    return matchesSearch && matchesSeason && matchesPosition && matchesTeam && matchesStatus;
  });

  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'goals':
        comparison = a.goals - b.goals;
        break;
      case 'assists':
        comparison = a.assists - b.assists;
        break;
      case 'rating':
        comparison = a.overall_rating - b.overall_rating;
        break;
      case 'price':
        comparison = (a.price_paid || 0) - (b.price_paid || 0);
        break;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const topScorers = [...players].filter(p => p.is_sold).sort((a, b) => b.goals - a.goals).slice(0, 5);
  const topAssists = [...players].filter(p => p.is_sold).sort((a, b) => b.assists - a.assists).slice(0, 5);
  const mostExpensive = [...players].filter(p => p.is_sold && p.price_paid).sort((a, b) => (b.price_paid || 0) - (a.price_paid || 0)).slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-505 font-mono text-xs tracking-widest uppercase animate-pulse">Syncing Stats telemetry...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="space-y-8 animate-fade-in font-mono">
      {/* Page Header */}
      <div className="flex items-center gap-4 pb-6 border-b border-slate-200/60">
        <button
          onClick={() => router.push('/dashboard/superadmin')}
          className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-55 text-slate-600 hover:text-slate-950 transition-all flex-shrink-0 shadow-sm"
          title="Back to Dashboard"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Season Player Statistics
          </h1>
          <p className="text-xs text-slate-505 font-mono mt-1">
            Analyze historical drafts, auction valuation trends, and player performance parameters.
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="console-card bg-white border border-slate-200/60 p-5 shadow-sm rounded-2xl">
          <p className="text-[10px] text-slate-450 uppercase tracking-wider mb-1">Total Players</p>
          <p className="text-2xl font-extrabold text-slate-800">{stats.totalPlayers}</p>
        </div>

        <div className="console-card bg-white border border-slate-200/60 p-5 shadow-sm rounded-2xl">
          <p className="text-[10px] text-slate-450 uppercase tracking-wider mb-1">Sold Players</p>
          <p className="text-2xl font-extrabold text-emerald-600">{stats.soldPlayers}</p>
        </div>

        <div className="console-card bg-white border border-slate-200/60 p-5 shadow-sm rounded-2xl">
          <p className="text-[10px] text-slate-450 uppercase tracking-wider mb-1">Unsold</p>
          <p className="text-2xl font-extrabold text-slate-550">{stats.unsoldPlayers}</p>
        </div>

        <div className="console-card bg-white border border-slate-200/60 p-5 shadow-sm rounded-2xl">
          <p className="text-[10px] text-slate-450 uppercase tracking-wider mb-1">Total Goals</p>
          <p className="text-2xl font-extrabold text-amber-600">{stats.totalGoals}</p>
        </div>

        <div className="console-card bg-white border border-slate-200/60 p-5 shadow-sm rounded-2xl">
          <p className="text-[10px] text-slate-450 uppercase tracking-wider mb-1">Total Assists</p>
          <p className="text-2xl font-extrabold text-amber-600">{stats.totalAssists}</p>
        </div>

        <div className="console-card bg-white border border-slate-200/60 p-5 shadow-sm rounded-2xl">
          <p className="text-[10px] text-slate-455 uppercase tracking-wider mb-1">Total Matches</p>
          <p className="text-2xl font-extrabold text-slate-705">{stats.totalMatches}</p>
        </div>
      </div>

      {/* Top Players Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Scorers */}
        <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-705 mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            Top Scorers
          </h3>
          <div className="space-y-3">
            {topScorers.map((player, index) => (
              <div key={player.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/30 transition-colors">
                <div className="flex items-center flex-1 min-w-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs mr-3 flex-shrink-0 ${
                    index === 0 ? 'bg-amber-100 text-amber-900 border border-amber-200' :
                    index === 1 ? 'bg-slate-100 text-slate-700 border border-slate-200' :
                    index === 2 ? 'bg-orange-50 text-orange-900 border border-orange-200' :
                    'bg-slate-50 text-slate-500 border border-slate-100'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{player.player_name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{player.team_code || 'Unsold'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-extrabold text-amber-600">{player.goals}</p>
                  <p className="text-[9px] text-slate-450 uppercase">goals</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Assists */}
        <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-705 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-500" />
            Top Assists
          </h3>
          <div className="space-y-3">
            {topAssists.map((player, index) => (
              <div key={player.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/30 transition-colors">
                <div className="flex items-center flex-1 min-w-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs mr-3 flex-shrink-0 ${
                    index === 0 ? 'bg-amber-100 text-amber-900 border border-amber-200' :
                    index === 1 ? 'bg-slate-100 text-slate-700 border border-slate-200' :
                    index === 2 ? 'bg-orange-50 text-orange-900 border border-orange-200' :
                    'bg-slate-50 text-slate-500 border border-slate-100'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{player.player_name}</p>
                    <p className="text-[10px] text-slate-550 font-mono">{player.team_code || 'Unsold'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-extrabold text-amber-600">{player.assists}</p>
                  <p className="text-[9px] text-slate-450 uppercase">assists</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Most Expensive */}
        <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-705 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            Most Expensive
          </h3>
          <div className="space-y-3">
            {mostExpensive.map((player, index) => (
              <div key={player.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/30 transition-colors">
                <div className="flex items-center flex-1 min-w-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs mr-3 flex-shrink-0 ${
                    index === 0 ? 'bg-amber-100 text-amber-900 border border-amber-200' :
                    index === 1 ? 'bg-slate-100 text-slate-700 border border-slate-200' :
                    index === 2 ? 'bg-orange-50 text-orange-900 border border-orange-200' :
                    'bg-slate-50 text-slate-500 border border-slate-100'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{player.player_name}</p>
                    <p className="text-[10px] text-slate-550 font-mono">{player.team_code}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-extrabold text-amber-600">{formatCurrency(player.price_paid || 0)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters and Search Console */}
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-4">
        {/* Search and Export Row */}
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
          <div className="flex-1 w-full lg:max-w-md">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search players, franchises, or registry IDs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-800 font-mono text-xs transition-all placeholder-slate-400"
              />
            </div>
          </div>

          <button
            onClick={handleExportData}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm w-full lg:w-auto justify-center"
          >
            <Download className="w-4 h-4" />
            Export to Excel
          </button>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap gap-3 font-mono text-xs">
          <select
            value={filterSeason}
            onChange={(e) => setFilterSeason(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-amber-400/50 outline-none"
          >
            <option value="all">All Seasons</option>
            <option value="Season 2024">Season 2024</option>
            <option value="Season 2023">Season 2023</option>
          </select>

          <select
            value={filterPosition}
            onChange={(e) => setFilterPosition(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-amber-400/50 outline-none"
          >
            <option value="all">All Positions</option>
            <option value="GK">Goalkeeper (GK)</option>
            <option value="CB">Center Back (CB)</option>
            <option value="LB">Left Back (LB)</option>
            <option value="RB">Right Back (RB)</option>
            <option value="DMF">Defensive Mid (DMF)</option>
            <option value="CMF">Central Mid (CMF)</option>
            <option value="AMF">Attacking Mid (AMF)</option>
            <option value="LWF">Left Wing (LWF)</option>
            <option value="RWF">Right Wing (RWF)</option>
            <option value="CF">Center Forward (CF)</option>
          </select>

          <select
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-amber-400/50 outline-none"
          >
            <option value="all">All Teams</option>
            <option value="MUN">Manchester United (MUN)</option>
            <option value="MCI">Manchester City (MCI)</option>
            <option value="LIV">Liverpool (LIV)</option>
            <option value="CHE">Chelsea (CHE)</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-amber-400/50 outline-none"
          >
            <option value="all">All Status</option>
            <option value="sold">Sold</option>
            <option value="unsold">Unsold</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-amber-400/50 outline-none"
          >
            <option value="goals">Sort by Goals</option>
            <option value="assists">Sort by Assists</option>
            <option value="rating">Sort by Rating</option>
            <option value="price">Sort by Price</option>
          </select>

          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="px-4 py-2 border border-slate-200 bg-white rounded-xl hover:bg-slate-50 transition-all font-bold flex items-center gap-1"
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {sortOrder === 'asc' ? 'Asc' : 'Desc'}
          </button>
        </div>
      </div>

      {/* Players Table Card */}
      <div className="console-card bg-white border border-slate-200/60 shadow-sm rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/60 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-500" />
            Player Statistics Table
          </h3>
          {sortedPlayers.length > 0 && (
            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-mono font-bold uppercase">
              {sortedPlayers.length} Records
            </span>
          )}
        </div>

        {sortedPlayers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/50 font-mono text-[10px] text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Player ID</th>
                  <th className="px-4 py-3 text-left font-semibold">Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Position</th>
                  <th className="px-4 py-3 text-left font-semibold">Rating</th>
                  <th className="px-4 py-3 text-left font-semibold">Team</th>
                  <th className="px-4 py-3 text-left font-semibold">Price</th>
                  <th className="px-4 py-3 text-left font-semibold">Matches</th>
                  <th className="px-4 py-3 text-left font-semibold">Goals</th>
                  <th className="px-4 py-3 text-left font-semibold">Assists</th>
                  <th className="px-4 py-3 text-left font-semibold">Clean Sheets</th>
                  <th className="px-4 py-3 text-left font-semibold">Cards</th>
                  <th className="px-4 py-3 text-left font-semibold">Minutes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-xs font-mono text-slate-700">
                {sortedPlayers.map((player) => (
                  <tr key={player.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3.5 whitespace-nowrap font-medium text-amber-600">
                      {player.player_id}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-bold text-slate-900">
                      {player.player_name}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200/60 font-semibold text-[10px]">
                        {player.position}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-slate-900">{player.overall_rating}</span>
                        <span className="text-amber-500">★</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {player.team_code ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200/60 font-semibold text-[10px]">
                          {player.team_code}
                        </span>
                      ) : (
                        <span className="text-slate-400">Unsold</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-bold text-slate-900">
                      {player.price_paid ? formatCurrency(player.price_paid) : '-'}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">{player.matches_played}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-bold text-emerald-650">{player.goals}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-bold text-slate-700">{player.assists}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">{player.clean_sheets}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {player.yellow_cards > 0 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                            {player.yellow_cards} 🟨
                          </span>
                        )}
                        {player.red_cards > 0 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 text-[10px] font-bold">
                            {player.red_cards} 🟥
                          </span>
                        )}
                        {player.yellow_cards === 0 && player.red_cards === 0 && (
                          <span className="text-slate-300">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">{player.minutes_played}'</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center text-slate-500 font-mono">
            <Users className="w-12 h-12 mx-auto text-slate-300 mb-4 animate-pulse" />
            <h4 className="font-extrabold text-slate-800 mb-1 text-sm">No Performance Records Found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery || filterSeason !== 'all' || filterPosition !== 'all' || filterTeam !== 'all' || filterStatus !== 'all'
                ? 'No stats match the criteria. Adjust filter query parameters.'
                : 'No performance telemetry registered for this season context.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
