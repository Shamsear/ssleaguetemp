'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronRight, Layers, TrendingUp, Users, Trophy, Calendar, Activity, CheckCircle, Award, Info, Star } from 'lucide-react';

interface Team {
  team: {
    id: string;
    name: string;
    logoUrl?: string;
    balance: number;
    dollar_balance?: number;
    euro_balance?: number;
  };
  totalPlayers: number;
  totalValue: number;
  avgRating: number;
  positionBreakdown: { [key: string]: number };
  realPlayerSpent?: number;
  footballSpent?: number;
}

interface Match {
  id: string;
  round_number: number;
  leg: string;
  match_number: number;
  status: string;
  result: string;
  home_team_name: string;
  away_team_name: string;
  home_score?: number;
  away_score?: number;
  updated_at?: any;
  created_at?: any;
}

export default function TeamManagementClient({
  teams,
  seasonName,
  recentMatches,
}: {
  teams: Team[];
  seasonName: string;
  recentMatches: Match[];
}) {
  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Users className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">SYSTEM CONTROL</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Team Management
              </h1>
              <p className="text-xs text-slate-550 font-mono mt-1">
                Complete control center for teams and tournament settings.
              </p>
            </div>
          </div>
          {seasonName && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-extrabold uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5 text-amber-600" />
              {seasonName}
            </span>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Quick Actions (takes 2 columns) */}
          <div className="lg:col-span-2">
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm flex flex-col h-full">
              <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-550" /> Quick Actions
                </h2>
                <span className="text-[10px] bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md font-bold uppercase tracking-wide border border-slate-200/50">
                  4 Modules
                </span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                <Link 
                  href="/dashboard/committee/team-management/categories" 
                  className="group relative bg-slate-50 hover:bg-amber-50/20 rounded-2xl p-5 border border-slate-200 hover:border-amber-500/50 transition-all duration-300 shadow-sm hover:shadow-md flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2.5 rounded-xl bg-slate-800 text-white shadow-sm transition-transform group-hover:scale-105">
                        <Layers className="w-5 h-5 text-amber-400" />
                      </div>
                      <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wide group-hover:text-amber-600 transition-colors">Categories</h3>
                    </div>
                    <p className="text-xs text-slate-550 font-mono mt-2 leading-relaxed">
                      Manage player categories, colors, and point configurations.
                    </p>
                  </div>
                  <div className="flex justify-end mt-4">
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </Link>

                <Link 
                  href="/dashboard/committee/team-management/team-standings" 
                  className="group relative bg-slate-50 hover:bg-amber-50/20 rounded-2xl p-5 border border-slate-200 hover:border-amber-500/50 transition-all duration-300 shadow-sm hover:shadow-md flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2.5 rounded-xl bg-slate-800 text-white shadow-sm transition-transform group-hover:scale-105">
                        <TrendingUp className="w-5 h-5 text-amber-400" />
                      </div>
                      <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wide group-hover:text-amber-600 transition-colors">Team Standings</h3>
                    </div>
                    <p className="text-xs text-slate-550 font-mono mt-2 leading-relaxed">
                      View the league table standings and real-time team rankings.
                    </p>
                  </div>
                  <div className="flex justify-end mt-4">
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </Link>

                <Link 
                  href="/dashboard/committee/team-management/player-stats" 
                  className="group relative bg-slate-50 hover:bg-amber-50/20 rounded-2xl p-5 border border-slate-200 hover:border-amber-500/50 transition-all duration-300 shadow-sm hover:shadow-md flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2.5 rounded-xl bg-slate-800 text-white shadow-sm transition-transform group-hover:scale-105">
                        <Users className="w-5 h-5 text-amber-400" />
                      </div>
                      <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wide group-hover:text-amber-600 transition-colors">Player Stats</h3>
                    </div>
                    <p className="text-xs text-slate-550 font-mono mt-2 leading-relaxed">
                      View and filter individual player performance statistics.
                    </p>
                  </div>
                  <div className="flex justify-end mt-4">
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </Link>

                <Link 
                  href="/dashboard/committee/team-management/tournament" 
                  className="group relative bg-slate-50 hover:bg-amber-50/20 rounded-2xl p-5 border border-slate-200 hover:border-amber-500/50 transition-all duration-300 shadow-sm hover:shadow-md flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2.5 rounded-xl bg-slate-800 text-white shadow-sm transition-transform group-hover:scale-105">
                        <Trophy className="w-5 h-5 text-amber-400" />
                      </div>
                      <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wide group-hover:text-amber-600 transition-colors">Tournament</h3>
                    </div>
                    <p className="text-xs text-slate-550 font-mono mt-2 leading-relaxed">
                      Manage match fixtures, leg scores, and tournament operations.
                    </p>
                  </div>
                  <div className="flex justify-end mt-4">
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </Link>
              </div>
            </div>
          </div>

          {/* Overview Card (takes 1 column) */}
          <div className="lg:col-span-1">
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm flex flex-col h-full">
              <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-550" /> Overview
                </h2>
              </div>
              
              <div className="space-y-4 flex-grow flex flex-col justify-between">
                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total Teams</p>
                    <p className="text-2xl font-black text-slate-800 mt-1 font-mono">{teams.length}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                    <Users className="w-5 h-5 text-slate-600" />
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total Players</p>
                    <p className="text-2xl font-black text-slate-800 mt-1 font-mono">
                      {teams.reduce((sum, t) => sum + t.totalPlayers, 0)}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                    <Users className="w-5 h-5 text-slate-600" />
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Avg Rating</p>
                    <p className="text-2xl font-black text-amber-500 mt-1 font-mono">
                      <Star className="w-4 h-4 inline-block text-amber-400 fill-amber-400 mr-1 align-text-bottom" /> {teams.length > 0 
                        ? (teams.reduce((sum, t) => sum + t.avgRating, 0) / teams.length).toFixed(1)
                        : '0.0'
                      }
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                    <Award className="w-5 h-5 text-amber-500" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Matches Section */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-550" /> Recent Matches
            </h2>
            <Link 
              href="/dashboard/committee/team-management/tournament"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-mono text-xs uppercase font-extrabold shadow-sm transition-all cursor-pointer"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" /> View All Matches
            </Link>
          </div>
          
          {recentMatches.length === 0 ? (
            <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-2xl">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-4">
                <Info className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">
                No Completed Matches Yet
              </h3>
              <p className="text-xs text-slate-550 font-mono">
                Completed match details and leg scores will populate here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {recentMatches.map((match) => (
                <div key={match.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 hover:shadow-sm transition-all duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-slate-800 text-white px-2 py-0.5 rounded uppercase font-black tracking-wider shadow-sm">
                        Round {match.round_number}
                      </span>
                      <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded uppercase font-black tracking-wider">
                        {match.leg === 'first' ? '1st Leg' : '2nd Leg'} · Match {match.match_number}
                      </span>
                    </div>
                    <span className="flex-shrink-0 flex items-center gap-1 text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 rounded uppercase font-black tracking-wider">
                      <CheckCircle className="w-3 h-3 text-emerald-500" /> Completed
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className={`flex-1 text-right truncate ${
                        match.result === 'home_win' ? 'font-black text-amber-600' : 'text-slate-700'
                      }`}>
                        <span className="text-xs sm:text-sm font-bold uppercase tracking-wider">{match.home_team_name}</span>
                        {match.home_score !== undefined && (
                          <span className="ml-3 text-xl font-extrabold font-mono">{match.home_score}</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-450 font-black px-2 uppercase font-mono">VS</span>
                      <div className={`flex-1 text-left truncate ${
                        match.result === 'away_win' ? 'font-black text-amber-600' : 'text-slate-700'
                      }`}>
                        {match.away_score !== undefined && (
                          <span className="mr-3 text-xl font-extrabold font-mono">{match.away_score}</span>
                        )}
                        <span className="text-xs sm:text-sm font-bold uppercase tracking-wider">{match.away_team_name}</span>
                      </div>
                    </div>
                    {match.result === 'draw' && (
                      <span className="ml-4 px-2 py-0.5 bg-slate-200 text-slate-800 text-[10px] rounded font-black tracking-wider uppercase">DRAW</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Team Overview Section */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
            <h2 className="text-sm font-extrabold text-slate-950 uppercase tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-550" /> All Teams ({teams.length})
            </h2>
          </div>
          
          {teams.length === 0 ? (
            <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-2xl">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-4">
                <Info className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">
                No Registered Teams Yet
              </h3>
              <p className="text-xs text-slate-550 font-mono">
                No teams have registered for the season yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {teams.map((teamData) => (
                <div
                  key={teamData.team.id}
                  className="bg-slate-50 hover:bg-white border border-slate-200 hover:border-amber-500/30 transition-all duration-300 rounded-2xl p-5 hover:shadow-md flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-4 mb-4">
                      {teamData.team.logoUrl ? (
                        <img
                          src={teamData.team.logoUrl}
                          alt={teamData.team.name}
                          className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-sm"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center shadow-sm">
                          <span className="text-base font-extrabold text-amber-400 uppercase">
                            {teamData.team.name.charAt(0)}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-extrabold text-slate-900 truncate text-sm uppercase tracking-wide">
                          {teamData.team.name}
                        </h3>
                        <span className="inline-flex items-center text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                          {teamData.totalPlayers} Players
                        </span>
                      </div>
                    </div>
                    
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center justify-between text-xs bg-white border border-slate-200/60 rounded-xl p-2.5">
                        <span className="text-slate-600 font-medium">Real Players Spent</span>
                        <span className="font-extrabold text-slate-800">
                          ${(teamData.realPlayerSpent || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs bg-white border border-slate-200/60 rounded-xl p-2.5">
                        <span className="text-slate-600 font-medium">Football Spent</span>
                        <span className="font-extrabold text-slate-800">
                          €{(teamData.footballSpent || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs bg-white border border-slate-200/60 rounded-xl p-2.5">
                        <span className="text-slate-600 font-medium">Average Rating</span>
                        <span className="font-extrabold text-amber-600 flex items-center gap-0.5">
                          <Star className="w-4 h-4 inline-block text-amber-400 fill-amber-400 mr-1 align-text-bottom" /> {teamData.avgRating.toFixed(1)}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div className="flex flex-col gap-0.5 bg-emerald-50/20 border border-emerald-100 rounded-xl p-2.5">
                          <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider">$ Balance</span>
                          <span className="font-extrabold text-emerald-800 text-xs font-mono">
                            ${(teamData.team.dollar_balance || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 bg-emerald-50/20 border border-emerald-100 rounded-xl p-2.5">
                          <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider">€ Balance</span>
                          <span className="font-extrabold text-emerald-800 text-xs font-mono">
                            €{(teamData.team.euro_balance || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-slate-200/80">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-2">Position Breakdown</span>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(teamData.positionBreakdown)
                        .filter(([_, count]) => count > 0)
                        .map(([position, count]) => (
                          <span
                            key={position}
                            className="text-[9px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-md font-bold uppercase transition-colors"
                          >
                            {position}: {count}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
