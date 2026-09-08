'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowLeftRight, Calendar, Shield } from 'lucide-react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

interface Swap {
  swap_id: string;
  league_id: string;
  team_id: string;
  window_id: string | null;
  window_name: string | null;
  player_out_id: string;
  player_out_name: string;
  player_out_price: number;
  player_in_id: string;
  player_in_name: string;
  player_in_price: number;
  price_difference: number;
  status: string;
  swapped_at: string;
}

export default function TeamSwapsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadMySwaps();
    }
  }, [user]);

  const loadMySwaps = async () => {
    try {
      setIsLoading(true);
      const teamRes = await fetchWithTokenRefresh(`/api/fantasy/teams/my-team?user_id=${user?.uid}`);
      if (!teamRes.ok) throw new Error('Failed to load my team');
      const teamData = await teamRes.json();
      if (!teamData.team) return;

      const tid = teamData.team.team_id || teamData.team.id;

      const res = await fetchWithTokenRefresh(`/api/fantasy/swaps?team_id=${tid}`);
      if (!res.ok) throw new Error('Failed to load swaps');
      const data = await res.json();
      setSwaps(data.swaps || []);
    } catch (err: any) {
      console.error('Error loading my swaps:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center font-mono">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <AuthGuard requiredRole="team">
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-12 px-4 sm:px-6 font-mono">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Back & Nav */}
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard/team/fantasy/transfers"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Transfers
            </Link>

            <Link
              href="/dashboard/team/fantasy/releases"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-mono font-bold text-xs uppercase tracking-wider hover:bg-rose-100 transition-all"
            >
              My Releases →
            </Link>
          </div>

          {/* Banner */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6">
            <div>
              <span className="text-[10px] text-purple-600 font-extrabold uppercase tracking-wider">
                FANTASY TEAM HISTORY
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 uppercase tracking-tight mt-1">
                My Swapped Players
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                History of player swaps performed by your team per Transfer Window
              </p>
            </div>
            <div className="w-14 h-14 bg-purple-50 border border-purple-200 rounded-2xl flex items-center justify-center text-purple-600 shrink-0">
              <ArrowLeftRight className="w-7 h-7" />
            </div>
          </div>

          {/* List */}
          {swaps.length === 0 ? (
            <div className="bg-white border border-slate-200/60 rounded-3xl p-12 text-center text-slate-400 font-bold uppercase italic text-xs">
              You have not swapped any players yet
            </div>
          ) : (
            <div className="space-y-3">
              {swaps.map((swap) => (
                <div
                  key={swap.swap_id}
                  className="bg-white border border-slate-200/70 p-5 rounded-2xl shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between border-b pb-2 border-slate-100 text-[10px] font-bold text-slate-400 uppercase">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-purple-500" />
                      <span>{swap.window_name || 'Transfer Window'}</span>
                    </div>
                    <span>{new Date(swap.swapped_at).toLocaleDateString()}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                    <div>
                      <span className="text-[9px] font-extrabold text-rose-600 uppercase block">OUT</span>
                      <p className="font-bold uppercase text-slate-900 mt-0.5">{swap.player_out_name}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                        ₹{Number(swap.player_out_price).toFixed(1)}M
                      </p>
                    </div>

                    <div className="border-l border-slate-200 pl-3">
                      <span className="text-[9px] font-extrabold text-emerald-600 uppercase block">IN</span>
                      <p className="font-bold uppercase text-slate-900 mt-0.5">{swap.player_in_name}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                        ₹{Number(swap.player_in_price).toFixed(1)}M
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
