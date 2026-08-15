'use client';

import { SoccerBallIcon } from '@/components/ui/CustomIcons';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { 
  Search, 
  TrendingUp, 
  Users, 
  Target, 
  Trophy, 
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle
} from 'lucide-react';

interface PlayerWithPoints {
  real_player_id: string;
  player_name: string;
  position: string | null;
  real_team_name: string | null;
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

interface RoundInfo {
  fantasy_round_id: string;
  round_id: string;
  round_number: number;
  round_name: string;
  is_completed: boolean;
}

interface League {
  league_id: string;
  name: string;
  status: string;
}

export default function CommitteeAllPlayersPointsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [players, setPlayers] = useState<PlayerWithPoints[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<PlayerWithPoints[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>('');
  const [rounds, setRounds] = useState<RoundInfo[]>([]);
  const [selectedRound, setSelectedRound] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'cumulative' | 'round' | 'name' | 'acquired'>('cumulative');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'drafted'>('all');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Load all fantasy leagues
  useEffect(() => {
    const loadLeagues = async () => {
      if (!user) return;

      try {
        const response = await fetchWithTokenRefresh('/api/fantasy/leagues');
        if (!response.ok) throw new Error('Failed to fetch leagues');
        const data = await response.json();
        
        setLeagues(data.leagues || []);
        
        // Default to first active league
        const activeLeague = data.leagues.find((l: League) => l.status === 'active');
        if (activeLeague) {
          setSelectedLeague(activeLeague.league_id);
        }
      } catch (error) {
        console.error('Error loading leagues:', error);
      }
    };

    loadLeagues();
  }, [user]);

  // Load rounds when league is selected
  useEffect(() => {
    const loadRounds = async () => {
      if (!selectedLeague) return;

      try {
        const roundsResponse = await fetchWithTokenRefresh(`/api/fantasy/rounds?league_id=${selectedLeague}`);
        if (!roundsResponse.ok) throw new Error('Failed to fetch rounds');
        const roundsData = await roundsResponse.json();
        
        setRounds(roundsData.rounds || []);
        
        // Default to most recent completed round
        const completedRounds = roundsData.rounds.filter((r: RoundInfo) => r.is_completed);
        if (completedRounds.length > 0) {
          setSelectedRound(completedRounds[completedRounds.length - 1].round_id);
        }
      } catch (error) {
        console.error('Error loading rounds:', error);
      }
    };

    loadRounds();
  }, [selectedLeague]);

  // Load players when league and round are selected
  useEffect(() => {
    const loadPlayers = async () => {
      if (!selectedLeague) return;

      setIsLoading(true);
      try {
        const url = selectedRound 
          ? `/api/fantasy/players/all-base-points?league_id=${selectedLeague}&round_id=${selectedRound}`
          : `/api/fantasy/players/all-base-points?league_id=${selectedLeague}`;

        const response = await fetchWithTokenRefresh(url);
        if (!response.ok) throw new Error('Failed to fetch players');
        
        const data = await response.json();
        setPlayers(data.players || []);
        setFilteredPlayers(data.players || []);
      } catch (error) {
        console.error('Error loading players:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPlayers();
  }, [selectedLeague, selectedRound]);

  // Filter and sort players
  useEffect(() => {
    let result = [...players];

    // Filter by status
    if (filterStatus === 'available') {
      result = result.filter(p => p.is_available);
    } else if (filterStatus === 'drafted') {
      result = result.filter(p => !p.is_available);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.player_name.toLowerCase().includes(query) ||
        p.real_team_name?.toLowerCase().includes(query) ||
        p.acquired_by_team_name?.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'cumulative':
          comparison = a.cumulative_base_points - b.cumulative_base_points;
          break;
        case 'round':
          comparison = (a.round_base_points || 0) - (b.round_base_points || 0);
          break;
        case 'name':
          comparison = a.player_name.localeCompare(b.player_name);
          break;
        case 'acquired':
          comparison = (a.acquired_by_team_name || '').localeCompare(b.acquired_by_team_name || '');
          break;
      }

      return sortDirection === 'desc' ? -comparison : comparison;
    });

    setFilteredPlayers(result);
  }, [players, searchQuery, sortBy, sortDirection, filterStatus]);

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ field }: { field: typeof sortBy }) => {
    if (sortBy !== field) return null;
    return sortDirection === 'desc' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />;
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Trophy className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            All Players - Base Points (Admin)
          </h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          View all players' base points across all fantasy leagues (without captain/vice-captain multipliers)
        </p>
      </div>

      {/* Filters and Controls */}
      <div className="max-w-7xl mx-auto mb-6 space-y-4">
        {/* League and Round Selectors */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Fantasy League
              </label>
              <select
                value={selectedLeague}
                onChange={(e) => setSelectedLeague(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Select a league...</option>
                {leagues.map((league) => (
                  <option key={league.league_id} value={league.league_id}>
                    {league.name} ({league.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Round
              </label>
              <select
                value={selectedRound}
                onChange={(e) => setSelectedRound(e.target.value)}
                disabled={!selectedLeague}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
              >
                <option value="">All Rounds (Cumulative)</option>
                {rounds.map((round) => (
                  <option key={round.round_id} value={round.round_id}>
                    Round {round.round_number} - {round.round_name} 
                    {round.is_completed ? ' ✓' : ' (In Progress)'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search players, teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* Status Filter */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterStatus === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                All ({players.length})
              </button>
              <button
                onClick={() => setFilterStatus('available')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterStatus === 'available'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Available ({players.filter(p => p.is_available).length})
              </button>
              <button
                onClick={() => setFilterStatus('drafted')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterStatus === 'drafted'
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Drafted ({players.filter(p => !p.is_available).length})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Players Table */}
      {selectedLeague ? (
        <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th 
                    onClick={() => toggleSort('name')}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    <div className="flex items-center gap-1">
                      Player <SortIcon field="name" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Team
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th 
                    onClick={() => toggleSort('acquired')}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    <div className="flex items-center gap-1">
                      Acquired By <SortIcon field="acquired" />
                    </div>
                  </th>
                  <th 
                    onClick={() => toggleSort('cumulative')}
                    className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Total Points <SortIcon field="cumulative" />
                    </div>
                  </th>
                  {selectedRound && (
                    <th 
                      onClick={() => toggleSort('round')}
                      className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      <div className="flex items-center justify-center gap-1">
                        Round Points <SortIcon field="round" />
                      </div>
                    </th>
                  )}
                  {selectedRound && (
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Performance
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredPlayers.map((player) => (
                  <tr 
                    key={player.real_player_id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {player.player_name}
                      </div>
                      {player.position && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {player.position}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {player.real_team_name || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {player.is_available ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                          <CheckCircle2 className="w-3 h-3" /> Available
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                          <Users className="w-3 h-3" /> Drafted
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {player.acquired_by_team_name ? (
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {player.acquired_by_team_name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {player.acquired_by_owner}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 italic">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="font-bold text-lg text-blue-600 dark:text-blue-400">
                        {player.cumulative_base_points}
                      </div>
                    </td>
                    {selectedRound && (
                      <td className="px-4 py-3 text-center">
                        {player.round_base_points !== null ? (
                          <div className="font-semibold text-gray-900 dark:text-white">
                            {player.round_base_points}
                          </div>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">0</span>
                        )}
                      </td>
                    )}
                    {selectedRound && player.round_stats && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2 text-xs">
                          {player.round_stats.goals > 0 && (
                            <span className="text-green-600 dark:text-green-400 font-medium">
                              ⚽ {player.round_stats.goals}
                            </span>
                          )}
                          {player.round_stats.assists > 0 && (
                            <span className="text-blue-600 dark:text-blue-400 font-medium">
                              🎯 {player.round_stats.assists}
                            </span>
                          )}
                          {player.round_stats.motm && (
                            <span className="text-yellow-600 dark:text-yellow-400" title="Man of the Match">
                              ⭐
                            </span>
                          )}
                          {player.round_stats.clean_sheet && (
                            <span className="text-purple-600 dark:text-purple-400" title="Clean Sheet">
                              🛡️
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredPlayers.length === 0 && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No players found matching your filters</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500 dark:text-gray-400 text-lg">
            Please select a fantasy league to view players
          </p>
        </div>
      )}

      {/* Info Box */}
      <div className="max-w-7xl mx-auto mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Target className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Base Points Explained
            </h3>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              These are base points <strong>without</strong> captain (2x) or vice-captain (1.5x) multipliers. 
              This view shows all players across the league to help teams plan their acquisitions and identify high-performing players.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
