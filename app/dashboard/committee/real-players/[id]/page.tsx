'use client';
import { DollarSign, Trophy, Crown } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import Link from 'next/link';
import Image from 'next/image';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface RealPlayerDetails {
  id: string;
  player_name: string;
  team_id: string;
  team_name?: string;
  auction_value: number;
  star_rating: number;
  category?: string;
  season_id: string;
  // Season stats
  matches_played?: number;
  goals_scored?: number;
  assists?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  clean_sheets?: number;
  motm_awards?: number;
  points?: number;
  // Awards
  awards?: string[];
  potm_count?: number;
  pots_count?: number;
}

export default function RealPlayerDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const { isCommitteeAdmin, userSeasonId } = usePermissions();
  const [playerData, setPlayerData] = useState<RealPlayerDetails | null>(null);
  const [loadingPlayer, setLoadingPlayer] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const playerId = params?.id as string;

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && !isCommitteeAdmin) {
      router.push('/dashboard');
    }
  }, [user, loading, router, isCommitteeAdmin]);

  useEffect(() => {
    const fetchPlayerDetails = async () => {
      if (!userSeasonId || !playerId) {
        setError('Missing required parameters');
        setLoadingPlayer(false);
        return;
      }

      try {
        setLoadingPlayer(true);
        
        // Fetch from API endpoint
        const response = await fetchWithTokenRefresh(`/api/real-player/${playerId}?season_id=${userSeasonId}`);
        const result = await response.json();
        
        if (result.success && result.data) {
          setPlayerData(result.data);
        } else {
          setError(result.error || 'Player not found');
        }
      } catch (err) {
        console.error('Error fetching player details:', err);
        setError('Failed to load player details');
      } finally {
        setLoadingPlayer(false);
      }
    };

    if (isCommitteeAdmin && userSeasonId && playerId) {
      fetchPlayerDetails();
    }
  }, [isCommitteeAdmin, userSeasonId, playerId]);

  if (loading || loadingPlayer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="text-center font-mono">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 font-mono font-extrabold uppercase tracking-wider">Loading player details...</p>
        </div>
      </div>
    );
  }

  if (!user || !isCommitteeAdmin) {
    return null;
  }

  if (error || !playerData) {
    return (
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
        <div className="max-w-md mx-auto relative z-10 font-mono text-xs text-center">
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-8 shadow-sm space-y-4">
            <svg className="w-12 h-12 mx-auto text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Error Encountered</h2>
            <p className="text-[10px] text-slate-455 uppercase tracking-wide leading-relaxed">{error || 'Player not found'}</p>
            <Link
              href="/dashboard/committee/real-players"
              className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              Back to SS Members List
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <svg
        key={i}
        className={`w-4 h-4 ${i < rating ? 'text-amber-500' : 'text-slate-200'}`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ));
  };

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-4xl mx-auto relative z-10 space-y-6 font-mono text-xs">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <Link
              href="/dashboard/committee/real-players"
              className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all mb-4"
            >
              &larr; Back to SS Members
            </Link>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight font-mono">
              {playerData.player_name}
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1 leading-normal">
              SS Member Contract Profile
            </p>
          </div>
          
          <div className="bg-slate-800 text-white font-mono font-bold text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-xl border border-slate-700 shadow-sm shrink-0">
            REAL PLAYER
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Star Rating</span>
            <div className="flex items-center gap-1 mt-1">
              {renderStars(playerData.star_rating)}
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Auction Value</span>
            <div className="text-xl font-black text-emerald-600 mt-1">
              <DollarSign className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" />{playerData.auction_value?.toLocaleString() ?? '0'}
            </div>
          </div>

          {playerData.category && (
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category</span>
              <div className="text-xl font-black text-purple-650 mt-1 uppercase">
                {playerData.category}
              </div>
            </div>
          )}
        </div>

        {/* Team Info */}
        {playerData.team_id && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">Allocated Team</span>
              <Link
                href={`/dashboard/committee/teams/${playerData.team_id}`}
                className="font-extrabold text-blue-600 hover:text-blue-500 uppercase tracking-wide"
              >
                {playerData.team_name || playerData.team_id}
              </Link>
            </div>
          </div>
        )}

        {/* Season Stats */}
        {(playerData.matches_played !== undefined || playerData.goals_scored !== undefined) && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Season Statistics Matrix</h2>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
              {playerData.matches_played !== undefined && (
                <div className="text-center bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                  <div className="text-lg font-black text-slate-800">{playerData.matches_played}</div>
                  <div className="text-[9px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mt-0.5">Games</div>
                </div>
              )}
              {playerData.goals_scored !== undefined && (
                <div className="text-center bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                  <div className="text-lg font-black text-emerald-600">{playerData.goals_scored}</div>
                  <div className="text-[9px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mt-0.5">Goals</div>
                </div>
              )}
              {playerData.assists !== undefined && (
                <div className="text-center bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                  <div className="text-lg font-black text-purple-650">{playerData.assists}</div>
                  <div className="text-[9px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mt-0.5">Assists</div>
                </div>
              )}
              {playerData.clean_sheets !== undefined && (
                <div className="text-center bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                  <div className="text-lg font-black text-blue-600">{playerData.clean_sheets}</div>
                  <div className="text-[9px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mt-0.5">CS</div>
                </div>
              )}
              {playerData.wins !== undefined && (
                <div className="text-center bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                  <div className="text-lg font-black text-emerald-600">{playerData.wins}</div>
                  <div className="text-[9px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mt-0.5">Wins</div>
                </div>
              )}
              {playerData.draws !== undefined && (
                <div className="text-center bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                  <div className="text-lg font-black text-slate-500">{playerData.draws}</div>
                  <div className="text-[9px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mt-0.5">Draws</div>
                </div>
              )}
              {playerData.losses !== undefined && (
                <div className="text-center bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                  <div className="text-lg font-black text-rose-600">{playerData.losses}</div>
                  <div className="text-[9px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mt-0.5">Losses</div>
                </div>
              )}
              {playerData.motm_awards !== undefined && playerData.motm_awards > 0 && (
                <div className="text-center bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                  <div className="text-lg font-black text-amber-600">{playerData.motm_awards}</div>
                  <div className="text-[9px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mt-0.5">MOTM</div>
                </div>
              )}
              {playerData.points !== undefined && (
                <div className="text-center bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                  <div className="text-lg font-black text-indigo-600">{playerData.points}</div>
                  <div className="text-[9px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mt-0.5">Points</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Awards Section */}
        {((playerData.awards && playerData.awards.length > 0) || (playerData.potm_count && playerData.potm_count > 0) || (playerData.pots_count && playerData.pots_count > 0)) && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Awards & Honors
            </h2>
            
            {/* POTM and POTS counts */}
            {((playerData.potm_count && playerData.potm_count > 0) || (playerData.pots_count && playerData.pots_count > 0)) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {playerData.potm_count !== undefined && playerData.potm_count > 0 && (
                  <div className="bg-amber-50/40 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <div className="text-lg font-black text-amber-600">{playerData.potm_count}</div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Player of the Match</div>
                    </div>
                    <div className="text-2xl"><Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /></div>
                  </div>
                )}
                {playerData.pots_count !== undefined && playerData.pots_count > 0 && (
                  <div className="bg-purple-50/40 border border-purple-200 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <div className="text-lg font-black text-purple-650">{playerData.pots_count}</div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Player of the Season</div>
                    </div>
                    <div className="text-2xl"><Crown className="w-4 h-4 inline-block text-amber-500 fill-amber-500 mr-1 align-text-bottom" /></div>
                  </div>
                )}
              </div>
            )}
            
            {/* Awards list */}
            {playerData.awards && playerData.awards.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Other Awards</h3>
                <div className="flex flex-wrap gap-1.5">
                  {playerData.awards.map((award, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-slate-50 border border-slate-200 text-slate-655"
                    >
                      {award}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
