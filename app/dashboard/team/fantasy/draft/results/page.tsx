'use client';
import { Award, DollarSign, ArrowRight, ShieldCheck, Star, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

interface SquadPlayer {
  real_player_id: string;
  player_name: string;
  position: string;
  real_team_name: string;
  purchase_price: number;
}

interface BidResult {
  slot_index: number;
  priority: number;
  target_id: string;
  target_name: string;
  bid_type: 'player' | 'real_team';
  bid_amount: number;
  status: 'pending' | 'won' | 'lost';
}

export default function DraftResultsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [myTeam, setMyTeam] = useState<any>(null);
  const [squad, setSquad] = useState<SquadPlayer[]>([]);
  const [bids, setBids] = useState<BidResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draftStatus, setDraftStatus] = useState<string>('pending');

  const loadResults = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // 1. Fetch my team and league details
      const teamRes = await fetchWithTokenRefresh(`/api/fantasy/teams/my-team?user_id=${user.uid}`);
      if (teamRes.ok) {
        const data = await teamRes.json();
        setMyTeam(data.team);
        
        // 2. Check if draft is completed before showing results
        const leagueId = data.team?.fantasy_league_id;
        if (leagueId) {
          const settingsRes = await fetchWithTokenRefresh(`/api/fantasy/draft/settings?league_id=${leagueId}`);
          if (settingsRes.ok) {
            const settingsData = await settingsRes.json();
            const status = settingsData.settings?.draft_status || 'pending';
            setDraftStatus(status);
            
            // Only load results if draft is completed
            if (status === 'completed') {
              setSquad(data.squad || []);
              
              // 3. Fetch my bids results
              const bidsRes = await fetchWithTokenRefresh(`/api/fantasy/draft/bids/my-bids?user_id=${user.uid}`);
              if (bidsRes.ok) {
                const bidsData = await bidsRes.json();
                setBids(bidsData.bids || []);
              }
            } else {
              // Draft not completed yet - don't show results
              setSquad([]);
              setBids([]);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load draft results:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadResults();
    }
  }, [user, loadResults]);

  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400 mx-auto"></div>
        <p className="mt-4 text-slate-400">Loading draft results...</p>
      </div>
    );
  }

  if (!myTeam) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        No fantasy team found.
      </div>
    );
  }

  // Show waiting message if draft is not completed
  if (draftStatus !== 'completed') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          
          {/* Navigation */}
          <div className="mb-6">
            <Link
              href="/dashboard"
              className="text-slate-400 hover:text-indigo-400 font-semibold text-xs transition-colors"
            >
              ← Back to Dashboard
            </Link>
          </div>

          {/* Waiting Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-lg">
            <div className="w-16 h-16 bg-amber-900/20 border border-amber-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-amber-400" />
            </div>
            <h2 className="text-xl font-black text-white mb-2">Draft Results Not Available Yet</h2>
            <p className="text-sm text-slate-400 mb-4">
              The draft is currently <span className="text-amber-400 font-bold uppercase">{draftStatus}</span>
            </p>
            <p className="text-xs text-slate-500">
              Results will be available once the committee finalizes the draft.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthGuard requiredRole="team">
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        
        {/* Navigation */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="text-slate-400 hover:text-indigo-400 font-semibold text-xs transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Title Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8 flex flex-col sm:flex-row justify-between sm:items-center gap-4 shadow-lg">
          <div>
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-indigo-400" />
              <span className="text-[10px] bg-indigo-900/60 border border-indigo-700/50 px-2 py-0.5 rounded font-black tracking-wider uppercase">
                DRAFT RESULTS
              </span>
            </div>
            <h1 className="text-2xl font-black text-white mt-1">{myTeam.team_name} Squad</h1>
            <p className="text-xs text-slate-400 mt-1">Exclusive category blind bid resolution overview</p>
          </div>

          <div className="bg-slate-950 border border-slate-800 px-4 py-2.5 rounded-xl text-center sm:text-right">
            <span className="text-[9px] uppercase font-black text-slate-500">Remaining Budget</span>
            <h4 className="text-lg font-black text-emerald-400 mt-0.5">{myTeam.budget_remaining} Credits</h4>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* LEFT PANEL: My Roster (Roster Won) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
            <h2 className="text-base font-black text-white mb-4 border-b border-slate-800 pb-2">Rostered Squad</h2>
            
            <div className="space-y-4">
              {/* Players won */}
              {squad.map((player) => (
                <div key={player.real_player_id} className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl flex items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-white text-sm">{player.player_name}</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">{player.real_team_name} • {player.position}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] font-black text-slate-500 uppercase">WON AT</span>
                    <h5 className="font-black text-emerald-400 text-sm">{player.purchase_price} Cr</h5>
                  </div>
                </div>
              ))}

              {/* Supported real team won */}
              {myTeam.supported_team_id ? (
                <div className="bg-indigo-950/20 border border-indigo-900/40 p-4 rounded-xl flex items-center justify-between gap-4 mt-6">
                  <div>
                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-wider">ROSTERED REAL TEAM</span>
                    <h4 className="font-bold text-white text-sm mt-0.5">{myTeam.supported_team_name}</h4>
                  </div>
                  <div className="p-2 bg-indigo-900/40 border border-indigo-700/30 rounded-lg text-center">
                    <ShieldCheck className="w-5 h-5 text-indigo-400 mx-auto" />
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-amber-950/20 border border-amber-900/40 rounded-xl text-xs text-amber-300 italic">
                  No real team won. You will receive 0 passive team points.
                </div>
              )}

              {squad.length === 0 && (
                <p className="text-xs text-slate-500 italic text-center py-8">Your roster is empty. No bids were resolved in your favor.</p>
              )}
            </div>
          </div>

          {/* RIGHT PANEL: Bids Overview (Won / Lost List) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
            <h2 className="text-base font-black text-white mb-4 border-b border-slate-800 pb-2">Bids Log</h2>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {bids.map((bid, index) => (
                <div 
                  key={index} 
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 ${
                    bid.status === 'won' 
                      ? 'bg-emerald-950/20 border-emerald-900/50' 
                      : 'bg-red-950/10 border-red-950/40 opacity-75'
                  }`}
                >
                  <div>
                    <span className={`text-[8px] uppercase font-black px-1.5 py-0.5 rounded tracking-wider ${
                      bid.status === 'won' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'
                    }`}>
                      {bid.status === 'won' ? 'Won' : 'Lost'}
                    </span>
                    <h4 className="font-bold text-white text-sm mt-1.5">{bid.target_name}</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">Slot {bid.slot_index} • Priority {bid.priority}</p>
                  </div>
                  <span className="font-black text-sm text-slate-300">{bid.bid_amount} Cr</span>
                </div>
              ))}

              {bids.length === 0 && (
                <p className="text-xs text-slate-500 italic text-center py-8">No bids submitted.</p>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  
    </AuthGuard>
  );
}
