'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, User, Calendar, Shield, DollarSign, Filter, Users, Tag } from 'lucide-react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

interface Release {
  release_id: string;
  league_id: string;
  team_id: string;
  team_name: string;
  window_id: string | null;
  window_name: string | null;
  real_player_id: string | null;
  player_name: string;
  category: string;
  is_passive_team: boolean;
  purchase_price: number;
  refund_amount: number;
  refund_percentage: number;
  released_at: string;
}

export default function CommitteeReleasesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [releases, setReleases] = useState<Release[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWindow, setSelectedWindow] = useState<string>('all');

  useEffect(() => {
    if (user && leagueId) {
      loadReleases();
    }
  }, [user, leagueId]);

  const loadReleases = async () => {
    try {
      setIsLoading(true);
      const res = await fetchWithTokenRefresh(`/api/fantasy/releases?league_id=${leagueId}`);
      if (!res.ok) throw new Error('Failed to load releases');
      const data = await res.json();
      setReleases(data.releases || []);
    } catch (err: any) {
      console.error('Error loading releases:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const windowNames = Array.from(
    new Set(releases.map((r) => r.window_name).filter(Boolean))
  );

  const filteredReleases = selectedWindow === 'all'
    ? releases
    : releases.filter((r) => r.window_name === selectedWindow);

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
          {/* Header & Back */}
          <div className="flex items-center justify-between">
            <Link
              href={`/dashboard/committee/fantasy/${leagueId}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </Link>

            <Link
              href={`/dashboard/committee/fantasy/${leagueId}/swaps`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 font-mono font-bold text-xs uppercase tracking-wider hover:bg-purple-100 transition-all"
            >
              View Swapped Players →
            </Link>
          </div>

          {/* Title Banner */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6">
            <div>
              <span className="text-[10px] text-rose-600 font-extrabold uppercase tracking-wider">
                FANTASY COMMITTEE AUDIT
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 uppercase tracking-tight mt-1">
                Released Players Log
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Audit history of released squad players and passive teams per Transfer Window
              </p>
            </div>
            <div className="w-14 h-14 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-center text-rose-600 shrink-0">
              <Users className="w-7 h-7" />
            </div>
          </div>

          {/* Filters & Controls */}
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
              <option value="all">All Transfer Windows ({releases.length})</option>
              {windowNames.map((wn) => (
                <option key={wn} value={wn as string}>
                  {wn}
                </option>
              ))}
            </select>
          </div>

          {/* Release List Cards / Table */}
          {filteredReleases.length === 0 ? (
            <div className="bg-white border border-slate-200/60 rounded-3xl p-12 text-center text-slate-400 font-bold uppercase italic text-xs">
              No released players found
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredReleases.map((release) => (
                <div
                  key={release.release_id}
                  className="bg-white border border-slate-200/70 p-5 rounded-2xl shadow-sm space-y-3 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between border-b pb-2.5 border-slate-100">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-500" />
                      <span className="font-extrabold text-xs uppercase text-slate-900">
                        {release.team_name || release.team_id}
                      </span>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-lg border text-[9px] font-black uppercase ${
                        release.is_passive_team
                          ? 'bg-amber-50 border-amber-200 text-amber-800'
                          : 'bg-rose-50 border-rose-200 text-rose-700'
                      }`}
                    >
                      {release.is_passive_team ? 'PASSIVE TEAM' : release.category}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-extrabold text-sm uppercase text-slate-900">
                        {release.player_name}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                        Category: {release.category}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Refund</p>
                      <p className="text-sm font-black text-emerald-600">
                        +₹{Number(release.refund_amount).toFixed(1)}M
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-500" />
                      <span>{release.window_name || 'General Release'}</span>
                    </div>
                    <span className="text-slate-400">
                      {new Date(release.released_at).toLocaleDateString()}
                    </span>
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
