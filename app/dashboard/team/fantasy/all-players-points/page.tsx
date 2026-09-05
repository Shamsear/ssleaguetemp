'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import {
  Search,
  Users,
  Target,
  Trophy,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ArrowLeft,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Star,
  Shield,
  AlertTriangle,
  RotateCw,
  LayoutGrid,
  Table,
} from 'lucide-react';
import { SoccerBallIcon } from '@/components/ui/CustomIcons';
import AuthGuard from '@/components/auth/AuthGuard';

const PAGE_SIZE = 50;

interface PlayerWithPoints {
  real_player_id: string;
  player_name: string;
  position: string | null;
  real_team_name: string | null;
  category: string | null;
  draft_price: number;
  is_available: boolean;
  acquired_by_team_id: string | null;
  acquired_by_team_name: string | null;
  acquired_by_owner: string | null;
  cumulative_base_points: number;
  round_base_points: number | null;
  round_stats: {
    goals: number;
    assists: number;
    clean_sheet: boolean;
    motm: boolean;
    minutes_played: number;
  } | null;
}

interface Pagination {
  page: number;
  page_size: number;
  total_players: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

interface RoundInfo {
  fantasy_round_id: string;
  round_id: string;
  round_number: number;
  round_name: string;
  is_completed: boolean;
}

interface MatchBreakdown {
  fixture_id: string;
  round_number: number;
  opponent: string;
  goals_scored: number;
  goals_conceded: number;
  result: string;
  is_motm: boolean;
  is_clean_sheet: boolean;
  fine_goals: number;
  substitution_penalty: number;
  base_points: number;
  points_breakdown: Record<string, number>;
}

export default function AllPlayersPointsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [players, setPlayers] = useState<PlayerWithPoints[]>([]);
  const [leagueId, setLeagueId] = useState<string>('');
  const [rounds, setRounds] = useState<RoundInfo[]>([]);
  const [selectedRound, setSelectedRound] = useState<string>('');
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [leagueLoading, setLeagueLoading] = useState(true);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'cumulative' | 'round' | 'name' | 'acquired'>('cumulative');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'drafted'>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [totalDrafted, setTotalDrafted] = useState(0);
  const [totalAll, setTotalAll] = useState(0);

  // Draft settings for list assignments
  const [categorySettings, setCategorySettings] = useState<any>(null);

  // Get the list label for a player (e.g., "RED 1", "RED 2", "BLACK")
  const getPlayerListLabel = (playerId: string, category: string | null): string => {
    if (!categorySettings?.lists || !category) return category || '—';
    const cat = category.toUpperCase();
    const lists = categorySettings.lists;
    // Find which list this player belongs to
    for (const [listId, playerIds] of Object.entries(lists)) {
      if ((playerIds as string[]).includes(playerId)) {
        // Check if this list belongs to the current category
        const listCat = listId.replace(/_list_?\d*$/i, '').toUpperCase();
        if (listCat === cat) {
          // Count how many lists exist for this category
          const catLists = Object.keys(lists).filter(k => k.replace(/_list_?\d*$/i, '').toUpperCase() === cat);
          if (catLists.length >= 2) {
            // Find the index of this list among category lists
            const idx = catLists.indexOf(listId) + 1;
            return `${cat} ${idx}`;
          }
          return cat;
        }
      }
    }
    return category;
  };

  // Expandable row state
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [breakdownCache, setBreakdownCache] = useState<Record<string, MatchBreakdown[]>>({});
  const [breakdownLoading, setBreakdownLoading] = useState<string | null>(null);

  const toggleExpand = async (playerId: string) => {
    if (expandedPlayer === playerId) { setExpandedPlayer(null); return; }
    setExpandedPlayer(playerId);
    if (breakdownCache[playerId]) return;
    setBreakdownLoading(playerId);
    try {
      const res = await fetchWithTokenRefresh(
        `/api/fantasy/players/${playerId}/breakdown?league_id=${leagueId}`
      );
      if (res.ok) {
        const data = await res.json();
        setBreakdownCache(prev => ({ ...prev, [playerId]: data.matches || [] }));
      } else {
        setBreakdownCache(prev => ({ ...prev, [playerId]: [] }));
      }
    } catch {
      setBreakdownCache(prev => ({ ...prev, [playerId]: [] }));
    } finally {
      setBreakdownLoading(null);
    }
  };

  useEffect(() => {
    const loadLeagueData = async () => {
      if (!user) return;

      setLeagueLoading(true);
      setError('');
      try {
        const myTeamResponse = await fetchWithTokenRefresh(`/api/fantasy/teams/my-team?user_id=${user.uid}`);

        if (myTeamResponse.status === 404) {
          setError('no_team');
          setLeagueLoading(false);
          return;
        }

        if (!myTeamResponse.ok) throw new Error('Failed to fetch team data');

        const myTeam = await myTeamResponse.json();
        const fetchedLeagueId = myTeam.team?.league_id || myTeam.team?.fantasy_league_id;

        if (!fetchedLeagueId) {
          setError('no_league');
          setLeagueLoading(false);
          return;
        }

        setLeagueId(fetchedLeagueId);

        // Fetch draft settings for list assignments
        try {
          const settingsResponse = await fetchWithTokenRefresh(`/api/fantasy/draft/settings?league_id=${fetchedLeagueId}`);
          if (settingsResponse.ok) {
            const settingsData = await settingsResponse.json();
            setCategorySettings(settingsData.settings?.category_settings || null);
          }
        } catch {
          // Draft settings not available — that's fine
        }

        // Try to get rounds (optional)
        try {
          const roundsResponse = await fetchWithTokenRefresh(`/api/fantasy/rounds?league_id=${fetchedLeagueId}`);
          if (roundsResponse.ok) {
            const roundsData = await roundsResponse.json();
            setRounds(roundsData.rounds || []);

            // Default to most recent completed round
            const completedRounds = roundsData.rounds?.filter((r: RoundInfo) => r.is_completed) || [];
            if (completedRounds.length > 0) {
              setSelectedRound(completedRounds[completedRounds.length - 1].round_id);
            }
          }
        } catch {
          // Rounds not available — that's fine, we'll show cumulative
          setRounds([]);
        }
      } catch (err: any) {
        console.error('Error loading league data:', err);
        setError('fetch_error');
      } finally {
        setLeagueLoading(false);
      }
    };

    if (!loading && user) {
      loadLeagueData();
    }
  }, [user, loading]);

  const loadPlayers = useCallback(async () => {
    if (!leagueId) return;
    setPlayersLoading(true);
    try {
      const params = new URLSearchParams({
        league_id: leagueId,
        page: String(currentPage),
        page_size: String(PAGE_SIZE),
      });
      if (selectedRound) params.set('round_id', selectedRound);

      const response = await fetchWithTokenRefresh(`/api/fantasy/players/all-base-points?${params}`);
      if (!response.ok) throw new Error('Failed to fetch players');

      const data = await response.json();
      setPlayers(data.players || []);
      setPagination(data.pagination || null);
      setTotalAll(data.total_players || 0);
      setTotalAvailable(data.available_players || 0);
      setTotalDrafted(data.drafted_players || 0);
    } catch (err: any) {
      console.error('Error loading players:', err);
    } finally {
      setPlayersLoading(false);
    }
  }, [leagueId, selectedRound, currentPage]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);

  // Reset page when round changes
  useEffect(() => { setCurrentPage(1); }, [selectedRound, filterStatus]);

  // Client-side filter + sort within the current page
  const filteredPlayers = (() => {
    let result = [...players];
    if (filterStatus === 'available') result = result.filter(p => p.is_available);
    else if (filterStatus === 'drafted') result = result.filter(p => !p.is_available);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.player_name.toLowerCase().includes(q) ||
        p.real_team_name?.toLowerCase().includes(q) ||
        p.acquired_by_team_name?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'cumulative': cmp = a.cumulative_base_points - b.cumulative_base_points; break;
        case 'round': cmp = (a.round_base_points || 0) - (b.round_base_points || 0); break;
        case 'name': cmp = a.player_name.localeCompare(b.player_name); break;
        case 'acquired': cmp = (a.acquired_by_team_name || '').localeCompare(b.acquired_by_team_name || ''); break;
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });
    return result;
  })();

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) setSortDirection(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(field); setSortDirection('desc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortBy }) => {
    if (sortBy !== field) return null;
    return sortDirection === 'desc' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />;
  };

  const topScorer = players.length > 0 && currentPage === 1
    ? [...players].sort((a, b) => b.cumulative_base_points - a.cumulative_base_points)[0]
    : null;

  // Auth loading
  if (loading || leagueLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-extrabold font-mono">Loading player points...</p>
        </div>
      </div>
    );
  }

  // Error states
  if (error === 'no_team' || error === 'no_league') {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="max-w-md w-full bg-white border border-slate-200/60 p-8 rounded-3xl text-center shadow-sm relative z-10">
          <div className="w-14 h-14 bg-slate-800 text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow">
            <Trophy className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">
            No Fantasy League
          </h2>
          <p className="text-xs text-slate-500 font-mono mb-6">
            {error === 'no_team'
              ? "You don't have a fantasy team yet. Register your squad to participate."
              : "Your team isn't linked to a fantasy league yet."}
          </p>
          <Link
            href="/dashboard/team/fantasy/my-team"
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
          >
            Go to My Team
          </Link>
        </div>
      </div>
    );
  }

  if (error === 'fetch_error') {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="max-w-md w-full bg-white border border-slate-200/60 p-8 rounded-3xl text-center shadow-sm relative z-10">
          <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Failed to Load</h2>
          <p className="text-xs text-slate-500 font-mono mb-6">
            Something went wrong loading your league data. Please try refreshing.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthGuard requiredRole="team">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-5">
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/team/fantasy/my-team"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to My Team
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">FANTASY LEAGUE</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
                All Players — Base Points
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Scout players without captain/vice-captain multipliers to plan future acquisitions
              </p>
            </div>
            <Trophy className="w-10 h-10 text-amber-500 shrink-0" />
          </div>
        </div>

        {/* Stats Summary */}
        {totalAll > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Total Players</div>
              <div className="text-2xl font-extrabold text-slate-900">{totalAll}</div>
            </div>
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Drafted</div>
              <div className="text-2xl font-extrabold text-slate-900">{totalDrafted}</div>
            </div>
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Available</div>
              <div className="text-2xl font-extrabold text-emerald-600">{totalAvailable}</div>
            </div>
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Top Score</div>
              <div className="text-2xl font-extrabold text-amber-600">{topScorer?.cumulative_base_points ?? '—'}</div>
              {topScorer && <div className="text-[10px] text-slate-400 truncate">{topScorer.player_name}</div>}
            </div>
          </div>
        )}

        {/* Filters Panel */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
          <h2 className="text-[10px] font-black text-slate-850 uppercase tracking-wider">Filters &amp; Controls</h2>

          {/* Round Selector */}
          <div>
            <label className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mb-2">
              Round
            </label>
            <select
              value={selectedRound}
              onChange={(e) => setSelectedRound(e.target.value)}
              className="w-full md:w-80 px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none text-xs font-bold uppercase"
            >
              <option value="">All Rounds (Cumulative)</option>
              {rounds.map((round) => (
                <option key={round.round_id} value={round.round_id}>
                  Round {round.round_number} — {round.round_name}
                  {round.is_completed ? ' ✓' : ' (In Progress)'}
                </option>
              ))}
            </select>
          </div>

          {/* Search and Status Filter */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search players, teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none text-xs font-bold uppercase placeholder:normal-case placeholder:font-normal placeholder:text-slate-400"
              />
            </div>

            <div className="flex gap-2 shrink-0 flex-wrap">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-4 py-2.5 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all ${
                  filterStatus === 'all'
                    ? 'bg-slate-800 text-amber-400 shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                All ({totalAll})
              </button>
              <button
                onClick={() => setFilterStatus('available')}
                className={`px-4 py-2.5 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all ${
                  filterStatus === 'available'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                Free ({totalAvailable})
              </button>
              <button
                onClick={() => setFilterStatus('drafted')}
                className={`px-4 py-2.5 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all ${
                  filterStatus === 'drafted'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                Drafted ({totalDrafted})
              </button>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Display Mode</span>
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
              <button
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition-all ${
                  viewMode === 'cards'
                    ? 'bg-slate-900 text-amber-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Cards View
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition-all ${
                  viewMode === 'table'
                    ? 'bg-slate-900 text-amber-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Table className="w-3.5 h-3.5" /> Table View
              </button>
            </div>
          </div>
        </div>

        {/* Players Display */}
        {playersLoading ? (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 shadow-sm text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto mb-3"></div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Loading players...</p>
          </div>
        ) : viewMode === 'cards' ? (
          /* Cards Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPlayers.map((player) => {
              const isExpanded = expandedPlayer === player.real_player_id;
              const isLoadingBreakdown = breakdownLoading === player.real_player_id;
              const matches = breakdownCache[player.real_player_id] || [];

              return (
                <div
                  key={player.real_player_id}
                  className="console-card bg-white border border-slate-200/70 rounded-3xl p-5 shadow-sm hover:border-amber-400/80 transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        {(player as any).photo_url ? (
                          <img
                            src={(player as any).photo_url}
                            alt={player.player_name}
                            className="w-12 h-12 rounded-2xl object-cover border border-slate-200 shadow-sm shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-slate-900 border border-slate-700 text-amber-400 rounded-2xl flex items-center justify-center text-base font-black shadow-sm shrink-0">
                            {(player.player_name || '').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h3 className="font-extrabold text-base text-slate-900 leading-snug">{player.player_name}</h3>
                          <p className="text-xs text-slate-500 font-medium">{player.real_team_name || 'No Club'}</p>
                        </div>
                      </div>
                      {player.category && (
                        <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-slate-900 text-amber-400 border border-slate-800 shrink-0">
                          {getPlayerListLabel(player.real_player_id, player.category)}
                        </span>
                      )}
                    </div>

                    {/* Status & Total Points Banner */}
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 mb-3 flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-0.5">Status</span>
                        {player.is_available ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-100/80 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Free Agent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-indigo-100/80 text-indigo-800 border border-indigo-200 truncate max-w-[140px]">
                            <Users className="w-3 h-3 shrink-0" /> {player.acquired_by_team_name || 'Drafted'}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-0.5">Total Points</span>
                        <span className="text-2xl font-black text-amber-600 leading-none">{player.cumulative_base_points} <span className="text-xs font-bold text-slate-400">pts</span></span>
                      </div>
                    </div>

                    {/* Quick Stats Badges */}
                    {player.round_stats && (
                      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                        {player.round_stats.goals > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200"><SoccerBallIcon className="w-3 h-3" /> {player.round_stats.goals} Goal{player.round_stats.goals > 1 ? 's' : ''}</span>}
                        {player.round_stats.motm && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 font-bold text-[10px] border border-amber-200"><Star className="w-3 h-3 fill-amber-400" /> MOTM</span>}
                        {player.round_stats.clean_sheet && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold text-[10px] border border-slate-200"><Shield className="w-3 h-3" /> Clean Sheet</span>}
                      </div>
                    )}
                  </div>

                  {/* Toggle Breakdown Button */}
                  <div>
                    <button
                      onClick={() => toggleExpand(player.real_player_id)}
                      className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-amber-400 rounded-2xl font-mono text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm"
                    >
                      {isExpanded ? (
                        <>Hide Point Breakdown <ChevronUp className="w-4 h-4" /></>
                      ) : (
                        <>View Full Breakdown <ChevronDown className="w-4 h-4" /></>
                      )}
                    </button>

                    {/* Detailed Match Breakdown inside Card */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          Match History Breakdown ({matches.length} Match{matches.length !== 1 ? 'es' : ''})
                        </h4>
                        {isLoadingBreakdown ? (
                          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono py-3 justify-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-500" />
                            Loading match history...
                          </div>
                        ) : matches.length === 0 ? (
                          <p className="text-xs text-slate-400 font-bold text-center py-3 bg-slate-50 rounded-2xl border border-slate-100">
                            No match breakdown recorded yet
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {matches.map((m) => (
                              <div key={m.fixture_id} className="bg-slate-50 border border-slate-200/70 rounded-2xl p-3 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Round {m.round_number} vs {m.opponent}</span>
                                  <span className="text-xs font-extrabold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">+{m.base_points} pts</span>
                                </div>
                                <div className="text-[11px] text-slate-500 font-medium">
                                  Result: {m.goals_scored} - {m.goals_conceded} ({m.result.toUpperCase()})
                                </div>
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[10px] font-bold text-slate-600">Played: +1</span>
                                  {m.goals_scored > 0 && <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-md text-[10px] font-bold text-emerald-700">Goals ({m.goals_scored}): +{m.goals_scored * 2}</span>}
                                  {m.result === 'win' && <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-md text-[10px] font-bold text-emerald-700">Win: +3</span>}
                                  {m.result === 'draw' && <span className="px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-md text-[10px] font-bold text-amber-700">Draw: +1</span>}
                                  {m.is_motm && <span className="px-2 py-0.5 bg-amber-100 border border-amber-300 rounded-md text-[10px] font-bold text-amber-800">MOTM: +5</span>}
                                  {m.is_clean_sheet && <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-md text-[10px] font-bold text-blue-700">Clean Sheet: +6</span>}
                                  {m.goals_scored >= 3 && <span className="px-2 py-0.5 bg-purple-50 border border-purple-200 rounded-md text-[10px] font-bold text-purple-700">Hat-Trick: +5</span>}
                                  {m.substitution_penalty !== 0 && <span className="px-2 py-0.5 bg-rose-50 border border-rose-200 rounded-md text-[10px] font-bold text-rose-700">Sub Penalty: {m.substitution_penalty}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-wider w-10">#</th>
                    <th
                      onClick={() => toggleSort('name')}
                      className="px-5 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider cursor-pointer hover:text-amber-600 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        Player <SortIcon field="name" />
                      </div>
                    </th>
                    <th className="px-5 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      Club
                    </th>
                    <th className="px-5 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-5 py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th
                      onClick={() => toggleSort('acquired')}
                      className="px-5 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider cursor-pointer hover:text-amber-600 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        Acquired By <SortIcon field="acquired" />
                      </div>
                    </th>
                    <th
                      onClick={() => toggleSort('cumulative')}
                      className="px-5 py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-wider cursor-pointer hover:text-amber-600 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        Total Pts <SortIcon field="cumulative" />
                      </div>
                    </th>
                    {selectedRound && (
                      <th
                        onClick={() => toggleSort('round')}
                        className="px-5 py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-wider cursor-pointer hover:text-amber-600 transition-colors"
                      >
                        <div className="flex items-center justify-center gap-1">
                          Round Pts <SortIcon field="round" />
                        </div>
                      </th>
                    )}
                    {selectedRound && (
                      <th className="px-5 py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-wider">
                        Performance
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredPlayers.map((player, idx) => {
                    const rowNum = (currentPage - 1) * PAGE_SIZE + idx + 1;
                    const isExpanded = expandedPlayer === player.real_player_id;
                    const isLoadingBreakdown = breakdownLoading === player.real_player_id;
                    const matches = breakdownCache[player.real_player_id] || [];
                    const colSpan = 7 + (selectedRound ? 2 : 0);
                    return (
                      <Fragment key={player.real_player_id}>
                        <tr
                          onClick={() => toggleExpand(player.real_player_id)}
                          className={`cursor-pointer transition-colors ${isExpanded ? 'bg-amber-50/60' : 'hover:bg-amber-50/40'}`}
                        >
                          {/* # */}
                          <td className="px-4 py-3.5 text-center">
                            <span className="text-[10px] font-black text-slate-400">{rowNum}</span>
                          </td>

                          {/* Player */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              {(player as any).photo_url ? (
                                <img
                                  src={(player as any).photo_url}
                                  alt={player.player_name}
                                  className="w-8 h-8 rounded-xl object-cover border border-slate-200 shadow-sm shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 bg-slate-800 border border-slate-700 text-amber-450 rounded-xl flex items-center justify-center text-[10px] font-black shadow-sm shrink-0">
                                  {(player.player_name || '').charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <div className="font-bold text-sm text-slate-900">{player.player_name}</div>
                                {isExpanded
                                  ? <ChevronUp className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  : <ChevronDown className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                }
                              </div>
                            </div>
                          </td>

                          {/* Club */}
                          <td className="px-5 py-3.5">
                            <span className="text-xs text-slate-600 font-medium">
                              {player.real_team_name || <span className="text-slate-300">—</span>}
                            </span>
                          </td>

                          {/* Category / List */}
                          <td className="px-5 py-3.5">
                            {player.category ? (
                              <span className="inline-block px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                {getPlayerListLabel(player.real_player_id, player.category)}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-5 py-3.5 text-center">
                            {player.is_available ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" /> Free
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                                <Users className="w-3 h-3" /> Drafted
                              </span>
                            )}
                          </td>

                          {/* Acquired By */}
                          <td className="px-5 py-3.5">
                            {player.acquired_by_team_name ? (
                              <div>
                                <div className="font-bold text-xs text-slate-900">{player.acquired_by_team_name}</div>
                                <div className="text-[10px] text-slate-400">{player.acquired_by_owner}</div>
                              </div>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>

                          {/* Total Points */}
                          <td className="px-5 py-3.5 text-center">
                            <span className="text-lg font-extrabold text-amber-600">{player.cumulative_base_points}</span>
                          </td>

                          {/* Round Points */}
                          {selectedRound && (
                            <td className="px-5 py-3.5 text-center">
                              {player.round_base_points !== null ? (
                                <span className="text-base font-extrabold text-slate-900">{player.round_base_points}</span>
                              ) : (
                                <span className="text-slate-300 text-sm">0</span>
                              )}
                            </td>
                          )}

                          {/* Performance */}
                          {selectedRound && (
                            <td className="px-5 py-3.5">
                              {player.round_stats ? (
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  {player.round_stats.goals > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200"><SoccerBallIcon className="w-3 h-3" /> {player.round_stats.goals}</span>}
                                  {player.round_stats.assists > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[10px] border border-blue-200"><Target className="w-3 h-3" /> {player.round_stats.assists}</span>}
                                  {player.round_stats.motm && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold text-[10px] border border-amber-200"><Star className="w-3 h-3 fill-amber-400" /> MOTM</span>}
                                  {player.round_stats.clean_sheet && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 text-slate-700 font-bold text-[10px] border border-slate-200"><Shield className="w-3 h-3" /> CS</span>}
                                  {!player.round_stats.goals && !player.round_stats.assists && !player.round_stats.motm && !player.round_stats.clean_sheet && <span className="text-slate-300 text-[10px]">—</span>}
                                </div>
                              ) : (
                                <span className="text-slate-300 text-[10px] block text-center">—</span>
                              )}
                            </td>
                          )}
                        </tr>

                        {/* Expanded Breakdown Row */}
                        {isExpanded && (
                          <tr key={`${player.real_player_id}-breakdown`}>
                            <td colSpan={colSpan} className="px-0 py-0 bg-slate-50/80 border-b border-amber-100">
                              <div className="px-8 py-4">
                                {isLoadingBreakdown ? (
                                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono py-2">
                                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-amber-500" />
                                    Loading match history…
                                  </div>
                                ) : matches.length === 0 ? (
                                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider py-2">
                                    No match data recorded yet
                                  </p>
                                ) : (
                                  <div>
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">
                                      Match-by-Match Breakdown · {matches.length} match{matches.length !== 1 ? 'es' : ''}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                                      {matches.map((m) => (
                                        <div key={m.fixture_id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                                          <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Round {m.round_number}</span>
                                            <span className={`text-base font-extrabold ${m.base_points > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{m.base_points} pts</span>
                                          </div>
                                          <div className="flex flex-wrap gap-1 mb-2">
                                            {m.goals_scored > 0 && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200"><SoccerBallIcon className="w-3 h-3" /> {m.goals_scored}</span>}
                                            {m.is_motm && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold text-[10px] border border-amber-200"><Star className="w-3 h-3 fill-amber-400" /> MOTM</span>}
                                            {m.is_clean_sheet && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-bold text-[10px] border border-slate-200"><Shield className="w-3 h-3" /> CS</span>}
                                            {m.fine_goals > 0 && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 font-bold text-[10px] border border-red-200"><AlertTriangle className="w-3 h-3" /> Fine ×{m.fine_goals}</span>}
                                            {m.substitution_penalty !== 0 && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-600 font-bold text-[10px] border border-orange-200"><RotateCw className="w-3 h-3" /> Sub</span>}
                                          </div>
                                           {m.points_breakdown && Object.keys(m.points_breakdown).length > 0 && (
                                             <div className="border-t border-slate-100 pt-2 mt-2 space-y-1">
                                               <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Itemized Breakdown</span>
                                               {Object.entries(m.points_breakdown).map(([key, val]) => (
                                                 <div key={key} className="flex justify-between items-center text-[10px] bg-slate-50/60 px-2 py-1 rounded">
                                                   <span className="text-slate-600 font-mono capitalize font-bold">{key.replace(/_/g, ' ')}</span>
                                                   <span className={`font-mono font-black ${Number(val) > 0 ? 'text-emerald-600' : Number(val) < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                                                     {Number(val) > 0 ? '+' : ''}{val} Pts
                                                   </span>
                                                 </div>
                                               ))}
                                             </div>
                                           )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>

                {filteredPlayers.length === 0 && !playersLoading && (
                  <div className="text-center py-16">
                    <Target className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                      {players.length === 0
                        ? 'No player data available for this league'
                        : 'No players found matching your filters'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pagination — Available in BOTH Cards View and Table View */}
          {pagination && pagination.total_pages > 0 && (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Page {pagination.page} of {pagination.total_pages} &nbsp;·&nbsp; {pagination.total_players} total players
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={!pagination.has_prev || playersLoading}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-black text-slate-600 uppercase tracking-wider transition-all"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                    let pageNum: number;
                    if (pagination.total_pages <= 5) pageNum = i + 1;
                    else if (pagination.page <= 3) pageNum = i + 1;
                    else if (pagination.page >= pagination.total_pages - 2) pageNum = pagination.total_pages - 4 + i;
                    else pageNum = pagination.page - 2 + i;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        disabled={playersLoading}
                        className={`w-8 h-8 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                          pageNum === pagination.page
                            ? 'bg-slate-800 text-amber-400'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(pagination.total_pages, p + 1))}
                  disabled={!pagination.has_next || playersLoading}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-black text-slate-600 uppercase tracking-wider transition-all"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

        {/* Info Box */}
        <div className="console-card bg-white border border-amber-200/60 rounded-2xl p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <Target className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-[10px] font-black text-slate-850 uppercase tracking-wider mb-1">
                Base Points Explained
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                These are base points <strong>without</strong> captain (2×) or vice-captain (1.5×) multipliers.
                Use this data to identify high-performing players for future acquisitions when releasing existing players.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  
    </AuthGuard>
  );
}
