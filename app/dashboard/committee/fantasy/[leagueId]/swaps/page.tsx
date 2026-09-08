'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowLeftRight, Calendar, Shield, Filter, Users } from 'lucide-react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

interface Swap {
  swap_id: string;
  league_id: string;
  team_id: string;
  team_name: string;
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

export default function CommitteeSwapsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWindow, setSelectedWindow] = useState<string>('all');

  useEffect(() => {
    if (user && leagueId) {
      loadSwaps();
    }
  }, [user, leagueId]);

  const loadSwaps = async () => {
    try {
      setIsLoading(true);
      const res = await fetchWithTokenRefresh(`/api/fantasy/swaps?league_id=${leagueId}`);
      if (!res.ok) throw new Error('Failed to load swaps');
      const data = await res.json();
      setSwaps(data.swaps || []);
    } catch (err: any) {
      console.error('Error loading swaps:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const windowNames = Array.from(
    new Set(swaps.map((s) => s.window_name).filter(Boolean))
  );

  const filteredSwaps = selectedWindow === 'all'
    ? swaps
    : swaps.filter((s) => s.window_name === selectedWindow);

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center font-mono">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <AuthGuard requiredRole="committee_admin">
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-12 px-4 sm:px-6 font-mono">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header & Navigation */}
          <div className="flex items-center justify-between">
            <Link
              href={`/dashboard/committee/fantasy/${leagueId}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </Link>

            <Link
              href={`/dashboard/committee/fantasy/${leagueId}/releases`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-mono font-bold text-xs uppercase tracking-wider hover:bg-rose-100 transition-all"
            >
              View Released Players →
            </Link>
          </div>

          {/* Title Banner */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6">
            <div>
              <span className="text-[10px] text-purple-600 font-extrabold uppercase tracking-wider">
                FANTASY COMMITTEE AUDIT
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 uppercase tracking-tight mt-1">
                Swapped Players Log
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Audit history of player swaps performed across teams per Transfer Window
              </p>
            </div>
            <div className="w-14 h-14 bg-purple-50 border border-purple-200 rounded-2xl flex items-center justify-center text-purple-600 shrink-0">
              <ArrowLeftRight className="w-7 h-7" />
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white border border-slate-200/60 p-4 rounded-2xl shadow-sm flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold uppercase text-slate-600">Filter by Window:</span>
            </div>
            <select
              value={selectedWindow}
              onChange={(e) => setSelectedWindow(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase outline-none focus:border-amber-400"
            >
              <option value="all">All Transfer Windows ({swaps.length})</option>
              {windowNames.map((wn) => (
                <option key={wn} value={wn as string}>
                  {wn}
                </option>
              ))}
            </select>
          </div>

          {/* Swaps Cards */}
          {filteredSwaps.length === 0 ? (
            <div className="bg-white border border-slate-200/60 rounded-3xl p-12 text-center text-slate-400 font-bold uppercase italic text-xs">
              No swapped players found
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSwaps.map((swap) => (
                <div
                  key={swap.swap_id}
                  className="bg-white border border-slate-200/70 p-5 rounded-2xl shadow-sm space-y-4"
                >
                  <div className="flex items-center justify-between border-b pb-2.5 border-slate-100">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-purple-500" />
                      <span className="font-extrabold text-xs uppercase text-slate-900">
                        {swap.team_name || swap.team_id}
                      </span>
                    </div>

                    <span className="px-2.5 py-0.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 text-[9px] font-black uppercase">
                      SWAP COMPLETED
                    </span>
                  </div>

                  {/* Player Out & Player In comparison */}
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

                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-purple-500" />
                      <span>{swap.window_name || 'General Swap'}</span>
                    </div>

                    <span>{new Date(swap.swapped_at).toLocaleDateString()}</span>
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
