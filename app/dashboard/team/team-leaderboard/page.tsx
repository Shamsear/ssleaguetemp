'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useTournamentContext } from '@/contexts/TournamentContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { useTournament } from '@/hooks/useTournaments';
import TournamentSelector from '@/components/TournamentSelector';
import TournamentStandings from '@/components/tournament/TournamentStandings';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

export default function TeamLeaderboardPage() {
  const { user, loading } = useAuth();
  const { selectedTournamentId, seasonId, setSeasonId } = useTournamentContext();
  const router = useRouter();
  
  // Get tournament info for display
  const { data: tournament, isLoading: tournamentLoading } = useTournament(selectedTournamentId);

  // Fetch and set the team's season if not already set
  useEffect(() => {
    const fetchTeamSeason = async () => {
      if (!user || user.role !== 'team') return;

      try {
        // Get active season from Firebase
        const { db } = await import('@/lib/firebase/config');
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        
        const seasonsRef = collection(db, 'seasons');
        const activeSeasonQuery = query(seasonsRef, where('isActive', '==', true));
        const snapshot = await getDocs(activeSeasonQuery);
        
        if (!snapshot.empty) {
          const activeSeason = snapshot.docs[0];
          const activeSeasonId = activeSeason.id;
          
          console.log('📝 [Leaderboard] Found active season:', activeSeasonId);
          
          // Check if team is registered for this season
          const teamSeasonsRef = collection(db, 'team_seasons');
          const teamSeasonQuery = query(
            teamSeasonsRef,
            where('user_id', '==', user.uid),
            where('season_id', '==', activeSeasonId),
            where('status', '==', 'registered')
          );
          const teamSeasonSnapshot = await getDocs(teamSeasonQuery);
          
          if (!teamSeasonSnapshot.empty) {
            console.log('📝 [Leaderboard] Team is registered, setting season ID:', activeSeasonId);
            setSeasonId(activeSeasonId);
          } else {
            console.log('⚠️ [Leaderboard] Team not registered for active season, but setting it anyway for viewing');
            // Set it anyway so they can view the leaderboard
            setSeasonId(activeSeasonId);
          }
        } else {
          console.log('⚠️ [Leaderboard] No active season found');
        }
      } catch (error) {
        console.error('❌ [Leaderboard] Error fetching team season:', error);
      }
    };

    fetchTeamSeason();
  }, [user, setSeasonId]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Leaderboard...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team') {
    return null;
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          {/* Back Link */}
          <Link
            href="/dashboard/team"
            className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit mb-4"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Dashboard
          </Link>

          {/* Title Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono relative overflow-hidden">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/10">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800">
                      Team Leaderboard
                    </h1>
                    <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                      {tournament?.tournament_name || 'Tournament'} Rankings
                    </p>
                  </div>
                </div>
                
                {/* Quick Link */}
                <Link
                  href="/dashboard/team/player-leaderboard"
                  className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold inline-flex items-center gap-1.5 mt-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  View Player Rankings
                </Link>
              </div>
              
              {/* Tournament Selector */}
              <div className="w-full sm:w-auto">
                <TournamentSelector />
              </div>
            </div>
          </div>
        </div>

        {/* Tournament Standings - Format-Aware */}
        {tournamentLoading ? (
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-8 text-center font-mono shadow-sm">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto mb-4"></div>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Loading Standings...</p>
          </div>
        ) : selectedTournamentId ? (
          <TournamentStandings 
            tournamentId={selectedTournamentId}
            currentUserId={user.uid}
          />
        ) : (
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 text-center shadow-sm font-mono">
            <span className="text-4xl mb-3 block">⚠️</span>
            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-2">No Tournament Selected</h3>
            <p className="text-xs text-slate-500 uppercase font-semibold mb-4">Please select a tournament from the dropdown above to view standings</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              If no tournaments appear, make sure your team is registered for the current season
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
