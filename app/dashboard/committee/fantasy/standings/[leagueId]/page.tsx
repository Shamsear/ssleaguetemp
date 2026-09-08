'use client';
import { Trophy, BarChart2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import ShareableFantasyLeaderboard from '@/components/fantasy/ShareableFantasyLeaderboard';
import AuthGuard from '@/components/auth/AuthGuard';

interface LeaderboardEntry {
  rank: number;
  fantasy_team_id: string;
  team_name: string;
  owner_name: string;
  total_points: number;
  player_points?: number;
  passive_points?: number;
  supported_team_name?: string;
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
      } catch (error: any) {
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
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs sm:text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading standings...</p>
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
    <AuthGuard requiredRole="committee_admin">
      <div className="console-bg min-h-screen text-slate-800 relative pt-3 sm:pt-5 lg:pt-24 pb-8 sm:pb-12 px-2.5 sm:px-6 font-mono">
        {/* Ambient Gold Glow */}
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

        <AlertModal {...alertState} onClose={closeAlert} />

        <div className="max-w-5xl mx-auto relative z-10 space-y-4 sm:space-y-6">
          {/* Navigation */}
          <div>
            <Link
              href={`/dashboard/committee/fantasy/${leagueId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-[11px] sm:text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </Link>
          </div>

          {/* Header Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sm:gap-6">
            <div className="space-y-1">
              <span className="text-[9px] sm:text-[10px] text-amber-600 font-bold uppercase tracking-wider">FANTASY CONSOLE</span>
              <h1 className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight uppercase">
                Fantasy Leaderboard
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-400 font-mono">
                {league.name} — Overall points standings
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between md:justify-end w-full md:w-auto gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
              {leaderboard.length > 0 && (
                <div className="shrink-0">
                  <ShareableFantasyLeaderboard
                    teams={leaderboard}
                    leagueName={league.name}
                  />
                </div>
              )}
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-800 border border-slate-700 rounded-xl sm:rounded-2xl flex items-center justify-center text-amber-400 shadow-sm shrink-0">
                <Trophy className="w-6 h-6 sm:w-8 sm:h-8" />
              </div>
            </div>
          </div>

          {/* Full Leaderboard Table Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 shadow-sm space-y-3 sm:space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xs sm:text-sm font-black text-slate-850 uppercase tracking-wider">Complete Standings</h2>
                <p className="text-[9px] sm:text-[10px] text-slate-450 font-bold uppercase mt-0.5">
                  {leaderboard.length} fantasy managers participating
                </p>
              </div>
            </div>

            {leaderboard.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs font-bold uppercase italic">
                No overall points recorded yet
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-150 rounded-xl sm:rounded-2xl">
                <table className="w-full text-left border-collapse min-w-[580px] sm:min-w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-150">
                      <th className="px-2.5 sm:px-6 py-3 text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider w-12 sm:w-auto">Rank</th>
                      <th className="px-2.5 sm:px-6 py-3 text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider">Team / Owner</th>
                      <th className="px-2 sm:px-6 py-3 text-center text-[9px] sm:text-[10px] font-bold text-blue-600 uppercase tracking-wider">Player Pts</th>
                      <th className="px-2 sm:px-6 py-3 text-center text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Supported Team</th>
                      <th className="px-2 sm:px-6 py-3 text-center text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider">Last Rd</th>
                      <th className="px-3 sm:px-6 py-3 text-right text-[9px] sm:text-[10px] font-bold text-amber-600 uppercase tracking-wider">Total Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leaderboard.map((entry, index) => {
                      const badge = getRankBadge(entry.rank || index + 1);
                      return (
                        <tr 
                          key={entry.fantasy_team_id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="px-2.5 sm:px-6 py-3 whitespace-nowrap text-center sm:text-left">
                            <span className={`inline-flex items-center justify-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[9px] sm:text-[10px] font-black uppercase border ${badge.bg}`}>
                              {badge.icon || badge.text}
                            </span>
                          </td>
                          <td className="px-2.5 sm:px-6 py-3">
                            <div className="flex items-center gap-2 sm:gap-3">
                              {entry.team_logo ? (
                                <img 
                                  src={entry.team_logo} 
                                  alt={`${entry.team_name}`}
                                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-slate-200 shadow-sm shrink-0"
                                  style={{
                                    objectPosition: `${(entry as any).logo_position_x_circle ?? 50}% ${(entry as any).logo_position_y_circle ?? 50}%`,
                                    transform: `scale(${(entry as any).logo_scale_circle ?? 1})`,
                                    transformOrigin: `${(entry as any).logo_position_x_circle ?? 50}% ${(entry as any).logo_position_y_circle ?? 50}%`,
                                  }}
                                />
                              ) : (
                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 border border-slate-700 text-amber-400 flex items-center justify-center font-black text-[10px] sm:text-xs uppercase font-mono shrink-0">
                                  {entry.team_name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-bold text-[11px] sm:text-xs uppercase text-slate-800 truncate max-w-[120px] sm:max-w-none">{entry.team_name}</p>
                                <p className="text-[8px] sm:text-[9px] text-slate-400 font-bold uppercase truncate">{entry.owner_name}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 sm:px-6 py-3 text-center font-mono text-[11px] sm:text-xs font-bold text-blue-600">
                            {entry.player_points || 0}
                          </td>
                          <td className="px-2 sm:px-6 py-3 text-center font-mono text-[11px] sm:text-xs">
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] sm:text-[10px] font-bold text-slate-700 uppercase truncate max-w-[90px] sm:max-w-none">
                                {entry.supported_team_name || 'N/A'}
                              </span>
                              <span className="text-emerald-600 font-extrabold text-[10px] sm:text-xs">
                                +{entry.passive_points || 0}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 sm:px-6 py-3 text-center font-mono text-[11px] sm:text-xs font-bold">
                            <span className={entry.last_round_points > 0 ? 'text-emerald-600' : 'text-slate-500'}>
                              {entry.last_round_points > 0 ? `+${entry.last_round_points}` : entry.last_round_points}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-3 text-right font-mono text-xs sm:text-sm font-black text-amber-600">
                            {entry.total_points}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Stats Summary Grid - Responsive 2/3 Cols */}
          {leaderboard.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4">
              <div className="console-card bg-white border border-slate-200/60 p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm">
                <p className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase mb-0.5 sm:mb-1">Highest Score</p>
                <p className="text-lg sm:text-xl font-black text-emerald-600">{Math.max(...leaderboard.map(e => e.total_points))}</p>
              </div>
              <div className="console-card bg-white border border-slate-200/60 p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm">
                <p className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase mb-0.5 sm:mb-1">Average Score</p>
                <p className="text-lg sm:text-xl font-black text-amber-600">
                  {Math.round(leaderboard.reduce((sum, e) => sum + e.total_points, 0) / leaderboard.length)}
                </p>
              </div>
              <div className="console-card bg-white border border-slate-200/60 p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm col-span-2 md:col-span-1">
                <p className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase mb-0.5 sm:mb-1">Active Squad Count</p>
                <p className="text-lg sm:text-xl font-black text-slate-800">
                  {leaderboard.reduce((sum, e) => sum + e.player_count, 0)}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
