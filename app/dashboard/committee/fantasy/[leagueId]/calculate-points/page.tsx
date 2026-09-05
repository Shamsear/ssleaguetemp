'use client';
import { CheckCircle, Trophy, BarChart2, AlertTriangle, Unlock, ArrowLeft, Activity, ChevronDown, Zap, RotateCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

interface PreviewData {
  round_summary: {
    round_id: string;
    total_teams: number;
    lineups_submitted: number;
    lineups_locked: number;
    teams_without_lineups: number;
  };
  points_distribution: {
    total_points_to_award: number;
    average_points: number;
    highest_scoring_team: { team_name: string; points: number } | null;
    lowest_scoring_team: { team_name: string; points: number } | null;
  };
  team_breakdown: Array<{
    team_name: string;
    lineup_points: number;
    captain_bonus: number;
    vc_bonus: number;
    power_up: string;
    power_up_bonus: number;
    total_points: number;
    player_breakdown: Array<{
      player_name: string;
      position: string;
      base_points: number;
      multiplier: number;
      bonus_type: string;
      final_points: number;
    }>;
    is_locked: boolean;
  }>;
  power_ups_active: Array<{
    team_name: string;
    power_up: string;
  }>;
  warnings: Array<{
    type: string;
    severity: string;
    message: string;
    teams?: string[];
  }>;
  can_calculate: boolean;
}

export default function CalculatePointsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [selectedRound, setSelectedRound] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const loadPreview = async () => {
    if (!selectedRound) {
      setError('Please select a round');
      return;
    }

    setIsLoadingPreview(true);
    setError(null);

    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/lineups/calculate-points/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: leagueId,
          round_id: selectedRound
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load preview');
      }

      setPreviewData(data.preview);
      setShowPreview(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load preview');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleCalculate = async () => {
    if (!confirm('Are you sure you want to calculate points for this round? This action cannot be undone.')) {
      return;
    }
    
    setIsCalculating(true);
    setError(null);
    setSuccess(null);
    setResults(null);

    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/lineups/calculate-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: leagueId,
          round_id: selectedRound
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to calculate points');
      }

      setSuccess(data.lineups_processed > 0 ? `Successfully calculated points for ${data.lineups_processed} lineups!` : "Successfully processed points for all fantasy squads!");
      setResults(data);
      setShowPreview(false);
    } catch (err: any) {
      setError(err.message || 'Failed to calculate points');
    } finally {
      setIsCalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-555 uppercase tracking-wider font-extrabold font-mono">Loading calculation console...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-rose-50 border-rose-200 text-rose-700';
      case 'high': return 'bg-amber-50 border-amber-200 text-amber-700';
      case 'medium': return 'bg-slate-50 border-slate-200 text-slate-700';
      default: return 'bg-slate-50 border-slate-250 text-slate-700';
    }
  };

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Navigation */}
        <div>
          <Link
            href={`/dashboard/committee/fantasy/${leagueId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">FANTASY CONSOLE</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
              Calculate Points
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Process squad matches and calculate manager fantasy points
            </p>
          </div>
          <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center text-amber-400 shadow-sm shrink-0">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

        {/* Full System Recalculate Banner */}
        <div className="console-card bg-slate-900 border border-slate-800 rounded-3xl p-5 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-slate-800 text-amber-400 rounded-2xl border border-slate-700 shrink-0">
              <RotateCw className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
                Full-System Recalculation Utility
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Fix &amp; recalculate all real player points (including free agents), passive team bonuses, and league standings
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/committee/fantasy/recalculate"
            className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-black uppercase tracking-wider transition-all shrink-0 shadow-sm"
          >
            Recalculate All &rarr;
          </Link>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200/60 rounded-2xl p-4 flex gap-3 text-rose-700">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider">Error Encountered</h3>
              <p className="text-[10px] font-bold uppercase mt-1 text-rose-600">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 border border-emerald-200/60 rounded-2xl p-4 flex gap-3 text-emerald-700">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider">Success</h3>
              <p className="text-[10px] font-bold uppercase mt-1 text-emerald-600">{success}</p>
            </div>
          </div>
        )}

        {/* 1. Preview Mode Screen */}
        {showPreview && previewData && !results && (
          <div className="space-y-6">
            {/* Round Summary Card */}
            <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4 text-slate-500" /> Round Summary Preview
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Total Teams</p>
                  <p className="text-lg font-black text-slate-805">{previewData.round_summary.total_teams}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">
                    {previewData.round_summary.lineups_submitted === previewData.round_summary.total_teams ? "Squads Status" : "Lineups Submitted"}
                  </p>
                  <p className="text-lg font-black text-emerald-600">
                    {previewData.round_summary.lineups_submitted === previewData.round_summary.total_teams ? "READY" : `${previewData.round_summary.lineups_submitted}/${previewData.round_summary.total_teams}`}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Total Points to Award</p>
                  <p className="text-lg font-black text-amber-600">
                    {previewData.points_distribution.total_points_to_award}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Average Points</p>
                  <p className="text-lg font-black text-slate-850">
                    {previewData.points_distribution.average_points}
                  </p>
                </div>
              </div>
            </div>

            {/* Warnings Alert Section */}
            {previewData.warnings.length > 0 && (
              <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-3">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500" /> System Warnings
                </h3>
                <div className="space-y-2">
                  {previewData.warnings.map((warning, idx) => (
                    <div key={idx} className={`border rounded-xl p-4 text-[10px] font-bold uppercase ${getSeverityColor(warning.severity)}`}>
                      <p className="mb-1.5">{warning.message}</p>
                      {warning.teams && warning.teams.length > 0 && (
                        <ul className="list-disc list-inside space-y-0.5 text-[9px] text-slate-500 mt-1">
                          {warning.teams.map((team, i) => (
                            <li key={i}>{team}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Performers Overview */}
            {(previewData.points_distribution.highest_scoring_team || previewData.points_distribution.lowest_scoring_team) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {previewData.points_distribution.highest_scoring_team && (
                  <div className="console-card bg-white border border-emerald-250 p-6 rounded-3xl shadow-sm flex flex-col justify-between">
                    <div>
                      <h4 className="text-[9px] font-black text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                        <Trophy className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> Highest Scoring Team
                      </h4>
                      <p className="text-xs font-black text-slate-855 uppercase mt-2">
                        {previewData.points_distribution.highest_scoring_team.team_name}
                      </p>
                    </div>
                    <p className="text-2xl font-black text-emerald-650 font-mono mt-4">
                      {previewData.points_distribution.highest_scoring_team.points} pts
                    </p>
                  </div>
                )}
                {previewData.points_distribution.lowest_scoring_team && (
                  <div className="console-card bg-white border border-rose-250 p-6 rounded-3xl shadow-sm flex flex-col justify-between">
                    <div>
                      <h4 className="text-[9px] font-black text-rose-700 uppercase tracking-wider">
                        📉 Lowest Scoring Team
                      </h4>
                      <p className="text-xs font-black text-slate-855 uppercase mt-2">
                        {previewData.points_distribution.lowest_scoring_team.team_name}
                      </p>
                    </div>
                    <p className="text-2xl font-black text-rose-600 font-mono mt-4">
                      {previewData.points_distribution.lowest_scoring_team.points} pts
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Active Power Ups */}
            {previewData.power_ups_active.length > 0 && (
              <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-3">
                <h4 className="text-xs font-black text-slate-850 uppercase tracking-wider flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-amber-500" /> Active Power-Ups This Round
                </h4>
                <div className="flex flex-wrap gap-2 pt-1">
                  {previewData.power_ups_active.map((pu, idx) => (
                    <span key={idx} className="px-3 py-1 bg-slate-800 border border-slate-900 text-amber-400 rounded-lg text-[9px] font-black uppercase tracking-wider">
                      {pu.team_name}: {pu.power_up.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Team breakdowns list */}
            <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">Team-by-Team breakdown</h3>
              
              <div className="space-y-2.5">
                {previewData.team_breakdown.map((team, idx) => (
                  <div key={idx} className="border border-slate-200/80 rounded-xl overflow-hidden bg-slate-50/50">
                    <button
                      onClick={() => setExpandedTeam(expandedTeam === team.team_name ? null : team.team_name)}
                      className="w-full p-4 hover:bg-slate-100/50 transition-all flex items-center justify-between cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-bold text-xs uppercase text-slate-800">{team.team_name}</span>
                        <span className="px-2 py-0.5 bg-slate-800 text-amber-400 border border-slate-900 rounded-lg text-[9px] font-bold font-mono">
                          {team.total_points} pts
                        </span>
                        {team.power_up !== 'None' && (
                          <span className="px-2.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[9px] font-black uppercase">
                            ⚡ {team.power_up.replace(/_/g, ' ')}
                          </span>
                        )}
                        {!team.is_locked && (
                          <span className="px-2.5 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-[9px] font-black uppercase flex items-center gap-1">
                            <Unlock className="w-3 h-3" /> UNLOCKED
                          </span>
                        )}
                      </div>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedTeam === team.team_name ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {expandedTeam === team.team_name && (
                      <div className="p-4 bg-white border-t border-slate-150 space-y-4">
                        {/* Stats mini grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
                          <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Base Points</p>
                            <p className="text-sm font-black text-slate-800">{team.lineup_points}</p>
                          </div>
                          {team.captain_bonus > 0 && (
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                              <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Captain Bonus</p>
                              <p className="text-sm font-black text-amber-600">+{team.captain_bonus}</p>
                            </div>
                          )}
                          {team.vc_bonus > 0 && (
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                              <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">VC Bonus</p>
                              <p className="text-sm font-black text-amber-600">+{team.vc_bonus}</p>
                            </div>
                          )}
                          {team.power_up_bonus > 0 && (
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                              <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Power-Up Bonus</p>
                              <p className="text-sm font-black text-amber-655">+{team.power_up_bonus}</p>
                            </div>
                          )}
                        </div>

                        {/* Player details table */}
                        <div className="overflow-x-auto border border-slate-150 rounded-xl">
                          <table className="w-full text-left border-collapse font-mono text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-150 uppercase text-[9px] text-slate-450 font-black">
                                <th className="px-4 py-2.5">Player</th>
                                <th className="px-4 py-2.5">Position</th>
                                <th className="px-4 py-2.5">Base Pts</th>
                                <th className="px-4 py-2.5">Multiplier</th>
                                <th className="px-4 py-2.5 text-right">Final Pts</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-150 uppercase font-bold text-slate-700">
                              {team.player_breakdown.map((player, pidx) => (
                                <tr key={pidx} className="hover:bg-slate-50/50">
                                  <td className="px-4 py-2 text-slate-800">{player.player_name}</td>
                                  <td className="px-4 py-2 text-slate-500">{player.position}</td>
                                  <td className="px-4 py-2">{player.base_points}</td>
                                  <td className="px-4 py-2">
                                    {player.bonus_type ? (
                                      <span className="text-[9px] px-2 py-0.5 bg-amber-50 border border-amber-250 text-amber-700 rounded-lg">
                                        {player.bonus_type}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">1x</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2 text-right text-emerald-650 font-black">{player.final_points}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <button
                onClick={() => setShowPreview(false)}
                className="flex-1 py-3 px-6 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-750 font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCalculate}
                disabled={isCalculating || !previewData.can_calculate}
                className="flex-1 py-3 px-6 bg-slate-800 border border-slate-900 hover:bg-slate-700 text-amber-400 font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
              >
                {isCalculating ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-amber-400"></div> Calculating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-amber-400" /> Confirm & Calculate Points
                  </>
                )}
              </button>
            </div>

            {!previewData.can_calculate && (
              <p className="text-[10px] uppercase font-bold text-rose-600 text-center flex items-center justify-center gap-1 mt-2">
                <AlertTriangle className="w-3.5 h-3.5" /> Cannot calculate due to critical warnings. Please resolve issues first.
              </p>
            )}
          </div>
        )}

        {/* 2. Success Results Dashboard Screen */}
        {results && (
          <div className="space-y-6">
            <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-855 uppercase tracking-wider">Calculation Results Dashboard</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
                  <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Lineups Processed</p>
                  <p className="text-xl font-black text-slate-800">{results.lineups_processed}</p>
                </div>
                <div className="bg-slate-800 border border-slate-900 rounded-xl p-4 text-center text-amber-400">
                  <p className="text-[9px] text-amber-300 font-bold uppercase mb-1">Total Points Awarded</p>
                  <p className="text-xl font-black">{results.total_points_awarded}</p>
                </div>
                {results.highest_scoring_team && (
                  <div className="bg-slate-50 border border-slate-105 rounded-xl p-4 text-center">
                    <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Highest Score</p>
                    <p className="text-xs font-bold text-slate-800 truncate mb-1">{results.highest_scoring_team.team_name}</p>
                    <p className="text-base font-black text-emerald-650">{results.highest_scoring_team.points} pts</p>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                setResults(null);
                setSuccess(null);
                setSelectedRound('');
              }}
              className="w-full py-3 px-6 bg-slate-850 hover:bg-slate-750 border border-slate-900 text-amber-400 font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all cursor-pointer"
            >
              Calculate Another Round
            </button>
          </div>
        )}

        {/* 3. Choose Round / Configuration Form Screen (Neither results nor preview) */}
        {!showPreview && !results && (
          <div className="space-y-6">
            {/* Warning Callout */}
            <div className="console-card bg-slate-50 border border-slate-205 p-5 rounded-3xl shadow-sm flex gap-3 text-slate-755">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-xs uppercase tracking-wider">Before You Process:</h3>
                <p className="text-[10px] font-bold uppercase text-slate-455 mt-1">
                  Click "Preview Calculation" to verify estimated points first.
                  This ensures team rosters and performance metrics look accurate before finalizing.
                </p>
              </div>
            </div>

            {/* Selector Card */}
            <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
              <div>
                <label className="block text-[10px] text-slate-455 font-bold uppercase tracking-wider mb-2">
                  Select Season Round
                </label>
                <select
                  value={selectedRound}
                  onChange={(e) => setSelectedRound(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none text-xs font-bold uppercase"
                >
                  <option value="">Choose a round...</option>
                  <option value="round_1">Round 1</option>
                  <option value="round_2">Round 2</option>
                  <option value="round_3">Round 3</option>
                </select>
              </div>

              <button
                onClick={loadPreview}
                disabled={isLoadingPreview || !selectedRound}
                className="w-full py-3 px-6 bg-slate-855 hover:bg-slate-755 border border-slate-900 text-amber-400 font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
              >
                {isLoadingPreview ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-amber-400"></div> Loading...
                  </>
                ) : (
                  <>
                    🔍 Preview Calculation Breakdown
                  </>
                )}
              </button>
            </div>

            {/* Calculations Steps Telemetry Card */}
            <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Calculation Telemetry Steps</h3>
              
              <div className="space-y-4 font-mono text-[10px] font-bold uppercase">
                <div className="flex gap-3">
                  <div className="w-5 h-5 bg-slate-800 text-amber-400 rounded-md flex items-center justify-center text-[9px] flex-shrink-0">
                    1
                  </div>
                  <div>
                    <p className="text-slate-800">Fetch Player Performances</p>
                    <p className="text-[9px] text-slate-405 mt-0.5">Collect goals, assists, clean sheets, motm points from season matches</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-5 h-5 bg-slate-800 text-amber-400 rounded-md flex items-center justify-center text-[9px] flex-shrink-0">
                    2
                  </div>
                  <div>
                    <p className="text-slate-800">Process Base Points</p>
                    <p className="text-[9px] text-slate-405 mt-0.5">Apply league scoring rules and multipliers on drafted players</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-5 h-5 bg-slate-800 text-amber-400 rounded-md flex items-center justify-center text-[9px] flex-shrink-0">
                    3
                  </div>
                  <div>
                    <p className="text-slate-800">Apply Multipliers & Powerups</p>
                    <p className="text-[9px] text-slate-405 mt-0.5">Form multipliers, active manager chips, and round bonuses</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-5 h-5 bg-slate-800 text-amber-400 rounded-md flex items-center justify-center text-[9px] flex-shrink-0">
                    4
                  </div>
                  <div>
                    <p className="text-slate-800">Consolidate Standings</p>
                    <p className="text-[9px] text-slate-405 mt-0.5">Add passive bonus points and update league table aggregates</p>
                  </div>
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
