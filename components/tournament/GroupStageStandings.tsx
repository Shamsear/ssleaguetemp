'use client';

import { useState } from 'react';

interface GroupTeam {
  team_id: string;
  team_name: string;
  team_logo?: string;
  group: string;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  position: number;
  qualifies: boolean;
}

interface GroupStageStandingsProps {
  groupStandings: Record<string, GroupTeam[]>;
  currentUserId?: string;
}

export default function GroupStageStandings({ groupStandings, currentUserId }: GroupStageStandingsProps) {
  const groups = Object.keys(groupStandings).sort();
  const [selectedGroup, setSelectedGroup] = useState<string>(groups[0] || 'A');

  if (groups.length === 0) {
    return (
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-8 text-center font-mono shadow-sm">
        <span className="text-6xl mb-4 block">🏆</span>
        <h3 className="text-lg font-medium text-gray-600 mb-2">No Group Stage Data Available</h3>
        <p className="text-sm text-gray-500">Group standings will appear once matches are completed</p>
      </div>
    );
  }

  const currentGroupStandings = groupStandings[selectedGroup] || [];

  return (
    <div className="space-y-6">
      {/* Group Tabs */}
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm font-mono">
        <div className="mb-4">
          <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">Group Stage</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase">Select a group to view standings</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <button
              key={group}
              onClick={() => setSelectedGroup(group)}
              className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer ${
                selectedGroup === group
                  ? 'bg-slate-800 text-amber-400 border border-slate-900'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-850 hover:bg-slate-100 border border-slate-200/30'
              }`}
            >
              Group {group}
            </button>
          ))}
        </div>
      </div>

      {/* Group Standings Table */}
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl overflow-hidden font-mono shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center">
              <span className="text-xl">🏆</span>
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Group {selectedGroup} Standings</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{currentGroupStandings.length} teams</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/50 font-mono text-[10px] text-slate-400 font-bold uppercase tracking-wider text-center">
              <tr>
                <th className="px-6 py-4 text-left font-bold uppercase tracking-wider">
                  Pos
                </th>
                <th className="px-6 py-4 text-left font-bold uppercase tracking-wider">
                  Team
                </th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider">
                  MP
                </th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider">
                  W
                </th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider">
                  D
                </th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider">
                  L
                </th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider">
                  GF
                </th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider">
                  GA
                </th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider">
                  GD
                </th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider text-amber-600">
                  PTS
                </th>
              </tr>
            </thead>
            <tbody className="bg-white/40 divide-y divide-slate-100/60">
              {currentGroupStandings.map((team) => {
                const isCurrentUser = currentUserId && team.team_id === currentUserId;
                const qualifyColor = team.qualifies ? 'border-l-4 border-l-emerald-500 bg-emerald-500/[0.005]' : '';

                return (
                  <tr 
                    key={team.team_id} 
                    className={`hover:bg-slate-50/50 transition-colors text-center ${qualifyColor} ${
                      isCurrentUser ? 'ring-1 ring-amber-500 bg-amber-500/[0.02]' : ''
                    }`}
                  >
                    <td className="px-6 py-3.5 whitespace-nowrap text-left text-xs font-black text-slate-800">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${
                          team.position === 1 ? 'text-amber-500' :
                          team.position === 2 ? 'text-slate-500' :
                          'text-slate-800'
                        }`}>
                          #{team.position}
                        </span>
                        {team.qualifies && (
                          <span className="text-emerald-650 font-black" title="Qualifies for knockout stage">
                            ↑
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-left">
                      <div className="flex items-center gap-3">
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
                        
                        <div>
                          <div className="text-xs sm:text-sm font-extrabold text-slate-850 truncate uppercase tracking-tight">
                            {team.team_name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 font-mono">
                            {isCurrentUser && (
                              <span className="text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200/40 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                You
                              </span>
                            )}
                            {team.qualifies && (
                              <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-250/30 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                Qualified
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-xs font-bold text-slate-650">
                      {team.matches_played}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-xs font-extrabold text-emerald-600">
                      {team.wins}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-xs font-bold text-slate-500">
                      {team.draws}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-xs font-extrabold text-rose-600">
                      {team.losses}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-xs font-bold text-slate-650">
                      {team.goals_for}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-xs font-bold text-slate-650">
                      {team.goals_against}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap">
                      <span className={`text-xs font-extrabold ${
                        team.goal_difference > 0 ? 'text-emerald-600' :
                        team.goal_difference < 0 ? 'text-rose-600' :
                        'text-slate-650'
                      }`}>
                        {team.goal_difference > 0 ? '+' : ''}{team.goal_difference}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap">
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

        <div className="px-5 py-3 bg-slate-50/50 border-t border-slate-100 font-mono">
          <p className="text-[10px] text-slate-500 uppercase font-bold flex items-center">
            <span className="text-emerald-650 mr-1.5 font-black">↑</span>
            Teams with green borders qualify for the knockout stage
          </p>
        </div>
      </div>

      {/* All Groups Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((group) => {
          const teams = groupStandings[group];
          
          return (
            <div 
              key={group}
              className={`console-card bg-white border cursor-pointer transition-all relative overflow-hidden p-4 shadow-sm hover:border-amber-400/40 duration-200 ${
                selectedGroup === group 
                  ? 'border-amber-500/30 scale-[1.02] shadow-md shadow-amber-500/5' 
                  : 'border-slate-200/60'
              }`}
              onClick={() => setSelectedGroup(group)}
            >
              <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2 font-mono">
                <span className="text-lg">🏆</span>
                Group {group}
              </h4>
              <div className="space-y-2 font-mono">
                {teams.slice(0, 4).map((team, index) => (
                  <div 
                    key={team.team_id}
                    className={`flex items-center justify-between p-2 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-colors duration-150 ${
                      team.qualifies ? 'bg-emerald-50/40 border-emerald-100/30 text-emerald-750' : 'bg-slate-50/50 border-slate-200/20 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-slate-400 w-4 font-black">#{index + 1}</span>
                      <span className="truncate max-w-[120px] font-extrabold">
                        {team.team_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 font-black">
                      <span>{team.points} PTS</span>
                      {team.qualifies && <span className="text-emerald-600">✓</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm font-mono relative overflow-hidden">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-lg">📊</span>
          </div>
          <div>
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-2">Group Stage Legend</h3>
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
    </div>
  );
}
