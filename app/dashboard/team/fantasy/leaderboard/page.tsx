'use client';

import { Trophy, Shield, Star, Users, Award, Calendar, AlertTriangle, ArrowLeft, ArrowUp, ArrowDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

interface LeaderboardEntry {
  rank: number;
  fantasy_team_id: string;
  team_name: string;
  owner_name: string;
  total_points: number;
  player_points: number;
  passive_points: number;
  supported_team_name?: string;
  player_count: number;
  last_round_points: number;
  team_logo?: string;
}

export default function FantasyLeaderboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leagueName, setLeagueName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [myTeamId, setMyTeamId] = useState<string>('');

  useEffect(() => {
    const loadLeaderboard = async () => {
      if (!user) return;

      try {
        // First get user's team to find league ID
        const myTeamResponse = await fetchWithTokenRefresh(`/api/fantasy/teams/my-team?user_id=${user.uid}`);
        
        if (myTeamResponse.status === 404) {
          setIsLoading(false);
          return;
        }

        const myTeamData = await myTeamResponse.json();
        const leagueId = myTeamData.team.fantasy_league_id;
        setMyTeamId(myTeamData.team.id);

        // Get leaderboard
        const leaderboardResponse = await fetchWithTokenRefresh(`/api/fantasy/leaderboard/${leagueId}`);
        
        if (!leaderboardResponse.ok) {
          throw new Error('Failed to load leaderboard');
        }

        const leaderboardData = await leaderboardResponse.json();
        setLeagueName(leaderboardData.league.name);
        setLeaderboard(leaderboardData.leaderboard);
      } catch (error: any) {
        console.error('Error loading leaderboard:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (user) {
      loadLeaderboard();
    }
  }, [user]);

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs sm:text-sm text-slate-550 uppercase tracking-wider font-extrabold">Loading leaderboard standings...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (leaderboard.length === 0) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="max-w-md w-full bg-white border border-slate-200/60 p-6 sm:p-8 rounded-2xl sm:rounded-3xl text-center shadow-sm relative z-10">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-800 border border-slate-700 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow">
            <Trophy className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <h3 className="text-lg sm:text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">No Active Leaderboard</h3>
          <p className="text-xs text-slate-455 font-bold uppercase leading-normal mb-6">
            Standings will generate automatically once the first match round is calculated.
          </p>
          <Link href="/dashboard" className="px-5 py-2.5 sm:px-6 sm:py-3 bg-slate-800 border border-slate-900 hover:bg-slate-750 text-amber-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const getRankColor = (rank: number) => {
    if (rank === 1) return 'from-amber-400 to-yellow-500 text-slate-900 border-amber-500 shadow-amber-500/10';
    if (rank === 2) return 'from-slate-350 to-slate-450 text-slate-950 border-slate-350 shadow-slate-350/10';
    if (rank === 3) return 'from-amber-700 to-amber-800 text-white border-amber-750 shadow-amber-700/10';
    return 'from-slate-700 to-slate-800 text-amber-400 border-slate-900 shadow-slate-900/10';
  };

  const getRankBadgeClass = (rank: number) => {
    if (rank === 1) return 'bg-amber-500 text-slate-900 border-amber-600';
    if (rank === 2) return 'bg-slate-300 text-slate-900 border-slate-400';
    if (rank === 3) return 'bg-amber-750 text-white border-amber-800';
    return 'bg-slate-800 text-slate-300 border-slate-900';
  };

  return (
    <AuthGuard requiredRole="team">
      <div className="console-bg min-h-screen text-slate-800 relative pt-3 sm:pt-5 lg:pt-24 pb-6 sm:pb-12 px-2.5 sm:px-6 font-mono">
        {/* Ambient Gold Glow */}
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

        <div className="max-w-5xl mx-auto relative z-10 space-y-4 sm:space-y-6">
          {/* Navigation */}
          <div className="flex justify-between items-center">
            <Link
              href="/dashboard/team/fantasy/my-team"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-bold text-[11px] sm:text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to My Team
            </Link>
          </div>

          {/* Header Banner */}
          <div className="console-card bg-white border border-slate-200/60 p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 sm:p-3 bg-slate-800 border border-slate-900 rounded-xl sm:rounded-2xl text-amber-400 shadow-sm shrink-0">
                <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <div className="text-[8px] sm:text-[9px] uppercase bg-amber-500 border border-amber-600 text-slate-900 px-2 py-0.5 rounded-lg font-black tracking-wider w-fit">
                  STANDINGS LEADERBOARD
                </div>
                <h1 className="text-lg sm:text-2xl font-black text-slate-900 mt-1 uppercase tracking-tight">{leagueName}</h1>
              </div>
            </div>
          </div>

          {/* Standings Console Container */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm">
            {/* Podium Display (Top 3 Teams) */}
            {leaderboard.length >= 3 && (
              <div className="bg-slate-50/50 border-b border-slate-100 p-3 sm:p-8">
                <div className="grid grid-cols-3 gap-1.5 sm:gap-3 max-w-2xl mx-auto items-end pt-2 sm:pt-4">
                  {/* 2nd Place */}
                  <div className="text-center space-y-1.5 sm:space-y-2">
                    <div className={`w-10 h-10 sm:w-16 sm:h-16 mx-auto bg-gradient-to-br ${getRankColor(2)} border-2 rounded-full flex items-center justify-center font-black text-xs sm:text-lg shadow-sm shrink-0 relative`}>
                      2
                      <span className="absolute -bottom-1 -right-1 bg-slate-400 text-[6px] sm:text-[8px] px-1 py-0.5 rounded uppercase font-black tracking-wider hidden sm:block">SILVER</span>
                    </div>
                    <div className="min-w-0">
                      <p className={`font-black text-[9px] sm:text-xs uppercase truncate px-0.5 ${leaderboard[1].fantasy_team_id === myTeamId ? 'text-amber-600' : 'text-slate-800'}`}>
                        {leaderboard[1].team_name}
                      </p>
                      <p className="text-[10px] sm:text-xs font-black text-slate-500 mt-0.5">{leaderboard[1].total_points} pts</p>
                    </div>
                  </div>

                  {/* 1st Place */}
                  <div className="text-center space-y-1.5 sm:space-y-2">
                    <div className="w-3.5 h-3.5 sm:w-5 sm:h-5 mx-auto text-amber-500 flex items-center justify-center animate-bounce">
                      <Trophy className="w-3.5 h-3.5 sm:w-5 sm:h-5 fill-amber-500" />
                    </div>
                    <div className={`w-12 h-12 sm:w-20 sm:h-20 mx-auto bg-gradient-to-br ${getRankColor(1)} border-2 rounded-full flex items-center justify-center font-black text-sm sm:text-xl shadow-md shrink-0 relative`}>
                      1
                      <span className="absolute -bottom-1 -right-1 bg-amber-500 text-[6px] sm:text-[8px] text-slate-900 px-1 py-0.5 rounded uppercase font-black tracking-wider hidden sm:block">CHAMP</span>
                    </div>
                    <div className="min-w-0">
                      <p className={`font-black text-[10px] sm:text-sm uppercase truncate px-0.5 ${leaderboard[0].fantasy_team_id === myTeamId ? 'text-amber-600 font-extrabold' : 'text-slate-850'}`}>
                        {leaderboard[0].team_name}
                      </p>
                      <p className="text-xs sm:text-sm font-black text-amber-600 mt-0.5">{leaderboard[0].total_points} pts</p>
                    </div>
                  </div>

                  {/* 3rd Place */}
                  <div className="text-center space-y-1.5 sm:space-y-2">
                    <div className={`w-10 h-10 sm:w-16 sm:h-16 mx-auto bg-gradient-to-br ${getRankColor(3)} border-2 rounded-full flex items-center justify-center font-black text-xs sm:text-lg shadow-sm shrink-0 relative`}>
                      3
                      <span className="absolute -bottom-1 -right-1 bg-amber-800 text-[6px] sm:text-[8px] text-white px-1 py-0.5 rounded uppercase font-black tracking-wider hidden sm:block">BRONZE</span>
                    </div>
                    <div className="min-w-0">
                      <p className={`font-black text-[9px] sm:text-xs uppercase truncate px-0.5 ${leaderboard[2].fantasy_team_id === myTeamId ? 'text-amber-600' : 'text-slate-800'}`}>
                        {leaderboard[2].team_name}
                      </p>
                      <p className="text-[10px] sm:text-xs font-black text-slate-500 mt-0.5">{leaderboard[2].total_points} pts</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Full Rankings list */}
            <div className="p-3 sm:p-6">
              <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                <h3 className="text-[11px] sm:text-xs font-black text-slate-900 uppercase tracking-wider">
                  League Standings Table
                </h3>
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase">{leaderboard.length} Teams</span>
              </div>
              
              <div className="overflow-x-auto border border-slate-150 rounded-xl sm:rounded-2xl">
                <table className="w-full text-left border-collapse min-w-[500px] sm:min-w-full">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100 font-mono text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      <th className="px-2.5 sm:px-4 py-3 text-center w-12 sm:w-14">Rank</th>
                      <th className="px-2.5 sm:px-4 py-3 text-left">Team / Owner</th>
                      <th className="px-2 sm:px-4 py-3 text-center text-blue-600 font-bold">Player Pts</th>
                      <th className="px-2 sm:px-4 py-3 text-center text-emerald-600 font-bold">Supported Team</th>
                      <th className="px-3 sm:px-4 py-3 text-center text-amber-600 font-black">Total Pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leaderboard.map((entry) => (
                      <tr
                        key={entry.fantasy_team_id}
                        className={`transition-all hover:bg-slate-50/50 ${
                          entry.fantasy_team_id === myTeamId
                            ? 'bg-amber-50/30 font-bold'
                            : ''
                        }`}
                      >
                        <td className="px-2.5 sm:px-4 py-3 text-center">
                          <div className={`w-6 h-6 sm:w-8 sm:h-8 mx-auto rounded-lg border font-black text-[9px] sm:text-xs flex items-center justify-center shadow-sm ${getRankBadgeClass(entry.rank)}`}>
                            {entry.rank >= 999 ? '—' : entry.rank}
                          </div>
                        </td>
                        <td className="px-2.5 sm:px-4 py-3">
                          <div className="flex items-center gap-2 sm:gap-3">
                            {entry.team_logo ? (
                              <img 
                                src={entry.team_logo} 
                                alt={`${entry.team_name} logo`}
                                className="w-7 h-7 sm:w-9 sm:h-9 rounded-full object-cover shrink-0 border border-slate-200 bg-white"
                                style={{
                                  objectPosition: `${(entry as any).logo_position_x_circle ?? 50}% ${(entry as any).logo_position_y_circle ?? 50}%`,
                                  transform: `scale(${(entry as any).logo_scale_circle ?? 1})`,
                                  transformOrigin: `${(entry as any).logo_position_x_circle ?? 50}% ${(entry as any).logo_position_y_circle ?? 50}%`,
                                }}
                              />
                            ) : (
                              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-slate-800 border border-slate-900 text-amber-400 font-black text-[10px] sm:text-xs flex items-center justify-center shrink-0 shadow-sm">
                                {entry.team_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className={`text-[11px] sm:text-xs font-black uppercase truncate max-w-[110px] sm:max-w-none ${entry.fantasy_team_id === myTeamId ? 'text-amber-700' : 'text-slate-800'}`}>
                                {entry.team_name}
                                {entry.fantasy_team_id === myTeamId && (
                                  <span className="ml-1.5 text-[7px] sm:text-[8px] bg-amber-500 border border-amber-600 text-slate-900 px-1.5 py-0.5 rounded font-black tracking-wider uppercase inline-block">
                                    YOU
                                  </span>
                                )}
                              </p>
                              <p className="text-[8px] sm:text-[9px] font-bold text-slate-450 uppercase mt-0.5 truncate">{entry.owner_name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-center font-mono text-[11px] sm:text-xs font-extrabold text-blue-600">
                          {entry.player_points || 0}
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-center font-mono">
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] sm:text-[10px] font-bold text-slate-700 uppercase truncate max-w-[85px] sm:max-w-none">
                              {entry.supported_team_name || 'N/A'}
                            </span>
                            <span className="text-[10px] sm:text-xs font-extrabold text-emerald-600 mt-0.5">
                              +{entry.passive_points || 0}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-xl text-[11px] sm:text-sm font-black border uppercase tracking-wider bg-slate-800 text-amber-400 border-slate-900 shadow-sm">
                            {entry.total_points}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
