'use client';

import { useEffect, useState } from 'react';
import LeagueStandingsTable from './LeagueStandingsTable';
import GroupStageStandings from './GroupStageStandings';
import KnockoutBracket from './KnockoutBracket';
import ShareableLeaderboard from './ShareableLeaderboard';

interface TournamentStandingsProps {
  tournamentId: string;
  currentUserId?: string;
}

export default function TournamentStandings({ tournamentId, currentUserId }: TournamentStandingsProps) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'standings' | 'knockout'>('standings');
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [availableRounds, setAvailableRounds] = useState<number[]>([]);

  useEffect(() => {
    if (!tournamentId) return;

    const fetchStandings = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Build URL with optional round filter
        const url = selectedRound 
          ? `/api/tournaments/${tournamentId}/standings?upToRound=${selectedRound}`
          : `/api/tournaments/${tournamentId}/standings`;
        
        const response = await fetch(url);
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch standings');
        }

        setData(result);
        
        // Set default tab based on format
        if (result.format === 'knockout') {
          setActiveTab('knockout');
        } else {
          setActiveTab('standings');
        }
      } catch (err: any) {
        console.error('Error fetching tournament standings:', err);
        setError(err.message || 'Failed to load standings');
      } finally {
        setIsLoading(false);
      }
    };

    fetchStandings();
  }, [tournamentId, selectedRound]);

  // Fetch available rounds for the tournament
  useEffect(() => {
    if (!tournamentId) return;

    const fetchRounds = async () => {
      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/rounds`);
        const result = await response.json();
        
        if (result.success && result.rounds) {
          const roundNumbers = result.rounds
            .map((r: any) => r.round_number)
            .filter((n: number) => n !== null && n !== undefined)
            .sort((a: number, b: number) => a - b);
          
          setAvailableRounds(roundNumbers);
        }
      } catch (err) {
        console.error('Error fetching rounds:', err);
      }
    };

    fetchRounds();
  }, [tournamentId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0066FF] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading standings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <span className="text-4xl mb-2 block">⚠️</span>
        <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Standings</h3>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-8 text-center font-mono shadow-sm">
        <span className="text-6xl mb-4 block">📊</span>
        <h3 className="text-lg font-medium text-gray-600 mb-2">No Standings Available</h3>
        <p className="text-sm text-gray-500">Standings will appear once matches are completed</p>
      </div>
    );
  }

  const { format, has_knockout, standings, groupStandings, knockoutFixtures, playoff_spots, tournament_name, season_name } = data;

  // Determine what to show based on format
  const showLeagueStandings = format === 'league' && standings;
  const showGroupStandings = format === 'group_stage' && groupStandings;
  const showKnockout = (format === 'knockout' || has_knockout) && knockoutFixtures;
  const hasBothStages = (showLeagueStandings || showGroupStandings) && showKnockout;

  return (
    <div className="space-y-6">
      {/* Round Selector - Show for both league and group stage */}
      {(showLeagueStandings || showGroupStandings) && availableRounds.length > 0 && (
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 sm:p-6 shadow-sm font-mono">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3 lg:gap-4">
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xl">🎯</span>
              <label className="text-xs font-black text-slate-800 uppercase tracking-wider whitespace-nowrap">Filter by Round:</label>
            </div>
            
            {/* Dropdown for mobile/small screens */}
            <div className="w-full lg:hidden">
              <select
                value={selectedRound === null ? 'all' : selectedRound}
                onChange={(e) => setSelectedRound(e.target.value === 'all' ? null : Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold uppercase tracking-wider text-slate-700 focus:outline-none focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-sm"
              >
                <option value="all">📊 All Rounds (Current Standings)</option>
                {availableRounds.map((roundNum) => (
                  <option key={roundNum} value={roundNum}>
                    Round {roundNum}
                  </option>
                ))}
              </select>
            </div>

            {/* Buttons for larger screens */}
            <div className="hidden lg:flex flex-wrap items-center gap-2 flex-1">
              <button
                onClick={() => setSelectedRound(null)}
                className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer ${
                  selectedRound === null
                    ? 'bg-slate-800 text-amber-400 border border-slate-900 scale-105'
                    : 'bg-white text-slate-750 border border-slate-200 hover:border-amber-400/40 hover:text-amber-600'
                }`}
              >
                📊 All Rounds
              </button>
              <div className="h-5 w-px bg-slate-200 mx-1"></div>
              {availableRounds.map((roundNum) => (
                <button
                  key={roundNum}
                  onClick={() => setSelectedRound(roundNum)}
                  className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer ${
                    selectedRound === roundNum
                      ? 'bg-slate-800 text-amber-400 border border-slate-900 scale-105'
                      : 'bg-white text-slate-750 border border-slate-200 hover:border-amber-400/40 hover:text-amber-600'
                  }`}
                >
                  R{roundNum}
                </button>
              ))}
            </div>
          </div>
          
          {/* Info text */}
          {selectedRound !== null && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1.5">
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Showing standings after Round {selectedRound} (includes only matches up to this round)
              </p>
            </div>
          )}
        </div>
      )}

      {/* Share Leaderboard Feature - Show for both league and group stage */}
      {((showLeagueStandings && standings && standings.length > 0) || (showGroupStandings && groupStandings)) && (
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono relative overflow-hidden">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center">
              <span className="text-xl">📸</span>
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Share Leaderboard</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Generate and share a beautiful image of the current standings</p>
            </div>
          </div>
          <ShareableLeaderboard 
            standings={showLeagueStandings ? standings : undefined}
            groupStandings={showGroupStandings ? groupStandings : undefined}
            tournamentName={tournament_name || 'Tournament'}
            seasonName={season_name}
            format={format}
            selectedRound={selectedRound}
            availableRounds={availableRounds}
          />
        </div>
      )}

      {/* Tabs for combined formats (League+Knockout or Group+Knockout) */}
      {hasBothStages && (
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-3 shadow-sm font-mono flex items-center justify-center gap-3">
          <button
            onClick={() => setActiveTab('standings')}
            className={`px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider font-extrabold transition-all shadow-sm cursor-pointer ${
              activeTab === 'standings'
                ? 'bg-slate-800 text-amber-400 border border-slate-900'
                : 'bg-slate-50 text-slate-500 hover:text-slate-850 hover:bg-slate-100 border border-slate-200/30'
            }`}
          >
            {format === 'group_stage' ? '🏆 Group Stage' : '⚽ League Standings'}
          </button>
          <button
            onClick={() => setActiveTab('knockout')}
            className={`px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider font-extrabold transition-all shadow-sm cursor-pointer ${
              activeTab === 'knockout'
                ? 'bg-slate-800 text-amber-400 border border-slate-900'
                : 'bg-slate-50 text-slate-500 hover:text-slate-850 hover:bg-slate-100 border border-slate-200/30'
            }`}
          >
            🥇 Knockout Stage
          </button>
        </div>
      )}

      {/* Render appropriate view based on format and active tab */}
      {activeTab === 'standings' && (
        <>
          {showLeagueStandings && (
            <LeagueStandingsTable 
              standings={standings} 
              currentUserId={currentUserId}
              showPlayoffIndicator={has_knockout}
              playoffSpots={playoff_spots || 4}
            />
          )}
          
          {showGroupStandings && (
            <GroupStageStandings 
              groupStandings={groupStandings}
              currentUserId={currentUserId}
            />
          )}
        </>
      )}

      {activeTab === 'knockout' && showKnockout && (
        <KnockoutBracket knockoutFixtures={knockoutFixtures} />
      )}

      {/* Format Info Badge */}
      <div className="flex items-center justify-center font-mono">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200/60 rounded-xl">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {format === 'league' && has_knockout && '⚽ League + 🥇 Knockout Format'}
            {format === 'league' && !has_knockout && '⚽ League Format'}
            {format === 'group_stage' && has_knockout && '🏆 Group Stage + 🥇 Knockout Format'}
            {format === 'group_stage' && !has_knockout && '🏆 Group Stage Format'}
            {format === 'knockout' && '🥇 Knockout Format'}
          </span>
        </div>
      </div>
    </div>
  );
}
