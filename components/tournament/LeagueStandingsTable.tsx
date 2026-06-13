'use client';

import { useState } from 'react';

interface TeamStats {
  team_id: string;
  team_name: string;
  team_logo?: string;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
}

interface LeagueStandingsTableProps {
  standings: TeamStats[];
  currentUserId?: string;
  showPlayoffIndicator?: boolean;
  playoffSpots?: number;
}

export default function LeagueStandingsTable({ 
  standings, 
  currentUserId,
  showPlayoffIndicator = false,
  playoffSpots = 4
}: LeagueStandingsTableProps) {
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  
  if (standings.length === 0) {
    return (
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-8 text-center font-mono shadow-sm">
        <span className="text-4xl mb-3 block">⚽</span>
        <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-2">No Team Statistics Available</h3>
        <p className="text-xs text-slate-500 uppercase font-semibold">Team standings will appear once matches are completed</p>
      </div>
    );
  }

  const topTeam = standings[0];

  return (
    <div className="space-y-6">
      {/* League Table */}
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl overflow-hidden font-mono shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center">
                <span className="text-xl">⚽</span>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">League Table</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{standings.length} teams competing</p>
              </div>
            </div>
            
            {/* View Toggle - Only show on small screens */}
            <div className="md:hidden flex gap-2">
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-xl transition-all font-mono text-xs uppercase font-extrabold shadow-sm ${
                  viewMode === 'table' ? 'bg-slate-800 text-amber-400 border border-slate-900' : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
                }`}
                title="Table View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-2 rounded-xl transition-all font-mono text-xs uppercase font-extrabold shadow-sm ${
                  viewMode === 'cards' ? 'bg-slate-800 text-amber-400 border border-slate-900' : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
                }`}
                title="Card View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Card View for Mobile */}
        {viewMode === 'cards' && (
          <div className="md:hidden p-4 space-y-3">
            {standings.map((team, index) => {
              const isPlayoffSpot = showPlayoffIndicator && index < playoffSpots;
              const isCurrentUser = currentUserId && team.team_id === currentUserId;

              return (
                <div
                  key={team.team_id}
                  className={`console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm relative overflow-hidden transition-all duration-200 ${
                    isCurrentUser ? 'ring-1 ring-amber-500 bg-amber-500/[0.02]' : ''
                  } ${isPlayoffSpot ? 'border-l-4 border-l-emerald-500' : ''}`}
                >
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-xl font-bold font-mono">
                      {index === 0 && '🥇'}
                      {index === 1 && '🥈'}
                      {index === 2 && '🥉'}
                      {index > 2 && `#${index + 1}`}
                    </div>
                    
                    {team.team_logo ? (
                      <img 
                        src={team.team_logo} 
                        alt={`${team.team_name} logo`}
                        className="w-10 h-10 rounded-full object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-black text-sm shadow-sm shadow-amber-500/10">
                        {team.team_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-slate-800 truncate uppercase text-sm">{team.team_name}</div>
                      <div className="flex flex-wrap gap-1.5 mt-1 font-mono">
                        {isCurrentUser && (
                          <span className="text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200/40 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            You
                          </span>
                        )}
                        {isPlayoffSpot && (
                          <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-250/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            🎯 Playoff
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider bg-slate-50 text-slate-700 border-slate-200/60">
                        {team.points} PTS
                      </div>
                    </div>
                  </div>
                  
                  {/* Stats Grid */}
                  <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    <div className="bg-slate-50/50 rounded-lg p-1.5 border border-slate-250/20">
                      <div className="text-slate-400 font-bold">MP</div>
                      <div className="text-slate-700 font-black mt-0.5">{team.matches_played}</div>
                    </div>
                    <div className="bg-emerald-50/40 rounded-lg p-1.5 border border-emerald-100/30 text-emerald-700">
                      <div className="text-emerald-500 font-bold">W</div>
                      <div className="text-emerald-700 font-black mt-0.5">{team.wins}</div>
                    </div>
                    <div className="bg-slate-50/50 rounded-lg p-1.5 border border-slate-250/20">
                      <div className="text-slate-400 font-bold">D</div>
                      <div className="text-slate-700 font-black mt-0.5">{team.draws}</div>
                    </div>
                    <div className="bg-rose-50/40 rounded-lg p-1.5 border border-rose-100/30 text-rose-700">
                      <div className="text-rose-500 font-bold">L</div>
                      <div className="text-rose-700 font-black mt-0.5">{team.losses}</div>
                    </div>
                  </div>
                  
                  {/* Goals */}
                  <div className="grid grid-cols-3 gap-2 mt-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    <div className="bg-slate-50/50 rounded-lg p-1.5 border border-slate-250/20">
                      <div className="text-slate-400 font-bold">GF</div>
                      <div className="text-slate-700 font-black mt-0.5">{team.goals_for}</div>
                    </div>
                    <div className="bg-slate-50/50 rounded-lg p-1.5 border border-slate-250/20">
                      <div className="text-slate-400 font-bold">GA</div>
                      <div className="text-slate-700 font-black mt-0.5">{team.goals_against}</div>
                    </div>
                    <div className={`rounded-lg p-1.5 border ${
                      team.goal_difference > 0 ? 'bg-emerald-50/40 border-emerald-100/30 text-emerald-750' :
                      team.goal_difference < 0 ? 'bg-rose-50/40 border-rose-100/30 text-rose-750' :
                      'bg-slate-50/50 border-slate-250/20 text-slate-700'
                    }`}>
                      <div className="font-bold">GD</div>
                      <div className="font-black mt-0.5">
                        {team.goal_difference > 0 ? '+' : ''}{team.goal_difference}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Table View */}
        {viewMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/50 font-mono text-[10px] text-slate-400 font-bold uppercase tracking-wider text-center">
                <tr>
                  <th className="px-3 sm:px-6 py-4 text-left font-bold uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-3 sm:px-6 py-4 text-left font-bold uppercase tracking-wider">
                    Team
                  </th>
                  <th className="hidden md:table-cell px-3 sm:px-6 py-4 font-bold uppercase tracking-wider">
                    MP
                  </th>
                  <th className="px-3 sm:px-6 py-4 font-bold uppercase tracking-wider">
                    W
                  </th>
                  <th className="hidden sm:table-cell px-3 sm:px-6 py-4 font-bold uppercase tracking-wider">
                    D
                  </th>
                  <th className="px-3 sm:px-6 py-4 font-bold uppercase tracking-wider">
                    L
                  </th>
                  <th className="hidden lg:table-cell px-3 sm:px-6 py-4 font-bold uppercase tracking-wider">
                    GF
                  </th>
                  <th className="hidden lg:table-cell px-3 sm:px-6 py-4 font-bold uppercase tracking-wider">
                    GA
                  </th>
                  <th className="hidden md:table-cell px-3 sm:px-6 py-4 font-bold uppercase tracking-wider">
                    GD
                  </th>
                  <th className="px-3 sm:px-6 py-4 font-bold uppercase tracking-wider text-amber-600">
                    PTS
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white/40 divide-y divide-slate-100/60">
                {standings.map((team, index) => {
                  const isPlayoffSpot = showPlayoffIndicator && index < playoffSpots;
                  const isCurrentUser = currentUserId && team.team_id === currentUserId;

                  return (
                    <tr 
                      key={team.team_id} 
                      className={`hover:bg-slate-50/50 transition-colors text-center ${
                        index < 3 ? 'bg-amber-500/[0.005]' : ''
                      } ${
                        isPlayoffSpot ? 'border-l-4 border-l-emerald-500' : ''
                      } ${
                        isCurrentUser ? 'ring-1 ring-amber-500 bg-amber-500/[0.02]' : ''
                      }`}
                    >
                      <td className="px-3 sm:px-6 py-3.5 whitespace-nowrap text-left text-xs font-black text-slate-800">
                        {index === 0 && <span className="text-lg">🥇</span>}
                        {index === 1 && <span className="text-lg">🥈</span>}
                        {index === 2 && <span className="text-lg">🥉</span>}
                        {index > 2 && <span className="font-bold">{`#${index + 1}`}</span>}
                      </td>
                      <td className="px-3 sm:px-6 py-3.5 text-left">
                        <div className="flex items-center gap-2 sm:gap-3">
                          {/* Team Logo */}
                          {team.team_logo ? (
                            <img 
                              src={team.team_logo} 
                              alt={`${team.team_name} logo`}
                              className="w-8 h-8 rounded-full object-cover border border-slate-200 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-black text-[10px] flex-shrink-0 shadow-sm shadow-amber-500/10">
                              {team.team_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-extrabold text-slate-850 truncate uppercase tracking-tight">
                              {team.team_name}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 font-mono">
                              {isCurrentUser && (
                                <span className="text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200/40 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                  You
                                </span>
                              )}
                              {isPlayoffSpot && (
                                <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-250/30 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                  🎯 Playoff
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-3 sm:px-6 py-3.5 whitespace-nowrap text-xs font-bold text-slate-600">
                        {team.matches_played}
                      </td>
                      <td className="px-3 sm:px-6 py-3.5 whitespace-nowrap text-xs font-extrabold text-emerald-600">
                        {team.wins}
                      </td>
                      <td className="hidden sm:table-cell px-3 sm:px-6 py-3.5 whitespace-nowrap text-xs font-bold text-slate-500">
                        {team.draws}
                      </td>
                      <td className="px-3 sm:px-6 py-3.5 whitespace-nowrap text-xs font-extrabold text-rose-600">
                        {team.losses}
                      </td>
                      <td className="hidden lg:table-cell px-3 sm:px-6 py-3.5 whitespace-nowrap text-xs font-bold text-slate-600">
                        {team.goals_for}
                      </td>
                      <td className="hidden lg:table-cell px-3 sm:px-6 py-3.5 whitespace-nowrap text-xs font-bold text-slate-600">
                        {team.goals_against}
                      </td>
                      <td className="hidden md:table-cell px-3 sm:px-6 py-3.5 whitespace-nowrap">
                        <span className={`text-xs font-extrabold ${
                          team.goal_difference > 0 ? 'text-emerald-600' :
                          team.goal_difference < 0 ? 'text-rose-600' :
                          'text-slate-600'
                        }`}>
                          {team.goal_difference > 0 ? '+' : ''}{team.goal_difference}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-black border uppercase tracking-wider bg-slate-50 text-slate-700 border-slate-200/60">
                          {team.points}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm font-mono relative overflow-hidden">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-lg">📊</span>
          </div>
          <div>
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-2">League Table Legend</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-x-4 gap-y-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              <div><strong className="text-slate-700 font-black">MP:</strong> Matches Played</div>
              <div><strong className="text-slate-700 font-black">W:</strong> Wins</div>
              <div><strong className="text-slate-700 font-black">D:</strong> Draws</div>
              <div><strong className="text-slate-700 font-black">L:</strong> Losses</div>
              <div><strong className="text-slate-700 font-black">GF:</strong> Goals For</div>
              <div><strong className="text-slate-700 font-black">GA:</strong> Goals Against</div>
              <div><strong className="text-slate-700 font-black">GD:</strong> Goal Difference</div>
              <div><strong className="text-slate-700 font-black">PTS:</strong> Points</div>
            </div>
          </div>
        </div>
      </div>

      {/* Current Leader */}
      {topTeam && topTeam.matches_played > 0 && (
        <div className="console-card bg-gradient-to-br from-amber-500/5 via-orange-500/[0.02] to-transparent border border-amber-500/20 rounded-2xl p-5 shadow-sm font-mono relative overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-center flex-shrink-0 animate-pulse">
              <span className="text-2xl">🏆</span>
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Current Leader</h3>
              <p className="text-xl font-extrabold text-slate-800 uppercase tracking-wider mt-1">{topTeam.team_name}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                {topTeam.points} points • {topTeam.wins} wins • GD: {topTeam.goal_difference > 0 ? '+' : ''}{topTeam.goal_difference}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
