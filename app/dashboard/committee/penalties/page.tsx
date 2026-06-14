'use client';
import { CheckCircle, AlertTriangle, BarChart2 } from 'lucide-react';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import Link from 'next/link';

interface TeamStats {
    team_id: string;
    team_name: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goals_for: number;
    goals_against: number;
    goal_difference: number;
    points: number;
    points_deducted: number;
}

interface Tournament {
    id: string;
    tournament_name: string;
    season_id: string;
    status: string;
}

interface Penalty {
    id: number;
    team_id: string;
    tournament_id: string;
    points_deducted: number;
    ecoin_fine: number;
    sscoin_fine: number;
    reason: string;
    applied_by: string;
    applied_at: string;
    removed_at: string | null;
    removed_by: string | null;
}

export default function TournamentPenaltiesPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [selectedTournament, setSelectedTournament] = useState<string>('');
    const [teamStats, setTeamStats] = useState<TeamStats[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Penalty form state
    const [penaltyPoints, setPenaltyPoints] = useState(1);
    const [ecoinFine, setEcoinFine] = useState(0);
    const [sscoinFine, setSscoinFine] = useState(0);
    const [penaltyReason, setPenaltyReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Penalty history
    const [penalties, setPenalties] = useState<Penalty[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Calculator state
    const [calculatorPercentage, setCalculatorPercentage] = useState(20);
    const [selectedTeamForCalc, setSelectedTeamForCalc] = useState<{ ecoin: number; sscoin: number } | null>(null);

    // WhatsApp message state
    const [whatsappMessage, setWhatsappMessage] = useState<string>('');

    // Redirect if not authenticated
    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (user) {
            fetchTournaments();
        }
    }, [user]);

    useEffect(() => {
        if (selectedTournament) {
            fetchTeamStats();
        }
    }, [selectedTournament]);

    const fetchTournaments = async () => {
        try {
            const response = await fetchWithTokenRefresh('/api/tournaments?status=active');
            const data = await response.json();
            if (data.success && data.tournaments.length > 0) {
                setTournaments(data.tournaments);
                setSelectedTournament(data.tournaments[0].id);
            }
        } catch (error) {
            console.error('Error fetching tournaments:', error);
            setError('Failed to load tournaments');
        }
    };

    const fetchTeamStats = async () => {
        if (!selectedTournament) return;

        setIsLoading(true);
        setError('');
        try {
            const response = await fetchWithTokenRefresh(
                `/api/teamstats?tournament_id=${selectedTournament}`
            );
            const data = await response.json();
            if (data.success) {
                const sorted = data.teamStats.sort((a: TeamStats, b: TeamStats) => {
                    const aAdjusted = a.points - (a.points_deducted || 0);
                    const bAdjusted = b.points - (b.points_deducted || 0);
                    if (bAdjusted !== aAdjusted) return bAdjusted - aAdjusted;
                    if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
                    return b.goals_for - a.goals_for;
                });
                setTeamStats(sorted);
            } else {
                setError('Failed to load team stats');
            }
        } catch (error) {
            console.error('Error fetching team stats:', error);
            setError('Failed to load team stats');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchPenaltyHistory = async (teamId: string) => {
        setLoadingHistory(true);
        try {
            const response = await fetchWithTokenRefresh(
                `/api/tournaments/${selectedTournament}/penalties?team_id=${teamId}`
            );
            const data = await response.json();
            if (data.success) {
                setPenalties(data.penalties || []);
            }
        } catch (error) {
            console.error('Error fetching penalty history:', error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const togglePenaltyForm = (teamId: string) => {
        if (expandedTeam === teamId) {
            setExpandedTeam(null);
            resetForm();
        } else {
            setExpandedTeam(teamId);
            setShowHistory(false);
            resetForm();
        }
    };

    const toggleHistory = (teamId: string) => {
        if (expandedTeam === teamId && showHistory) {
            setExpandedTeam(null);
            setShowHistory(false);
        } else {
            setExpandedTeam(teamId);
            setShowHistory(true);
            fetchPenaltyHistory(teamId);
        }
    };

    const resetForm = () => {
        setPenaltyPoints(1);
        setEcoinFine(0);
        setSscoinFine(0);
        setPenaltyReason('');
        setSuccess('');
        setWhatsappMessage('');
    };

    const handleSubmitPenalty = async (team: TeamStats) => {
        if (!user || !selectedTournament) return;

        if (penaltyReason.trim().length < 10) {
            setError('Reason must be at least 10 characters');
            return;
        }

        setIsSubmitting(true);
        setError('');
        setSuccess('');

        try {
            const selectedTournamentData = tournaments.find(t => t.id === selectedTournament);

            const response = await fetchWithTokenRefresh(
                `/api/tournaments/${selectedTournament}/penalties`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        team_id: team.team_id,
                        team_name: team.team_name,
                        season_id: selectedTournamentData?.season_id,
                        points_deducted: penaltyPoints,
                        ecoin_fine: ecoinFine,
                        sscoin_fine: sscoinFine,
                        reason: penaltyReason,
                        applied_by_id: user.uid,
                        applied_by_name: user.email || 'Admin',
                    }),
                }
            );

            const data = await response.json();
            if (data.success) {
                setSuccess(`<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Penalty applied to ${team.team_name}`);
                setWhatsappMessage(data.whatsapp_message || '');
                fetchTeamStats();
                // Don't auto-close so user can copy the WhatsApp message
                // setTimeout(() => {
                //     setExpandedTeam(null);
                //     resetForm();
                // }, 2000);
            } else {
                setError(data.error || 'Failed to apply penalty');
            }
        } catch (error) {
            console.error('Error applying penalty:', error);
            setError('Failed to apply penalty');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRemovePenalty = async (penaltyId: number, teamId: string) => {
        if (!user || !confirm('Remove this penalty?')) return;

        try {
            const response = await fetchWithTokenRefresh(
                `/api/tournaments/${selectedTournament}/penalties/${penaltyId}`,
                {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        removed_by: user.uid,
                    }),
                }
            );

            const data = await response.json();
            if (data.success) {
                setSuccess('<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Penalty removed');
                fetchTeamStats();
                fetchPenaltyHistory(teamId);
            } else {
                setError(data.error || 'Failed to remove penalty');
            }
        } catch (error) {
            console.error('Error removing penalty:', error);
            setError('Failed to remove penalty');
        }
    };

    const selectedTournamentData = tournaments.find(t => t.id === selectedTournament);

    if (authLoading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
                <div className="text-center font-mono">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto"></div>
                    <p className="mt-4 text-xs text-slate-550 font-mono font-extrabold uppercase tracking-wider">Loading penalties portal...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
            {/* Decorative eSports glowing ambient overlay */}
            <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

            <div className="max-w-7xl mx-auto relative z-10 space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <Link
                            href="/dashboard/committee/team-management/tournament"
                            className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all mb-4"
                        >
                            &larr; Back to Tournament
                        </Link>
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight font-mono">
                            Tournament Penalties Management
                        </h1>
                        <p className="text-xs text-slate-400 font-mono mt-1 leading-normal">
                            Apply and manage point deductions and budget fines for teams
                        </p>
                    </div>
                    
                    <div className="bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm shrink-0">
                        COMMITTEE ADMIN ONLY
                    </div>
                </div>

                {/* Tournament Selector */}
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm font-mono text-xs">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Select Tournament
                    </label>
                    <select
                        value={selectedTournament}
                        onChange={(e) => setSelectedTournament(e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide cursor-pointer"
                    >
                        {tournaments.map((tournament) => (
                            <option key={tournament.id} value={tournament.id}>
                                {tournament.tournament_name} ({tournament.status})
                            </option>
                        ))}
                    </select>
                </div>

                {/* Messages */}
                {error && (
                    <div className="bg-rose-50 border border-rose-250/60 rounded-2xl p-4 font-mono text-xs">
                        <div className="flex items-center gap-2 text-rose-800">
                            <span className="font-extrabold"><AlertTriangle className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> ERROR:</span>
                            <span className="font-bold uppercase tracking-wide">{error}</span>
                        </div>
                    </div>
                )}

                {success && (
                    <div className="bg-emerald-50 border border-emerald-255/60 rounded-2xl p-4 font-mono text-xs">
                        <div className="flex items-center gap-2 text-emerald-800">
                            <span className="font-extrabold"><CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> SUCCESS:</span>
                            <span className="font-bold uppercase tracking-wide">{success}</span>
                        </div>
                    </div>
                )}

                {/* WhatsApp Message */}
                {whatsappMessage && (
                    <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm font-mono text-xs space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <h3 className="text-xs font-bold text-slate-855 uppercase tracking-wider flex items-center gap-1.5">
                                📱 WHATSAPP TRANSMISSION MESSAGE
                            </h3>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(whatsappMessage);
                                    alert('WhatsApp message copied to clipboard!');
                                }}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
                            >
                                📋 Copy Message
                            </button>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                            <pre className="text-xs whitespace-pre-wrap font-mono text-slate-700 leading-relaxed uppercase">
                                {whatsappMessage}
                            </pre>
                        </div>
                        <p className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">
                            💡 Copy this message and send it to the team owner via WhatsApp
                        </p>
                    </div>
                )}

                {/* Standings Table */}
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm font-mono text-xs">
                    <div className="bg-slate-850 text-white p-5 border-b border-slate-850">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                Tournament Standings & Penalties Matrix
                            </h2>
                            {selectedTournamentData && (
                                <span className="text-[10px] font-bold uppercase bg-slate-700 text-amber-400 px-2 py-0.5 rounded border border-slate-650">
                                    {selectedTournamentData.tournament_name}
                                </span>
                            )}
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 font-mono">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
                            <span className="mt-4 text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">Syncing standings table...</span>
                        </div>
                    ) : teamStats.length === 0 ? (
                        <div className="text-center py-20 font-mono">
                            <p className="text-slate-450 text-xs font-bold uppercase tracking-wider">No teams found for this tournament</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-100">
                                <thead className="bg-slate-800 text-white uppercase text-[10px] font-bold tracking-wider">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Pos</th>
                                        <th className="px-4 py-3 text-left">Team</th>
                                        <th className="px-4 py-3 text-center">P</th>
                                        <th className="px-4 py-3 text-center">W</th>
                                        <th className="px-4 py-3 text-center">D</th>
                                        <th className="px-4 py-3 text-center">L</th>
                                        <th className="px-4 py-3 text-center">GF</th>
                                        <th className="px-4 py-3 text-center">GA</th>
                                        <th className="px-4 py-3 text-center">GD</th>
                                        <th className="px-4 py-3 text-center">Pts</th>
                                        <th className="px-4 py-3 text-center">Penalties</th>
                                        <th className="px-4 py-3 text-center">Adj Pts</th>
                                        <th className="px-4 py-3 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {teamStats.map((team, index) => {
                                        const adjustedPoints = team.points - (team.points_deducted || 0);
                                        const isExpanded = expandedTeam === team.team_id;

                                        return (
                                            <React.Fragment key={team.team_id}>
                                                <tr className={`even:bg-slate-50/40 hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-amber-50/40' : ''}`}>
                                                    <td className="px-4 py-3">
                                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-extrabold text-xs">
                                                            {index + 1}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-bold text-slate-850 uppercase tracking-wide">{team.team_name}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-medium text-slate-700">{team.played}</td>
                                                    <td className="px-4 py-3 text-center font-bold text-emerald-600">{team.won}</td>
                                                    <td className="px-4 py-3 text-center font-medium text-slate-600">{team.drawn}</td>
                                                    <td className="px-4 py-3 text-center font-bold text-rose-600">{team.lost}</td>
                                                    <td className="px-4 py-3 text-center text-slate-655">{team.goals_for}</td>
                                                    <td className="px-4 py-3 text-center text-slate-655">{team.goals_against}</td>
                                                    <td className="px-4 py-3 text-center font-extrabold">
                                                        <span className={team.goal_difference >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                                            {team.goal_difference >= 0 ? '+' : ''}{team.goal_difference}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-slate-100 border border-slate-200 text-slate-750">
                                                            {team.points}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        {team.points_deducted > 0 ? (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-50 border border-rose-250 text-rose-700">
                                                                -{team.points_deducted} PTS
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-400 font-bold">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider bg-indigo-50 border border-indigo-250 text-indigo-700">
                                                            {adjustedPoints} PTS
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                onClick={() => togglePenaltyForm(team.team_id)}
                                                                disabled={authLoading || !user}
                                                                className={`px-3 py-1.5 font-mono font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all inline-flex items-center gap-1 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                                                                    isExpanded && !showHistory
                                                                        ? 'bg-slate-750 hover:bg-slate-700 text-white'
                                                                        : 'bg-rose-600 hover:bg-rose-500 text-white'
                                                                }`}
                                                            >
                                                                <span>{isExpanded && !showHistory ? '✕' : '<AlertTriangle className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" />'}</span>
                                                                {isExpanded && !showHistory ? 'Cancel' : 'Penalty'}
                                                            </button>
                                                            {team.points_deducted > 0 && (
                                                                <button
                                                                    onClick={() => toggleHistory(team.team_id)}
                                                                    className={`px-3 py-1.5 font-mono font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all inline-flex items-center gap-1 shadow-sm ${
                                                                        isExpanded && showHistory
                                                                            ? 'bg-slate-750 hover:bg-slate-700 text-white'
                                                                            : 'bg-slate-800 hover:bg-slate-750 text-white'
                                                                    }`}
                                                                >
                                                                    <span>{isExpanded && showHistory ? '✕' : '📋'}</span>
                                                                    {isExpanded && showHistory ? 'Close' : 'History'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>

                                                {/* Expanded Penalty Form or History */}
                                                {isExpanded && (
                                                    <tr>
                                                        <td colSpan={13} className="px-0 py-0">
                                                            <div className="bg-[#f8fafc] border-t border-b border-slate-200/60 p-6 font-mono text-xs">
                                                                {!showHistory ? (
                                                                    /* Apply Penalty Form */
                                                                    <div className="max-w-4xl mx-auto space-y-6">
                                                                        <h3 className="text-sm font-bold text-slate-850 uppercase tracking-wider flex items-center gap-1.5 mb-4">
                                                                            <AlertTriangle className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> APPLY PENALTY TO {team.team_name}
                                                                        </h3>

                                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                                            <div>
                                                                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                                                                                    Points to Deduct *
                                                                                </label>
                                                                                <input
                                                                                    type="number"
                                                                                    min="1"
                                                                                    max="50"
                                                                                    value={penaltyPoints}
                                                                                    onChange={(e) => setPenaltyPoints(parseInt(e.target.value) || 1)}
                                                                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide"
                                                                                />
                                                                            </div>

                                                                            <div>
                                                                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                                                                                    ECoin Fine (Optional)
                                                                                </label>
                                                                                <input
                                                                                    type="number"
                                                                                    min="0"
                                                                                    max="10000"
                                                                                    step="0.01"
                                                                                    value={ecoinFine}
                                                                                    onChange={(e) => setEcoinFine(parseFloat(e.target.value) || 0)}
                                                                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide"
                                                                                    placeholder="0.00"
                                                                                />
                                                                            </div>

                                                                            <div>
                                                                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                                                                                    SSCoin Fine (Optional)
                                                                                </label>
                                                                                <input
                                                                                    type="number"
                                                                                    min="0"
                                                                                    max="10000"
                                                                                    step="0.01"
                                                                                    value={sscoinFine}
                                                                                    onChange={(e) => setSscoinFine(parseFloat(e.target.value) || 0)}
                                                                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide"
                                                                                    placeholder="0.00"
                                                                                />
                                                                            </div>
                                                                        </div>

                                                                        <div>
                                                                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                                                                                Reason * (min 10 characters)
                                                                            </label>
                                                                            <textarea
                                                                                value={penaltyReason}
                                                                                onChange={(e) => setPenaltyReason(e.target.value)}
                                                                                rows={3}
                                                                                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-xs font-bold outline-none uppercase tracking-wide resize-none"
                                                                                placeholder="ENTER REASON FOR PENALTY (E.G. LATE LINEUP SUBMISSION, MISCONDUCT, ETC.)"
                                                                            />
                                                                            <div className="flex justify-between items-center mt-1">
                                                                                <p className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">
                                                                                    {penaltyReason.length}/10 characters minimum
                                                                                </p>
                                                                            </div>
                                                                        </div>

                                                                        {/* Percentage Calculator */}
                                                                        <div className="console-card bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                                                                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                                                                🧮 Fine Calculator
                                                                            </h4>

                                                                            <div className="space-y-2">
                                                                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450">
                                                                                    Percentage of Total Balance
                                                                                </label>
                                                                                <div className="flex items-center gap-4">
                                                                                    <input
                                                                                        type="range"
                                                                                        min="1"
                                                                                        max="100"
                                                                                        value={calculatorPercentage}
                                                                                        onChange={(e) => setCalculatorPercentage(parseInt(e.target.value))}
                                                                                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                                                                    />
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        <input
                                                                                            type="number"
                                                                                            min="1"
                                                                                            max="100"
                                                                                            value={calculatorPercentage}
                                                                                            onChange={(e) => setCalculatorPercentage(parseInt(e.target.value) || 1)}
                                                                                            className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-center font-bold text-slate-800 focus:border-slate-800 bg-white"
                                                                                        />
                                                                                        <span className="text-slate-800 font-bold">%</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            <button
                                                                                onClick={async () => {
                                                                                    try {
                                                                                        const response = await fetchWithTokenRefresh(
                                                                                            `/api/teams/${team.team_id}/balance?season_id=${tournaments.find(t => t.id === selectedTournament)?.season_id}`
                                                                                        );
                                                                                        const data = await response.json();
                                                                                        if (data.success && data.data) {
                                                                                            const ecoin = data.data.football_budget || 0;
                                                                                            const sscoin = data.data.real_player_budget || 0;
                                                                                            setSelectedTeamForCalc({ ecoin, sscoin });
                                                                                        }
                                                                                    } catch (error) {
                                                                                        console.error('Error fetching balance:', error);
                                                                                    }
                                                                                }}
                                                                                className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm"
                                                                            >
                                                                                <BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Fetch {team.team_name} Balance
                                                                            </button>

                                                                            {selectedTeamForCalc && (
                                                                                <div className="space-y-4 pt-3 border-t border-slate-200">
                                                                                    <div className="bg-white rounded-xl p-4 border border-slate-200/60">
                                                                                        <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Current Balance:</h5>
                                                                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                                                                            <div className="bg-slate-50/50 rounded-lg p-2.5 border border-slate-100">
                                                                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">ECoin</p>
                                                                                                <p className="text-sm font-extrabold text-blue-600">{selectedTeamForCalc.ecoin.toLocaleString()}</p>
                                                                                            </div>
                                                                                            <div className="bg-slate-50/50 rounded-lg p-2.5 border border-slate-100">
                                                                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">SSCoin</p>
                                                                                                <p className="text-sm font-extrabold text-purple-600">{selectedTeamForCalc.sscoin.toLocaleString()}</p>
                                                                                            </div>
                                                                                        </div>

                                                                                        <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                                                                            {calculatorPercentage}% Calculated Fine:
                                                                                        </h5>
                                                                                        <div className="grid grid-cols-2 gap-4">
                                                                                            <div className="bg-blue-50/40 rounded-xl p-3 border border-blue-100">
                                                                                                <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider mb-1">ECoin Fine</p>
                                                                                                <p className="text-base font-black text-blue-800">
                                                                                                    {((selectedTeamForCalc.ecoin * calculatorPercentage) / 100).toFixed(2)}
                                                                                                </p>
                                                                                                <button
                                                                                                    onClick={() => setEcoinFine(parseFloat(((selectedTeamForCalc.ecoin * calculatorPercentage) / 100).toFixed(2)))}
                                                                                                    className="mt-2 w-full px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white font-mono font-bold text-[9px] uppercase tracking-wider rounded-lg transition-colors"
                                                                                                >
                                                                                                    Use This Amount
                                                                                                </button>
                                                                                            </div>
                                                                                            <div className="bg-purple-50/40 rounded-xl p-3 border border-purple-100">
                                                                                                <p className="text-[9px] font-bold text-purple-600 uppercase tracking-wider mb-1">SSCoin Fine</p>
                                                                                                <p className="text-base font-black text-purple-800">
                                                                                                    {((selectedTeamForCalc.sscoin * calculatorPercentage) / 100).toFixed(2)}
                                                                                                </p>
                                                                                                <button
                                                                                                    onClick={() => setSscoinFine(parseFloat(((selectedTeamForCalc.sscoin * calculatorPercentage) / 100).toFixed(2)))}
                                                                                                    className="mt-2 w-full px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white font-mono font-bold text-[9px] uppercase tracking-wider rounded-lg transition-colors"
                                                                                                >
                                                                                                    Use This Amount
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        {(penaltyPoints > 0 || ecoinFine > 0 || sscoinFine > 0) && penaltyReason.length >= 10 && (
                                                                            <div className="bg-amber-50/60 border border-amber-250 rounded-xl p-4">
                                                                                <p className="text-[10px] font-black text-amber-800 uppercase tracking-wider mb-2"><AlertTriangle className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> WARNING: THIS WILL APPLY THE FOLLOWING PENALTIES:</p>
                                                                                <ul className="space-y-1 text-slate-700 font-bold uppercase tracking-wide text-[10px]">
                                                                                    <li>• <span className="text-slate-900 font-black">{penaltyPoints}</span> standpoint points deduction</li>
                                                                                    {ecoinFine > 0 && <li>• <span className="text-blue-700 font-black">{ecoinFine}</span> ecoin budget deduction</li>}
                                                                                    {sscoinFine > 0 && <li>• <span className="text-purple-700 font-black">{sscoinFine}</span> sscoin budget deduction</li>}
                                                                                </ul>
                                                                            </div>
                                                                        )}

                                                                        <div className="flex gap-3 pt-2">
                                                                            <button
                                                                                onClick={() => handleSubmitPenalty(team)}
                                                                                disabled={isSubmitting || penaltyReason.length < 10}
                                                                                className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                                            >
                                                                                {isSubmitting ? 'APPLYING PENALTY...' : '<AlertTriangle className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> APPLY PENALTY'}
                                                                            </button>
                                                                            <button
                                                                                onClick={() => togglePenaltyForm(team.team_id)}
                                                                                disabled={isSubmitting}
                                                                                className="px-6 py-3 bg-white hover:bg-slate-50 border border-slate-255 text-slate-750 font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm"
                                                                            >
                                                                                CANCEL
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    /* Penalty History */
                                                                    <div className="max-w-4xl mx-auto space-y-6">
                                                                        <h3 className="text-sm font-bold text-slate-855 uppercase tracking-wider flex items-center gap-1.5 mb-4">
                                                                            📋 PENALTY HISTORY FOR {team.team_name}
                                                                        </h3>

                                                                        {loadingHistory ? (
                                                                            <div className="text-center py-8">
                                                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
                                                                                <p className="mt-2 text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">Syncing team records...</p>
                                                                            </div>
                                                                        ) : penalties.length === 0 ? (
                                                                            <div className="text-center py-8 text-slate-550 font-mono font-extrabold uppercase tracking-wider">
                                                                                <p>No penalties found for this team</p>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="space-y-6">
                                                                                {/* Active Penalties */}
                                                                                {penalties.filter(p => !p.removed_at).length > 0 && (
                                                                                    <div className="space-y-3">
                                                                                        <h4 className="text-[10px] font-black text-rose-700 uppercase tracking-wider">Active Penalties</h4>
                                                                                        <div className="space-y-3">
                                                                                            {penalties.filter(p => !p.removed_at).map((penalty) => (
                                                                                                <div key={penalty.id} className="bg-white border border-rose-250 rounded-xl p-4 shadow-sm">
                                                                                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                                                                                        <div className="flex-1 space-y-2">
                                                                                                            <div className="flex flex-wrap gap-1.5">
                                                                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-rose-50 border border-rose-250 text-rose-700">
                                                                                                                    -{penalty.points_deducted} points
                                                                                                                </span>
                                                                                                                {penalty.ecoin_fine > 0 && (
                                                                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-blue-50 border border-blue-205 text-blue-700">
                                                                                                                        {penalty.ecoin_fine} ECoin
                                                                                                                    </span>
                                                                                                                )}
                                                                                                                {penalty.sscoin_fine > 0 && (
                                                                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-purple-50 border border-purple-205 text-purple-700">
                                                                                                                        {penalty.sscoin_fine} SSCoin
                                                                                                                    </span>
                                                                                                                )}
                                                                                                            </div>
                                                                                                            <p className="text-xs text-slate-700 leading-normal uppercase">
                                                                                                                <strong className="text-slate-855 font-black">Reason:</strong> {penalty.reason}
                                                                                                            </p>
                                                                                                            <p className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">
                                                                                                                Applied on {new Date(penalty.applied_at).toLocaleDateString()} by {penalty.applied_by}
                                                                                                            </p>
                                                                                                        </div>
                                                                                                        <button
                                                                                                            onClick={() => handleRemovePenalty(penalty.id, team.team_id)}
                                                                                                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-sm transition-all self-start"
                                                                                                        >
                                                                                                            Remove
                                                                                                        </button>
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                {/* Removed Penalties */}
                                                                                {penalties.filter(p => p.removed_at).length > 0 && (
                                                                                    <div className="space-y-3">
                                                                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Removed Penalties</h4>
                                                                                        <div className="space-y-3">
                                                                                            {penalties.filter(p => p.removed_at).map((penalty) => (
                                                                                                <div key={penalty.id} className="bg-white border border-slate-200/60 rounded-xl p-4 opacity-60">
                                                                                                    <div className="space-y-2">
                                                                                                        <div className="flex flex-wrap gap-1.5">
                                                                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-slate-100 border border-slate-200 text-slate-500">
                                                                                                                -{penalty.points_deducted} points
                                                                                                            </span>
                                                                                                            {penalty.ecoin_fine > 0 && (
                                                                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-slate-50 border border-slate-200 text-slate-500">
                                                                                                                    {penalty.ecoin_fine} ECoin
                                                                                                                </span>
                                                                                                            )}
                                                                                                            {penalty.sscoin_fine > 0 && (
                                                                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-slate-50 border border-slate-200 text-slate-500">
                                                                                                                    {penalty.sscoin_fine} SSCoin
                                                                                                                </span>
                                                                                                            )}
                                                                                                        </div>
                                                                                                        <p className="text-xs text-slate-550 leading-normal uppercase">
                                                                                                            <strong className="font-bold">Reason:</strong> {penalty.reason}
                                                                                                        </p>
                                                                                                        <p className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">
                                                                                                            Removed on {new Date(penalty.removed_at!).toLocaleDateString()} by {penalty.removed_by}
                                                                                                        </p>
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Info Box */}
                <div className="console-card bg-slate-50 border border-slate-200 rounded-2xl p-5 font-mono text-xs">
                    <div className="flex items-start gap-3">
                        <span className="text-lg">⚙️</span>
                        <div className="space-y-2">
                            <h3 className="text-xs font-bold text-slate-850 uppercase tracking-wider">How Penalties Work</h3>
                            <ul className="space-y-1 text-slate-500 font-bold uppercase tracking-wide text-[10px]">
                                <li>• <strong className="text-slate-700">Apply Penalty:</strong> Click the "Penalty" button to expand the form inline</li>
                                <li>• <strong className="text-slate-700">Adjusted Points:</strong> Teams are ranked by their adjusted points (Points - Penalties)</li>
                                <li>• <strong className="text-slate-700">View History:</strong> Click "History" to see all penalties applied to a team</li>
                                <li>• <strong className="text-slate-700">Remove Penalty:</strong> Reverse a penalty if an appeal is successful</li>
                                <li>• <strong className="text-slate-700">Audit Trail:</strong> All actions are logged with who applied/removed and when</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
// end of file
