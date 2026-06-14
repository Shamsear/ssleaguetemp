'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { ArrowLeft, Shuffle, RefreshCw, AlertTriangle, Info, Layers, Activity, Sparkles, CheckCircle, BarChart2 } from 'lucide-react';

// Only these positions are used for position groups
const POSITION_GROUP_POSITIONS = ['CB', 'DMF', 'CMF', 'AMF', 'CF'] as const;

const POSITION_LABELS = {
  CB: 'Center Back',
  DMF: 'Defensive Midfielder',
  CMF: 'Central Midfielder',
  AMF: 'Attacking Midfielder',
  CF: 'Center Forward',
} as const;

const POSITION_COLORS = {
  CB: 'bg-emerald-500',
  DMF: 'bg-amber-500',
  CMF: 'bg-amber-400',
  AMF: 'bg-violet-500',
  CF: 'bg-rose-500',
} as const;

interface Player {
  id: string; // UUID stored as string
  name: string;
  position: string;
  overall_rating: number;
  is_auction_eligible: boolean;
  position_group?: string | null;
}

interface GroupedPlayers {
  group1: Player[];
  group2: Player[];
  ungrouped: Player[];
}

interface PositionStats {
  [position: string]: {
    total: number;
    group1: number;
    group2: number;
    ungrouped: number;
  };
}

export default function PositionGroupsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PositionStats>({});
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [groupedPlayers, setGroupedPlayers] = useState<GroupedPlayers>({
    group1: [],
    group2: [],
    ungrouped: []
  });
  const [dividing, setDividing] = useState(false);

  // Modal system
  const { alertState, showAlert, closeAlert } = useModal();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
    if (!authLoading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user?.role === 'committee_admin') {
      fetchPlayers();
    }
  }, [user]);

  const fetchPlayers = async () => {
    try {
      setLoading(true);
      // Fetch all players without limit to get complete data
      const response = await fetchWithTokenRefresh('/api/players?limit=10000');
      const { data: players, success } = await response.json();

      if (success) {
        console.log(`<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> [Position Groups] Fetched ${players.length} total players`);
        
        // Filter to only show players with the specified positions
        // Don't filter by is_auction_eligible - we want to group ALL players
        const relevantPlayers = players.filter((p: Player) => 
          POSITION_GROUP_POSITIONS.includes(p.position?.toUpperCase() as any)
        );
        
        console.log(`<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> [Position Groups] Filtered to ${relevantPlayers.length} players in CB/DMF/CMF/AMF/CF positions`);

        setAllPlayers(relevantPlayers);
        calculateStats(relevantPlayers);
      }
    } catch (err) {
      console.error('Error fetching players:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (playerList: Player[]) => {
    const newStats: PositionStats = {};

    POSITION_GROUP_POSITIONS.forEach(pos => {
      const posPlayers = playerList.filter(p => p.position?.toUpperCase() === pos);
      newStats[pos] = {
        total: posPlayers.length,
        group1: posPlayers.filter(p => p.position_group === `${pos}-1`).length,
        group2: posPlayers.filter(p => p.position_group === `${pos}-2`).length,
        ungrouped: posPlayers.filter(p => !p.position_group).length,
      };
    });

    setStats(newStats);
  };

  const handlePositionClick = (position: string) => {
    setSelectedPosition(position);
    const posPlayers = allPlayers.filter(p => p.position?.toUpperCase() === position);
    
    setGroupedPlayers({
      group1: posPlayers.filter(p => p.position_group === `${position}-1`),
      group2: posPlayers.filter(p => p.position_group === `${position}-2`),
      ungrouped: posPlayers.filter(p => !p.position_group)
    });
  };

  const handleDividePlayers = async () => {
    if (!selectedPosition) return;

    setDividing(true);
    try {
      // Get all players for this position
      const posPlayers = allPlayers.filter(p => p.position?.toUpperCase() === selectedPosition);
      
      // Sort by rating (highest first) for balanced distribution
      const sortedPlayers = [...posPlayers].sort((a, b) => 
        (b.overall_rating || 0) - (a.overall_rating || 0)
      );

      // Distribute players alternately to balance groups
      const updates: Promise<any>[] = [];
      sortedPlayers.forEach((player, index) => {
        const group = index % 2 === 0 ? `${selectedPosition}-1` : `${selectedPosition}-2`;
        updates.push(
          fetchWithTokenRefresh(`/api/players/${player.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ position_group: group })
          })
        );
      });

      await Promise.all(updates);
      
      console.log(`<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> [Position Groups] Updated ${sortedPlayers.length} players with position_group`);
      
      // Refresh data from database
      await fetchPlayers();
      
      // Small delay to ensure state has updated
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Re-fetch the fresh data and update the view
      const response = await fetchWithTokenRefresh('/api/players?limit=10000');
      const { data: freshPlayers, success } = await response.json();
      
      if (success) {
        const relevantPlayers = freshPlayers.filter((p: Player) => 
          POSITION_GROUP_POSITIONS.includes(p.position?.toUpperCase() as any)
        );
        
        setAllPlayers(relevantPlayers);
        
        // Now update the position view with fresh data
        const posPlayers = relevantPlayers.filter((p: Player) => p.position?.toUpperCase() === selectedPosition);
        console.log(`<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> [Position Groups] Found ${posPlayers.length} ${selectedPosition} players after division`);
        
        setGroupedPlayers({
          group1: posPlayers.filter((p: Player) => p.position_group === `${selectedPosition}-1`),
          group2: posPlayers.filter((p: Player) => p.position_group === `${selectedPosition}-2`),
          ungrouped: posPlayers.filter((p: Player) => !p.position_group)
        });
        
        calculateStats(relevantPlayers);
      }
      
      showAlert({
        type: 'success',
        title: 'Success',
        message: `Successfully divided ${sortedPlayers.length} players into 2 balanced groups!`
      });
    } catch (err) {
      console.error('Error dividing players:', err);
      showAlert({
        type: 'error',
        title: 'Division Failed',
        message: 'Failed to divide players. Please try again.'
      });
    } finally {
      setDividing(false);
    }
  };

  const handleSwapGroup = async (player: Player) => {
    if (!selectedPosition || !player.position_group) return;

    const currentGroup = player.position_group;
    const newGroup = currentGroup.endsWith('-1') 
      ? `${selectedPosition}-2` 
      : `${selectedPosition}-1`;

    try {
      const response = await fetchWithTokenRefresh(`/api/players/${player.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_group: newGroup })
      });

      if (response.ok) {
        // Prevent race condition or state lag by updating all relevant states synchronously
        const updatedAllPlayers = allPlayers.map(p => 
          p.id === player.id ? { ...p, position_group: newGroup } : p
        );
        setAllPlayers(updatedAllPlayers);
        
        const posPlayers = updatedAllPlayers.filter(p => p.position?.toUpperCase() === selectedPosition);
        setGroupedPlayers({
          group1: posPlayers.filter(p => p.position_group === `${selectedPosition}-1`),
          group2: posPlayers.filter(p => p.position_group === `${selectedPosition}-2`),
          ungrouped: posPlayers.filter(p => !p.position_group)
        });
        
        calculateStats(updatedAllPlayers);
      }
    } catch (err) {
      console.error('Error swapping player:', err);
      showAlert({
        type: 'error',
        title: 'Swap Failed',
        message: 'Failed to swap player group'
      });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading position groups...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'committee_admin') {
    return null;
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-6">
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Layers className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">COMMITTEE CONSOLE</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Position Group Management
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Divide players into equal position groups for balanced auction rounds.
              </p>
            </div>
          </div>
          <div className="bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-xl border border-slate-700 shadow-sm shrink-0">
            Total Players: {allPlayers.length}
          </div>
        </div>

        {/* Position Selection */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <h2 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-amber-500" />
            Select Position to Manage
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {POSITION_GROUP_POSITIONS.map((position) => {
              const stat = stats[position] || { total: 0, group1: 0, group2: 0, ungrouped: 0 };
              const isSelected = selectedPosition === position;
              
              return (
                <button
                  key={position}
                  onClick={() => handlePositionClick(position)}
                  className={`p-4 rounded-2xl border transition-all flex flex-col items-center justify-center gap-2 font-mono relative cursor-pointer ${
                    isSelected 
                      ? 'border-amber-500 bg-amber-50/50 shadow-md shadow-amber-500/5 ring-1 ring-amber-500' 
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${POSITION_COLORS[position as keyof typeof POSITION_COLORS]}`}></span>
                    <span className="font-extrabold text-sm text-slate-800">{position}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase text-center mt-1">
                    <div>{stat.total} total</div>
                    {stat.ungrouped > 0 && (
                      <div className="text-amber-600 font-extrabold mt-0.5">{stat.ungrouped} ungrouped</div>
                    )}
                  </div>
                  {stat.ungrouped > 0 && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Group Management */}
        {selectedPosition && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${POSITION_COLORS[selectedPosition as keyof typeof POSITION_COLORS]}`}></span>
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
                  {POSITION_LABELS[selectedPosition as keyof typeof POSITION_LABELS]} ({selectedPosition}) Groups
                </h3>
              </div>
              <button
                onClick={handleDividePlayers}
                disabled={dividing}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
              >
                {dividing ? (
                  <>
                    <RefreshCw className="animate-spin h-3.5 w-3.5 text-amber-400" />
                    Dividing...
                  </>
                ) : (
                  <>
                    <Shuffle className="w-3.5 h-3.5 text-amber-400" />
                    Divide Players
                  </>
                )}
              </button>
            </div>

            {/* Help Text */}
            <div className="console-card bg-amber-50/50 border border-amber-200/60 p-5 rounded-2xl flex items-start gap-3 text-slate-700">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <h4 className="font-extrabold text-amber-800 uppercase tracking-wider mb-1">Equal Auto-Distribution</h4>
                <p className="text-slate-500">
                  Use the <strong className="text-slate-800">"Divide Players"</strong> button to automatically split players into two balanced groups sorted by rating. 
                  You can manually swap players between groups using the action buttons in the list below.
                </p>
              </div>
            </div>

            {/* Groups Display */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Group 1 */}
              <div className="console-card bg-slate-50/40 border border-slate-200/50 rounded-2xl p-5">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    {selectedPosition}-1 Group
                  </h4>
                  <span className="bg-slate-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider font-mono">
                    {groupedPlayers.group1.length} players
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-150">
                    <thead>
                      <tr className="bg-slate-100/60 font-mono text-[9px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">
                        <th className="px-3 py-2 text-left">Player</th>
                        <th className="px-3 py-2 text-center">Rating</th>
                        <th className="px-3 py-2 text-center w-16">Swap</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-xs text-slate-700 bg-white/40">
                      {groupedPlayers.group1.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-6 text-center text-slate-400 italic">
                            No players in this group
                          </td>
                        </tr>
                      ) : (
                        groupedPlayers.group1.map(player => (
                          <tr key={player.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-3 py-2.5 font-bold text-slate-800 whitespace-nowrap">
                              {player.name}
                            </td>
                            <td className="px-3 py-2.5 text-center text-slate-500 font-bold">
                              {player.overall_rating || 'N/A'}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                onClick={() => handleSwapGroup(player)}
                                className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-amber-50 hover:border-amber-400 text-slate-400 hover:text-amber-600 shadow-sm transition-all cursor-pointer"
                                title="Move to Group 2"
                              >
                                <Shuffle className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Group 2 */}
              <div className="console-card bg-slate-50/40 border border-slate-200/50 rounded-2xl p-5">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                    {selectedPosition}-2 Group
                  </h4>
                  <span className="bg-slate-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider font-mono">
                    {groupedPlayers.group2.length} players
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-150">
                    <thead>
                      <tr className="bg-slate-100/60 font-mono text-[9px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">
                        <th className="px-3 py-2 text-left">Player</th>
                        <th className="px-3 py-2 text-center">Rating</th>
                        <th className="px-3 py-2 text-center w-16">Swap</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-xs text-slate-700 bg-white/40">
                      {groupedPlayers.group2.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-6 text-center text-slate-400 italic">
                            No players in this group
                          </td>
                        </tr>
                      ) : (
                        groupedPlayers.group2.map(player => (
                          <tr key={player.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-3 py-2.5 font-bold text-slate-800 whitespace-nowrap">
                              {player.name}
                            </td>
                            <td className="px-3 py-2.5 text-center text-slate-500 font-bold">
                              {player.overall_rating || 'N/A'}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                onClick={() => handleSwapGroup(player)}
                                className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-amber-50 hover:border-amber-400 text-slate-400 hover:text-amber-600 shadow-sm transition-all cursor-pointer"
                                title="Move to Group 1"
                              >
                                <Shuffle className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Warning for ungrouped players */}
            {groupedPlayers.ungrouped.length > 0 && (
              <div className="console-card bg-rose-50/30 border border-rose-200/50 p-4 rounded-2xl flex items-start gap-3 text-rose-800 font-mono">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5 animate-bounce" />
                <div className="text-xs">
                  <span className="font-extrabold uppercase tracking-wide">Ungrouped Players Detected</span>
                  <p className="text-slate-500 mt-1">
                    There are <strong className="text-rose-700">{groupedPlayers.ungrouped.length} player(s)</strong> that are not assigned to any group. 
                    Click the <strong className="text-slate-800">"Divide Players"</strong> button above to automatically distribute them.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Component */}
      <AlertModal
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />
    </div>
  );
}

