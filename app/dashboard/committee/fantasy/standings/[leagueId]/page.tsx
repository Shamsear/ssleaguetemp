'use client';
import { Trophy, BarChart2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import ShareableFantasyLeaderboard from '@/components/fantasy/ShareableFantasyLeaderboard';

interface LeaderboardEntry {
  rank: number;
  fantasy_team_id: string;
  team_name: string;
  owner_name: string;
  total_points: number;
  player_count: number;
  last_round_points: number;
  team_logo?: string;
}

export default function FantasyStandingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [league, setLeague] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [h2hStandings, setH2hStandings] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overall' | 'h2h'>('overall');
  const [isLoading, setIsLoading] = useState(true);

  const { alertState, showAlert, closeAlert } = useModal();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && user.role !== 'committee_admin' && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const loadLeaderboard = async () => {
      if (!leagueId) return;

      try {
        const response = await fetchWithTokenRefresh(`/api/fantasy/leaderboard/${leagueId}`);
        if (!response.ok) throw new Error('Failed to load leaderboard');

        const data = await response.json();
        setLeague(data.league);
        setLeaderboard(data.leaderboard || []);
        
        // Load H2H standings
        try {
          const h2hResponse = await fetchWithTokenRefresh(`/api/fantasy/h2h/standings?league_id=${leagueId}`);
          if (h2hResponse.ok) {
            const h2hData = await h2hResponse.json();
            setH2hStandings(h2hData.standings || []);
          }
        } catch (h2hError) {
          console.error('Error loading H2H standings:', h2hError);
        }
      } catch (error) {
        console.error('Error loading leaderboard:', error);
        showAlert({
          type: 'error',
          title: 'Error',
          message: 'Failed to load fantasy standings',
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (user) {
      loadLeaderboard();
    }
  }, [user, leagueId]);

  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !league) return null;

  const getRankBadge = (rank: number) => {
    if (rank === 1) return { bg: 'bg-amber-100 text-amber-800 border-amber-200', text: '1st', icon: '🏆' };
    if (rank === 2) return { bg: 'bg-slate-100 text-slate-700 border-slate-200', text: '2nd', icon: '🥈' };
    if (rank === 3) return { bg: 'bg-orange-100 text-orange-800 border-orange-200', text: '3rd', icon: '🥉' };
    return { bg: 'bg-slate-50 text-slate-500 border-slate-100', text: `#${rank}`, icon: null };
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <AlertModal {...alertState} onClose={closeAlert} />

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/dashboard/committee/fantasy/${leagueId}`}
            className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-semibold text-sm transition-colors mb-4"
          >
            ← Back to League Dashboard
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
                <Trophy className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Fantasy Standings</h1>
                <p className="text-slate-500 mt-1 font-semibold text-sm">{league.name} — Leaderboard and H2H Leagues</p>
              </div>
            </div>
            
            {leaderboard.length > 0 && (
              <ShareableFantasyLeaderboard
                teams={leaderboard}
                leagueName={league.name}
              />
            )}
          </div>
        </div>

        {/* Full Leaderboard Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50/50">
            <button
              onClick={() => setActiveTab('overall')}
              className={`flex-1 px-6 py-4 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                activeTab === 'overall'
                  ? 'text-indigo-600 border-indigo-600 bg-white'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 border-transparent'
              }`}
            >
              <BarChart2 className="w-4.5 h-4.5 inline-block mr-1.5 align-text-bottom" /> Overall Points
            </button>
            <button
              onClick={() => setActiveTab('h2h')}
              className={`flex-1 px-6 py-4 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                activeTab === 'h2h'
                  ? 'text-indigo-600 border-indigo-600 bg-white'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 border-transparent'
              }`}
            >
              ⚔️ Head-to-Head (H2H) Standings
            </button>
          </div>

          <div className="p-6 border-b border-slate-100 bg-slate-50/20">
            <h2 className="text-base font-bold text-slate-800">
              {activeTab === 'overall' ? 'Complete Standings' : 'H2H League Standings'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {activeTab === 'overall' 
                ? `${leaderboard.length} fantasy managers participating` 
                : 'Based on weekly H2H matching (3 pts win, 1 pt draw)'}
            </p>
          </div>

          {activeTab === 'overall' ? (
            // Overall Points Tab
            leaderboard.length === 0 ? (
              <div className="text-center py-12 text-slate-400 italic text-sm">
                No overall points recorded yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-slate-600 text-sm">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase">Rank</th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase">Team / Owner</th>
                      <th className="px-6 py-3.5 text-center text-xs font-bold text-slate-400 uppercase">Squad size</th>
                      <th className="px-6 py-3.5 text-center text-xs font-bold text-slate-400 uppercase">Last Round</th>
                      <th className="px-6 py-3.5 text-right text-xs font-bold text-slate-400 uppercase">Total Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leaderboard.map((entry, index) => {
                      const badge = getRankBadge(entry.rank || index + 1);
                      return (
                        <tr 
                          key={entry.fantasy_team_id}
                          className="hover:bg-slate-50/60 transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-black border ${badge.bg}`}>
                              {badge.icon || badge.text}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {entry.team_logo ? (
                                <img 
                                  src={entry.team_logo} 
                                  alt={`${entry.team_name}`}
                                  className="w-8 h-8 rounded-full object-cover border border-slate-200 shadow-sm"
                                  style={{
                                    objectPosition: `${(entry as any).logo_position_x_circle ?? 50}% ${(entry as any).logo_position_y_circle ?? 50}%`,
                                    transform: `scale(${(entry as any).logo_scale_circle ?? 1})`,
                                    transformOrigin: `${(entry as any).logo_position_x_circle ?? 50}% ${(entry as any).logo_position_y_circle ?? 50}%`,
                                  }}
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-black text-xs">
                                  {entry.team_name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <p className="font-bold text-slate-900">{entry.team_name}</p>
                                <p className="text-[10px] text-slate-400 font-semibold">{entry.owner_name}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold">
                              {entry.player_count} / 6
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center font-semibold">
                            <span className={entry.last_round_points > 0 ? 'text-emerald-600' : 'text-slate-600'}>
                              {entry.last_round_points > 0 ? `+${entry.last_round_points}` : entry.last_round_points}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-black text-lg text-indigo-600">
                            {entry.total_points}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            // H2H Standings Tab
            h2hStandings.length === 0 ? (
              <div className="text-center py-12 text-slate-400 italic text-sm">
                No head-to-head records generated yet for this season
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-slate-600 text-sm">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase">Rank</th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase">Team</th>
                      <th className="px-6 py-3.5 text-center text-xs font-bold text-slate-400 uppercase">Matches</th>
                      <th className="px-6 py-3.5 text-center text-xs font-bold text-slate-400 uppercase">W - D - L</th>
                      <th className="px-6 py-3.5 text-right text-xs font-bold text-slate-400 uppercase">H2H Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {h2hStandings.map((entry, index) => {
                      const badge = getRankBadge(index + 1);
                      return (
                        <tr 
                          key={entry.team_id}
                          className="hover:bg-slate-50/60 transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-black border ${badge.bg}`}>
                              {badge.icon || badge.text}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-900">{entry.team_name}</p>
                          </td>
                          <td className="px-6 py-4 text-center font-semibold text-slate-600">
                            {entry.matches_played || 0}
                          </td>
                          <td className="px-6 py-4 text-center text-slate-500 font-mono text-xs">
                            {entry.wins || 0} - {entry.draws || 0} - {entry.losses || 0}
                          </td>
                          <td className="px-6 py-4 text-right font-black text-lg text-indigo-600">
                            {entry.h2h_points || 0}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        {/* Stats Summary */}
        {leaderboard.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <p className="text-xs text-slate-400 font-bold uppercase mb-1">Highest Team Score</p>
              <p className="text-2xl font-black text-emerald-600">{Math.max(...leaderboard.map(e => e.total_points))}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <p className="text-xs text-slate-400 font-bold uppercase mb-1">Average Team Score</p>
              <p className="text-2xl font-black text-indigo-600">
                {Math.round(leaderboard.reduce((sum, e) => sum + e.total_points, 0) / leaderboard.length)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <p className="text-xs text-slate-400 font-bold uppercase mb-1">Active Squad Count</p>
              <p className="text-2xl font-black text-slate-800">
                {leaderboard.reduce((sum, e) => sum + e.player_count, 0)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
