'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useTournamentContext } from '@/contexts/TournamentContext';
import { useCachedTeams } from '@/hooks/useCachedData';
import { ArrowRightLeft, AlertTriangle } from 'lucide-react';
import SearchablePlayerSelect from '@/components/ui/SearchablePlayerSelect';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import Link from 'next/link';

// Custom UI Components replacing missing shadcn imports
const Card = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm ${className || ''}`} {...props}>
    {children}
  </div>
);

const CardHeader = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`space-y-1.5 pb-4 ${className || ''}`} {...props}>
    {children}
  </div>
);

const CardTitle = ({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={`text-lg font-bold leading-none tracking-tight text-slate-900 flex items-center gap-2 ${className || ''}`} {...props}>
    {children}
  </h3>
);

const CardDescription = ({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={`text-sm text-slate-500 ${className || ''}`} {...props}>
    {children}
  </p>
);

const CardContent = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`${className || ''}`} {...props}>
    {children}
  </div>
);

const Button = ({ className, children, variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => {
  const baseStyle = "inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50 disabled:pointer-events-none px-4 py-2";
  const variants: Record<string, string> = {
    default: "bg-slate-900 text-white hover:bg-slate-800",
    outline: "border border-slate-200 hover:bg-slate-100 text-slate-700",
    ghost: "hover:bg-slate-100 hover:text-slate-900 font-normal",
  };
  const currentVariant = variants[variant || 'default'] || variant || variants.default;
  return (
    <button className={`${baseStyle} ${currentVariant} ${className || ''}`} {...props}>
      {children}
    </button>
  );
};

interface Player {
  id: string;
  player_id: string;
  player_name: string;
  team_id: string;
  team_name?: string;
  acquisition_value: number;
  star_rating: number; 
  position: string;
}

export default function TeamSwapRequestPage() {
  const { user } = useAuth();
  const { seasonId: selectedSeason } = useTournamentContext();
  const { data: teams, isLoading: teamsLoading } = useCachedTeams(selectedSeason);
  const router = useRouter();
  
  const teamId = user?.email;

  // Form state
  const [targetTeamId, setTargetTeamId] = useState('');
  const [myPlayerId, setMyPlayerId] = useState('');
  const [theirPlayerId, setTheirPlayerId] = useState('');
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [cashDirection, setCashDirection] = useState<'A_to_B' | 'B_to_A' | 'none'>('none');

  // Data state
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  
  const [activeWindows, setActiveWindows] = useState<any[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<string>('');

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all football players and windows
  useEffect(() => {
    const loadData = async () => {
      if (!selectedSeason || !teamId) return;

      setLoadingPlayers(true);
      try {
        const [playersRes, windowsRes] = await Promise.all([
          fetchWithTokenRefresh(`/api/players/database?limit=2000&assigned_only=true`),
          fetch(`/api/requests/windows?team_id=${teamId}&season_id=${selectedSeason}`)
        ]);
        
        const result = await playersRes.json();
        const windowsResult = await windowsRes.json();

        if (!result.success) {
          throw new Error('Failed to fetch players');
        }

        const loadedPlayers: Player[] = result.data.players
          .filter((p: any) => p.team_id && p.acquisition_value) 
          .map((p: any) => ({
            id: p.id || p.player_id,
            player_id: p.player_id,
            player_name: p.name || 'Unknown Player',
            team_id: p.team_id,
            team_name: p.team_name || 'Unknown Team',
            acquisition_value: p.acquisition_value || 0,
            star_rating: p.overall_rating || 70,
            position: p.position || p.position_group || 'N/A'
          }));

        setAllPlayers(loadedPlayers);
        
        if (windowsResult.success) {
          const swapWindows = (windowsResult.data || []).filter((w: any) => w.type === 'swap' && !w.isLimitReached);
          setActiveWindows(swapWindows);
          if (swapWindows.length === 1) {
            setSelectedWindowId(swapWindows[0].id.toString());
          }
        }
      } catch (error) {
        console.error('Error loading data:', error);
        setError('Failed to load data');
      } finally {
        setLoadingPlayers(false);
      }
    };

    loadData();
  }, [selectedSeason, teamId]);

  // Derived state
  const myPlayers = useMemo(() => {
    return allPlayers.filter(p => p.team_id === teamId);
  }, [allPlayers, teamId]);

  const targetTeamPlayers = useMemo(() => {
    if (!targetTeamId) return [];
    return allPlayers.filter(p => p.team_id === targetTeamId);
  }, [allPlayers, targetTeamId]);

  const otherTeams = useMemo(() => {
    return (teams || []).filter(t => t.id !== teamId);
  }, [teams, teamId]);

  const mySelectedPlayer = useMemo(() => {
    return allPlayers.find(p => p.id === myPlayerId);
  }, [allPlayers, myPlayerId]);

  const theirSelectedPlayer = useMemo(() => {
    return allPlayers.find(p => p.id === theirPlayerId);
  }, [allPlayers, theirPlayerId]);

  // Handle Target Team change
  const handleTargetTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTargetTeamId(e.target.value);
    setTheirPlayerId(''); // Reset their player when team changes
  };

  // Handle submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!mySelectedPlayer || !theirSelectedPlayer || !teamId || !selectedSeason || !targetTeamId || !selectedWindowId) {
      setError('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        season_id: selectedSeason,
        window_id: parseInt(selectedWindowId),
        requesting_team_id: teamId,
        target_team_id: targetTeamId,
        cash_amount: cashAmount,
        cash_direction: cashDirection,
        players: [
          {
            from_team_id: teamId,
            to_team_id: targetTeamId,
            player_id: mySelectedPlayer.player_id,
            player_name: mySelectedPlayer.player_name,
            player_type: 'football'
          },
          {
            from_team_id: targetTeamId,
            to_team_id: teamId,
            player_id: theirSelectedPlayer.player_id,
            player_name: theirSelectedPlayer.player_name,
            player_type: 'football'
          }
        ]
      };

      const response = await fetch('/api/requests/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to submit swap request');
      }

      router.push('/dashboard/team/requests');
    } catch (err: any) {
      setError(err.message || 'Failed to submit request');
      console.error('Submit error:', err);
      setSubmitting(false);
    }
  };

  if (loadingPlayers || teamsLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Back Link */}
        <Link
          href="/dashboard/team/requests"
          className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit mb-4"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Requests Hub
        </Link>

        {/* Header Title Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono relative overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/10 flex-shrink-0">
                <ArrowRightLeft className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800">
                  Swap Player
                </h1>
                <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                  Propose a trade deal with another team in your league
                </p>
              </div>
            </div>
          </div>
        </div>

        <Card className="border-t-4 border-t-indigo-500">
          <CardHeader>
            <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-indigo-500" />
              Trade Proposal Form
            </CardTitle>
            <CardDescription className="text-[10px] text-slate-500 font-bold uppercase mt-1">
              Trades are only executed after being approved by the committee.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs mb-6 flex items-center gap-2 font-bold uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {activeWindows.length === 0 ? (
                <div className="p-4 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 mb-6 font-bold uppercase text-[10px] tracking-wider">
                  <p className="font-extrabold text-sm mb-1 text-amber-900">No Active Windows</p>
                  <p className="normal-case font-medium text-slate-650 mt-1">There are no open swap windows available, or you have reached your request limit. You cannot submit requests at this time.</p>
                </div>
              ) : (
                <div className="mb-6">
                  <label className="text-sm font-medium mb-2 block">Select Transfer Window</label>
                  <select
                    value={selectedWindowId}
                    onChange={(e) => setSelectedWindowId(e.target.value)}
                    disabled={submitting || activeWindows.length === 1}
                    className="w-full flex h-10 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  >
                    <option value="">-- Select Active Window --</option>
                    {activeWindows.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.max_requests > 0 ? `(${w.remaining} requests remaining)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative pb-4 border-b border-slate-100">
                {/* Decorative dividing line for md and up */}
                <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-slate-200 -ml-px"></div>
                
                {/* My Team Side */}
                <div className="space-y-4">
                  <div className="pb-2 border-b border-slate-150">
                    <h3 className="font-bold text-xs uppercase text-slate-700 tracking-wider">Your Side (You Send)</h3>
                  </div>
                  
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Player to Send</label>
                    <SearchablePlayerSelect
                      players={myPlayers}
                      value={myPlayerId}
                      onChange={setMyPlayerId}
                      disabled={submitting}
                      label="Select Your Player"
                      placeholder="Search your roster..."
                      color="blue"
                      playerType="football"
                    />
                  </div>
                  
                  {mySelectedPlayer && (
                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs mt-2">
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-bold uppercase">Value:</span>
                        <span className="font-extrabold text-slate-700">{mySelectedPlayer.acquisition_value} eCoin</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Their Team Side */}
                <div className="space-y-4">
                  <div className="pb-2 border-b border-slate-150">
                    <h3 className="font-bold text-xs uppercase text-slate-700 tracking-wider">Their Side (You Receive)</h3>
                  </div>
                  
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Trade Partner</label>
                    <select 
                      value={targetTeamId}
                      onChange={handleTargetTeamChange}
                      className="w-full flex h-10 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">-- Select Team --</option>
                      {otherTeams.map(team => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </div>

                  {targetTeamId && (
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Player to Receive</label>
                      <SearchablePlayerSelect
                        players={targetTeamPlayers}
                        value={theirPlayerId}
                        onChange={setTheirPlayerId}
                        disabled={submitting || !targetTeamId}
                        label="Select Their Player"
                        placeholder="Search their roster..."
                        color="green"
                        playerType="football"
                      />
                    </div>
                  )}
                  
                  {theirSelectedPlayer && (
                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs mt-2">
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-bold uppercase">Value:</span>
                        <span className="font-extrabold text-slate-700">{theirSelectedPlayer.acquisition_value} eCoin</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Cash Considerations */}
              <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
                <h3 className="font-bold text-xs uppercase tracking-wider mb-4 text-slate-700">Cash Considerations (Optional)</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Direction</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setCashDirection('none')}
                        className={`py-2 rounded-xl font-bold uppercase text-xs transition-all border cursor-pointer ${
                          cashDirection === 'none' ? 'bg-slate-800 text-amber-400 border-slate-900 shadow-md' : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        No Cash
                      </button>
                      <button
                        type="button"
                        onClick={() => setCashDirection('A_to_B')}
                        className={`py-2 rounded-xl font-bold uppercase text-xs transition-all border cursor-pointer ${
                          cashDirection === 'A_to_B' ? 'bg-slate-800 text-amber-400 border-slate-900 shadow-md' : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        You Pay
                      </button>
                      <button
                        type="button"
                        onClick={() => setCashDirection('B_to_A')}
                        className={`py-2 rounded-xl font-bold uppercase text-xs transition-all border cursor-pointer ${
                          cashDirection === 'B_to_A' ? 'bg-slate-800 text-amber-400 border-slate-900 shadow-md' : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        You Receive
                      </button>
                    </div>
                  </div>
                  
                  {cashDirection !== 'none' && (
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Amount (eCoin)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-slate-500 text-xs font-mono">$</span>
                        <input
                          type="number"
                          min="1"
                          value={cashAmount || ''}
                          onChange={(e) => setCashAmount(parseInt(e.target.value) || 0)}
                          className="flex h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 pl-8"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={!myPlayerId || !theirPlayerId || !targetTeamId || !selectedWindowId || submitting || activeWindows.length === 0}
                className={`w-full py-3 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  (!myPlayerId || !theirPlayerId || !targetTeamId || !selectedWindowId || submitting || activeWindows.length === 0) ? 'opacity-50 cursor-not-allowed bg-slate-200 hover:bg-slate-200 text-slate-400 border border-slate-200' : ''
                }`}
              >
                {submitting ? 'Submitting Trade Proposal...' : 'Submit Trade Proposal'}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
