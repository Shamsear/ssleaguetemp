'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, AlertTriangle, CheckCircle, HelpCircle, Trophy, DollarSign, X } from 'lucide-react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

interface Request {
  submission_id: number;
  team_id: string;
  team_name: string;
  player_out_id: string;
  player_out_name: string;
  player_out_price: number;
  player_in_name: string;
  player_in_price: number;
  created_at: string;
}

interface Conflict {
  player_name: string;
  price: number;
  requests: Request[];
}

interface ActiveWindow {
  window_id: string;
  window_name: string;
  opens_at: string;
  closes_at: string;
  is_active: boolean;
  start_round: number | null;
  end_round: number | null;
}

export default function CommitteeTransfersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeWindow, setActiveWindow] = useState<ActiveWindow | null>(null);
  
  const [autoApprovals, setAutoApprovals] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<Record<string, Conflict>>({});
  
  // Resolutions state: { [player_in_id]: { winning_team_id: string, bid_price: string } }
  const [resolutions, setResolutions] = useState<Record<string, { winning_team_id: string; bid_price: string }>>({});

  useEffect(() => {
    if (user && leagueId) {
      loadData();
    }
  }, [user, leagueId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/admin/fantasy/transfers/submissions?league_id=${leagueId}`);
      if (!response.ok) throw new Error('Failed to load submissions');
      
      const data = await response.json();
      setActiveWindow(data.active_window || null);
      setAutoApprovals(data.auto_approvals || []);
      setConflicts(data.conflicts || {});

      // Pre-fill resolutions with the first team for each conflict and their base price
      const initialResolutions: Record<string, { winning_team_id: string; bid_price: string }> = {};
      if (data.conflicts) {
        Object.entries(data.conflicts).forEach(([playerId, conflict]: [string, any]) => {
          if (conflict.requests && conflict.requests.length > 0) {
            initialResolutions[playerId] = {
              winning_team_id: conflict.requests[0].team_id,
              bid_price: String(conflict.price)
            };
          }
        });
      }
      setResolutions(initialResolutions);

    } catch (error: any) {
      console.error('Error loading transfer submissions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectWinner = (playerId: string, teamId: string) => {
    setResolutions(prev => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        winning_team_id: teamId
      }
    }));
  };

  const handlePriceChange = (playerId: string, price: string) => {
    setResolutions(prev => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        bid_price: price
      }
    }));
  };

  const handleFinalize = async () => {
    if (!activeWindow) return;
    
    // Check conflicts resolution
    const hasUnresolved = Object.keys(conflicts).some(pid => !resolutions[pid]?.winning_team_id);
    if (hasUnresolved) {
      alert('Please resolve all contested player conflicts before finalising.');
      return;
    }

    if (!confirm('Are you sure you want to finalize weekly transfers? This will execute all swaps, update budgets, close the transfer window, and clear pending selections.')) {
      return;
    }

    setIsProcessing(true);
    try {
      // Map resolutions to convert bid prices to numbers
      const formattedResolutions: Record<string, { winning_team_id: string; bid_price: number }> = {};
      Object.entries(resolutions).forEach(([pid, res]) => {
        formattedResolutions[pid] = {
          winning_team_id: res.winning_team_id,
          bid_price: parseFloat(res.bid_price) || 0
        };
      });

      const response = await fetchWithTokenRefresh('/api/admin/fantasy/transfers/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: leagueId,
          window_id: activeWindow.window_id,
          resolutions: formattedResolutions
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to finalize transfers');
      }

      alert('Successfully finalized weekly transfers and closed window!');
      loadData();
    } catch (error: any) {
      console.error('Error finalising transfers:', error);
      alert(error.message || 'Failed to finalize weekly transfers');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading transfer submissions...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Navigation */}
        <div>
          <Link
            href={`/dashboard/committee/fantasy/${leagueId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">FANTASY COMMITTEE</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
              Process Weekly Transfers
            </h1>
            {activeWindow && (
              <p className="text-xs text-slate-400 font-mono mt-1">
                Active Window: {activeWindow.window_name} 
                {activeWindow.start_round && activeWindow.end_round && ` (Rounds ${activeWindow.start_round}-${activeWindow.end_round})`}
              </p>
            )}
          </div>
          <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center text-amber-400 shadow-sm shrink-0">
            <Trophy className="w-8 h-8" />
          </div>
        </div>

        {!activeWindow ? (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center">
            <HelpCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-2">No Active Window Open</h3>
            <p className="text-xs text-slate-400 font-mono max-w-md mx-auto">
              Weekly transfers are not active. Go to Transfer Windows settings to configure and open a window first.
            </p>
          </div>
        ) : (
          <>
            {/* Auto Approvals */}
            <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <CheckCircle className="w-4.5 h-4.5 text-emerald-505" /> Auto-Approvals ({autoApprovals.length})
              </h2>
              {autoApprovals.length === 0 ? (
                <p className="text-center text-slate-400 py-6 text-xs font-bold uppercase italic border border-dashed border-slate-200 rounded-2xl">
                  No non-conflicted requests submitted yet
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs uppercase font-bold text-slate-700">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-black">
                        <th className="pb-3">Team</th>
                        <th className="pb-3">Releasing Player</th>
                        <th className="pb-3">Signing Player</th>
                        <th className="pb-3 text-right">Base Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {autoApprovals.map((req, idx) => (
                        <tr key={`auto-${idx}`} className="align-middle">
                          <td className="py-3 text-slate-905">{req.team_name}</td>
                          <td className="py-3 text-rose-600">-{req.player_out_name} (+{req.player_out_price} Cr)</td>
                          <td className="py-3 text-emerald-600">+{req.player_in_name}</td>
                          <td className="py-3 text-right text-slate-800">{req.player_in_price} Cr</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Conflicts / Tiebreakers */}
            <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-6">
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4.5 h-4.5 text-amber-500 animate-pulse" /> Contestations & Tiebreakers ({Object.keys(conflicts).length})
              </h2>

              {Object.keys(conflicts).length === 0 ? (
                <p className="text-center text-slate-400 py-6 text-xs font-bold uppercase italic border border-dashed border-slate-200 rounded-2xl">
                  No conflicts found. All requests are non-conflicting.
                </p>
              ) : (
                <div className="space-y-6 divide-y divide-slate-100">
                  {Object.entries(conflicts).map(([playerId, conflict], cIdx) => (
                    <div key={playerId} className={`pt-6 ${cIdx === 0 ? 'pt-0' : ''} space-y-4`}>
                      <div className="flex justify-between items-center bg-slate-55 border border-slate-200/80 p-4 rounded-2xl">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Requested Player</p>
                          <p className="text-sm font-black uppercase text-slate-900">{conflict.player_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Base Price</p>
                          <p className="text-sm font-black uppercase text-slate-900">{conflict.price} Cr</p>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <p className="text-[10px] text-slate-450 font-black uppercase">Competing Teams:</p>
                        {conflict.requests.map((req) => (
                          <div 
                            key={req.team_id}
                            onClick={() => handleSelectWinner(playerId, req.team_id)}
                            className={`p-4 border-2 rounded-2xl cursor-pointer transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
                              resolutions[playerId]?.winning_team_id === req.team_id
                                ? 'border-amber-400 bg-amber-50/50'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name={`winner-${playerId}`}
                                  checked={resolutions[playerId]?.winning_team_id === req.team_id}
                                  onChange={() => handleSelectWinner(playerId, req.team_id)}
                                  className="w-4 h-4 text-amber-500"
                                />
                                <span className="text-xs font-black uppercase text-slate-850">{req.team_name}</span>
                              </div>
                              <p className="text-[9px] text-slate-500 font-bold mt-1 uppercase pl-6">
                                Releases: {req.player_out_name} (+{req.player_out_price} Cr)
                              </p>
                            </div>
                            
                            {resolutions[playerId]?.winning_team_id === req.team_id && (
                              <div className="flex items-center gap-2 pl-6 sm:pl-0 shrink-0 w-full sm:w-auto">
                                <label className="text-[10px] font-black uppercase text-amber-800 shrink-0">Tiebreaker Price:</label>
                                <div className="relative flex-1 sm:w-28">
                                  <input
                                    type="number"
                                    step="0.5"
                                    value={resolutions[playerId]?.bid_price || ''}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => handlePriceChange(playerId, e.target.value)}
                                    placeholder={String(conflict.price)}
                                    className="w-full pl-6 pr-3 py-1.5 border border-amber-400 rounded-xl text-xs font-bold text-slate-800 focus:outline-none bg-white"
                                  />
                                  <span className="absolute left-2.5 top-2 text-[10px] text-slate-400 font-bold uppercase">Cr</span>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Execute Panel */}
            <button
              onClick={handleFinalize}
              disabled={isProcessing}
              className="w-full py-4 px-6 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-amber-400 font-mono font-bold text-sm uppercase tracking-wider rounded-2xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-3"
            >
              {isProcessing ? (
                <>
                  <div className="w-5 h-5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                  Processing Weekly Swaps...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Finalize & Resolve Transfers
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  
    </AuthGuard>
  );
}
