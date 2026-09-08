'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Shield, Users, Filter } from 'lucide-react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

interface Release {
  release_id: string;
  league_id: string;
  team_id: string;
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

export default function TeamReleasesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [releases, setReleases] = useState<Release[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [myTeamId, setMyTeamId] = useState<string>('');

  useEffect(() => {
    if (user) {
      loadMyReleases();
    }
  }, [user]);

  const loadMyReleases = async () => {
    try {
      setIsLoading(true);
      const teamRes = await fetchWithTokenRefresh(`/api/fantasy/teams/my-team?user_id=${user?.uid}`);
      if (!teamRes.ok) throw new Error('Failed to load my team');
      const teamData = await teamRes.json();
      if (!teamData.team) return;

      const tid = teamData.team.team_id || teamData.team.id;
      setMyTeamId(tid);

      const res = await fetchWithTokenRefresh(`/api/fantasy/releases?team_id=${tid}`);
      if (!res.ok) throw new Error('Failed to load releases');
      const data = await res.json();
      setReleases(data.releases || []);
    } catch (err: any) {
      console.error('Error loading my releases:', err);
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
          {/* Back & Navigation */}
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard/team/fantasy/transfers"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Transfers
            </Link>

            <Link
              href="/dashboard/team/fantasy/swaps"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 font-mono font-bold text-xs uppercase tracking-wider hover:bg-purple-100 transition-all"
            >
              My Swaps →
            </Link>
          </div>

          {/* Banner */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6">
            <div>
              <span className="text-[10px] text-rose-600 font-extrabold uppercase tracking-wider">
                FANTASY TEAM HISTORY
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 uppercase tracking-tight mt-1">
                My Released Players
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                History of squad players and passive teams released by your team per Transfer Window
              </p>
            </div>
            <div className="w-14 h-14 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-center text-rose-600 shrink-0">
              <Users className="w-7 h-7" />
            </div>
          </div>

          {/* List */}
          {releases.length === 0 ? (
            <div className="bg-white border border-slate-200/60 rounded-3xl p-12 text-center text-slate-400 font-bold uppercase italic text-xs">
              You have not released any players yet
            </div>
          ) : (
            <div className="space-y-3">
              {releases.map((rel) => (
                <div
                  key={rel.release_id}
                  className="bg-white border border-slate-200/70 p-5 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-sm uppercase text-slate-900">
                        {rel.player_name}
                      </h3>
                      <span
                        className={`px-2.5 py-0.5 rounded-lg border text-[9px] font-black uppercase ${
                          rel.is_passive_team
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : 'bg-rose-50 border-rose-200 text-rose-700'
                        }`}
                      >
                        {rel.is_passive_team ? 'PASSIVE TEAM' : rel.category}
                      </span>
                    </div>

                    <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-amber-500" />
                      <span>{rel.window_name || 'Transfer Window'}</span>
                      <span>•</span>
                      <span>{new Date(rel.released_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="text-left sm:text-right shrink-0">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">
                      Refund Amount ({rel.refund_percentage}%)
                    </span>
                    <span className="text-base font-black text-emerald-600">
                      +₹{Number(rel.refund_amount).toFixed(1)}M
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
