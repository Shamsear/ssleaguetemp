'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useTournamentContext } from '@/contexts/TournamentContext';
import { BarChart2, AlertTriangle, UserMinus } from 'lucide-react';
import SearchablePlayerSelect from '@/components/ui/SearchablePlayerSelect';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import Link from 'next/link';

// Custom UI Components replacing missing shadcn imports
const Card = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm ${className || ''}`} {...props}>
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
  contract_start_season: string;
  contract_end_season: string;
  season_id: string;
}

export default function TeamReleaseRequestPage() {
  const { user } = useAuth();
  const { seasonId: selectedSeason } = useTournamentContext();
  const router = useRouter();
  
  const teamId = user?.email; // Team ID from auth context

  // Form state
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [refundPercentage, setRefundPercentage] = useState<number>(75);

  // Data state
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  
  const [activeWindows, setActiveWindows] = useState<any[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<string>('');

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load data
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
          .filter((p: any) => p.team_id === teamId && p.acquisition_value) // Only THEIR players
          .map((p: any) => ({
            id: p.id || p.player_id,
            player_id: p.player_id,
            player_name: p.name || 'Unknown Player',
            team_id: p.team_id,
            team_name: p.team_name || 'Your Team',
            acquisition_value: p.acquisition_value || 0,
            star_rating: p.overall_rating || 70,
            position: p.position || p.position_group || 'N/A',
            contract_start_season: p.contract_start_season || 'N/A',
            contract_end_season: p.contract_end_season || 'N/A',
            season_id: selectedSeason
          }));

        setPlayers(loadedPlayers);
        
        if (windowsResult.success) {
          const releaseWindows = (windowsResult.data || []).filter((w: any) => w.type === 'release' && !w.isLimitReached);
          setActiveWindows(releaseWindows);
          if (releaseWindows.length === 1) {
            setSelectedWindowId(releaseWindows[0].id.toString());
          }
        }
      } catch (error) {
        console.error('Error loading data:', error);
        setError('Failed to load your roster or active windows');
      } finally {
        setLoadingPlayers(false);
      }
    };

    loadData();
  }, [selectedSeason, teamId]);

  // Get selected player
  const selectedPlayer = useMemo(() => {
    return players.find(p => p.id === selectedPlayerId);
  }, [players, selectedPlayerId]);

  // Calculate refund amount
  const refundAmount = useMemo(() => {
    if (!selectedPlayer) return 0;
    return Math.round(selectedPlayer.acquisition_value * (refundPercentage / 100));
  }, [selectedPlayer, refundPercentage]);

  // Handle release submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPlayer || !teamId || !selectedSeason || !selectedWindowId) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/requests/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: teamId,
          season_id: selectedSeason,
          window_id: parseInt(selectedWindowId),
          player_id: selectedPlayer.player_id,
          player_name: selectedPlayer.player_name,
          player_type: 'football', // Default to football for this form
          refund_amount: refundAmount
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to submit release request');
      }

      router.push('/dashboard/team/requests');
    } catch (err: any) {
      setError(err.message || 'Failed to submit request');
      console.error('Submit error:', err);
      setSubmitting(false);
    }
  };

  if (loadingPlayers) {
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
              <div className="w-12 h-12 bg-gradient-to-br from-rose-500 to-red-500 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-500/10 flex-shrink-0">
                <UserMinus className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800">
                  Release Player
                </h1>
                <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                  Submit a request to drop a player and get budget refund
                </p>
              </div>
            </div>
          </div>
        </div>

        <Card className="max-w-2xl mx-auto border-t-4 border-t-rose-500">
          <CardHeader>
            <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <UserMinus className="w-5 h-5 text-rose-500" />
              Release Request Form
            </CardTitle>
            <CardDescription className="text-[10px] text-slate-500 font-bold uppercase mt-1">
              Dropped players remain on your roster until approved by the committee.
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
                <div className="p-4 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 font-bold uppercase text-[10px] tracking-wider">
                  <p className="font-extrabold text-sm mb-1 text-amber-900">No Active Windows</p>
                  <p className="normal-case font-medium text-slate-650 mt-1">There are no open release windows available, or you have reached your request limit. You cannot submit requests at this time.</p>
                </div>
              ) : (
                <div>
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

              <div>
                <label className="text-sm font-medium mb-2 block">Select Player from Roster</label>
                <SearchablePlayerSelect
                  players={players}
                  value={selectedPlayerId}
                  onChange={setSelectedPlayerId}
                  disabled={submitting}
                  label="Select Player"
                  placeholder="Search your roster..."
                  color="red"
                  playerType="football"
                />
                {players.length === 0 && (
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">You don't have any eligible players on your roster.</p>
                )}
              </div>

              {selectedPlayerId && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Expected Refund Percentage</label>
                  <div className="grid grid-cols-5 gap-2 mb-3">
                    {[100, 75, 50, 25, 0].map((percent) => (
                      <button
                        key={percent}
                        type="button"
                        onClick={() => setRefundPercentage(percent)}
                        disabled={submitting}
                        className={`py-2 rounded-xl font-bold uppercase text-xs transition-all border cursor-pointer ${
                          refundPercentage === percent
                            ? 'bg-slate-800 text-amber-400 border-slate-900 shadow-md'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        } disabled:opacity-50`}
                      >
                        {percent}%
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Custom Refund %:</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={refundPercentage}
                      onChange={(e) => setRefundPercentage(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                      disabled={submitting}
                      className="w-24 px-3 py-1 border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              )}

              {selectedPlayer && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                  <h3 className="font-bold text-xs uppercase tracking-wider mb-4 flex items-center gap-2 text-slate-700">
                    <BarChart2 className="w-4 h-4 text-slate-400" /> 
                    Refund Calculation Preview
                  </h3>

                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-bold uppercase">Original Value:</span>
                      <span className="font-extrabold text-slate-700">{selectedPlayer.acquisition_value} eCoin</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-bold uppercase">Refund Rate:</span>
                      <span className="font-extrabold text-slate-700">{refundPercentage}%</span>
                    </div>
                    <div className="flex justify-between pt-3 border-t border-slate-200 font-extrabold">
                      <span className="text-slate-800 uppercase">Expected Budget Refund:</span>
                      <span className="text-emerald-600">{refundAmount} eCoin</span>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={!selectedPlayerId || !selectedWindowId || submitting || activeWindows.length === 0}
                className={`w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  (!selectedPlayerId || !selectedWindowId || submitting || activeWindows.length === 0) ? 'opacity-50 cursor-not-allowed bg-slate-200 hover:bg-slate-200 text-slate-400 border border-slate-200' : ''
                }`}
              >
                {submitting ? 'Submitting Request...' : 'Submit Release Request'}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
