'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { ArrowLeft, Users, DollarSign, Percent, CheckCircle, AlertCircle, X } from 'lucide-react';
import Link from 'next/link';

interface Player {
  id: string;
  playerName: string;
  category: string;
  basePrice: number;
}

interface TeamData {
  id: string;
  name: string;
  originalBudget: number;
  currentBudget: number;
  currentSpent: number;
  retainedPlayers: Array<Player & { retentionPrice: number; retentionPercentage: number }>;
}

export default function RetainPlayersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [userSeasonId, setUserSeasonId] = useState<string | null>(null);
  const [currentSeason, setCurrentSeason] = useState<any>(null);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Retain form state
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [retentionPercentage, setRetentionPercentage] = useState<string>('100');
  const [isRetaining, setIsRetaining] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchSeasonData = async () => {
      try {
        const response = await fetchWithTokenRefresh('/api/user/get-season');
        const data = await response.json();
        if (data.season) {
          setCurrentSeason(data.season);
          setUserSeasonId(data.season.id);
        }
      } catch (error) {
        console.error('Error fetching season:', error);
      }
    };

    if (user?.role === 'committee_admin') {
      fetchSeasonData();
    }
  }, [user]);

  useEffect(() => {
    const loadData = async () => {
      if (!userSeasonId) return;

      setIsLoading(true);
      try {
        // Load players
        const playersResponse = await fetchWithTokenRefresh(`/api/realplayers/season-players?seasonId=${userSeasonId}`);
        const playersResult = await playersResponse.json();

        // Load teams
        const teamsResponse = await fetchWithTokenRefresh(`/api/teams/season-teams?seasonId=${userSeasonId}`);
        const teamsResult = await teamsResponse.json();

        if (!playersResult.success || !teamsResult.success) {
          setError('Failed to load data');
          return;
        }

        const realPlayersData = playersResult.data || [];
        const teamSeasons = teamsResult.data || [];

        // Organize players
        const teamMap: { [key: string]: Array<Player & { retentionPrice: number; retentionPercentage: number }> } = {};
        const unassignedPlayers: Player[] = [];

        realPlayersData.forEach((data: any) => {
          const player: Player = {
            id: data.id,
            playerName: data.player_name || '',
            category: data.category || 'BRONZE',
            basePrice: parseInt(data.base_price) || 0,
          };

          const teamId = data.team_id;
          if (teamId && teamId !== '' && teamId !== null) {
            if (!teamMap[teamId]) teamMap[teamId] = [];
            const retentionPrice = parseInt(data.price) || player.basePrice;
            const retentionPercentage = player.basePrice > 0 
              ? Math.round((retentionPrice / player.basePrice) * 100)
              : 100;
            teamMap[teamId].push({
              ...player,
              retentionPrice,
              retentionPercentage
            });
          } else {
            unassignedPlayers.push(player);
          }
        });

        // Create team data structure
        const teamsData: TeamData[] = teamSeasons.map((teamSeason: any) => {
          const teamId = teamSeason.team_id || teamSeason.id.split('_')[0];
          const retainedPlayers = teamMap[teamId] || [];

          const originalBudget = teamSeason.initial_real_player_budget || 
            teamSeason.real_player_budget_initial || 1000;
          const currentBudget = teamSeason.real_player_budget ?? originalBudget;
          const currentSpent = teamSeason.real_player_spent || 0;

          return {
            id: teamId,
            name: teamSeason.team_name || teamSeason.team_code || 'Unknown Team',
            originalBudget,
            currentBudget,
            currentSpent,
            retainedPlayers,
          };
        }).sort((a, b) => a.name.localeCompare(b.name));

        setTeams(teamsData);
        setAvailablePlayers(unassignedPlayers);
      } catch (error) {
        console.error('Error loading data:', error);
        setError('Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [userSeasonId]);

  const handleRetainPlayer = async () => {
    if (!selectedPlayer || !selectedTeam || !retentionPercentage) {
      setError('Please select a player, team, and retention percentage');
      return;
    }

    const percentage = parseInt(retentionPercentage);
    if (isNaN(percentage) || percentage < 1 || percentage > 100) {
      setError('Retention percentage must be between 1 and 100');
      return;
    }

    const retentionPrice = Math.round((selectedPlayer.basePrice * percentage) / 100);

    if (retentionPrice < 1) {
      setError('Retention price must be at least 1 coin');
      return;
    }

    try {
      setIsRetaining(true);
      setError(null);
      setSuccess(null);

      const response = await fetchWithTokenRefresh('/api/contracts/assign-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: userSeasonId,
          players: [{
            id: selectedPlayer.id,
            teamId: selectedTeam,
            playerName: selectedPlayer.playerName,
            auctionValue: retentionPrice,
          }],
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to retain player');
      }

      // Update local state
      setTeams(prevTeams => prevTeams.map(t => {
        if (t.id === selectedTeam) {
          return {
            ...t,
            currentBudget: t.currentBudget - retentionPrice,
            currentSpent: t.currentSpent + retentionPrice,
            retainedPlayers: [...t.retainedPlayers, {
              ...selectedPlayer,
              retentionPrice,
              retentionPercentage: percentage,
            }]
          };
        }
        return t;
      }));

      setAvailablePlayers(prev => prev.filter(p => p.id !== selectedPlayer.id));

      const teamName = teams.find(t => t.id === selectedTeam)?.name || 'Team';
      setSuccess(`${selectedPlayer.playerName} retained by ${teamName} at ${percentage}% (${retentionPrice} coins)`);

      // Reset form
      setSelectedPlayer(null);
      setSelectedTeam('');
      setRetentionPercentage('100');

      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      console.error('Error retaining player:', err);
      setError(err.message || 'Failed to retain player');
    } finally {
      setIsRetaining(false);
    }
  };

  const removePlayerFromTeam = (teamId: string, playerId: string) => {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    const removedPlayer = team.retainedPlayers.find(p => p.id === playerId);
    if (!removedPlayer) return;

    setTeams(prevTeams => prevTeams.map(t => {
      if (t.id === teamId) {
        return {
          ...t,
          currentBudget: t.currentBudget + removedPlayer.retentionPrice,
          currentSpent: t.currentSpent - removedPlayer.retentionPrice,
          retainedPlayers: t.retainedPlayers.filter(p => p.id !== playerId)
        };
      }
      return t;
    }));

    setAvailablePlayers(prev => [...prev, {
      id: removedPlayer.id,
      playerName: removedPlayer.playerName,
      category: removedPlayer.category,
      basePrice: removedPlayer.basePrice,
    }]);
  };

  const calculatedRetentionPrice = selectedPlayer && retentionPercentage
    ? Math.round((selectedPlayer.basePrice * parseInt(retentionPercentage)) / 100)
    : 0;

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-500 uppercase tracking-wider font-bold">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'committee_admin') {
    return null;
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/committee/team-management"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0">
              <Users className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">SYSTEM CONTROL</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Retain Real Players
              </h1>
              <p className="text-xs text-slate-500 font-mono mt-1">
                Assign players to teams at a percentage of their base price
              </p>
            </div>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="console-card bg-rose-50 border border-rose-200 rounded-3xl p-5 shadow-sm flex items-center justify-between gap-3 text-rose-800">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
              <p className="text-xs font-bold uppercase tracking-wide">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="console-card bg-emerald-50 border border-emerald-200 rounded-3xl p-5 shadow-sm flex items-center justify-between gap-3 text-emerald-800">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <p className="text-xs font-bold uppercase tracking-wide">{success}</p>
            </div>
            <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Retention Form */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider mb-4">Retain Player</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Player Selection */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                1. Select Player
              </label>
              <select
                value={selectedPlayer?.id || ''}
                onChange={(e) => {
                  const player = availablePlayers.find(p => p.id === e.target.value);
                  setSelectedPlayer(player || null);
                }}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide"
              >
                <option value="">Choose player...</option>
                {availablePlayers
                  .sort((a, b) => a.playerName.localeCompare(b.playerName))
                  .map(player => (
                    <option key={player.id} value={player.id}>
                      {player.playerName} ({player.category}) - Base: {player.basePrice}
                    </option>
                  ))}
              </select>
            </div>

            {/* Team Selection */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                2. Select Team
              </label>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide"
              >
                <option value="">Choose team...</option>
                {teams
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(team => (
                    <option key={team.id} value={team.id}>
                      {team.name} - Budget: {team.currentBudget}
                    </option>
                  ))}
              </select>
            </div>

            {/* Retention Percentage */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                3. Retention %
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={retentionPercentage}
                  onChange={(e) => setRetentionPercentage(e.target.value)}
                  className="w-full px-4 py-2.5 pr-8 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none"
                  placeholder="100"
                />
                <Percent className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
              {selectedPlayer && (
                <p className="text-[9px] text-slate-500 mt-1">
                  = {calculatedRetentionPrice} coins
                </p>
              )}
            </div>

            {/* Retain Button */}
            <div className="flex items-end">
              <button
                onClick={handleRetainPlayer}
                disabled={isRetaining || !selectedPlayer || !selectedTeam}
                className="w-full px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isRetaining ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                    Retaining...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    Retain Player
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Teams Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {teams.map(team => (
            <div key={team.id} className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
                  {team.name}
                </h3>
                <div className="text-right">
                  <p className="text-[9px] text-slate-500 uppercase font-bold">Budget</p>
                  <p className="text-sm font-black text-emerald-600 font-mono">
                    {team.currentBudget} / {team.originalBudget}
                  </p>
                </div>
              </div>

              {team.retainedPlayers.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No retained players</p>
              ) : (
                <div className="space-y-2">
                  {team.retainedPlayers.map(player => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-900">{player.playerName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded uppercase">
                            {player.category}
                          </span>
                          <span className="text-[9px] text-slate-500">
                            Base: {player.basePrice}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-[9px] text-slate-500">Retained at</p>
                          <p className="text-xs font-black text-emerald-600 font-mono">
                            {player.retentionPercentage}% = {player.retentionPrice}
                          </p>
                        </div>
                        <button
                          onClick={() => removePlayerFromTeam(team.id, player.id)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                          title="Remove player"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
