'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { 
  Trophy, ArrowLeft, Crown, Star, Shield, Award, Calendar, 
  ChevronRight, Users, User, Flame, RefreshCw, Zap, Medal, Filter 
} from 'lucide-react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { useAuth } from '@/contexts/AuthContext';
import AuthGuard from '@/components/auth/AuthGuard';

interface PerformersData {
  available_rounds: number[];
  available_weeks: Array<{
    week: number;
    label: string;
    startRound: number;
    endRound: number;
  }>;
  target_round: number;
  target_week: {
    week: number;
    label: string;
    startRound: number;
    endRound: number;
  };
  round_performers: {
    team_of_the_day: Array<{
      team_id: string;
      team_name: string;
      owner_name: string;
      player_points: number;
      passive_points: number;
      total_round_points: number;
      total_goals: number;
      clean_sheets: number;
      supporting_team_name?: string;
    }>;
    supporting_team_of_the_day: Array<{
      fantasy_team_id: string;
      fantasy_team_name: string;
      owner_name: string;
      real_team_id: string;
      real_team_name: string;
      supporting_points: number;
      bonus_breakdown?: any;
    }>;
    player_of_the_day_drafted: Array<{
      real_player_id: string;
      player_name: string;
      fantasy_team_id: string;
      fantasy_team_name: string;
      fantasy_owner_name?: string;
      position?: string;
      real_team_name?: string;
      goals_scored: number;
      base_points: number;
      total_points: number;
      is_captain?: boolean;
      is_vice_captain?: boolean;
    }>;
    player_of_the_day_free_agent: Array<{
      real_player_id: string;
      player_name: string;
      position?: string;
      real_team_name?: string;
      goals_scored: number;
      base_points: number;
      total_points: number;
    }>;
  };
  week_performers: {
    team_of_the_week: Array<{
      team_id: string;
      team_name: string;
      owner_name: string;
      player_points: number;
      passive_points: number;
      total_week_points: number;
      total_goals: number;
      clean_sheets: number;
    }>;
    supporting_team_of_the_week: Array<{
      fantasy_team_id: string;
      fantasy_team_name: string;
      owner_name: string;
      real_team_name: string;
      supporting_points: number;
    }>;
    player_of_the_week_drafted: Array<{
      real_player_id: string;
      player_name: string;
      fantasy_team_id: string;
      fantasy_team_name: string;
      fantasy_owner_name?: string;
      position?: string;
      real_team_name?: string;
      total_goals: number;
      player_base_points: number;
      player_total_points: number;
    }>;
    player_of_the_week_free_agent: Array<{
      real_player_id: string;
      player_name: string;
      position?: string;
      real_team_name?: string;
      total_goals: number;
      player_base_points: number;
      player_total_points: number;
    }>;
  };
}

export default function CommitteePerformersPage() {
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;
  const { user, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<'round' | 'week'>('round');
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [data, setData] = useState<PerformersData | null>(null);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  const toggleExpandTeam = (tId: string) => {
    setExpandedTeamId(prev => prev === tId ? null : tId);
  };

  const loadData = async (rd?: number | null, wk?: number) => {
    if (!leagueId) return;
    setIsLoading(true);
    try {
      let url = `/api/fantasy/performers?league_id=${encodeURIComponent(leagueId)}`;
      if (rd) url += `&round=${rd}`;
      if (wk) url += `&week=${wk}`;

      const res = await fetchWithTokenRefresh(url);
      if (!res.ok) throw new Error('Failed to load performers data');

      const json: PerformersData = await res.json();
      setData(json);

      if (rd === undefined || rd === null) {
        setSelectedRound(json.target_round);
      }
      if (wk === undefined) {
        setSelectedWeek(json.target_week?.week || 1);
      }
    } catch (err) {
      console.error('Error loading performers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user && leagueId) {
      loadData(selectedRound, selectedWeek);
    }
  }, [user, leagueId]);

  const handleRoundChange = (rd: number) => {
    setSelectedRound(rd);
    loadData(rd, selectedWeek);
  };

  const handleWeekChange = (wk: number) => {
    setSelectedWeek(wk);
    loadData(selectedRound, wk);
  };

  if (authLoading || (!data && isLoading)) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-extrabold">Loading fantasy performers breakdown...</p>
        </div>
      </div>
    );
  }

  const roundPerf = data?.round_performers;
  const weekPerf = data?.week_performers;

  // Winner highlights
  const todWinner = roundPerf?.team_of_the_day?.[0];
  const stodWinner = roundPerf?.supporting_team_of_the_day?.[0];
  const podDraftedWinner = roundPerf?.player_of_the_day_drafted?.[0];
  const podFreeAgentWinner = roundPerf?.player_of_the_day_free_agent?.[0];

  const towWinner = weekPerf?.team_of_the_week?.[0];
  const stowWinner = weekPerf?.supporting_team_of_the_week?.[0];
  const powDraftedWinner = weekPerf?.player_of_the_week_drafted?.[0];
  const powFreeAgentWinner = weekPerf?.player_of_the_week_free_agent?.[0];

  return (
    <AuthGuard requiredRole="committee_admin">
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
        <div className="max-w-6xl mx-auto relative z-10 space-y-6">
          
          {/* Navigation */}
          <div>
            <Link
              href={`/dashboard/committee/fantasy/${leagueId}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Fantasy Console
            </Link>
          </div>

          {/* Header Banner */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">FANTASY COMMITTEE CONSOLE</span>
                <span className="px-2 py-0.5 bg-amber-100 border border-amber-300 text-amber-800 text-[9px] font-black rounded-md">
                  ROUND &amp; WEEKLY BREAKDOWN
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1 uppercase flex items-center gap-3">
                <Trophy className="w-7 h-7 text-amber-500" />
                Fantasy Performers Standings
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1 uppercase">
                League: <span className="text-amber-600 font-bold">{leagueId}</span> • Team &amp; Player Scores per Round &amp; 6-Round Week Block
              </p>
            </div>

            <button
              onClick={() => loadData(selectedRound, selectedWeek)}
              disabled={isLoading}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-200 flex items-center gap-2 transition cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>

          {/* Main Mode Tabs */}
          <div className="console-card bg-white border border-slate-200/60 p-3 rounded-3xl shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('round')}
                className={`px-5 py-3 rounded-2xl font-mono text-xs font-bold uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                  activeTab === 'round'
                    ? 'bg-slate-900 text-amber-400 border border-slate-950 shadow-md'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                }`}
              >
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>Round Breakdown (TOD / POD)</span>
              </button>

              <button
                onClick={() => setActiveTab('week')}
                className={`px-5 py-3 rounded-2xl font-mono text-xs font-bold uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                  activeTab === 'week'
                    ? 'bg-slate-900 text-amber-400 border border-slate-950 shadow-md'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                }`}
              >
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Weekly 6-Round Block (TOW / POW)</span>
              </button>
            </div>

            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-3 hidden md:inline">
              Includes Squad Pts + Supporting Team Bonus
            </span>
          </div>

          {/* Selector Pills */}
          {activeTab === 'round' ? (
            <div className="console-card bg-white border border-slate-200/60 p-4 rounded-3xl shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
                  <Filter className="w-4 h-4 text-amber-500" /> SELECT DRAFT / FIXTURE ROUND:
                </span>
                <span className="text-[10px] font-bold text-amber-600 uppercase">
                  Currently Viewing Round {data?.target_round}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {data?.available_rounds?.map((rd) => {
                  const isSelected = selectedRound === rd;
                  return (
                    <button
                      key={rd}
                      onClick={() => handleRoundChange(rd)}
                      className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 font-extrabold border border-amber-600 shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/60'
                      }`}
                    >
                      Round {rd}
                    </button>
                  );
                })}

                {(!data?.available_rounds || data.available_rounds.length === 0) && (
                  <span className="text-xs text-slate-400 italic">No completed rounds recorded yet</span>
                )}
              </div>
            </div>
          ) : (
            <div className="console-card bg-white border border-slate-200/60 p-4 rounded-3xl shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
                  <Filter className="w-4 h-4 text-amber-500" /> SELECT 6-ROUND WEEK BLOCK:
                </span>
                <span className="text-[10px] font-bold text-amber-600 uppercase">
                  {data?.target_week?.label}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {data?.available_weeks?.map((wk) => {
                  const isSelected = selectedWeek === wk.week;
                  return (
                    <button
                      key={wk.week}
                      onClick={() => handleWeekChange(wk.week)}
                      className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-2 ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 font-extrabold border border-amber-600 shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/60'
                      }`}
                    >
                      <span>{wk.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── ROUND VIEW CONTENT ── */}
          {activeTab === 'round' && (
            <div className="space-y-6">
              
              {/* Winner Highlight Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* TOD Winner Card */}
                <div className="console-card bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 p-5 rounded-3xl shadow-md space-y-2 border border-amber-600 relative overflow-hidden">
                  <Crown className="w-20 h-20 text-slate-950/10 absolute -right-3 -bottom-3 pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 bg-slate-950 text-amber-400 text-[9px] font-black rounded-lg uppercase tracking-wider">
                      TEAM OF THE DAY (R{data?.target_round})
                    </span>
                    <Crown className="w-5 h-5 text-slate-950 fill-amber-300" />
                  </div>
                  {todWinner ? (
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight line-clamp-1">{todWinner.team_name}</h3>
                      <p className="text-[11px] font-extrabold opacity-80 uppercase">Owner: {todWinner.owner_name}</p>
                      <div className="mt-3 pt-2 border-t border-slate-950/15 flex items-baseline justify-between">
                        <span className="text-[10px] font-black uppercase">Total Score:</span>
                        <span className="text-2xl font-black">₹{todWinner.total_round_points} Pts</span>
                      </div>
                      <p className="text-[9px] font-extrabold opacity-75 mt-0.5">
                        Squad Pts: {todWinner.player_points} | Supporting Pts: {todWinner.passive_points}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs font-bold italic opacity-75">No team scores recorded for this round.</p>
                  )}
                </div>

                {/* Supporting TOD Winner Card */}
                <div className="console-card bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 rounded-3xl shadow-md space-y-2 border border-slate-950 relative overflow-hidden">
                  <Shield className="w-20 h-20 text-white/5 absolute -right-3 -bottom-3 pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 bg-amber-500 text-slate-950 text-[9px] font-black rounded-lg uppercase tracking-wider">
                      SUPPORTING TOD (R{data?.target_round})
                    </span>
                    <Shield className="w-5 h-5 text-amber-400" />
                  </div>
                  {stodWinner ? (
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight text-amber-400 line-clamp-1">{stodWinner.real_team_name}</h3>
                      <p className="text-[11px] font-bold text-slate-300 uppercase">Owner Team: {stodWinner.fantasy_team_name}</p>
                      <div className="mt-3 pt-2 border-t border-slate-700 flex items-baseline justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Passive Bonus:</span>
                        <span className="text-2xl font-black text-emerald-400">+{stodWinner.supporting_points} Pts</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-bold italic text-slate-400">No supporting team scores for this round.</p>
                  )}
                </div>

                {/* Drafted POD Winner Card */}
                <div className="console-card bg-white border border-slate-200/60 p-5 rounded-3xl shadow-sm space-y-2 relative overflow-hidden">
                  <Star className="w-20 h-20 text-amber-500/10 absolute -right-3 -bottom-3 pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-black rounded-lg uppercase tracking-wider">
                      DRAFTED POD (R{data?.target_round})
                    </span>
                    <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
                  </div>
                  {podDraftedWinner ? (
                    <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight line-clamp-1">{podDraftedWinner.player_name}</h3>
                      <p className="text-[11px] font-bold text-amber-700 uppercase">Squad: {podDraftedWinner.fantasy_team_name}</p>
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-baseline justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Score:</span>
                        <span className="text-2xl font-black text-amber-600">{podDraftedWinner.base_points} Pts</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-bold italic text-slate-400">No drafted player scores for this round.</p>
                  )}
                </div>

                {/* Free Agent POD Winner Card */}
                <div className="console-card bg-white border border-slate-200/60 p-5 rounded-3xl shadow-sm space-y-2 relative overflow-hidden">
                  <User className="w-20 h-20 text-blue-500/10 absolute -right-3 -bottom-3 pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 border border-blue-300 text-[9px] font-black rounded-lg uppercase tracking-wider">
                      FREE AGENT POD (R{data?.target_round})
                    </span>
                    <User className="w-5 h-5 text-blue-500" />
                  </div>
                  {podFreeAgentWinner ? (
                    <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight line-clamp-1">{podFreeAgentWinner.player_name}</h3>
                      <p className="text-[11px] font-bold text-blue-700 uppercase">Un-drafted (Free Agent)</p>
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-baseline justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Score:</span>
                        <span className="text-2xl font-black text-blue-600">{podFreeAgentWinner.base_points} Pts</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-bold italic text-slate-400">No free agent player scores for this round.</p>
                  )}
                </div>

              </div>

              {/* Team of the Day Standings Table */}
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-500" /> Team of the Day (TOD) Round {data?.target_round} Full Standings
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Ranked by Total Score (Player Pts + Supporting Pts)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-bold font-mono">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b border-slate-200/60">
                      <tr>
                        <th className="px-6 py-3.5">Rank</th>
                        <th className="px-6 py-3.5">Fantasy Team</th>
                        <th className="px-6 py-3.5">Owner</th>
                        <th className="px-6 py-3.5">Supporting Team</th>
                        <th className="px-6 py-3.5 text-center">Squad Pts</th>
                        <th className="px-6 py-3.5 text-center">Supporting Pts</th>
                        <th className="px-6 py-3.5 text-right">Total Round Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {roundPerf?.team_of_the_day?.map((t: any, idx: number) => {
                        const isExpanded = expandedTeamId === t.team_id;
                        return (
                          <React.Fragment key={t.team_id}>
                            <tr 
                              onClick={() => toggleExpandTeam(t.team_id)}
                              className={`hover:bg-slate-50/80 transition cursor-pointer ${idx === 0 ? 'bg-amber-50/40 font-extrabold' : ''}`}
                            >
                              <td className="px-6 py-3.5">
                                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${
                                  idx === 0 ? 'bg-amber-500 text-slate-950' : idx === 1 ? 'bg-slate-300 text-slate-900' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {idx + 1}
                                </span>
                              </td>
                              <td className="px-6 py-3.5 text-slate-900 font-extrabold flex items-center gap-2">
                                <span>{t.team_name}</span>
                                {idx === 0 && <Crown className="w-4 h-4 text-amber-500 fill-amber-300 shrink-0" />}
                              </td>
                              <td className="px-6 py-3.5 text-slate-600">{t.owner_name}</td>
                              <td className="px-6 py-3.5 text-emerald-700 font-bold">
                                {t.supporting_team_name || 'N/A'}
                              </td>
                              <td className="px-6 py-3.5 text-center text-slate-700">{t.player_points} Pts</td>
                              <td className="px-6 py-3.5 text-center text-emerald-700">+{t.passive_points} Pts</td>
                              <td className="px-6 py-3.5 text-right text-amber-600 font-black text-sm flex items-center justify-end gap-2">
                                <span>₹{t.total_round_points} Pts</span>
                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </td>
                            </tr>

                            {/* Itemized Round Breakdown Drawer */}
                            {isExpanded && (
                              <tr className="bg-slate-50/90 border-b border-slate-200/80">
                                <td colSpan={7} className="p-4 space-y-3">
                                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                    <span className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
                                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                                      Round {data?.target_round} Breakdown for {t.team_name}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                                      Owner: {t.owner_name}
                                    </span>
                                  </div>

                                  {/* Squad Player Breakdown */}
                                  <div className="space-y-2">
                                    <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                      Squad Players Performance (Round {data?.target_round})
                                    </h5>
                                    {(!t.players || t.players.length === 0) ? (
                                      <p className="text-[10px] text-slate-400 italic">No player points recorded for Round {data?.target_round}</p>
                                    ) : (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {t.players.map((p: any) => {
                                          const bd = typeof p.points_breakdown === 'string' ? JSON.parse(p.points_breakdown || '{}') : (p.points_breakdown || {});
                                          return (
                                            <div key={p.real_player_id} className="bg-white border border-slate-200 p-2.5 rounded-xl space-y-1.5 shadow-sm">
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                  <span className="font-black text-slate-900 text-xs truncate">{p.player_name}</span>
                                                  {p.is_captain && <span className="px-1.5 py-0.5 bg-amber-500 text-slate-950 font-black text-[9px] rounded uppercase">Captain (2x)</span>}
                                                  {p.is_vice_captain && <span className="px-1.5 py-0.5 bg-slate-700 text-amber-300 font-black text-[9px] rounded uppercase">VC</span>}
                                                </div>
                                                <span className="font-black text-indigo-600 text-xs">{p.total_points} Pts</span>
                                              </div>

                                              {/* Itemized Chips */}
                                              <div className="flex flex-wrap items-center gap-1 text-[9px] font-bold">
                                                {bd.match_played > 0 && <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">Played +{bd.match_played}</span>}
                                                {bd.goals > 0 && <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">Goals +{bd.goals}</span>}
                                                {bd.result !== undefined && bd.result !== 0 && (
                                                  <span className={`${bd.result > 0 ? 'bg-indigo-100 text-indigo-800' : 'bg-rose-100 text-rose-800'} px-1.5 py-0.5 rounded`}>
                                                    Result {bd.result > 0 ? `+${bd.result}` : bd.result}
                                                  </span>
                                                )}
                                                {bd.clean_sheet > 0 && <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">CS +{bd.clean_sheet}</span>}
                                                {bd.motm > 0 && <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">MOTM +{bd.motm}</span>}
                                                {bd.hat_trick > 0 && <span className="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">Hat-Trick +{bd.hat_trick}</span>}
                                                {bd.fines < 0 && <span className="bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">Fines {bd.fines}</span>}
                                                {bd.substitution < 0 && <span className="bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">Sub {bd.substitution}</span>}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>

                                  {/* Supporting Team Breakdown */}
                                  <div className="space-y-1.5 pt-2 border-t border-slate-200">
                                    <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-500">
                                      <span>Supporting Team ({t.supporting_team_name || 'N/A'}) — Round {data?.target_round}</span>
                                      <span className="text-emerald-700 font-black">+{t.passive_points} Pts</span>
                                    </div>
                                    {t.passive_breakdown ? (
                                      <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-bold">
                                        {Object.entries(typeof t.passive_breakdown === 'string' ? JSON.parse(t.passive_breakdown) : t.passive_breakdown).map(([k, v]: [string, any]) => (
                                          <span key={k} className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded-lg uppercase">
                                            {k.replace(/_/g, ' ')}: {Number(v) > 0 ? `+${v}` : v} pts
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-[10px] text-slate-400 italic">No supporting team bonus for Round {data?.target_round}</p>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}

                      {(!roundPerf?.team_of_the_day || roundPerf.team_of_the_day.length === 0) && (
                        <tr>
                          <td colSpan={7} className="px-6 py-8 text-center text-slate-400 text-xs font-bold uppercase italic">
                            No team points calculated for Round {data?.target_round}.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Player of the Day Tables: Drafted vs Free Agents */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Drafted Player of the Day */}
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-300" /> Drafted Player of the Day (POD)
                    </h3>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                      Round {data?.target_round}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-bold font-mono">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b border-slate-200/60">
                        <tr>
                          <th className="px-4 py-3">Rank</th>
                          <th className="px-4 py-3">Player Name</th>
                          <th className="px-4 py-3">Fantasy Team</th>
                          <th className="px-4 py-3 text-right">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {roundPerf?.player_of_the_day_drafted?.map((p, idx) => (
                          <tr key={p.real_player_id} className={`hover:bg-slate-50/60 transition ${idx === 0 ? 'bg-amber-50/40 font-extrabold' : ''}`}>
                            <td className="px-4 py-3">
                              <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${
                                idx === 0 ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {idx + 1}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-900 font-extrabold">{p.player_name}</td>
                            <td className="px-4 py-3 text-amber-700">{p.fantasy_team_name}</td>
                            <td className="px-4 py-3 text-right text-amber-600 font-black">
                              {p.base_points} Pts
                            </td>
                          </tr>
                        ))}

                        {(!roundPerf?.player_of_the_day_drafted || roundPerf.player_of_the_day_drafted.length === 0) && (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-xs font-bold uppercase italic">
                              No drafted player scores for Round {data?.target_round}.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Free Agent Player of the Day */}
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
                      <User className="w-4 h-4 text-blue-500" /> Free Agent Player of the Day (Un-drafted)
                    </h3>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                      Round {data?.target_round}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-bold font-mono">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b border-slate-200/60">
                        <tr>
                          <th className="px-4 py-3">Rank</th>
                          <th className="px-4 py-3">Player Name</th>
                          <th className="px-4 py-3">Real Team</th>
                          <th className="px-4 py-3 text-right">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {roundPerf?.player_of_the_day_free_agent?.map((p, idx) => (
                          <tr key={p.real_player_id} className={`hover:bg-slate-50/60 transition ${idx === 0 ? 'bg-blue-50/40 font-extrabold' : ''}`}>
                            <td className="px-4 py-3">
                              <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${
                                idx === 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {idx + 1}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-900 font-extrabold">{p.player_name}</td>
                            <td className="px-4 py-3 text-slate-600">{p.real_team_name || 'N/A'}</td>
                            <td className="px-4 py-3 text-right text-blue-600 font-black">
                              {p.base_points} Pts
                            </td>
                          </tr>
                        ))}

                        {(!roundPerf?.player_of_the_day_free_agent || roundPerf.player_of_the_day_free_agent.length === 0) && (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-xs font-bold uppercase italic">
                              No un-drafted free agent scores for Round {data?.target_round}.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ── WEEK VIEW CONTENT (6-ROUND BLOCK) ── */}
          {activeTab === 'week' && (
            <div className="space-y-6">
              
              {/* Winner Highlight Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* TOW Winner Card */}
                <div className="console-card bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 p-5 rounded-3xl shadow-md space-y-2 border border-amber-600 relative overflow-hidden">
                  <Trophy className="w-20 h-20 text-slate-950/10 absolute -right-3 -bottom-3 pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 bg-slate-950 text-amber-400 text-[9px] font-black rounded-lg uppercase tracking-wider">
                      TEAM OF THE WEEK ({data?.target_week?.label})
                    </span>
                    <Trophy className="w-5 h-5 text-slate-950" />
                  </div>
                  {towWinner ? (
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight line-clamp-1">{towWinner.team_name}</h3>
                      <p className="text-[11px] font-extrabold opacity-80 uppercase">Owner: {towWinner.owner_name}</p>
                      <div className="mt-3 pt-2 border-t border-slate-950/15 flex items-baseline justify-between">
                        <span className="text-[10px] font-black uppercase">Week Score:</span>
                        <span className="text-2xl font-black">₹{towWinner.total_week_points} Pts</span>
                      </div>
                      <p className="text-[9px] font-extrabold opacity-75 mt-0.5">
                        Squad Pts: {towWinner.player_points} | Supporting Pts: {towWinner.passive_points}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs font-bold italic opacity-75">No week scores recorded.</p>
                  )}
                </div>

                {/* Supporting TOW Winner Card */}
                <div className="console-card bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 rounded-3xl shadow-md space-y-2 border border-slate-950 relative overflow-hidden">
                  <Shield className="w-20 h-20 text-white/5 absolute -right-3 -bottom-3 pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 bg-amber-500 text-slate-950 text-[9px] font-black rounded-lg uppercase tracking-wider">
                      SUPPORTING TOW ({data?.target_week?.label})
                    </span>
                    <Shield className="w-5 h-5 text-amber-400" />
                  </div>
                  {stowWinner ? (
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight text-amber-400 line-clamp-1">{stowWinner.real_team_name}</h3>
                      <p className="text-[11px] font-bold text-slate-300 uppercase">Owner Team: {stowWinner.fantasy_team_name}</p>
                      <div className="mt-3 pt-2 border-t border-slate-700 flex items-baseline justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Passive Bonus:</span>
                        <span className="text-2xl font-black text-emerald-400">+{stowWinner.supporting_points} Pts</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-bold italic text-slate-400">No supporting week scores.</p>
                  )}
                </div>

                {/* Drafted POW Winner Card */}
                <div className="console-card bg-white border border-slate-200/60 p-5 rounded-3xl shadow-sm space-y-2 relative overflow-hidden">
                  <Medal className="w-20 h-20 text-amber-500/10 absolute -right-3 -bottom-3 pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-black rounded-lg uppercase tracking-wider">
                      DRAFTED POW ({data?.target_week?.label})
                    </span>
                    <Medal className="w-5 h-5 text-amber-500" />
                  </div>
                  {powDraftedWinner ? (
                    <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight line-clamp-1">{powDraftedWinner.player_name}</h3>
                      <p className="text-[11px] font-bold text-amber-700 uppercase">Squad: {powDraftedWinner.fantasy_team_name}</p>
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-baseline justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Week Base Pts:</span>
                        <span className="text-2xl font-black text-amber-600">{powDraftedWinner.player_base_points} Pts</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-bold italic text-slate-400">No drafted player week scores.</p>
                  )}
                </div>

                {/* Free Agent POW Winner Card */}
                <div className="console-card bg-white border border-slate-200/60 p-5 rounded-3xl shadow-sm space-y-2 relative overflow-hidden">
                  <User className="w-20 h-20 text-blue-500/10 absolute -right-3 -bottom-3 pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 border border-blue-300 text-[9px] font-black rounded-lg uppercase tracking-wider">
                      FREE AGENT POW ({data?.target_week?.label})
                    </span>
                    <User className="w-5 h-5 text-blue-500" />
                  </div>
                  {powFreeAgentWinner ? (
                    <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight line-clamp-1">{powFreeAgentWinner.player_name}</h3>
                      <p className="text-[11px] font-bold text-blue-700 uppercase">Un-drafted (Free Agent)</p>
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-baseline justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Week Base Pts:</span>
                        <span className="text-2xl font-black text-blue-600">{powFreeAgentWinner.player_base_points} Pts</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-bold italic text-slate-400">No free agent player week scores.</p>
                  )}
                </div>

              </div>

              {/* Team of the Week Full Standings Table */}
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-500" /> Team of the Week (TOW) Full Standings ({data?.target_week?.label})
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Ranked by 6-Round Combined Total Score (Player Pts + Supporting Pts)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-bold font-mono">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b border-slate-200/60">
                      <tr>
                        <th className="px-6 py-3.5">Rank</th>
                        <th className="px-6 py-3.5">Fantasy Team</th>
                        <th className="px-6 py-3.5">Owner</th>
                        <th className="px-6 py-3.5 text-center">Squad Pts (6 Rds)</th>
                        <th className="px-6 py-3.5 text-center">Supporting Pts (6 Rds)</th>
                        <th className="px-6 py-3.5 text-right">Combined Week Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {weekPerf?.team_of_the_week?.map((t, idx) => (
                        <tr key={t.team_id} className={`hover:bg-slate-50/60 transition ${idx === 0 ? 'bg-amber-50/40 font-extrabold' : ''}`}>
                          <td className="px-6 py-3.5">
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${
                              idx === 0 ? 'bg-amber-500 text-slate-950' : idx === 1 ? 'bg-slate-300 text-slate-900' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {idx + 1}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-slate-900 font-extrabold flex items-center gap-2">
                            <span>{t.team_name}</span>
                            {idx === 0 && <Crown className="w-4 h-4 text-amber-500 fill-amber-300 shrink-0" />}
                          </td>
                          <td className="px-6 py-3.5 text-slate-600">{t.owner_name}</td>
                          <td className="px-6 py-3.5 text-center text-slate-700">{t.player_points} Pts</td>
                          <td className="px-6 py-3.5 text-center text-emerald-700">+{t.passive_points} Pts</td>
                          <td className="px-6 py-3.5 text-right text-amber-600 font-black text-sm">
                            ₹{t.total_week_points} Pts
                          </td>
                        </tr>
                      ))}

                      {(!weekPerf?.team_of_the_week || weekPerf.team_of_the_week.length === 0) && (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-xs font-bold uppercase italic">
                            No team points calculated for {data?.target_week?.label}.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Player of the Week Tables: Drafted vs Free Agents */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Drafted Player of the Week */}
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
                      <Medal className="w-4 h-4 text-amber-500" /> Drafted Player of the Week (POW)
                    </h3>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                      {data?.target_week?.label}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-bold font-mono">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b border-slate-200/60">
                        <tr>
                          <th className="px-4 py-3">Rank</th>
                          <th className="px-4 py-3">Player Name</th>
                          <th className="px-4 py-3">Fantasy Team</th>
                          <th className="px-4 py-3 text-right">Week Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {weekPerf?.player_of_the_week_drafted?.map((p, idx) => (
                          <tr key={p.real_player_id} className={`hover:bg-slate-50/60 transition ${idx === 0 ? 'bg-amber-50/40 font-extrabold' : ''}`}>
                            <td className="px-4 py-3">
                              <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${
                                idx === 0 ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {idx + 1}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-900 font-extrabold">{p.player_name}</td>
                            <td className="px-4 py-3 text-amber-700">{p.fantasy_team_name}</td>
                            <td className="px-4 py-3 text-right text-amber-600 font-black">
                              {p.player_base_points} Pts
                            </td>
                          </tr>
                        ))}

                        {(!weekPerf?.player_of_the_week_drafted || weekPerf.player_of_the_week_drafted.length === 0) && (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-xs font-bold uppercase italic">
                              No drafted player scores for {data?.target_week?.label}.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Free Agent Player of the Week */}
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
                      <User className="w-4 h-4 text-blue-500" /> Free Agent Player of the Week (Un-drafted)
                    </h3>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                      {data?.target_week?.label}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-bold font-mono">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b border-slate-200/60">
                        <tr>
                          <th className="px-4 py-3">Rank</th>
                          <th className="px-4 py-3">Player Name</th>
                          <th className="px-4 py-3">Real Team</th>
                          <th className="px-4 py-3 text-right">Week Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {weekPerf?.player_of_the_week_free_agent?.map((p, idx) => (
                          <tr key={p.real_player_id} className={`hover:bg-slate-50/60 transition ${idx === 0 ? 'bg-blue-50/40 font-extrabold' : ''}`}>
                            <td className="px-4 py-3">
                              <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${
                                idx === 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {idx + 1}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-900 font-extrabold">{p.player_name}</td>
                            <td className="px-4 py-3 text-slate-600">{p.real_team_name || 'N/A'}</td>
                            <td className="px-4 py-3 text-right text-blue-600 font-black">
                              {p.player_base_points} Pts
                            </td>
                          </tr>
                        ))}

                        {(!weekPerf?.player_of_the_week_free_agent || weekPerf.player_of_the_week_free_agent.length === 0) && (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-xs font-bold uppercase italic">
                              No un-drafted free agent scores for {data?.target_week?.label}.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

            </div>
          )}

        </div>
      </div>
    </AuthGuard>
  );
}
